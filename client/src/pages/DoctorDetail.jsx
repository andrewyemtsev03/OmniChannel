import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useLoad, date, duration, ago, phone, plural, CHANNEL_LABEL, METHOD_LABEL } from '../lib.js';
import { Avatar, Empty, ErrorNote, FormDialog, Icon, PageHero, Skeleton, useFeedback } from '../ui.jsx';
import { DoctorDialog } from './Doctors.jsx';

const today = () => new Date().toISOString().slice(0, 10);

function consentState(c) {
  if (c.withdrawn_at) return { label: `Withdrawn ${date(c.withdrawn_at, false)}`, cls: 'no' };
  if (!c.active) return { label: 'Expired', cls: 'no' };
  return { label: 'Active', cls: 'yes' };
}

function ConsentDialog({ open, onClose, doctorId, onSaved }) {
  const blank = {
    purpose: 'Получение научной и рекламной информации о рецептурных препаратах STADA',
    channel: 'any', method: 'written', given_at: today(), expires_at: '', evidence_note: '',
  };
  const [f, setF] = useState(blank);
  useEffect(() => { if (open) setF(blank); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <FormDialog open={open} onClose={onClose} title="Record a consent" submitLabel="Save consent" wide
      description="Record the consent exactly as the doctor gave it. Materials can then be sent through the channels it covers."
      onSubmit={async () => { await api.post(`/api/doctors/${doctorId}/consents`, { ...f, expires_at: f.expires_at || null }); onSaved(); }}>
      <label className="field">Purpose of processing
        <textarea value={f.purpose} onChange={set('purpose')} required />
        <span className="hint">Use the wording on the form the doctor signed. Agree it with your lawyer.</span>
      </label>
      <div className="grid-3">
        <label className="field">Channel
          <select value={f.channel} onChange={set('channel')}>{Object.entries(CHANNEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="field">How it was given
          <select value={f.method} onChange={set('method')}>{Object.entries(METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="field">Date given<input type="date" value={f.given_at} max={today()} onChange={set('given_at')} required /></label>
      </div>
      <div className="grid-2">
        <label className="field"><span>Valid until <span className="opt">(optional)</span></span><input type="date" value={f.expires_at} min={f.given_at} onChange={set('expires_at')} /></label>
        <label className="field">Where the proof is kept<input value={f.evidence_note} onChange={set('evidence_note')} placeholder="Scan in shared drive, paper form in rep folder" /></label>
      </div>
    </FormDialog>
  );
}

function ConsentBanner({ d, onRecord }) {
  const wa = d.consents.some((c) => c.active && (c.channel === 'whatsapp' || c.channel === 'any'));
  const any = d.consents.some((c) => c.active);
  if (wa && d.phone) return <div className="notice"><Icon name="shield" /><div className="grow"><strong>Ready for WhatsApp.</strong> Active consent covers WhatsApp, and a phone number is on file.</div></div>;
  if (any) return (
    <div className="notice"><Icon name="shield" /><div className="grow">
      <strong>Personal links only.</strong> {wa ? 'Add a phone number to send by WhatsApp.' : 'The consent on file does not cover WhatsApp.'}
    </div></div>
  );
  return (
    <div className="notice attention"><Icon name="alert" /><div className="grow"><strong>No consent (СОПД) on file.</strong> Materials can't be sent and views can't be tracked until you record one.</div>
      <button className="btn sm danger" onClick={onRecord}>Record consent</button></div>
  );
}

// One entry per link: when it was sent, then what the doctor did with it.
function Activity({ d }) {
  const failed = d.messages.filter((m) => m.status === 'failed');
  if (!d.links.length && !failed.length) return <Empty title="Nothing sent yet">Presentations you send to this doctor, and their views, appear here.</Empty>;
  return (
    <ul className="timeline">
      {failed.map((m) => (
        <li key={`m${m.id}`}>
          <span className="node attention"><Icon name="alert" /></span>
          <div><div className="t">WhatsApp message failed</div><div className="d">{m.error} {ago(m.created_at)}</div></div>
        </li>
      ))}
      {d.links.map((l) => (
        <li key={l.id}>
          <span className={`node ${l.first_opened_at ? '' : 'muted'}`}><Icon name={l.first_opened_at ? 'eye' : 'send'} /></span>
          <div>
            <div className="t"><Link to={`/presentations/${l.presentation_id}`}>{l.title}</Link> sent {l.channel === 'whatsapp' ? 'by WhatsApp' : 'as a personal link'}</div>
            <div className="d">
              {date(l.created_at)}.{' '}
              {l.first_opened_at
                ? `Opened ${plural(l.sessions, 'time', 'times')}, ${duration(l.total_seconds)} in total, last ${ago(l.last_viewed_at)}.`
                : 'Not opened yet.'}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function DoctorDetail() {
  const { id } = useParams();
  const user = useAuth();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const { data: d, error, loading, reload } = useLoad(() => api.get(`/api/doctors/${id}`), [id]);
  const [dialog, setDialog] = useState(null); // 'edit' | 'consent'

  if (error) return <div className="page"><ErrorNote error={error} /></div>;
  if (loading && !d) return <div className="page stack"><Skeleton h={120} r={18} /><Skeleton h={260} r={18} /></div>;

  const canSend = d.consents.some((c) => c.active);

  const withdraw = async (c) => {
    const ok = await confirm({
      title: 'Withdraw this consent?', danger: true, confirmLabel: 'Withdraw consent',
      body: 'Use this when the doctor withdraws consent. Nothing more can be sent on the basis of this consent. The record stays for audit.',
    });
    if (!ok) return;
    try { await api.post(`/api/doctors/${d.id}/consents/${c.id}/withdraw`); toast('Consent withdrawn'); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${d.full_name}?`, danger: true, confirmLabel: 'Delete permanently',
      body: 'Their consents, links and viewing history are removed permanently. Use this when the doctor asks for their data to be erased.',
    });
    if (!ok) return;
    try { await api.del(`/api/doctors/${d.id}`); toast(`${d.full_name} deleted`); navigate('/doctors'); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <>
      <PageHero crumb={{ to: '/doctors', label: 'Doctors' }} title={
        <span className="row" style={{ gap: 16, flexWrap: 'nowrap' }}><Avatar name={d.full_name} size="lg" /><span>{d.full_name}</span></span>
      }
        actions={<>
          <button className="btn" onClick={() => setDialog('edit')}><Icon name="edit" />Edit details</button>
          <button className="btn primary" disabled={!canSend} title={canSend ? undefined : 'Record a consent first'}
            onClick={() => navigate('/send', { state: { doctorIds: [d.id] } })}><Icon name="send" />Send a presentation</button>
        </>}>
        {[d.specialty, d.institution, d.city].filter(Boolean).join(', ') || 'No details yet'}
      </PageHero>

      <div className="page">
        <ConsentBanner d={d} onRecord={() => setDialog('consent')} />

        <div className="layout-2 section">
          <div className="stack" style={{ gap: 20 }}>
            <div className="card">
              <div className="card-head">
                <div><h2>Consent (СОПД)</h2><p>Consent to personal data processing</p></div>
                <button className="btn sm" onClick={() => setDialog('consent')}><Icon name="plus" />Record consent</button>
              </div>
              <div style={{ marginTop: 12 }}>
                {d.consents.length === 0 ? (
                  <Empty title="No consent recorded">Record the consent after the doctor signs the form or confirms it in eGov Mobile.</Empty>
                ) : d.consents.map((c) => {
                  const s = consentState(c);
                  return (
                    <div key={c.id} className={`consent-item ${c.active ? '' : 'inactive'}`}>
                      <div className="top">
                        <span className={`consent ${s.cls}`}>{s.label}</span>
                        {c.active && <button className="btn quiet sm" onClick={() => withdraw(c)}>Withdraw</button>}
                      </div>
                      <div className="purpose">{c.purpose}</div>
                      <div className="facts">
                        <span>{CHANNEL_LABEL[c.channel]}</span>
                        <span>{METHOD_LABEL[c.method]}</span>
                        <span>Given {date(c.given_at, false)}{c.expires_at ? `, valid until ${date(c.expires_at, false)}` : ''}</span>
                        {c.evidence_note && <span>Proof: {c.evidence_note}</span>}
                        <span>Recorded by {c.recorded_by_name || 'unknown'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h2>Activity</h2></div>
              <div className="card-body"><Activity d={d} /></div>
            </div>
          </div>

          <div className="stack" style={{ gap: 20 }}>
            <div className="card card-pad">
              <h2 style={{ fontSize: 16, marginBottom: 14 }}>Details</h2>
              <dl className="dl">
                <dt>WhatsApp</dt><dd>{phone(d.phone)}</dd>
                <dt>Email</dt><dd>{d.email || '—'}</dd>
                <dt>Proxima ID</dt><dd>{d.proxima_id || '—'}</dd>
                <dt>Medical rep</dt><dd>{d.rep?.name || 'Not assigned'}</dd>
                <dt>Added</dt><dd>{date(d.created_at, false)}</dd>
              </dl>
            </div>
            {user.role === 'admin' && (
              <div className="card card-pad">
                <h2 style={{ fontSize: 16 }}>Erase this doctor's data</h2>
                <p className="small" style={{ color: 'var(--text-2)', margin: '6px 0 14px' }}>
                  For data subject requests. Removes the doctor, their consents, links and viewing history.
                </p>
                <button className="btn danger sm" onClick={remove}><Icon name="trash" />Delete permanently</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <DoctorDialog open={dialog === 'edit'} onClose={() => setDialog(null)} initial={d} title="Edit doctor" submitLabel="Save changes"
        onSave={async (f) => { await api.patch(`/api/doctors/${d.id}`, f); toast('Changes saved'); reload(); }} />
      <ConsentDialog open={dialog === 'consent'} onClose={() => setDialog(null)} doctorId={d.id}
        onSaved={() => { toast('Consent recorded'); reload(); }} />
    </>
  );
}
