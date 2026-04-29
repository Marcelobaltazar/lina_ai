import { randomUUID } from 'crypto';
import { Resend } from 'resend';
import { supabase } from '../lib/supabase.js';

const getResend = (() => {
  let _client = null;
  return () => (_client ??= new Resend(process.env.RESEND_API_KEY));
})();

/**
 * Notifies a family member about a detected alert.
 */
export async function sendAlertEmail(familyEmail, familyName, elderName, alertType, flagReason) {
  try {
    const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#333">
  <p>Olá, <strong>${familyName}</strong>!</p>
  <p>A Lina identificou um possível momento que merece atenção nas conversas de <strong>${elderName}</strong> hoje.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr>
      <td style="padding:8px;background:#f9f9f9;border:1px solid #eee;font-weight:bold">Tipo</td>
      <td style="padding:8px;border:1px solid #eee">${alertType}</td>
    </tr>
    <tr>
      <td style="padding:8px;background:#f9f9f9;border:1px solid #eee;font-weight:bold">Contexto</td>
      <td style="padding:8px;border:1px solid #eee">${flagReason}</td>
    </tr>
  </table>
  <p>⚠️ <em>Isso é apenas um indício, não um diagnóstico. Pode valer uma ligadinha carinhosa. 💚</em></p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="font-size:12px;color:#999">Lina.ai · Companhia com cuidado</p>
</div>`;

    await getResend().emails.send({
      from: process.env.EMAIL_FROM,
      to: familyEmail,
      subject: `💚 Momento de atenção — ${elderName}`,
      html,
    });
  } catch (err) {
    console.error('[email] sendAlertEmail', err.message);
  }
}

/**
 * Sends the weekly activity report to a family member.
 * @param {string} familyEmail
 * @param {string} familyName
 * @param {string} elderName
 * @param {{ totalMessages:number, activeDays:number, medicationsConfirmed:number, medicationsTotal:number, hasSadSignals:boolean, summaryText:string }} stats
 */
export async function sendWeeklyReport(familyEmail, familyName, elderName, stats) {
  try {
    const {
      totalMessages,
      activeDays,
      medicationsConfirmed,
      medicationsTotal,
      hasSadSignals,
      summaryText,
    } = stats;

    const medIcon = medicationsTotal > 0 && medicationsConfirmed === medicationsTotal ? '✅' : '⚠️';
    const medText = medicationsTotal > 0
      ? `${medIcon} ${medicationsConfirmed} de ${medicationsTotal} confirmados`
      : 'Nenhum lembrete configurado esta semana.';

    const sadSection = hasSadSignals
      ? `<p style="background:#fff8e1;border-left:4px solid #ffc107;padding:12px;margin:16px 0">
           💛 Notamos alguns momentos mais delicados nas conversas desta semana. Pode ser uma ótima oportunidade para um contato carinhoso.
         </p>`
      : '';

    const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#333">
  <h2 style="color:#4caf50">Resumo semanal de ${elderName} 💚</h2>
  <p>Olá, <strong>${familyName}</strong>! Aqui está o resumo da semana.</p>

  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr>
      <td style="padding:8px;background:#f9f9f9;border:1px solid #eee;font-weight:bold">Mensagens enviadas</td>
      <td style="padding:8px;border:1px solid #eee">${totalMessages}</td>
    </tr>
    <tr>
      <td style="padding:8px;background:#f9f9f9;border:1px solid #eee;font-weight:bold">Dias ativos</td>
      <td style="padding:8px;border:1px solid #eee">${activeDays} de 7</td>
    </tr>
    <tr>
      <td style="padding:8px;background:#f9f9f9;border:1px solid #eee;font-weight:bold">Remédios</td>
      <td style="padding:8px;border:1px solid #eee">${medText}</td>
    </tr>
  </table>

  <h3 style="color:#555">Como foi a semana</h3>
  <p>${summaryText}</p>

  ${sadSection}

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="font-size:12px;color:#999">Lina.ai · Você pode desativar este relatório a qualquer momento.</p>
</div>`;

    await getResend().emails.send({
      from: process.env.EMAIL_FROM,
      to: familyEmail,
      subject: `Resumo semanal de ${elderName} 💚`,
      html,
    });
  } catch (err) {
    console.error('[email] sendWeeklyReport', err.message);
  }
}

/**
 * Generates an access token for a family member and sends them the caregiver link.
 * @param {string} relativeId
 * @returns {Promise<string>} accessUrl
 */
export async function generateFamilyToken(relativeId) {
  const token = randomUUID();

  const { data: relative, error } = await supabase
    .from('fam_relatives')
    .update({ access_token: token })
    .eq('id', relativeId)
    .select('name, email, user_id, cus_users(name)')
    .single();

  if (error) throw error;

  const elderName  = relative.cus_users?.name || 'seu familiar';
  const accessUrl  = `${process.env.BASE_URL || 'http://localhost:8082'}/cuidador/${token}`;

  if (relative.email) {
    await getResend().emails.send({
      from: process.env.EMAIL_FROM,
      to: relative.email,
      subject: `Seu acesso ao cuidado de ${elderName} 💚`,
      html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#333">
  <h2 style="color:#3d6b4f">Portal do Cuidador · Lina.ai 💚</h2>
  <p>Olá, <strong>${relative.name || 'cuidador(a)'}!</strong></p>
  <p>Aqui está seu link exclusivo para acompanhar e cuidar de <strong>${elderName}</strong> pela Lina.</p>
  <p style="margin:24px 0">
    <a href="${accessUrl}" style="background:#3d6b4f;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600">
      Acessar portal do cuidador
    </a>
  </p>
  <p style="font-size:13px;color:#999">Este link é exclusivo para você. Não compartilhe com outras pessoas.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="font-size:12px;color:#999">Lina.ai · Companhia com cuidado</p>
</div>`,
    });
  }

  return accessUrl;
}
