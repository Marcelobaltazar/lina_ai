import supabase from '../lib/supabase.js';
import { sendAlertEmail } from './email.js';

const ALERT_RULES = [
  { keywords: ['solidão', 'solidao', 'sozinho', 'sozinha', 'isolado'], type: 'loneliness', severity: 'medium' },
  { keywords: ['triste', 'tristeza', 'chorar', 'chorando', 'choro'], type: 'sadness', severity: 'medium' },
  { keywords: ['depressão', 'depressao', 'não quero mais', 'nao quero mais', 'desistir'], type: 'depression', severity: 'high' },
  { keywords: ['agressão', 'agressao', 'bater', 'violência', 'violencia'], type: 'aggression', severity: 'high' },
  { keywords: ['emergência', 'emergencia', 'caiu', 'caindo', 'dor forte', 'mal súbito', 'mal subito', 'samu'], type: 'danger', severity: 'high' },
];

/**
 * @param {string} flagReason
 * @returns {{ type: string, severity: 'low'|'medium'|'high' }}
 */
export function detectAlertType(flagReason) {
  const lower = (flagReason || '').toLowerCase();
  for (const rule of ALERT_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { type: rule.type, severity: rule.severity };
    }
  }
  return { type: 'sadness', severity: 'low' };
}

/**
 * Persists an alert, audits it, and notifies family on high severity.
 * @param {string} userId
 * @param {string|null} messageId
 * @param {string} flagReason
 * @returns {Promise<object|null>}
 */
export async function createAlert(userId, messageId, flagReason) {
  try {
    const { type, severity } = detectAlertType(flagReason);

    const { data: alert, error: alertErr } = await supabase.get()
      .from('alr_alerts')
      .insert({
        user_id: userId,
        message_id: messageId || null,
        type,
        severity,
        flag_reason: flagReason,
        notified_family: false,
      })
      .select()
      .single();

    if (alertErr) throw alertErr;

    // Audit log
    await supabase.get().from('adm_audit_log').insert({
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

/**
 * Notifies family members with report_enabled=true about a high-severity alert.
 * @param {string} userId
 * @param {string} alertType
 * @param {string} flagReason
 */
export async function notifyFamilyAlert(userId, alertType, flagReason) {
  try {
    const { data: user } = await supabase.get()
      .from('cus_users')
      .select('name')
      .eq('id', userId)
      .maybeSingle();

    const elderName = user?.name || 'seu familiar';

    const { data: relatives } = await supabase.get()
      .from('fam_relatives')
      .select('email, name')
      .eq('user_id', userId)
      .eq('report_enabled', true);

    for (const relative of relatives || []) {
      if (!relative.email) continue;
      await sendAlertEmail(relative.email, relative.name, elderName, alertType, flagReason);
    }

    // Mark all pending alerts for this user as notified
    await supabase.get()
      .from('alr_alerts')
      .update({ notified_family: true })
      .eq('user_id', userId)
      .eq('notified_family', false);
  } catch (err) {
    console.error('[alerts] notifyFamilyAlert', err.message);
  }
}
