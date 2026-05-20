import axios from 'axios';
import getSupabase from '../lib/supabase.js';
import { processConversation } from '../services/conversation.js';
import { transcribeAudio, generateAudio } from '../services/audio.js';
import { analyzeImage } from '../services/vision.js';
import { createAlert } from '../services/alerts.js';
import { extractAndSaveMemories } from '../services/memory.js';
import { confirmMedication, getPendingReminders } from '../services/medication.js';
import { handleMedicationFlow, parseTime } from '../services/medicationFlow.js';
import { classifyIntent } from '../services/intentClassifier.js';

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

      if (user.name === '__awaiting_name__') {
        const c = (textContent || '').trim();
        const nome = c.split(' ')[0];
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

    // ── Intent classification (uma única vez por mensagem) ──────────────────
    const intent = await classifyIntent(user, content);
    console.log('[intent]', intent, '|', content.slice(0, 50));

    // 1. Fluxo de lembrete em andamento + LEMBRETE → continua o flow
    if (user.med_flow && intent === 'LEMBRETE') {
      const response = await handleMedicationFlow(user, content);
      if (response) {
        await saveAndSend(user, phone, content, response);
        return;
      }
    }

    // 2. LEMBRETE sem fluxo ativo → inicia
    if (intent === 'LEMBRETE' && !user.med_flow) {
      const response = await startMedicationFlow(user, content);
      await saveAndSend(user, phone, content, response);
      return;
    }

    // 3. CONFIRMACAO → processa confirmação
    if (intent === 'CONFIRMACAO') {
      const result = await confirmMedication(user.id, content, intent);
      if (result.action) {
        const response = buildConfirmationResponse(result, user.name);
        await saveAndSend(user, phone, content, response);
        return;
      }
    }

    // 4. CONVERSA com fluxo pendente → cancela silenciosamente
    if (user.med_flow && intent === 'CONVERSA') {
      await supabase.from('cus_users').update({ med_flow: null }).eq('id', user.id);
      user = { ...user, med_flow: null };
    }

    // 5. Fluxo normal do LLM
    await processNormalConversation(user, phone, content, mediaType);
  } catch (err) {
    console.error('[webhook] erro:', err.message, err.stack);
  }
}

async function startMedicationFlow(user, content) {
  const supabase = getSupabase();
  const time = parseTime(content);
  const name = extractMedNameFromContent(content);

  if (time) {
    const flow = { step: 'awaiting_days', name, times: [time] };
    await supabase.from('cus_users').update({ med_flow: flow }).eq('id', user.id);
    return 'É todo dia ou só alguns dias da semana? 😊';
  }

  const flow = { step: 'awaiting_time', name };
  await supabase.from('cus_users').update({ med_flow: flow }).eq('id', user.id);
  return 'Claro! 💊 Que horas você toma?';
}

function extractMedNameFromContent(text) {
  const t = (text || '').toLowerCase().trim();
  const m = t.match(/(remédio da pressão|remedio da pressao|remédio do coração|remedio do coracao|remédio do diabetes|remedio do diabetes|remédio da diabetes|remedio da diabetes|remedinho|remédio|remedio|comprimido|cápsula|capsula|insulina|medicamento)/);
  return m ? m[1] : 'seu remédio';
}

function buildConfirmationResponse(result, userName) {
  if (result.action === 'confirmed') {
    return `Ótimo, ${userName}! Anotei que você tomou o ${result.medicationName} ✅💊`;
  }
  if (result.action === 'missed_pending') {
    return 'Tudo bem! Quando tomar me avisa 💚';
  }
  if (result.action === 'missed_notified') {
    return 'Que bom que avisou! Anotei aqui 💚';
  }
  return '';
}

async function saveAndSend(user, phone, userContent, botResponse) {
  const supabase = getSupabase();
  await supabase.from('msg_conversations').insert({
    user_id: user.id,
    role: 'user',
    content: userContent,
    media_type: 'text',
  });
  await supabase.from('msg_conversations').insert({
    user_id: user.id,
    role: 'assistant',
    content: botResponse,
    media_type: 'text',
    sentiment: 'happy',
    flagged: false,
  });
  await sendWhatsAppMessage(phone, botResponse);
}

async function processNormalConversation(user, phone, content, mediaType) {
  const supabase = getSupabase();

  const { error: msgErr } = await supabase
    .from('msg_conversations')
    .insert({
      user_id: user.id,
      role: 'user',
      content,
      media_type: mediaType,
    });
  if (msgErr) console.error('[evolution] save user msg', msgErr);

  const pendingMeds = await getPendingReminders(user.id);
  const pendingMedsHint = pendingMeds.length > 0 && Math.random() > 0.5
    ? `\n\nLEMBRETE PENDENTE: ${user.name} esqueceu de tomar ${pendingMeds.join(', ')}. Mencione naturalmente UMA VEZ no meio da conversa, com carinho e sem pressão. Exemplo: 'Ah, e o ${pendingMeds[0]}? Já conseguiu tomar?'`
    : null;

  const { cleanText, sentiment, flagged, flagReason } =
    await processConversation(user, content, pendingMedsHint);

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

  if (flagged) {
    try {
      await createAlert(user.id, asstMsg?.id, flagReason);
    } catch (err) {
      console.error('[evolution] createAlert failed', err);
    }
  }

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
