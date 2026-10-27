import { useState } from 'react';
import { api } from '../api.js';
import { Circles, ErrorNote } from '../ui.jsx';

export default function Login({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.post('/api/auth/login', { email, password }));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-art">
        <Circles />
        <p className="caption">Rx Omnichannel<span>Approved materials for healthcare professionals, delivered and measured.</span></p>
      </div>
      <div className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <img src="/brand/stada-logo.png" alt="STADA" />
          <div>
            <h1>Sign in</h1>
            <p className="muted" style={{ marginTop: 6 }}>Use your STADA Kazakhstan work account.</p>
          </div>
          <ErrorNote error={error} />
          <label className="field">Work email
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="name@stada.kz" />
          </label>
          <label className="field">Password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="small muted">Forgot your password? Ask your platform admin to set a new one.</p>
        </form>
      </div>
    </div>
  );
}
