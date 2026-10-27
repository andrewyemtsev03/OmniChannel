import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useLoad, phone } from '../lib.js';
import { ConsentMark, ErrorNote, Empty, Loading } from '../components.jsx';

function eligibility(d, channel) {
  if (channel === 'whatsapp') {
    if (!d.whatsapp_consent) return d.has_consent ? 'Consent does not cover WhatsApp' : 'No СОПД';
    if (!d.phone) return 'No phone number';
    return null;
  }
  return d.has_consent ? null : 'No СОПД';
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn sm" type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { window.prompt('Copy the link:', text); }
    }}>{done ? 'Copied' : 'Copy link'}</button>
  );
}

function Results({ result, onReset }) {
  const label = {
    sent: 'Sent from the company WhatsApp number',
    dry_run: 'Ready: open WhatsApp to send it',
    created: 'Personal link created',
    skipped: 'Skipped',
    failed: 'Failed',
  };
  const s = result.summary;
  const parts = [
    s.sent && `${s.sent} sent`, s.dry_run && `${s.dry_run} ready to send from your phone`,
    s.created && `${s.created} links created`, s.skipped && `${s.skipped} skipped`, s.failed && `${s.failed} failed`,
  ].filter(Boolean);
  return (
    <section className="section">
      <div className="section-head">
        <h2>Result</h2>
        <button className="btn" onClick={onReset}>Send another</button>
      </div>
      <div className={`notice ${s.failed || s.skipped ? '' : 'ok'}`} style={{ marginBottom: 14 }}>{parts.join(', ')}.</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Doctor</th><th>Result</th><th /></tr></thead>
          <tbody>
            {result.results.map((r) => (
              <tr key={r.doctor_id}>
                <td>{r.full_name || `Doctor #${r.doctor_id}`}</td>
                <td>{label[r.status]}{r.error && <div className="sub" style={{ color: 'var(--red)' }}>{r.error}</div>}</td>
                <td>
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    {r.wa_me_url && <a className="btn sm primary" href={r.wa_me_url} target="_blank" rel="noreferrer">Open WhatsApp</a>}
                    {r.url && <a className="btn sm" href={r.url} target="_blank" rel="noreferrer">Show on this device</a>}
                    {r.url && <CopyButton text={r.url} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Opening a personal link yourself counts as a view by that doctor. Use it only when showing the presentation to the doctor during a visit.
      </p>
    </section>
  );
}

export default function Send() {
  const { state } = useLocation();
  const presentations = useLoad(() => api.get('/api/presentations?status=approved'));
  const doctors = useLoad(() => api.get('/api/doctors'));
  const [presentationId, setPresentationId] = useState(state?.presentationId ? String(state.presentationId) : '');
  const [channel, setChannel] = useState('whatsapp');
  const [selected, setSelected] = useState(new Set(state?.doctorIds || []));
  const [filter, setFilter] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (doctors.data || []).filter((d) => !q || [d.full_name, d.city, d.specialty, d.institution].some((v) => v && v.toLowerCase().includes(q)));
  }, [doctors.data, filter]);
  const eligibleIds = rows.filter((d) => !eligibility(d, channel)).map((d) => d.id);
  const chosen = (doctors.data || []).filter((d) => selected.has(d.id) && !eligibility(d, channel));

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.post('/api/send', { presentation_id: Number(presentationId), doctor_ids: chosen.map((d) => d.id), channel }));
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };

  if (presentations.loading || doctors.loading) return <Loading />;
  const approved = presentations.data || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Send a presentation</h1>
          <p>Each doctor gets a personal link, so you can see when they open it and which slides they spend time on.</p>
        </div>
      </div>
      <ErrorNote error={presentations.error || doctors.error} />

      {result ? <Results result={result} onReset={() => { setResult(null); setSelected(new Set()); }} /> : (
        <>
          <div className="step">
            <div className="num">1</div>
            <div>
              <h2>Choose an approved presentation</h2>
              {approved.length === 0 ? (
                <div className="table-wrap"><Empty title="No approved presentations">A presentation needs MLR approval before it can be sent. <Link to="/presentations">Go to presentations</Link></Empty></div>
              ) : (
                <select value={presentationId} onChange={(e) => setPresentationId(e.target.value)} style={{ maxWidth: 520 }} aria-label="Presentation">
                  <option value="">Select a presentation</option>
                  {approved.map((p) => <option key={p.id} value={p.id}>{p.title}{p.approval_code ? ` (${p.approval_code})` : ''}</option>)}
                </select>
              )}
            </div>
          </div>

          <div className="step">
            <div className="num">2</div>
            <div>
              <h2>Choose how to deliver it</h2>
              <div className="grid-2" style={{ maxWidth: 720 }}>
                <label className="choice">
                  <input type="radio" name="channel" checked={channel === 'whatsapp'} onChange={() => setChannel('whatsapp')} />
                  <div><strong>WhatsApp</strong><span>Sends the link to the doctor's phone. Needs consent covering WhatsApp.</span></div>
                </label>
                <label className="choice">
                  <input type="radio" name="channel" checked={channel === 'link'} onChange={() => setChannel('link')} />
                  <div><strong>Personal link only</strong><span>Creates the link to show on a tablet during a visit or share another way.</span></div>
                </label>
              </div>
            </div>
          </div>

          <div className="step">
            <div className="num">3</div>
            <div>
              <h2>Choose doctors</h2>
              <div className="section-head">
                <input type="search" placeholder="Filter by name, city or specialty" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 360 }} aria-label="Filter doctors" />
                <div className="row">
                  <button className="btn sm" type="button" onClick={() => setSelected(new Set([...selected, ...eligibleIds]))}>Select all eligible ({eligibleIds.length})</button>
                  {selected.size > 0 && <button className="btn ghost sm" type="button" onClick={() => setSelected(new Set())}>Clear</button>}
                </div>
              </div>
              <div className="table-wrap">
                {rows.length === 0 ? <Empty title="No doctors found" /> : (
                  <table>
                    <thead><tr><th style={{ width: 36 }} /><th>Doctor</th><th>Phone</th><th>Consent</th><th /></tr></thead>
                    <tbody>
                      {rows.map((d) => {
                        const reason = eligibility(d, channel);
                        return (
                          <tr key={d.id} className={reason ? 'disabled' : ''}>
                            <td><input type="checkbox" disabled={Boolean(reason)} checked={!reason && selected.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Select ${d.full_name}`} /></td>
                            <td>{d.full_name}<div className="sub">{[d.specialty, d.city].filter(Boolean).join(', ')}</div></td>
                            <td className="nowrap">{phone(d.phone)}</td>
                            <td><ConsentMark has={d.has_consent} whatsapp={d.whatsapp_consent} /></td>
                            <td className="small">{reason && <Link to={`/doctors/${d.id}`}>{reason}: fix</Link>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div className="step">
            <div />
            <div className="stack">
              <ErrorNote error={error} />
              <div className="row">
                <button className="btn primary" disabled={busy || !presentationId || chosen.length === 0} onClick={send}>
                  {busy ? 'Working…' : channel === 'whatsapp'
                    ? `Send to ${chosen.length} ${chosen.length === 1 ? 'doctor' : 'doctors'}`
                    : `Create ${chosen.length} personal ${chosen.length === 1 ? 'link' : 'links'}`}
                </button>
                {!presentationId && <span className="small muted">Choose a presentation first.</span>}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
