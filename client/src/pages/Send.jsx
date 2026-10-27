import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useLoad, phone, plural } from '../lib.js';
import { Avatar, ConsentMark, DeckThumb, Empty, ErrorNote, Icon, Notice, PageHero, SearchInput, Skeleton, useFeedback } from '../ui.jsx';

function eligibility(d, channel) {
  if (channel === 'whatsapp') {
    if (!d.whatsapp_consent) return d.has_consent ? 'Consent does not cover WhatsApp' : 'No СОПД';
    if (!d.phone) return 'No phone number';
    return null;
  }
  return d.has_consent ? null : 'No СОПД';
}

// Must match greetingName() and messageText() in server/src/services/whatsapp.js
const greetingName = (full) => { const p = String(full || '').trim().split(/\s+/); return p.length >= 3 ? p.slice(1).join(' ') : p.join(' '); };
const messageFor = (name, title) => `Здравствуйте, ${greetingName(name)}! Направляю вам материал «${title}»: `;

function CopyButton({ text }) {
  const { toast } = useFeedback();
  return (
    <button className="btn sm" type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(text); toast('Link copied'); } catch { window.prompt('Copy the link:', text); }
    }}><Icon name="copy" />Copy link</button>
  );
}

function Results({ result, onReset }) {
  const label = {
    sent: ['Sent from the company WhatsApp number', 'check'],
    dry_run: ['Ready. Open WhatsApp to send it from your phone', 'chat'],
    created: ['Personal link created', 'link'],
    skipped: ['Skipped', 'alert'],
    failed: ['Failed', 'alert'],
  };
  const s = result.summary;
  const parts = [
    s.sent && `${s.sent} sent`, s.dry_run && `${s.dry_run} ready to send from your phone`,
    s.created && `${plural(s.created, 'link', 'links')} created`, s.skipped && `${s.skipped} skipped`, s.failed && `${s.failed} failed`,
  ].filter(Boolean);
  const bad = s.failed || s.skipped;
  return (
    <div className="stack" style={{ gap: 20 }}>
      <Notice tone={bad ? 'attention' : 'info'} icon={bad ? 'alert' : 'check'}><strong>{parts.join(', ')}.</strong>
        {s.dry_run ? ' WhatsApp is in test mode, so tap "Open WhatsApp" for each doctor.' : ''}</Notice>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Doctor</th><th>Result</th><th /></tr></thead>
            <tbody>
              {result.results.map((r) => {
                const [text, icon] = label[r.status];
                const warn = r.status === 'skipped' || r.status === 'failed';
                return (
                  <tr key={r.doctor_id}>
                    <td><div className="person"><Avatar name={r.full_name} size="sm" /><span className="name">{r.full_name || `Doctor #${r.doctor_id}`}</span></div></td>
                    <td>
                      <span className="row" style={{ gap: 8, flexWrap: 'nowrap', color: warn ? 'var(--rubine-700)' : 'var(--text)' }}><Icon name={icon} />{text}</span>
                      {r.error && <div className="sub" style={{ marginLeft: 26 }}>{r.error}</div>}
                    </td>
                    <td>
                      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        {r.wa_me_url && <a className="btn sm primary" href={r.wa_me_url} target="_blank" rel="noreferrer"><Icon name="chat" />Open WhatsApp</a>}
                        {r.url && <CopyButton text={r.url} />}
                        {r.url && <a className="btn sm quiet" href={r.url} target="_blank" rel="noreferrer" title="Opens the doctor's view. Counts as a view."><Icon name="slides" />Show</a>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="small muted">"Show" opens the doctor's view on this device and counts as their view. Use it only when presenting to the doctor in person.</p>
      <div><button className="btn" onClick={onReset}><Icon name="refresh" />Send another</button></div>
    </div>
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

  const all = doctors.data || [];
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return all.filter((d) => !q || [d.full_name, d.city, d.specialty, d.institution].some((v) => v && v.toLowerCase().includes(q)));
  }, [all, filter]);
  const eligibleIds = rows.filter((d) => !eligibility(d, channel)).map((d) => d.id);
  const chosen = all.filter((d) => selected.has(d.id) && !eligibility(d, channel));
  const droppedBySwitch = all.filter((d) => selected.has(d.id) && eligibility(d, channel)).length;
  const approved = presentations.data || [];
  const deck = approved.find((p) => String(p.id) === presentationId);

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
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };

  const sendLabel = channel === 'whatsapp' ? `Send to ${plural(chosen.length, 'doctor', 'doctors')}` : `Create ${plural(chosen.length, 'link', 'links')}`;

  return (
    <>
      <PageHero title={!result ? 'Send a presentation' : result.summary.sent ? 'Sent' : 'Links ready'}>
        Every doctor gets a personal link, so you can see when they open it and which slides hold their attention.
      </PageHero>
      <div className="page">
        <ErrorNote error={presentations.error || doctors.error} />
        {(presentations.loading || doctors.loading) && !result ? (
          <div className="send-layout"><Skeleton h={480} r={18} /><Skeleton h={360} r={18} /></div>
        ) : result ? (
          <Results result={result} onReset={() => { setResult(null); setSelected(new Set()); }} />
        ) : (
          <div className="send-layout">
            <div>
              <section className="card step-card" aria-labelledby="s1">
                <div className={`step-title ${deck ? '' : 'todo'}`}><span className="num">{deck ? <Icon name="check" /> : 1}</span><h2 id="s1">Choose an approved presentation</h2></div>
                {approved.length === 0 ? (
                  <Empty title="No approved presentations" action={<Link className="btn" to="/presentations">Go to presentations</Link>}>
                    A presentation needs MLR approval before it can be sent.
                  </Empty>
                ) : (
                  <div className="pick-grid" role="radiogroup" aria-label="Presentation">
                    {approved.map((p) => (
                      <label key={p.id} className="pick">
                        <input type="radio" name="deck" value={p.id} checked={presentationId === String(p.id)} onChange={() => setPresentationId(String(p.id))} />
                        <span className="tick"><Icon name="check" /></span>
                        <DeckThumb id={p.id} title={p.title} />
                        <div className="body"><div className="title">{p.title}</div><div className="meta">{p.approval_code}</div></div>
                      </label>
                    ))}
                  </div>
                )}
              </section>

              <section className="card step-card" aria-labelledby="s2">
                <div className="step-title"><span className="num"><Icon name="check" /></span><h2 id="s2">Choose how to deliver it</h2></div>
                <div className="choice-grid">
                  <label className="choice">
                    <span className="icon"><Icon name="chat" /></span>
                    <div style={{ flex: 1 }}><strong>WhatsApp</strong><span>Sends the link to the doctor's phone. Needs consent that covers WhatsApp.</span></div>
                    <input type="radio" name="channel" checked={channel === 'whatsapp'} onChange={() => setChannel('whatsapp')} />
                  </label>
                  <label className="choice">
                    <span className="icon"><Icon name="link" /></span>
                    <div style={{ flex: 1 }}><strong>Personal link</strong><span>To show on a tablet during a visit, or to share another way.</span></div>
                    <input type="radio" name="channel" checked={channel === 'link'} onChange={() => setChannel('link')} />
                  </label>
                </div>
              </section>

              <section className="card step-card" aria-labelledby="s3">
                <div className={`step-title ${chosen.length ? '' : 'todo'}`}><span className="num">{chosen.length ? <Icon name="check" /> : 3}</span><h2 id="s3">Choose doctors</h2></div>
                <div className="toolbar">
                  <SearchInput value={filter} onChange={setFilter} placeholder="Filter by name, city or specialty" label="Filter doctors" />
                  <button className="btn sm" type="button" disabled={!eligibleIds.length} onClick={() => setSelected(new Set([...selected, ...eligibleIds]))}>Select all eligible ({eligibleIds.length})</button>
                  {selected.size > 0 && <button className="btn quiet sm" type="button" onClick={() => setSelected(new Set())}>Clear</button>}
                </div>
                {rows.length === 0 ? <Empty title="No doctors found" /> : (
                  <div className="table-wrap" style={{ margin: '0 -24px -22px', borderTop: '1px solid var(--line)' }}>
                    <table>
                      <tbody>
                        {rows.map((d) => {
                          const reason = eligibility(d, channel);
                          const on = !reason && selected.has(d.id);
                          return (
                            <tr key={d.id} className={`${reason ? 'dim' : 'link'} ${on ? 'selected' : ''}`} onClick={() => !reason && toggle(d.id)}>
                              <td className="check" onClick={(e) => e.stopPropagation()}>
                                <input type="checkbox" disabled={Boolean(reason)} checked={on} onChange={() => toggle(d.id)} aria-label={`Select ${d.full_name}`} />
                              </td>
                              <td><div className="person"><Avatar name={d.full_name} size="sm" /><div><div className="name">{d.full_name}</div><div className="sub">{[d.specialty, d.city].filter(Boolean).join(', ')}</div></div></div></td>
                              <td className="nowrap">{phone(d.phone)}</td>
                              <td>{reason
                                ? <Link to={`/doctors/${d.id}`} onClick={(e) => e.stopPropagation()} className="small" style={{ color: 'var(--rubine-700)' }}>{reason}: fix</Link>
                                : <ConsentMark has={d.has_consent} whatsapp={d.whatsapp_consent} />}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            <aside className="card summary" aria-label="Summary">
              <div className="card-head"><h2>Summary</h2></div>
              <div className="card-body">
                <div className="line"><span>Presentation</span><span>{deck ? deck.title : 'Not chosen'}</span></div>
                <div className="line"><span>Delivery</span><span>{channel === 'whatsapp' ? 'WhatsApp' : 'Personal link'}</span></div>
                <div className="line"><span>Doctors</span><span>{chosen.length}</span></div>
                {droppedBySwitch > 0 && <p className="small" style={{ color: 'var(--rubine-700)' }}>{plural(droppedBySwitch, 'selected doctor is', 'selected doctors are')} not eligible for this channel and will be left out.</p>}
                {channel === 'whatsapp' && (
                  <div>
                    <div className="bubble-label">What the doctor receives</div>
                    <div className="bubble-wrap">
                      <div className="bubble">
                        {messageFor(chosen[0]?.full_name || 'Анна Сергеевна', deck?.title || 'Название материала')}
                        <span className="link">{window.location.origin}/v/…</span>
                      </div>
                    </div>
                  </div>
                )}
                <ErrorNote error={error} />
                <button className="btn primary" style={{ width: '100%', height: 46 }} disabled={busy || !deck || chosen.length === 0} onClick={send}>
                  <Icon name={channel === 'whatsapp' ? 'send' : 'link'} />{busy ? 'Working…' : sendLabel}
                </button>
                {!deck && <p className="small muted" style={{ textAlign: 'center' }}>Choose a presentation to continue.</p>}
              </div>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
