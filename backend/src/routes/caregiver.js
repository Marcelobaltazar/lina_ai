import { Router } from 'express';
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase.js';

const router = Router();

// ── Auth middleware ────────────────────────────────────────────────────────────
async function requireToken(req, res, next) {
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

// ── GET /caregiver/:token ──────────────────────────────────────────────────────
router.get('/:token', requireToken, async (req, res) => {
  try {
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
    const { name, ...rest } = req.body;
    if (!name) return res.status(400).json({ error: 'Campo "name" é obrigatório' });

    const { data, error } = await supabase
      .from('med_medications')
      .insert({ ...rest, name, user_id: req.elder.id, active: true })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[caregiver] POST /medications', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── PUT /caregiver/:token/medications/:medicationId ───────────────────────────
router.put('/:token/medications/:medicationId', requireToken, async (req, res) => {
  try {
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
