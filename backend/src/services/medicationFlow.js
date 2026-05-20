import getSupabase from '../lib/supabase.js';

const WORD_NUMBERS = {
  uma: 1, um: 1, duas: 2, dois: 2, três: 3, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20,
  'vinte e uma': 21, 'vinte e um': 21, 'vinte e duas': 22, 'vinte e dois': 22,
  'vinte e três': 23, 'vinte e tres': 23,
};

const DAY_MAP = {
  segunda: 'mon', terça: 'tue', terca: 'tue', quarta: 'wed',
  quinta: 'thu', sexta: 'fri', sábado: 'sat', sabado: 'sat', domingo: 'sun',
};

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

function normalize(text) {
  return (text || '').toLowerCase().trim();
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function adjustPeriod(hour, text) {
  if (/(da|de|à|a)\s*(tarde|noite)/.test(text) && hour < 12) return hour + 12;
  if (/(da|de)\s*manhã|manha/.test(text) && hour === 12) return 0;
  return hour;
}

export function parseTime(text) {
  const t = normalize(text);
  if (!t) return null;

  if (/meio[\s-]*dia/.test(t)) return '12:00';
  if (/meia[\s-]*noite/.test(t)) return '00:00';

  let m = t.match(/(\d{1,2})\s*h\s*(\d{2})/);
  if (m) {
    const h = adjustPeriod(parseInt(m[1], 10), t);
    return `${pad(h)}:${pad(parseInt(m[2], 10))}`;
  }

  m = t.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (m) {
    const h = adjustPeriod(parseInt(m[1], 10), t);
    return `${pad(h)}:${pad(parseInt(m[2], 10))}`;
  }

  m = t.match(/(\d{1,2})\s*e\s*meia/);
  if (m) {
    const h = adjustPeriod(parseInt(m[1], 10), t);
    return `${pad(h)}:30`;
  }

  m = t.match(/(\d{1,2})\s*(h|horas?|hr)\b/);
  if (m) {
    const h = adjustPeriod(parseInt(m[1], 10), t);
    return `${pad(h)}:00`;
  }

  const wordEntries = Object.entries(WORD_NUMBERS).sort((a, b) => b[0].length - a[0].length);
  for (const [word, num] of wordEntries) {
    const re = new RegExp(`\\b${word}\\b(\\s*e\\s*meia)?\\s*(horas?|h)?`);
    const mm = t.match(re);
    if (mm) {
      const h = adjustPeriod(num, t);
      const half = mm[1] ? 30 : 0;
      return `${pad(h)}:${pad(half)}`;
    }
  }

  m = t.match(/\b(\d{1,2})\b/);
  if (m) {
    const h = adjustPeriod(parseInt(m[1], 10), t);
    if (h >= 0 && h <= 23) return `${pad(h)}:00`;
  }

  return null;
}

export function parseDays(text) {
  const t = normalize(text);

  if (/\b(todo dia|todos os dias|sempre|diário|diario|diariamente|todo dia sim|sim todo dia)\b/.test(t)) {
    return ALL_DAYS;
  }
  if (/\b(dias úteis|dias uteis|segunda a sexta|seg a sex|semana)\b/.test(t)) {
    return WEEKDAYS;
  }

  const found = new Set();
  for (const [pt, en] of Object.entries(DAY_MAP)) {
    if (t.includes(pt)) found.add(en);
  }
  if (found.size > 0) return Array.from(found);

  return ALL_DAYS;
}

export function formatTimesForDisplay(times) {
  return times
    .map((t) => {
      const [h, m] = t.split(':');
      const hour = parseInt(h, 10);
      const min = parseInt(m, 10);
      return min === 0 ? `${hour}h` : `${hour}h${pad(min)}`;
    })
    .join(' e ');
}

export async function handleMedicationFlow(user, content) {
  const supabase = getSupabase();
  const state = user.med_flow || null;
  if (!state) return null;

  if (state.step === 'awaiting_time') {
    const time = parseTime(content);
    if (!time) {
      return 'Não entendi bem o horário 😊 Pode me falar assim: 8h da manhã, 14h da tarde, 20h da noite?';
    }
    const flow = { ...state, step: 'awaiting_days', times: [time] };
    await supabase.from('cus_users').update({ med_flow: flow }).eq('id', user.id);
    return 'É todo dia ou só alguns dias da semana?';
  }

  if (state.step === 'awaiting_days') {
    const days = parseDays(content);
    const { error: insertErr } = await supabase.from('med_medications').insert({
      user_id: user.id,
      name: state.name,
      times: state.times,
      days,
      active: true,
    });
    if (insertErr) console.error('[medicationFlow] insert med', insertErr.message);

    await supabase.from('cus_users').update({ med_flow: null }).eq('id', user.id);

    const timesDisplay = formatTimesForDisplay(state.times);
    return `Pronto, ${user.name}! ✅ Todo dia às ${timesDisplay} vou te lembrar do ${state.name} 💊\n\nSe precisar de mais lembretes é só me falar! 😊`;
  }

  return null;
}
