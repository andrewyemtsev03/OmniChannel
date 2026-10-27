import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useLoad, ago, date } from '../lib.js';
import { ErrorNote, Loading } from '../components.jsx';

const ROLES = { admin: 'Admin', reviewer: 'MLR reviewer', rep: 'Medical rep' };

const ACTION_LABEL = {
  'login': 'Signed in',
  'user.create': 'Added a team member', 'user.update': 'Changed a team member',
  'doctor.create': 'Added a doctor', 'doctor.update': 'Edited a doctor', 'doctor.delete': 'Deleted a doctor', 'doctor.import': 'Imported doctors',
  'consent.create': 'Recorded a consent', 'consent.withdraw': 'Withdrew a consent',
  'presentation.upload': 'Uploaded a presentation', 'presentation.replace_file': 'Replaced a presentation file',
  'presentation.submit': 'Submitted for MLR review', 'presentation.approve': 'Approved a presentation',
  'presentation.reject': 'Returned a presentation for changes', 'presentation.archive': 'Archived a presentation',
  'presentation.delete': 'Deleted a presentation', 'presentation.send': 'Sent a presentation',
};

function AddUser({ onDone }) {
  const [f, setF] = useState({ name: '', email: '', role: 'rep', password: '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try { await api.post('/api/users', f); setF({ name: '', email: '', role: 'rep', password: '' }); onDone(); } catch (err) { setError(err); }
  };
  return (
    <form className="panel stack" onSubmit={submit}>
      <h3>Add a team member</h3>
      <ErrorNote error={error} />
      <div className="grid-2">
        <label className="field">Name<input value={f.name} onChange={set('name')} required /></label>
        <label className="field">Work email<input type="email" value={f.email} onChange={set('email')} required /></label>
        <label className="field">Role
          <select value={f.role} onChange={set('role')}>{Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <span className="hint">Reps send approved materials to their own doctors. MLR reviewers upload and approve. Admins manage everything.</span>
        </label>
        <label className="field">First password<input type="text" value={f.password} onChange={set('password')} required minLength={8} /><span className="hint">At least 8 characters. Share it privately.</span></label>
      </div>
      <div><button className="btn primary">Add team member</button></div>
    </form>
  );
}

export default function Users() {
  const me = useAuth();
  const users = useLoad(() => api.get('/api/users'));
  const audit = useLoad(() => api.get('/api/stats/audit?limit=100'));
  const [error, setError] = useState(null);

  const update = async (u, body) => {
    setError(null);
    try { await api.patch(`/api/users/${u.id}`, body); users.reload(); } catch (err) { setError(err); }
  };
  const resetPassword = (u) => {
    const pw = window.prompt(`New password for ${u.name} (at least 8 characters):`);
    if (pw) update(u, { password: pw });
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Team</h1><p>Who can use the platform, and what they did.</p></div>
      </div>
      <AddUser onDone={users.reload} />
      <section className="section">
        <h2>Team members</h2>
        <ErrorNote error={error || users.error} />
        {users.loading && !users.data ? <Loading /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Added</th><th /></tr></thead>
              <tbody>
                {users.data.map((u) => (
                  <tr key={u.id} className={u.active ? '' : 'disabled'}>
                    <td>{u.name}<div className="sub">{u.email}</div></td>
                    <td>
                      <select value={u.role} disabled={u.id === me.id} onChange={(e) => update(u, { role: e.target.value })} style={{ width: 'auto' }} aria-label={`Role for ${u.name}`}>
                        {Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td>{u.active ? 'Active' : 'Deactivated'}</td>
                    <td>{date(u.created_at, false)}</td>
                    <td>
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn ghost sm" onClick={() => resetPassword(u)}>Set password</button>
                        {u.id !== me.id && <button className="btn ghost sm" onClick={() => update(u, { active: !u.active })}>{u.active ? 'Deactivate' : 'Reactivate'}</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="section">
        <h2>Activity log</h2>
        <ErrorNote error={audit.error} />
        {audit.data && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th></tr></thead>
              <tbody>
                {audit.data.map((a) => (
                  <tr key={a.id}>
                    <td className="muted">{ago(a.created_at)}</td>
                    <td>{a.user_name || '—'}</td>
                    <td>{ACTION_LABEL[a.action] || a.action}</td>
                    <td className="small muted">{a.entity ? `${a.entity} #${a.entity_id ?? ''}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
