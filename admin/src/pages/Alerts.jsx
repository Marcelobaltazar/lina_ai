import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const SEVERITY_BADGE = {
  low:    'badge-gray',
  medium: 'badge-yellow',
  high:   'badge-red',
};

export default function Alerts() {
  const [alerts, setAlerts]   = useState([]);
  const [filter, setFilter]   = useState('pending');
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null); // message text
  const [msgLoading, setMsgLoading] = useState(false);

  useEffect(() => { loadAlerts(); }, [filter]);

  async function loadAlerts() {
    setLoading(true);
    let q = supabase
      .from('alr_alerts')
      .select('*, cus_users(name, phone)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter === 'pending')  q = q.eq('resolved', false);
    if (filter === 'resolved') q = q.eq('resolved', true);

    const { data } = await q;
    setAlerts(data || []);
    setLoading(false);
  }

  async function viewMessage(messageId) {
    if (!messageId) { setModal({ content: '(sem mensagem vinculada)' }); return; }
    setModal({ loading: true });
    setMsgLoading(true);
    const { data } = await supabase
      .from('msg_conversations')
      .select('content, created_at, role')
      .eq('id', messageId)
      .maybeSingle();
    setModal(data || { content: '(mensagem não encontrada)' });
    setMsgLoading(false);
  }

  async function resolve(id) {
    await supabase.from('alr_alerts').update({ resolved: true }).eq('id', id);
    loadAlerts();
  }

  return (
    <div>
      <div className="page-header">
        <h2>Alertas</h2>
        <p>Situações detectadas pela Lina que podem precisar de atenção.</p>
      </div>

      <div className="surface">
        <div className="toolbar">
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Filtro</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="pending">Pendentes</option>
            <option value="resolved">Resolvidos</option>
            <option value="all">Todos</option>
          </select>
        </div>

        <div className="table-wrap">
          {loading ? (
            <div className="loading">Carregando...</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Tipo</th>
                  <th>Severidade</th>
                  <th>Motivo</th>
                  <th>Data</th>
                  <th>Família notificada</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td className="fw-bold">
                      {a.cus_users?.name || a.cus_users?.phone || '—'}
                    </td>
                    <td>{a.type || '—'}</td>
                    <td>
                      <span className={`badge ${SEVERITY_BADGE[a.severity] || 'badge-gray'}`}>
                        {a.severity || '—'}
                      </span>
                    </td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.flag_reason || '—'}
                    </td>
                    <td className="text-muted">
                      {new Date(a.created_at || a.notified_at).toLocaleString('pt-BR')}
                    </td>
                    <td>
                      {a.notified_family
                        ? <span className="badge badge-green">✓ Sim</span>
                        : <span className="badge badge-gray">Não</span>}
                    </td>
                    <td>
                      {a.resolved
                        ? <span className="badge badge-green">Resolvido</span>
                        : <span className="badge badge-yellow">Pendente</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => viewMessage(a.message_id)}>
                          🔍 Ver msg
                        </button>
                        {!a.resolved && (
                          <button className="btn btn-success btn-sm" onClick={() => resolve(a.id)}>
                            ✓ Resolver
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {alerts.length === 0 && (
                  <tr><td colSpan={8} className="loading">Nenhum alerta encontrado.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span>🔍 Mensagem vinculada</span>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {msgLoading || modal.loading ? (
                <div className="loading">Carregando...</div>
              ) : (
                <>
                  <p style={{ fontSize: 13, marginBottom: 8 }}>
                    <strong>Role:</strong> {modal.role || '—'} ·{' '}
                    <strong>Data:</strong> {modal.created_at ? new Date(modal.created_at).toLocaleString('pt-BR') : '—'}
                  </p>
                  <div style={{ background: 'var(--gray-bg)', borderRadius: 8, padding: 12, fontSize: 14 }}>
                    {modal.content}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
