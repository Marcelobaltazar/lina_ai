import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const STATUS_BADGE = {
  active:    'badge-green',
  trial:     'badge-blue',
  cancelled: 'badge-gray',
  past_due:  'badge-red',
};

export default function Subscriptions() {
  const [subs, setSubs]       = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase
      .from('sub_subscriptions')
      .select('*, cus_users(name, phone)')
      .order('created_at', { ascending: false });

    const rows = data || [];
    setSubs(rows);

    const active    = rows.filter((s) => s.status === 'active').length;
    const trial     = rows.filter((s) => s.status === 'trial').length;
    const cancelled = rows.filter((s) => s.status === 'cancelled').length;
    const mrr = rows
      .filter((s) => s.status === 'active')
      .reduce((sum, s) => sum + (parseFloat(s.price_brl) || 0), 0);

    setSummary({ active, trial, cancelled, mrr });
    setLoading(false);
  }

  if (loading) return <div className="loading">Carregando...</div>;

  return (
    <div>
      <div className="page-header">
        <h2>Assinaturas</h2>
        <p>Receita e planos dos usuários.</p>
      </div>

      <div className="cards-grid">
        <SummaryCard label="Assinaturas ativas" value={summary.active} color="var(--green)" />
        <SummaryCard label="Em trial"            value={summary.trial}  color="var(--blue)" />
        <SummaryCard label="Canceladas"          value={summary.cancelled} color="var(--gray)" />
        <SummaryCard
          label="MRR estimado"
          value={summary.mrr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          color="var(--yellow)"
        />
      </div>

      <div className="surface">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Plano</th>
                <th>Status</th>
                <th>Valor (R$)</th>
                <th>Vencimento</th>
                <th>Método</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td className="fw-bold">
                    {s.cus_users?.name || s.cus_users?.phone || '—'}
                  </td>
                  <td>{s.plan || '—'}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[s.status] || 'badge-gray'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>
                    {s.price_brl
                      ? parseFloat(s.price_brl).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : '—'}
                  </td>
                  <td className="text-muted">
                    {s.expires_at ? new Date(s.expires_at).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td>{s.payment_method || '—'}</td>
                  <td className="text-muted">
                    {new Date(s.created_at).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
              {subs.length === 0 && (
                <tr><td colSpan={7} className="loading">Nenhuma assinatura encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="card-label">{label}</div>
      <div className="card-value" style={{ color }}>{value}</div>
    </div>
  );
}
