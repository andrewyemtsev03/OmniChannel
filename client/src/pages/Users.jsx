import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth, ROLE_LABEL } from '../App.jsx';
import { useLoad, ago, date } from '../lib.js';
import { Avatar, ErrorNote, FormDialog, Icon, PageHero, SkeletonRows, useFeedback } from '../ui.jsx';

const ACTION = {
  'login': ['Signed in', 'logout'],
  'user.create': ['Added a team member', 'users'], 'user.update': ['Changed a team member', 'users'],
  'doctor.create': ['Added a doctor', 'plus'], 'doctor.update': ['Edited a doctor', 'edit'],
  'doctor.delete': ['Deleted a doctor', 'trash'], 'doctor.import': ['Imported doctors', 'upload'],
  'consent.create': ['Recorded a consent', 'shield'], 'consent.withdraw': ['Withdrew a consent', 'shield'],
  'presentation.upload': ['Uploaded a presentation', 'upload'], 'presentation.replace_file': ['Replaced a presentation file', 'upload'],
  'presentation.submit': ['Submitted for MLR review', 'clock'], 'presentation.approve': ['Approved a presentation', 'check'],
  'presentation.reject': ['Returned a presentation for changes', 'edit'], 'presentation.archive': ['Archived a presentation', 'archive'],
  'presentation.delete': ['Deleted a presentation', 'trash'], 'presentation.send': ['Sent a presentation', 'send'],
};
const ENTITY = { doctor: 'doctor', consent: 'consent', presentation: 'presentation', user: 'user' };

function AddUserDialog({ open, onClose, onDone }) {
  const { toast } = useFeedback();
  const [f, setF] = useState({ name: '', email: '', role: 'rep', password: '' });
  useEffect(() => { if (open) setF({ name: '', email: '', role: 'rep', password: '' }); }, [open]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <FormDialog open={open} onClose={onClose} title="Add a team member" submitLabel="Add team member"
      onSubmit={async () => { await api.post('/api/users', f); toast(`${f.name} can now sign in`); onDone(); }}>
      <div className="grid-2">
        <label className="field">Name<input value={f.name} onChange={set('name')} required autoFocus /></label>
        <label className="field">Work email<input type="email" value={f.email} onChange={set('email')} required placeholder="name@stada.kz" /></label>
      </div>
      <label className="field">Role
        <select value={f.role} onChange={set('role')}>{Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <span className="hint">Reps send approved materials to their own doctors. MLR reviewers upload and approve materials. Admins manage everything.</span>
      </label>
      <label className="field">First password
        <input type="text" value={f.password} onChange={set('password')} required minLength={8} autoComplete="off" />
        <span className="hint">At least 8 characters. Share it privately, not by email.</span>
      </label>
    </FormDialog>
  );
}

function PasswordDialog({ user, onClose }) {
  const { toast } = useFeedback();
  const [pw, setPw] = useState('');
  useEffect(() => setPw(''), [user]);
  return (
    <FormDialog open={Boolean(user)} onClose={onClose} title={`New password for ${user?.name || ''}`} submitLabel="Set password"
      onSubmit={async () => { await api.patch(`/api/users/${user.id}`, { password: pw }); toast('Password changed'); }}>
      <label className="field">New password
        <input type="text" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} autoFocus autoComplete="off" />
        <span className="hint">At least 8 characters.</span>
      </label>
    </FormDialog>
  );
}

export default function Users() {
  const me = useAuth();
  const { toast, confirm } = useFeedback();
  const users = useLoad(() => api.get('/api/users'));
  const audit = useLoad(() => api.get('/api/stats/audit?limit=100'));
  const [adding, setAdding] = useState(false);
  const [pwUser, setPwUser] = useState(null);

  const update = async (u, body, msg) => {
    try { await api.patch(`/api/users/${u.id}`, body); toast(msg); users.reload(); audit.reload(); } catch (err) { toast(err.message, 'error'); }
  };
  const toggleActive = async (u) => {
    if (u.active) {
      const ok = await confirm({ title: `Deactivate ${u.name}?`, confirmLabel: 'Deactivate', danger: true,
        body: 'They are signed out immediately and cannot sign in again until reactivated. Their history is kept.' });
      if (!ok) return;
    }
    update(u, { active: !u.active }, u.active ? `${u.name} deactivated` : `${u.name} reactivated`);
  };

  return (
    <>
      <PageHero title="Team" actions={<button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" />Add team member</button>}>
        Who can use the platform, and a record of what they did.
      </PageHero>
      <div className="page">
        {users.loading && !users.data ? <SkeletonRows rows={3} /> : (
          <div className="card">
            <ErrorNote error={users.error} />
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Added</th><th /></tr></thead>
                <tbody>
                  {(users.data || []).map((u) => (
                    <tr key={u.id} className={u.active ? '' : 'dim'}>
                      <td><div className="person"><Avatar name={u.name} /><div><div className="name">{u.name}{u.id === me.id && <span className="muted" style={{ fontWeight: 400 }}> (you)</span>}</div><div className="sub">{u.email}</div></div></div></td>
                      <td>
                        <select value={u.role} disabled={u.id === me.id} style={{ width: 'auto', minHeight: 36, paddingTop: 6, paddingBottom: 6 }}
                          onChange={(e) => update(u, { role: e.target.value }, `${u.name} is now ${ROLE_LABEL[e.target.value]}`)} aria-label={`Role for ${u.name}`}>
                          {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </td>
                      <td>{u.active ? <span className="consent yes">Active</span> : <span className="consent no">Deactivated</span>}</td>
                      <td className="nowrap">{date(u.created_at, false)}</td>
                      <td>
                        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <button className="btn quiet sm" onClick={() => setPwUser(u)}><Icon name="key" />Set password</button>
                          {u.id !== me.id && <button className="btn quiet sm" onClick={() => toggleActive(u)}>{u.active ? 'Deactivate' : 'Reactivate'}</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card section">
          <div className="card-head"><div><h2>Activity log</h2><p>The last 100 compliance-relevant actions</p></div></div>
          <div className="card-body">
            <ErrorNote error={audit.error} />
            {audit.data && (
              <ul className="timeline">
                {audit.data.map((a) => {
                  const [label, icon] = ACTION[a.action] || [a.action, 'info'];
                  return (
                    <li key={a.id}>
                      <span className="node muted"><Icon name={icon} /></span>
                      <div>
                        <div className="t"><strong style={{ fontWeight: 600 }}>{a.user_name || 'System'}</strong> {label.charAt(0).toLowerCase() + label.slice(1)}</div>
                        <div className="d">{ago(a.created_at)}{a.entity && a.entity_id ? `, ${ENTITY[a.entity] || a.entity} #${a.entity_id}` : ''}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
      <AddUserDialog open={adding} onClose={() => setAdding(false)} onDone={() => { users.reload(); audit.reload(); }} />
      <PasswordDialog user={pwUser} onClose={() => setPwUser(null)} />
    </>
  );
}
