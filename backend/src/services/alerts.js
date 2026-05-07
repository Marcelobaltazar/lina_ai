import getSupabase from '../lib/supabase.js';
import { sendAlertEmail } from './email.js';

const ALERT_RULES = [
  { keywords: ['solidão', 'solidao', 'sozinho', 'sozinha', 'isolado'], type: 'loneliness', severity: 'medium' },
  { keywords: ['triste', 'tristeza', 'chorar', 'chorando', 'choro'], type: 'sadness', severity: 'medium' },
  { keywords: ['depressão', 'depressao', 'não quero mais', 'nao quero mais', 'desistir'], type: 'depression', severity: 'high' },
  { keywords: ['agressão', 'agressao', 'bater', 'violência', 'violencia'], type: 'aggression', severity: 'high' },
  { keywords: ['emergência', 'emergencia', 'caiu', 'caindo', 'dor forte', 'mal súbito', 'mal subito', 'samu'], type: 'danger', severity: 'high' },
];

export function detectAlertType(flagReason) {
  const lower = (flagReason || '').toLowerCase();
  for (const rule of ALERT_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { type: rule.type, severity: rule.severity };
    }
  }
  return { type: 'sadness', severity: 'low' };
}

export async function createAlert(userId, messageId, flagReason) {
  const supabase = getSupabase();
  try {
    const { type, severity } = detectAlertType(flagReason);

    const { data: alert, error: alertErr } = await supabase
      .from('alr_alerts')
      .insert({
        user_id: userId,
        message_id: messageId || null,
        type,
        severity,
        notified_family: false,
      })
      .select()
      .single();

    if (alertErr) throw alertErr;

    await supabase.from('adm_audit_log').insert({
      action: 'alert_created',
      target_table: 'alr_alerts',
      target_id: alert.id,
      admin_user: 'system',
    });

    if (severity === 'high') {
      await notifyFamilyAlert(userId, type, flagReason);
    }

    return alert;
  } catch (err) {
    console.error('[alerts] createAlert', err.message);
    return null;
  }
}

export async function notifyFamilyAlert(userId, alertType, flagReason) {
  const supabase = getSupabase();
  try {
    const { data: user } = await supabase
      .from('cus_users')
      .select('name')
      .eq('id', userId)
      .maybeSingle();

    const elderName = user?.name || 'seu familiar';

    const { data: relatives } = await supabase
      .from('fam_relatives')
      .select('email, name')
      .eq('user_id', userId)
      .eq('report_enabled', true);

    for (const relative of relatives || []) {
      if (!relative.email) continue;
      await sendAlertEmail(relative.email, relative.name, elderName, alertType, flagReason);
    }

    await supabase
      .from('alr_alerts')
      .update({ notified_family: true })
      .eq('user_id', userId)
      .eq('notified_family', false);
  } catch (err) {
    console.error('[alerts] notifyFamilyAlert', err.message);
  }
}
