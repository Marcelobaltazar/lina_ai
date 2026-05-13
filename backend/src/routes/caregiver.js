import { Router } from 'express';
import { randomUUID } from 'crypto';
import getSupabase from '../lib/supabase.js';

const router = Router();

// ── Auth middleware ────────────────────────────────────────────────────────────
async function requireToken(req, res, next) {
  const supabase = getSupabase();
  const { token } = req.params;
  try {
    const { data: relative } = await supabase
      .from('fam_relatives')
      .select('*, cus_users(*)')
      .eq('access_token', token)
      .maybeSingle();

    if (!relative) return res.status(404).json({ error: 'Link inválido' });

    req.relative = relative;
    req.elder    = relative.cus_users;
    next();
  } catch (err) {
    console.error('[caregiver] auth', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function getWeekStats(elderId) {
  const supabase = getSupabase();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [msgsRes, medLogsRes, alertsRes] = await Promise.all([
    supabase
      .from('msg_conversations')
      .select('created_at')
      .eq('user_id', elderId)
      .eq('role', 'user')
      .gte('created_at', weekAgo),

    supabase
      .from('med_medication_logs')
      .select('status')
      .eq('user_id', elderId)
      .gte('scheduled_at', weekAgo),

    supabase
      .from('alr_alerts')
      .select('id')
      .eq('user_id', elderId)
      .in('type', ['sadness', 'loneliness', 'depression'])
      .gte('notified_at', weekAgo)
      .limit(1),
  ]);

  const msgs               = msgsRes.data || [];
  const medLogs            = medLogsRes.data || [];
  const activeDays         = new Set(msgs.map((m) => m.created_at.slice(0, 10))).size;
  const medicationsTotal     = medLogs.length;
  const medicationsConfirmed = medLogs.filter((l) => l.status === 'confirmed').length;

  return {
    totalMessages: msgs.length,
    activeDays,
    medicationsConfirmed,
    medicationsTotal,
    hasSadSignals: !!(alertsRes.data?.length),
  };
}

// ── POST /caregiver/setup/:relativeId/generate-token (sem auth) ───────────────
router.post('/setup/:relativeId/generate-token', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { relativeId } = req.params;

    const { data: relative } = await supabase
      .from('fam_relatives')
      .select('id')
      .eq('id', relativeId)
      .maybeSingle();

    if (!relative) return res.status(404).json({ error: 'Familiar não encontrado' });

    const token = randomUUID();

    const { error } = await supabase
      .from('fam_relatives')
      .update({ access_token: token, token_created_at: new Date().toISOString() })
      .eq('id', relativeId);

    if (error) throw error;

    const accessUrl = `${process.env.BASE_URL || 'http://localhost:8080'}/cuidador/${token}`;
    res.json({ accessUrl });
  } catch (err) {
    console.error('[caregiver] setup/generate-token', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── GET /caregiver/:token ──────────────────────────────────────────────────────
router.get('/:token', requireToken, async (req, res) => {
  try {
    const supabase = getSupabase();
    const elderId = req.elder.id;

    const [medsRes, alertsRes, weekStats] = await Promise.all([
      supabase
        .from('med_medications')
        .select('*')
        .eq('user_id', elderId)
        .order('created_at', { ascending: false }),

      supabase
        .from('alr_alerts')
        .select('*')
        .eq('user_id', elderId)
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(5),

      getWeekStats(elderId),
    ]);

    const { password, ...safeElder } = req.elder;

    res.json({
      elder:        safeElder,
      relative:     req.relative,
      medications:  medsRes.data  || [],
      recentAlerts: alertsRes.data || [],
      weekStats,
    });
  } catch (err) {
    console.error('[caregiver] GET /', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── GET /caregiver/:token/medications ─────────────────────────────────────────
router.get('/:token/medications', requireToken, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('med_medications')
      .select('*')
      .eq('user_id', req.elder.id)
      .order('created_at', { ascending: false });

    res.json(data || []);
  } catch (err) {
    console.error('[caregiver] GET /medications', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── POST /caregiver/:token/medications ────────────────────────────────────────
router.post('/:token/medications', requireToken, async (req, res) => {
  try {
    const supabase = getSupabase();
    const {
      name, generic_name, manufacturer, dosage, form,
      quantity_per_dose, take_with, purpose,
      doctor_name, doctor_specialty,
      start_date, end_date, continuous_use,
      side_effects, missed_dose, restrictions, notes,
      times, days,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Campo "name" é obrigatório' });

    const { data, error } = await supabase
      .from('med_medications')
      .insert({
        user_id:          req.elder.id,
        active:           true,
        name,
        generic_name:     generic_name     || null,
        manufacturer:     manufacturer     || null,
        dosage:           dosage           || null,
        form:             form             || null,
        quantity_per_dose: quantity_per_dose || null,
        take_with:        take_with        || null,
        purpose:          purpose          || null,
        doctor_name:      doctor_name      || null,
        doctor_specialty: doctor_specialty || null,
        start_date:       start_date       || null,
        end_date:         end_date         || null,
        continuous_use:   continuous_use   ?? false,
        side_effects:     side_effects     || null,
        missed_dose:      missed_dose      || null,
        restrictions:     restrictions     || null,
        notes:            notes            || null,
        times:            times            || null,
        days:             days             || null,
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[caregiver] erro medications POST:', err.message, err.stack);
    res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
});

// ── PUT /caregiver/:token/medications/:medicationId ───────────────────────────
router.put('/:token/medications/:medicationId', requireToken, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { medicationId } = req.params;

    const { data: existing } = await supabase
      .from('med_medications')
      .select('id')
      .eq('id', medicationId)
      .eq('user_id', req.elder.id)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: 'Medicamento não encontrado' });

    const { data, error } = await supabase
      .from('med_medications')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', medicationId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[caregiver] PUT /medications/:id', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── DELETE /caregiver/:token/medications/:medicationId ────────────────────────
router.delete('/:token/medications/:medicationId', requireToken, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { medicationId } = req.params;

    const { data: existing } = await supabase
      .from('med_medications')
      .select('id')
      .eq('id', medicationId)
      .eq('user_id', req.elder.id)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: 'Medicamento não encontrado' });

    const { error } = await supabase
      .from('med_medications')
      .update({ active: false })
      .eq('id', medicationId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[caregiver] DELETE /medications/:id', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── POST /caregiver/:token/generate-token ────────────────────────────────────
router.post('/:token/generate-token', requireToken, async (req, res) => {
  try {
    const supabase = getSupabase();
    const newToken = randomUUID();

    const { error } = await supabase
      .from('fam_relatives')
      .update({ access_token: newToken })
      .eq('id', req.relative.id);

    if (error) throw error;

    const accessUrl = `${process.env.BASE_URL || 'http://localhost:8082'}/cuidador/${newToken}`;
    res.json({ accessUrl });
  } catch (err) {
    console.error('[caregiver] generate-token', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
