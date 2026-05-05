import cron from 'node-cron';
import axios from 'axios';
import supabase from '../lib/supabase.js';
import { checkAndSendReminders } from '../services/medication.js';
import { sendWeeklyReport } from '../services/email.js';
import { complete as claudeComplete } from '../llm/providers/claude.js';

// ── Job 1: Medication reminders — every minute ────────────────────────────────
cron.schedule('* * * * *', async () => {
  try {
    await checkAndSendReminders();
  } catch (err) {
    console.error('[cron] checkAndSendReminders', err.message);
  }
});

// ── Job 2: Re-engagement — daily at 10:00 (São Paulo) ────────────────────────
cron.schedule('0 10 * * *', async () => {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: users, error } = await supabase.get()
      .from('cus_users')
      .select('id, name, phone')
      .eq('status', 'active')
      .lt('last_interaction', threeDaysAgo);

    if (error) throw error;
    if (!users?.length) return;

    for (const user of users) {
      try {
        const msg = `Oi ${user.name || 'querido(a)'}! 💚 Estava com saudade de você! Tem alguma novidade pra me contar?`;
        await sendWhatsAppMessage(user.phone, msg);

        await supabase.get()
          .from('cus_users')
          .update({ last_interaction: new Date().toISOString() })
          .eq('id', user.id);
      } catch (err) {
        console.error('[cron] re-engagement error for user', user.id, err.message);
      }
    }
  } catch (err) {
    console.error('[cron] re-engagement job', err.message);
  }
}, { timezone: 'America/Sao_Paulo' });

// ── Job 3: Weekly report — every Monday at 08:00 (São Paulo) ─────────────────
cron.schedule('0 8 * * 1', async () => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: relatives, error } = await supabase.get()
      .from('fam_relatives')
      .select('id, name, email, user_id, cus_users(id, name)')
      .eq('report_enabled', true);

    if (error) throw error;
    if (!relatives?.length) return;

    for (const relative of relatives) {
      try {
        if (!relative.email) continue;

        const userId = relative.user_id;
        const elder = relative.cus_users;
        const elderName = elder?.name || 'seu familiar';

        // Total messages and active days
        const { data: msgs } = await supabase.get()
          .from('msg_conversations')
          .select('created_at, content, role')
          .eq('user_id', userId)
          .eq('role', 'user')
          .gte('created_at', weekAgo)
          .order('created_at', { ascending: true });

        const totalMessages = msgs?.length || 0;
        const activeDays = new Set(
          (msgs || []).map((m) => m.created_at.slice(0, 10)),
        ).size;

        // Medication stats
        const { data: medLogs } = await supabase.get()
          .from('med_medication_logs')
          .select('status')
          .eq('user_id', userId)
          .gte('scheduled_at', weekAgo);

        const medicationsTotal = medLogs?.length || 0;
        const medicationsConfirmed = (medLogs || []).filter((l) => l.status === 'confirmed').length;

        // Sad signals
        const { data: sadAlerts } = await supabase.get()
          .from('alr_alerts')
          .select('id')
          .eq('user_id', userId)
          .in('type', ['sadness', 'loneliness', 'depression'])
          .gte('notified_at', weekAgo)
          .limit(1);

        const hasSadSignals = !!(sadAlerts?.length);

        // LLM summary — use last 30 user messages
        const recentContent = (msgs || [])
          .slice(-30)
          .map((m) => m.content)
          .join(' | ');

        let summaryText = 'Foi uma semana tranquila! 😊';
        if (recentContent.trim()) {
          try {
            const { text } = await claudeComplete(
              'Você é um assistente que ajuda famílias a entenderem como foi a semana de seus idosos.',
              [],
              `Em 2-3 frases curtas e carinhosas, descreva como foi a semana desta pessoa com base nas mensagens: ${recentContent}. Foque no lado positivo. Português brasileiro simples.`,
              { active_model: 'claude-haiku-4-5-20251001', max_tokens: 150, temperature: 0.7 },
            );
            summaryText = text.trim();
          } catch (err) {
            console.error('[cron] weekly summary LLM error', err.message);
          }
        }

        await sendWeeklyReport(relative.email, relative.name, elderName, {
          totalMessages,
          activeDays,
          medicationsConfirmed,
          medicationsTotal,
          hasSadSignals,
          summaryText,
        });
      } catch (err) {
        console.error('[cron] weekly report error for relative', relative.id, err.message);
      }
    }
  } catch (err) {
    console.error('[cron] weekly report job', err.message);
  }
}, { timezone: 'America/Sao_Paulo' });

console.log('[cron] 3 jobs registered (reminders, re-engagement, weekly report)');

async function sendWhatsAppMessage(phone, text) {
  const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;
  await axios.post(
    url,
    { number: phone, text },
    { headers: { apikey: process.env.EVOLUTION_API_KEY } },
  );
}
