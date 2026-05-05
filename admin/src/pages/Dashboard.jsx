import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [usersRes, msgsRes, alertsRes, llmRes] = await Promise.all([
        supabase.from('cus_users').select('status'),
        supabase.from('msg_conversations').select('id', { count: 'exact', head: true })
          .gte('created_at', todayStart.toISOString()),
        supabase.from('alr_alerts').select('id', { count: 'exact', head: true })
          .eq('resolved', false),
        supabase.from('cfg_llm_config').select('active_provider, active_model').limit(1).maybeSingle(),
      ]);

      const users = usersRes.data || [];
      const activeCount   = users.filter((u) => u.status === 'active').length;
      const trialCount    = users.filter((u) => u.status === 'trial').length;
      const blockedCount  = users.filter((u) => u.status === 'blocked').length;

      setStats({
        active: activeCount,
        trial: trialCount,
        blocked: blockedCount,
        msgsToday: msgsRes.count || 0,
        pendingAlerts: alertsRes.count || 0,
        llmProvider: llmRes.data?.active_provider || '—',
        llmModel: llmRes.data?.active_model || '—',
      });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="loading">Carregando...</div>;

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Visão geral do sistema Lina.AI</p>
      </div>

      <div className="cards-grid">
        <StatCard
          label="Usuários ativos"
          value={stats.active}
          sub={`${stats.trial} trial · ${stats.blocked} bloqueados`}
          color="var(--green)"
        />
        <StatCard
          label="Mensagens hoje"
          value={stats.msgsToday}
          sub="conversas recebidas"
          color="var(--blue)"
        />
        <StatCard
          label="Alertas pendentes"
          value={stats.pendingAlerts}
          sub="aguardando resolução"
          color={stats.pendingAlerts > 0 ? 'var(--red)' : 'var(--gray)'}
          badge={stats.pendingAlerts > 0}
        />
        <StatCard
          label="LLM ativo"
          value={stats.llmProvider}
          sub={stats.llmModel}
          color="var(--yellow)"
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, badge }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="card-label">{label}</div>
      <div className="card-value" style={{ color, display: 'flex', alignItems: 'center', gap: 8 }}>
        {value}
        {badge && (
          <span style={{ background: 'var(--red)', color: '#fff', borderRadius: 999, fontSize: 11, padding: '2px 7px', fontWeight: 700 }}>
            !
          </span>
        )}
      </div>
      <div className="card-sub">{sub}</div>
    </div>
  );
}
