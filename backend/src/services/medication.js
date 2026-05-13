import axios from 'axios';
import getSupabase from '../lib/supabase.js';

const REMINDER_MSG = (medicationName, userName) =>
  `💊 Hora do remédio! Está na hora de tomar ${medicationName}, ${userName}! Já tomou? Me responde aqui 😊`;

const RESEND_MSG = (medicationName, userName) =>
  `Oi ${userName}! 😊 Só passando pra lembrar do ${medicationName} — você conseguiu tomar? Me conta!`;

function nowInSaoPaulo() {
  const now = new Date();
  const sp = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now);

  const get = (type) => sp.find((p) => p.type === type)?.value;

  const hour = get('hour').padStart(2, '0');
  const minute = get('minute').padStart(2, '0');
  const time = `${hour}:${minute}`;

  const weekdayMap = {
    dom: 'sun', seg: 'mon', ter: 'tue', qua: 'wed',
    qui: 'thu', sex: 'fri', sáb: 'sat', sab: 'sat',
  };
  const rawDay = get('weekday').toLowerCase().replace('.', '');
  const day = weekdayMap[rawDay] || rawDay;

  return { time, day };
}

export async function checkAndSendReminders() {
  const supabase = getSupabase();
  try {
    const { data: medications, error } = await supabase
      .from('med_medications')
      .select('*, cus_users(id, name, phone)')
      .eq('active', true);

    if (error) throw error;
    if (!medications?.length) return;

    const { time, day } = nowInSaoPaulo();

    for (const med of medications) {
      try {
        const times = Array.isArray(med.times) ? med.times : [];
        const days = Array.isArray(med.days) ? med.days : [];

        if (!times.includes(time) || !days.includes(day)) continue;

        const user = med.cus_users;
        if (!user?.phone) continue;

        const windowStart = new Date(Date.now() - 60_000).toISOString();
        const { data: existingLog } = await supabase
          .from('med_medication_logs')
          .select('id')
          .eq('medication_id', med.id)
          .gte('scheduled_at', windowStart)
          .limit(1)
          .maybeSingle();

        if (existingLog) continue;

        await sendWhatsAppMessage(user.phone, REMINDER_MSG(med.name, user.name || 'querido(a)'));

        await supabase.from('med_medication_logs').insert({
          medication_id: med.id,
          user_id: user.id,
          status: 'sent',
          reminder_count: 1,
          scheduled_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[medication] reminder error for med', med.id, err.message);
      }
    }
  } catch (err) {
    console.error('[medication] checkAndSendReminders', err.message);
  }
}

export async function checkAndResendReminders() {
  const supabase = getSupabase();
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const sixtyMinutesAgo  = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: logs } = await supabase
      .from('med_medication_logs')
      .select('id, user_id, medication_id, med_medications(name), cus_users(name, phone)')
      .eq('status', 'sent')
      .eq('reminder_count', 1)
      .lt('scheduled_at', thirtyMinutesAgo)
      .gt('scheduled_at', sixtyMinutesAgo);

    if (!logs?.length) return;

    for (const log of logs) {
      try {
        const user = log.cus_users;
        const medName = log.med_medications?.name;
        if (!user?.phone || !medName) continue;

        await sendWhatsAppMessage(user.phone, RESEND_MSG(medName, user.name || 'querido(a)'));

        await supabase
          .from('med_medication_logs')
          .update({ reminder_count: 2 })
          .eq('id', log.id);
      } catch (err) {
        console.error('[medication] resend error for log', log.id, err.message);
      }
    }
  } catch (err) {
    console.error('[medication] checkAndResendReminders', err.message);
  }
}

export async function markIgnoredReminders() {
  const supabase = getSupabase();
  try {
    const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    await supabase
      .from('med_medication_logs')
      .update({ status: 'ignored' })
      .eq('status', 'sent')
      .lt('scheduled_at', sixtyMinutesAgo);
  } catch (err) {
    console.error('[medication] markIgnoredReminders', err.message);
  }
}

const CONFIRM_WORDS   = ['tomei', 'já tomei', 'tomar', 'tomado', 'bebi', 'já bebi'];
const FORGOT_WORDS    = ['esqueci', 'esqueceu', 'não tomei', 'nao tomei'];
const NOTIFIED_WORDS  = ['falei', 'avisei', 'contei', 'já falei'];
const PERSON_WORDS    = ['filho', 'filha', 'médico', 'medico', 'cuidador', 'enfermeira'];

export async function confirmMedication(userId, messageContent) {
  const supabase = getSupabase();
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const msg = (messageContent || '').toLowerCase();

    const { data: log } = await supabase
      .from('med_medication_logs')
      .select('id, med_medications(name)')
      .eq('user_id', userId)
      .in('status', ['sent', 'missed_pending'])
      .gte('scheduled_at', twoHoursAgo)
      .order('scheduled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!log) return { action: null };

    const medicationName = log.med_medications?.name || 'remédio';

    const isConfirm  = CONFIRM_WORDS.some((w) => msg.includes(w));
    const isForgot   = FORGOT_WORDS.some((w) => msg.includes(w));
    const isNotified = NOTIFIED_WORDS.some((w) => msg.includes(w));
    const hasPerson  = PERSON_WORDS.some((w) => msg.includes(w));

    if (isConfirm) {
      await supabase
        .from('med_medication_logs')
        .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
        .eq('id', log.id);
      return { action: 'confirmed', medicationName };
    }

    if (isForgot && isNotified && hasPerson) {
      const notifiedPerson = PERSON_WORDS.find((w) => msg.includes(w)) || null;
      await supabase
        .from('med_medication_logs')
        .update({ status: 'missed_notified', notified_person: notifiedPerson })
        .eq('id', log.id);
      return { action: 'missed_notified', medicationName, notifiedPerson };
    }

    if (isForgot) {
      await supabase
        .from('med_medication_logs')
        .update({ status: 'missed_pending' })
        .eq('id', log.id);
      return { action: 'missed_pending', medicationName };
    }

    return { action: null };
  } catch (err) {
    console.error('[medication] confirmMedication', err.message);
    return { action: null };
  }
}

export async function getPendingReminders(userId) {
  const supabase = getSupabase();
  try {
    const { data: logs } = await supabase
      .from('med_medication_logs')
      .select('med_medications(name)')
      .eq('user_id', userId)
      .eq('status', 'missed_pending');

    return (logs || [])
      .map((l) => l.med_medications?.name)
      .filter(Boolean);
  } catch (err) {
    console.error('[medication] getPendingReminders', err.message);
    return [];
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
