import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const PROVIDERS = ['claude', 'openai', 'gemini'];

const SUGGESTED_MODELS = {
  openai: [
    { id: 'gpt-4o',                label: 'GPT-4o',          tag: 'Recomendado' },
    { id: 'gpt-4o-search-preview', label: 'GPT-4o Search',   tag: 'Com busca web' },
    { id: 'gpt-4o-mini',           label: 'GPT-4o Mini',     tag: 'Econômico' },
  ],
  claude: [
    { id: 'claude-sonnet-4-20250514',   label: 'Claude Sonnet 4', tag: 'Recomendado' },
    { id: 'claude-opus-4-20250514',     label: 'Claude Opus 4',   tag: 'Mais poderoso' },
    { id: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku',    tag: 'Econômico' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash',        label: 'Gemini 2.0 Flash',  tag: 'Recomendado' },
    { id: 'gemini-2.0-flash-search', label: 'Gemini 2.0 Search', tag: 'Com busca web' },
    { id: 'gemini-1.5-pro',          label: 'Gemini 1.5 Pro',    tag: 'Mais poderoso' },
  ],
};

const TAG_COLORS = {
  'Recomendado':   { background: '#d1fae5', color: '#065f46' },
  'Com busca web': { background: '#dbeafe', color: '#1e40af' },
  'Econômico':     { background: '#f3f4f6', color: '#374151' },
  'Mais poderoso': { background: '#ede9fe', color: '#5b21b6' },
};

export default function LLMConfig() {
  const [cfg, setCfg]       = useState(null);
  const [form, setForm]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState(null); // { type: 'success'|'error', msg }

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    const { data } = await supabase
      .from('cfg_llm_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const merged = {
      active_provider: data?.active_provider || 'claude',
      active_model:    data?.active_model    || 'claude-sonnet-4-6',
      temperature:     Number(data?.temperature)  || 0.7,
      max_tokens:      Number(data?.max_tokens)   || 1024,
      system_prompt:   data?.system_prompt   || '',
    };

    setCfg(data ? { ...data, ...merged } : merged);
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
              {SUGGESTED_MODELS[form.active_provider] && (
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Modelos sugeridos:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {SUGGESTED_MODELS[form.active_provider].map((m) => {
                      const colors = TAG_COLORS[m.tag] || TAG_COLORS['Econômico'];
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => set('active_model', m.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '4px 10px', borderRadius: 20,
                            border: '1px solid #e5e7eb', background: '#fff',
                            cursor: 'pointer', fontSize: 13,
                            outline: form.active_model === m.id ? '2px solid #065f46' : 'none',
                          }}
                        >
                          {m.label}
                          <span style={{ ...colors, padding: '1px 7px', borderRadius: 10, fontSize: 11 }}>
                            {m.tag}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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
            {loading ? (
              <div className="form-control" style={{ minHeight: 280, color: '#9ca3af', display: 'flex', alignItems: 'center' }}>
                Carregando...
              </div>
            ) : (
              <textarea
                key={form.system_prompt ? 'loaded' : 'empty'}
                className="form-control"
                defaultValue={form.system_prompt}
                onChange={(e) => set('system_prompt', e.target.value)}
                placeholder="Instrução de sistema enviada a cada conversa..."
                style={{ minHeight: 280 }}
              />
            )}
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
