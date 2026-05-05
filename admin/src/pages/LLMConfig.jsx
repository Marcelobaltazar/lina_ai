import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const PROVIDERS = ['claude', 'openai', 'gemini'];

export default function LLMConfig() {
  const [cfg, setCfg]       = useState(null);
  const [form, setForm]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState(null); // { type: 'success'|'error', msg }

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    const { data } = await supabase.from('cfg_llm_config').select('*').limit(1).maybeSingle();
    const defaults = {
      active_provider: 'claude',
      active_model: 'claude-sonnet-4-6',
      temperature: 0.7,
      max_tokens: 1024,
      system_prompt: '',
    };
    const merged = { ...defaults, ...(data || {}) };
    setCfg(merged);
    setForm(merged);
    setLoading(false);
  }

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        active_provider: form.active_provider,
        active_model: form.active_model,
        temperature: parseFloat(form.temperature),
        max_tokens: parseInt(form.max_tokens, 10),
        system_prompt: form.system_prompt,
        updated_at: new Date().toISOString(),
        updated_by: 'admin',
      };

      let error;
      if (cfg?.id) {
        ({ error } = await supabase.from('cfg_llm_config').update(payload).eq('id', cfg.id));
      } else {
        ({ error } = await supabase.from('cfg_llm_config').insert(payload));
      }

      if (error) throw error;
      showToast('success', 'Configuração salva com sucesso!');
      loadConfig();
    } catch (err) {
      console.error(err);
      showToast('error', 'Erro ao salvar: ' + (err.message || 'tente novamente.'));
    } finally {
      setSaving(false);
    }
  }

  function showToast(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  if (loading || !form) return <div className="loading">Carregando...</div>;

  return (
    <div>
      <div className="page-header">
        <h2>Configuração LLM</h2>
        <p>Ajuste o provider, modelo e comportamento da Lina.</p>
      </div>

      <div className="alert-banner alert-banner-warning">
        ⚠️ <strong>Atenção:</strong> Alterações entram em vigor imediatamente para todos os usuários.
      </div>

      <div className="surface" style={{ padding: '24px', maxWidth: 700 }}>
        <form onSubmit={handleSave}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Provider</label>
              <select className="form-control" value={form.active_provider} onChange={(e) => set('active_provider', e.target.value)}>
                {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Modelo</label>
              <input
                className="form-control"
                value={form.active_model}
                onChange={(e) => set('active_model', e.target.value)}
                placeholder="ex: claude-sonnet-4-6"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Temperature — {Number(form.temperature).toFixed(2)}</label>
              <input
                type="range"
                min="0" max="1" step="0.05"
                value={form.temperature}
                onChange={(e) => set('temperature', e.target.value)}
              />
              <div className="range-labels"><span>0.0 (preciso)</span><span>1.0 (criativo)</span></div>
            </div>

            <div className="form-group">
              <label className="form-label">Max tokens</label>
              <input
                type="number"
                className="form-control"
                value={form.max_tokens}
                onChange={(e) => set('max_tokens', e.target.value)}
                min="64" max="8192"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">System Prompt</label>
            <textarea
              className="form-control"
              value={form.system_prompt}
              onChange={(e) => set('system_prompt', e.target.value)}
              placeholder="Instrução de sistema enviada a cada conversa..."
              style={{ minHeight: 280 }}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? '⏳ Salvando...' : '💾 Salvar configuração'}
          </button>
        </form>
      </div>

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
