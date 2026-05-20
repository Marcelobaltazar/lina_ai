import axios from 'axios';
import getSupabase from '../lib/supabase.js';
import { processConversation } from '../services/conversation.js';
import { transcribeAudio, generateAudio } from '../services/audio.js';
import { analyzeImage } from '../services/vision.js';
import { createAlert } from '../services/alerts.js';
import { extractAndSaveMemories } from '../services/memory.js';
import { confirmMedication, getPendingReminders } from '../services/medication.js';
import { handleMedicationFlow } from '../services/medicationFlow.js';

const trialWarningMsg = (name) =>
  `${name}, que bom que você está aqui! 😊 \n\nSó pra te avisar — nossas mensagens gratuitas \nestão quase no fim. Mas não se preocupe, \ncontinuar é muito simples!\n\nMe manda "quero continuar" quando quiser \ne eu te explico tudo 💚`;

const paywallWantsToPayMsg = (name) =>
  `Que ótimo, ${name}! Fico feliz que quer continuar! 🎉\n\nO plano mensal é R$29,90 — uma vez por mês.\nPode ser Pix ou cartão, do jeito que for melhor pra você!\n\nJá estou gerando seu link de pagamento... \nPode demorar um minutinho mas logo te mando \ntudo certinho aqui mesmo 😊💚`;

const paywallBlockMsg = (name) =>
  `${name}, adorei conversar com você! 😊\n\nMinhas mensagens gratuitas acabaram por hoje.\nPara continuar é só me falar "quero continuar" \nque eu te ajudo com tudo! 💚`;

const PAYMENT_INTENT_KEYWORDS = [
  'quero continuar', 'quero pagar', 'como pago',
  'como faço', 'quero assinar', 'continuar',
];

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
      const msgLower = (textContent || '').toLowerCase();
      const wantsToPay = PAYMENT_INTENT_KEYWORDS.some((kw) => msgLower.includes(kw));
      await sendWhatsAppMessage(phone, wantsToPay ? paywallWantsToPayMsg(user.name) : paywallBlockMsg(user.name));
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
        await sendWhatsAppMessage(phone, trialWarningMsg(user.name));
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

    // ── Medication confirmation detection ───────────────────────────────────
    const medResult = await confirmMedication(user.id, content);
    if (medResult.action === 'confirmed') {
      await sendWhatsAppMessage(phone,
        `Ótimo, ${user.name}! Anotei aqui que você tomou o ${medResult.medicationName} ✅💊 Cuide-se!`
      );
      return;
    }
    if (medResult.action === 'missed_pending') {
      await sendWhatsAppMessage(phone,
        `Tudo bem, ${user.name}! Pode acontecer 😊 Mas é importante tomar o ${medResult.medicationName}. Você pode pedir pra alguém te ajudar a lembrar? Quando tomar, me avisa que eu fico na torcida! 💚`
      );
      return;
    }
    if (medResult.action === 'missed_notified') {
      await sendWhatsAppMessage(phone,
        `Que bom que você avisou! 💚 Anotei aqui. Espero que o ${medResult.medicationName} seja tomado logo. Cuide-se!`
      );
      return;
    }

    // ── Medication reminder flow (conversational) ───────────────────────────
    const medResponse = await handleMedicationFlow(user, content);
    if (medResponse) {
      await supabase.from('msg_conversations').insert({
        user_id: user.id,
        role: 'user',
        content,
        media_type: 'text',
      });
      await supabase.from('msg_conversations').insert({
        user_id: user.id,
        role: 'assistant',
        content: medResponse,
        media_type: 'text',
        sentiment: 'happy',
        flagged: false,
      });
      await sendWhatsAppMessage(phone, medResponse);
      return;
    }

    // ── Save user message ───────────────────────────────────────────────────
    const { error: msgErr } = await supabase
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

    // ── Pending medication reminders injection ──────────────────────────────
    const pendingMeds = await getPendingReminders(user.id);
    const pendingMedsHint = pendingMeds.length > 0 && Math.random() > 0.5
      ? `\n\nLEMBRETE PENDENTE: ${user.name} esqueceu de tomar ${pendingMeds.join(', ')}. Mencione naturalmente UMA VEZ no meio da conversa, com carinho e sem pressão. Exemplo: 'Ah, e o ${pendingMeds[0]}? Já conseguiu tomar?'`
      : null;

    // ── LLM processing ──────────────────────────────────────────────────────
    const { cleanText, sentiment, flagged, flagReason } =
      await processConversation(user, content, pendingMedsHint);

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

    // ── Memory extraction (background, non-blocking) ────────────────────────
    supabase
      .from('msg_conversations')
      .select('role, content')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data: recent }) => {
        const recentMessages = (recent || []).reverse().map((m) => ({
          role: m.role,
          content: m.content,
        }));
        return extractAndSaveMemories(user.id, recentMessages);
      })
      .catch((err) => console.error('[memory] erro extração:', err.message));

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

    const delayMs = humanDelay(cleanText.length);
    await sendTypingIndicator(phone, delayMs);
    await sendWhatsAppMessage(phone, cleanText);
  } catch (err) {
    console.error('[webhook] erro:', err.message, err.stack);
  }
}

function humanDelay(textLength) {
  const base = Math.min(textLength * 35, 6000);
  const variation = Math.random() * 2000;
  return Math.max(1500, base + variation);
}

async function sendTypingIndicator(phone, delayMs) {
  try {
    await axios.post(
      `${process.env.EVOLUTION_API_URL}/chat/sendPresence/${process.env.EVOLUTION_INSTANCE}`,
      { number: phone, presence: 'composing', delay: delayMs },
      { headers: { apikey: process.env.EVOLUTION_API_KEY } },
    );
  } catch {
    // ignora silenciosamente
  }
  await new Promise((r) => setTimeout(r, delayMs));
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
