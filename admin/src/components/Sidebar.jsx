import { NavLink } from 'react-router-dom';

const LINKS = [
  { to: '/',             icon: '📊', label: 'Dashboard' },
  { to: '/users',        icon: '👥', label: 'Usuários' },
  { to: '/llm',          icon: '🤖', label: 'Config LLM' },
  { to: '/alerts',       icon: '🔔', label: 'Alertas' },
  { to: '/subscriptions',icon: '💳', label: 'Assinaturas' },
];

export default function Sidebar({ onLogout }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>Lina Admin</h1>
        <p>Painel de controle</p>
      </div>

      <nav className="sidebar-nav">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) => isActive ? 'active' : ''}
          >
            <span className="icon">{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="btn-logout" onClick={onLogout}>
          <span className="icon">🚪</span>
          Sair
        </button>
      </div>
    </aside>
  );
}
