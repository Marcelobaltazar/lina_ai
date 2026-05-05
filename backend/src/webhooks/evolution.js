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
  processPayload(req.body).catch((err) =>
    console.error('[evolution] unhandled error', err),
  );
}

async function processPayload(body) {
  console.log('[webhook] payload recebido:', JSON.stringify(body).slice(0, 200));
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

    if (messageType === 'audioMessage' && mediaUrl) {
      try {
        content = await transcribeAudio(mediaUrl);
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
  const url = `${process.env.EVOLUTION_API_URL}/message/sendMedia/${process.env.EVOLUTION_INSTANCE}`;
  await axios.post(
    url,
    {
      number: phone,
      mediatype: 'audio',
      media: audioBuffer.toString('base64'),
      mimetype: 'audio/ogg; codecs=opus',
    },
    { headers: { apikey: process.env.EVOLUTION_API_KEY } },
  );
}
