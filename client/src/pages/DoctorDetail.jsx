import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useLoad, date, duration, ago, phone, CHANNEL_LABEL, METHOD_LABEL } from '../lib.js';
import { ErrorNote, Empty, Loading } from '../components.jsx';
import { DoctorForm } from './Doctors.jsx';

const today = () => new Date().toISOString().slice(0, 10);

function consentState(c) {
  if (c.withdrawn_at) return { label: `Withdrawn ${date(c.withdrawn_at, false)}`, cls: 'no' };
  if (!c.active) return { label: 'Expired', cls: 'no' };
  return { label: 'Active', cls: 'yes' };
}

function ConsentForm({ doctorId, onSaved, onCancel }) {
  const [f, setF] = useState({
    purpose: 'Получение научной и рекламной информации о рецептурных препаратах Stada',
    channel: 'any', method: 'written', given_at: today(), expires_at: '', evidence_note: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/doctors/${doctorId}/consents`, { ...f, expires_at: f.expires_at || null });
      onSaved();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form className="panel inset stack" onSubmit={submit}>
      <h3>Record a consent</h3>
      <ErrorNote error={error} />
      <label className="field">Purpose of processing
        <textarea value={f.purpose} onChange={set('purpose')} required />
        <span className="hint">Use the exact purpose written on the consent the doctor signed. Agree the wording with your lawyer.</span>
      </label>
      <div className="grid-3">
        <label className="field">Channel
          <select value={f.channel} onChange={set('channel')}>
            {Object.entries(CHANNEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">How it was given
          <select value={f.method} onChange={set('method')}>
            {Object.entries(METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">Date given<input type="date" value={f.given_at} max={today()} onChange={set('given_at')} required /></label>
      </div>
      <div className="grid-2">
        <label className="field">Valid until<input type="date" value={f.expires_at} onChange={set('expires_at')} /><span className="hint">Leave empty if the consent has no end date.</span></label>
        <label className="field">Where the proof is kept<input value={f.evidence_note} onChange={set('evidence_note')} placeholder="Scan in shared drive, paper form in rep folder…" /></label>
      </div>
      <div className="row">
        <button className="btn primary" disabled={busy}>Save consent</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function DoctorDetail() {
  const { id } = useParams();
  const user = useAuth();
  const navigate = useNavigate();
  const { data: d, error, loading, reload } = useLoad(() => api.get(`/api/doctors/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [addingConsent, setAddingConsent] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (loading && !d) return <Loading />;
  if (error) return <ErrorNote error={error} />;

  const activeConsent = d.consents.some((c) => c.active);

  const withdraw = async (c) => {
    if (!window.confirm('Mark this consent as withdrawn? Materials can no longer be sent based on it.')) return;
    try { await api.post(`/api/doctors/${d.id}/consents/${c.id}/withdraw`); reload(); } catch (err) { setActionError(err); }
  };
  const remove = async () => {
    if (!window.confirm(`Permanently delete ${d.full_name} and all their consents, links and viewing history? This cannot be undone.`)) return;
    try { await api.del(`/api/doctors/${d.id}`); navigate('/doctors'); } catch (err) { setActionError(err); }
  };

  return (
    <>
      <Link className="crumb" to="/doctors">Doctors</Link>
      <div className="page-head">
        <div>
          <h1>{d.full_name}</h1>
          <p>{[d.specialty, d.institution, d.city].filter(Boolean).join(', ') || 'No details yet'}</p>
          <p className="small muted">{phone(d.phone)}{d.email ? `, ${d.email}` : ''}{d.proxima_id ? `, Proxima ID ${d.proxima_id}` : ''}{d.rep ? `, rep: ${d.rep.name}` : ''}</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setEditing(!editing)}>{editing ? 'Close' : 'Edit details'}</button>
          <button className="btn primary" disabled={!activeConsent}
            title={activeConsent ? '' : 'Record a consent first'}
            onClick={() => navigate('/send', { state: { doctorIds: [d.id] } })}>Send a presentation</button>
        </div>
      </div>
      <ErrorNote error={actionError} />

      {editing && (
        <DoctorForm initial={d} saveLabel="Save changes" onCancel={() => setEditing(false)}
          onSave={async (f) => { await api.patch(`/api/doctors/${d.id}`, f); setEditing(false); reload(); }} />
      )}

      <section className="section">
        <div className="section-head">
          <h2>Consent to personal data processing (СОПД)</h2>
          {!addingConsent && <button className="btn sm" onClick={() => setAddingConsent(true)}>Record a consent</button>}
        </div>
        {addingConsent && (
          <div style={{ marginBottom: 14 }}>
            <ConsentForm doctorId={d.id} onCancel={() => setAddingConsent(false)} onSaved={() => { setAddingConsent(false); reload(); }} />
          </div>
        )}
        <div className="table-wrap">
          {d.consents.length === 0 ? (
            <Empty title="No consent recorded">Without a consent you cannot send materials or track views for this doctor.</Empty>
          ) : (
            <table>
              <thead><tr><th>Status</th><th>Purpose</th><th>Channel</th><th>How given</th><th>Given</th><th>Proof</th><th /></tr></thead>
              <tbody>
                {d.consents.map((c) => {
                  const s = consentState(c);
                  return (
                    <tr key={c.id} className={c.active ? '' : 'disabled'}>
                      <td><span className={`consent ${s.cls}`}>{s.label}</span></td>
                      <td style={{ maxWidth: 320 }}>{c.purpose}</td>
                      <td>{CHANNEL_LABEL[c.channel]}</td>
                      <td>{METHOD_LABEL[c.method]}</td>
                      <td>{date(c.given_at, false)}{c.expires_at && <div className="sub">until {date(c.expires_at, false)}</div>}</td>
                      <td className="small">{c.evidence_note || '—'}<div className="sub">recorded by {c.recorded_by_name || '—'}</div></td>
                      <td>{c.active && <button className="btn ghost sm" onClick={() => withdraw(c)}>Withdraw</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="section">
        <h2>Materials sent</h2>
        <div className="table-wrap">
          {d.links.length === 0 ? <Empty title="Nothing sent yet" /> : (
            <table>
              <thead><tr><th>Presentation</th><th>Channel</th><th>Sent</th><th>Opened</th><th className="num">Views</th><th className="num">Time</th></tr></thead>
              <tbody>
                {d.links.map((l) => (
                  <tr key={l.id}>
                    <td><Link to={`/presentations/${l.presentation_id}`}>{l.title}</Link></td>
                    <td>{l.channel === 'whatsapp' ? 'WhatsApp' : 'Personal link'}</td>
                    <td>{date(l.created_at)}</td>
                    <td>{l.first_opened_at ? date(l.first_opened_at) : <span className="muted">Not opened</span>}</td>
                    <td className="num">{l.sessions}</td>
                    <td className="num">{duration(l.total_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {d.messages.length > 0 && (
        <section className="section">
          <h2>WhatsApp messages</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Result</th><th>Sent by</th></tr></thead>
              <tbody>
                {d.messages.map((m) => (
                  <tr key={m.id}>
                    <td>{ago(m.created_at)}</td>
                    <td>{m.status === 'sent' ? 'Sent from company number' : m.status === 'dry_run' ? 'Test mode: click-to-chat link' : <span style={{ color: 'var(--red)' }}>Failed: {m.error}</span>}</td>
                    <td>{m.sent_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {user.role === 'admin' && (
        <section className="section">
          <h2>Delete this doctor</h2>
          <p className="muted" style={{ margin: '0 0 12px', maxWidth: '70ch' }}>
            Use this when the doctor asks for their data to be erased. Their consents, links and viewing history are removed permanently.
          </p>
          <button className="btn danger" onClick={remove}>Delete doctor permanently</button>
        </section>
      )}
    </>
  );
}
