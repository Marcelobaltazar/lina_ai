import axios from 'axios';
import supabase from '../lib/supabase.js';

const REMINDER_MSG = (medicationName, userName) =>
  `💊 Hora do remédio! Está na hora de tomar ${medicationName}, ${userName}! Já tomou? Me responde aqui 😊`;

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

/**
 * Checks all active medication schedules and sends WhatsApp reminders when due.
 * Deduplicates via med_medication_logs within a 1-minute window.
 */
export async function checkAndSendReminders() {
  try {
    const { data: medications, error } = await supabase.get()
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

        // Dedup: check if already sent within the last minute
        const windowStart = new Date(Date.now() - 60_000).toISOString();
        const { data: existingLog } = await supabase.get()
          .from('med_medication_logs')
          .select('id')
          .eq('medication_id', med.id)
          .gte('scheduled_at', windowStart)
          .limit(1)
          .maybeSingle();

        if (existingLog) continue;

        await sendWhatsAppMessage(user.phone, REMINDER_MSG(med.name, user.name || 'querido(a)'));

        await supabase.get().from('med_medication_logs').insert({
          medication_id: med.id,
          user_id: user.id,
          status: 'sent',
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

/**
 * Marks the most recent pending reminder as confirmed for a user.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function confirmMedication(userId) {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: log } = await supabase.get()
      .from('med_medication_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'sent')
      .gte('scheduled_at', twoHoursAgo)
      .order('scheduled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!log) return false;

    await supabase.get()
      .from('med_medication_logs')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', log.id);

    return true;
  } catch (err) {
    console.error('[medication] confirmMedication', err.message);
    return false;
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
