import axios from 'axios';
import getSupabase from '../lib/supabase.js';
import { processConversation } from '../services/conversation.js';
import { transcribeAudio, generateAudio } from '../services/audio.js';
import { analyzeImage } from '../services/vision.js';
import { fetchNews, detectsNewsIntent } from '../services/news.js';
import { createAlert } from '../services/alerts.js';

const PAYWALL_MSG =
  'Você atingiu o limite de 15 mensagens gratuitas. 😊 Para continuar conversando comigo, assine um plano: [link]';
const TRIAL_WARNING_MSG =
  'Restam 2 mensagens gratuitas 😊 Para continuar sem interrupções, conheça nossos planos!';

export async function evolutionWebhook(req, res) {
  res.sendStatus(200);
  try {
    await processPayload(req.body);
  } catch (err) {
    console.error('[webhook] erro geral:', err.message);
  }
}

async function processPayload(body) {
  const remoteJid = body?.data?.key?.remoteJid || '';
  if (remoteJid.endsWith('@g.us')) {
    console.log('[webhook] ignorando grupo:', remoteJid);
    return;
  }
  console.log('[webhook] recebido tipo:', body?.data?.messageType, 'de:', remoteJid);
  const supabase = getSupabase();
  try {
    const data = body?.data;
    if (!data) return;

    if (data.key?.fromMe) return;

    const rawPhone = data.key?.remoteJid || '';
    const phone = rawPhone.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    if (!phone) return;

    const messageType = data.messageType;
    const textContent =
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      null;
    const mediaUrl =
      data.message?.audioMessage?.url ||
      data.message?.imageMessage?.url ||
      null;

    // ── User lookup / creation ──────────────────────────────────────────────
    let { data: user, error: userErr } = await supabase
      .from('cus_users')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (userErr) throw userErr;

    if (!user) {
      const { data: created, error: createErr } = await supabase
        .from('cus_users')
        .insert({ phone, status: 'trial', free_messages_used: 0 })
        .select()
        .single();
      if (createErr) throw createErr;
      user = created;
    }

    // ── Onboarding — pede nome na primeira mensagem ─────────────────────────
    if (!user.name || user.name === '__awaiting_name__') {

      // Usuário sem nome — pede o nome
      if (!user.name) {
        await supabase
          .from('cus_users')
          .update({ name: '__awaiting_name__' })
          .eq('id', user.id);

        await sendWhatsAppMessage(phone,
          'Oi! Que bom ter você aqui! 😊 Eu sou a Lina, sua nova companheira. Como posso te chamar?'
        );
        return;
      }

      // Usuário respondeu com o nome
      if (user.name === '__awaiting_name__') {
        const content = (textContent || '').trim();
        const nome = content.split(' ')[0];
        const nomeFormatado = nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();

        await supabase
          .from('cus_users')
          .update({
            name: nomeFormatado,
            onboarded_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        await sendWhatsAppMessage(phone,
          `Que nome lindo! Prazer, ${nomeFormatado}! 💚 Pode me contar qualquer coisa — estou aqui pra isso.`
        );
        return;
      }
    }

    // restante do fluxo normal continua abaixo...

    // ── Access control ──────────────────────────────────────────────────────
    if (user.status === 'blocked') return;

    if (user.status === 'trial' && user.free_messages_used >= 15) {
      await sendWhatsAppMessage(phone, PAYWALL_MSG);
      return;
    }

    if (user.status === 'trial') {
      const nextCount = (user.free_messages_used || 0) + 1;
      await supabase
        .from('cus_users')
        .update({ free_messages_used: nextCount })
        .eq('id', user.id);

      user = { ...user, free_messages_used: nextCount };

      if (nextCount === 13) {
        await sendWhatsAppMessage(phone, TRIAL_WARNING_MSG);
      }
    }

    // ── Media processing ────────────────────────────────────────────────────
    let content = textContent || '';
    let mediaType = 'text';

    if (messageType === 'audioMessage') {
      try {
        content = await transcribeAudio(data);
        mediaType = 'audio';
      } catch (err) {
        console.error('[evolution] transcribeAudio failed', err);
        content = textContent || '';
      }
    } else if (messageType === 'imageMessage' && mediaUrl) {
      try {
        content = await analyzeImage(mediaUrl);
        mediaType = 'image';
      } catch (err) {
        console.error('[evolution] analyzeImage failed', err);
        content = textContent || '';
      }
    }

    if (!content) return;

    // ── Save user message ───────────────────────────────────────────────────
    const { data: userMsg, error: msgErr } = await supabase
      .from('msg_conversations')
      .insert({
        user_id: user.id,
        role: 'user',
        content,
        media_type: mediaType,
      })
      .select()
      .single();
    if (msgErr) console.error('[evolution] save user msg', msgErr);

    // ── News context ────────────────────────────────────────────────────────
    let newsContext = null;
    if (detectsNewsIntent(content)) {
      try {
        newsContext = await fetchNews(content, user.city);
      } catch (err) {
        console.error('[evolution] fetchNews failed', err);
      }
    }

    // ── LLM processing ──────────────────────────────────────────────────────
    const { cleanText, sentiment, flagged, flagReason } =
      await processConversation(user, content, newsContext);

    // ── Save assistant message ──────────────────────────────────────────────
    const { data: asstMsg, error: asstErr } = await supabase
      .from('msg_conversations')
      .insert({
        user_id: user.id,
        role: 'assistant',
        content: cleanText,
        media_type: 'text',
        sentiment,
        flagged,
        flag_reason: flagReason || null,
      })
      .select()
      .single();
    if (asstErr) console.error('[evolution] save assistant msg', asstErr);

    // ── Alert ───────────────────────────────────────────────────────────────
    if (flagged) {
      try {
        await createAlert(user.id, asstMsg?.id, flagReason);
      } catch (err) {
        console.error('[evolution] createAlert failed', err);
      }
    }

    // ── Reply ───────────────────────────────────────────────────────────────
    console.log('[reply] audio_mode:', user.audio_mode, '| elevenlabs key:', process.env.ELEVENLABS_API_KEY ? 'presente' : 'AUSENTE');
    if (user.audio_mode) {
      try {
        const audioBuffer = await generateAudio(cleanText);
        if (audioBuffer) {
          await sendWhatsAppAudio(phone, audioBuffer);
          return;
        }
      } catch (err) {
        console.error('[evolution] generateAudio failed, falling back to text', err);
      }
    }

    await sendWhatsAppMessage(phone, cleanText);
  } catch (err) {
    console.error('[webhook] erro:', err.message, err.stack);
  }
}

async function sendWhatsAppMessage(phone, text) {
  const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;
  await axios.post(
    url,
    { number: phone, text },
    { headers: { apikey: process.env.EVOLUTION_API_KEY } },
  );
}

async function sendWhatsAppAudio(phone, audioBuffer) {
  const base64 = audioBuffer.toString('base64');
  console.log('[audio] tentando enviar áudio, tamanho base64:', base64.length);
  const url = `${process.env.EVOLUTION_API_URL}/message/sendMedia/${process.env.EVOLUTION_INSTANCE}`;
  await axios.post(
    url,
    {
      number: phone,
      mediatype: 'audio',
      mimetype: 'audio/ogg; codecs=opus',
      media: base64,
      fileName: 'audio.ogg',
    },
    { headers: { apikey: process.env.EVOLUTION_API_KEY } },
  );
}
