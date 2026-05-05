import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const PAGE_SIZE = 20;
const BACKEND   = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8082';

const STATUS_COLORS = {
  active: 'badge-green', trial: 'badge-blue',
  blocked: 'badge-red', cancelled: 'badge-gray',
};

export default function Users() {
  const [users, setUsers]             = useState([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(0);
  const [filter, setFilter]           = useState('all');
  const [loading, setLoading]         = useState(true);
  const [modal, setModal]             = useState(null); // 'conversations' | 'caregiver-link'
  const [modalData, setModalData]     = useState(null);
  const [msgs, setMsgs]               = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(false);

  useEffect(() => { loadUsers(); }, [page, filter]);

  async function loadUsers() {
    setLoading(true);
    let q = supabase
      .from('cus_users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (filter !== 'all') q = q.eq('status', filter);

    const { data, count } = await q;
    setUsers(data || []);
    setTotal(count || 0);
    setLoading(false);
  }

  async function openConversations(user) {
    setModal('conversations');
    setModalData(user);
    setMsgsLoading(true);
    const { data } = await supabase
      .from('msg_conversations')
      .select('role, content, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setMsgs((data || []).reverse());
    setMsgsLoading(false);
  }

  async function toggleBlock(user) {
    const nextStatus = user.status === 'blocked' ? 'active' : 'blocked';
    await supabase.from('cus_users').update({ status: nextStatus }).eq('id', user.id);
    loadUsers();
  }

  async function activateUser(user) {
    await supabase.from('cus_users').update({ status: 'active' }).eq('id', user.id);
    loadUsers();
  }

  async function generateCaregiverLink(user) {
    const { data: relatives } = await supabase
      .from('fam_relatives')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (!relatives?.length) {
      setModal('caregiver-link');
      setModalData({ error: true, userName: user.name || user.phone });
      return;
    }

    try {
      const res = await fetch(
        `${BACKEND}/caregiver/${relatives[0].id}/generate-token`,
        { method: 'POST' },
      );
      const json = await res.json();
      setModal('caregiver-link');
      setModalData({ url: json.accessUrl, userName: user.name || user.phone });
    } catch {
      setModal('caregiver-link');
      setModalData({ error: true, errorMsg: 'Erro ao gerar link.', userName: user.name || user.phone });
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="page-header">
        <h2>Usuários</h2>
        <p>{total} usuário{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}</p>
      </div>

      <div className="surface">
        <div className="toolbar">
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Status</label>
          <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}>
            <option value="all">Todos</option>
            <option value="trial">Trial</option>
            <option value="active">Ativo</option>
            <option value="blocked">Bloqueado</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>

        <div className="table-wrap">
          {loading ? (
            <div className="loading">Carregando...</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Cidade</th>
                  <th>Status</th>
                  <th>Msgs grátis</th>
                  <th>Última interação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="fw-bold">{u.name || <span className="text-muted">—</span>}</td>
                    <td>{u.phone}</td>
                    <td>{u.city || <span className="text-muted">—</span>}</td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[u.status] || 'badge-gray'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td>{u.free_messages_used ?? 0}</td>
                    <td className="text-muted">
                      {u.last_interaction ? new Date(u.last_interaction).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openConversations(u)}>
                          💬 Ver
                        </button>
                        <button
                          className={`btn btn-sm ${u.status === 'blocked' ? 'btn-success' : 'btn-danger'}`}
                          onClick={() => toggleBlock(u)}
                        >
                          {u.status === 'blocked' ? '🔓 Desbloquear' : '🔒 Bloquear'}
                        </button>
                        {u.status !== 'active' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => activateUser(u)}>
                            ✅ Ativar
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => generateCaregiverLink(u)}>
                          🔗 Link cuidador
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={7} className="loading">Nenhum usuário encontrado.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button className="btn btn-ghost btn-sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
              ← Anterior
            </button>
            <span>Página {page + 1} de {totalPages}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}>
              Próxima →
            </button>
          </div>
        )}
      </div>

      {/* Conversations modal */}
      {modal === 'conversations' && modalData && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span>💬 Conversas — {modalData.name || modalData.phone}</span>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {msgsLoading ? (
                <div className="loading">Carregando...</div>
              ) : msgs.length === 0 ? (
                <p className="text-muted">Nenhuma mensagem encontrada.</p>
              ) : (
                msgs.map((m, i) => (
                  <div key={i} className={`msg msg-${m.role}`}>
                    <div className="msg-bubble">{m.content}</div>
                    <div className="msg-meta">
                      {m.role === 'user' ? '👤 Usuário' : '🤖 Lina'} ·{' '}
                      {new Date(m.created_at).toLocaleString('pt-BR')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Caregiver link modal */}
      {modal === 'caregiver-link' && modalData && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span>🔗 Link do cuidador — {modalData.userName}</span>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {modalData.error ? (
                <p style={{ color: 'var(--text-mid)', fontSize: 14 }}>
                  {modalData.errorMsg || 'Cadastre um familiar primeiro para gerar o link de acesso.'}
                </p>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                    Compartilhe este link exclusivo com o familiar cuidador:
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      readOnly
                      className="form-control"
                      value={modalData.url}
                      onClick={(e) => e.target.select()}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => navigator.clipboard.writeText(modalData.url)}
                    >
                      Copiar
                    </button>
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
