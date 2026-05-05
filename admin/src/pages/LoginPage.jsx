import { useState } from 'react';

export default function LoginPage({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (password === import.meta.env.VITE_ADMIN_SECRET) {
      localStorage.setItem('admin_auth', 'true');
      onLogin();
    } else {
      setError('Senha incorreta.');
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <h1>💚 Lina Admin</h1>
        <p>Acesso restrito ao painel de controle.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Senha</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              autoFocus
              placeholder="••••••••"
            />
            {error && <p className="login-error">{error}</p>}
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
