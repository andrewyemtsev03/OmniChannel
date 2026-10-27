import { useState } from 'react';
import { api } from '../api.js';
import { ErrorNote } from '../components.jsx';

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
      <form className="panel stack" onSubmit={submit}>
        <div>
          <h1>Rx Omnichannel</h1>
          <p className="muted">Stada Kazakhstan. Sign in with your work account.</p>
        </div>
        <ErrorNote error={error} />
        <label className="field">Email
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field">Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
