import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import LoginPage from './pages/LoginPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Users from './pages/Users.jsx';
import LLMConfig from './pages/LLMConfig.jsx';
import Alerts from './pages/Alerts.jsx';
import Subscriptions from './pages/Subscriptions.jsx';

export default function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem('admin_auth') === 'true');

  function handleLogin() {
    setAuthed(true);
  }

  function handleLogout() {
    localStorage.removeItem('admin_auth');
    setAuthed(false);
  }

  if (!authed) return <LoginPage onLogin={handleLogin} />;

  return (
    <div className="layout">
      <Sidebar onLogout={handleLogout} />
      <main className="main">
        <Routes>
          <Route path="/"              element={<Dashboard />} />
          <Route path="/users"         element={<Users />} />
          <Route path="/llm"           element={<LLMConfig />} />
          <Route path="/alerts"        element={<Alerts />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="*"              element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
