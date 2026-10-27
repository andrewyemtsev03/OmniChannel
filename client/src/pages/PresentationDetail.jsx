import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useLoad, date, duration, pct, ago } from '../lib.js';
import { Stamp, Kpis, ErrorNote, Empty, Loading } from '../components.jsx';

// The signature view: one tile per slide. Fill height = average time on the slide
// (relative to the slowest slide); fill strength = share of viewers who reached it.
function AttentionStrip({ slides, slideCount }) {
  const count = Math.max(slideCount || 0, ...slides.map((s) => s.slide), 0);
  if (!count) return null;
  const bySlide = new Map(slides.map((s) => [s.slide, s]));
  const maxAvg = Math.max(1, ...slides.map((s) => s.avg_seconds));
  return (
    <>
      <div className="attention" role="list" aria-label="Attention per slide">
        {Array.from({ length: count }, (_, i) => {
          const s = bySlide.get(i + 1);
          if (!s) {
            return (
              <div key={i} className="slide-cell unseen" role="listitem" aria-label={`Slide ${i + 1}: not viewed`}>
                <div className="slide-tile"><span className="n">{i + 1}</span></div>
                <div className="slide-cap"><span>Not viewed</span></div>
              </div>
            );
          }
          return (
            <div key={i} className="slide-cell" role="listitem"
              aria-label={`Slide ${i + 1}: average ${duration(s.avg_seconds)}, reached by ${pct(s.reach)} of views`}>
              <div className="slide-tile">
                <div className="fill" style={{ height: `${Math.max(6, (s.avg_seconds / maxAvg) * 100)}%`, opacity: 0.25 + 0.75 * s.reach }} />
                <span className="n">{i + 1}</span>
              </div>
              <div className="slide-cap"><strong>{duration(s.avg_seconds)}</strong><span>{pct(s.reach)} reached</span></div>
            </div>
          );
        })}
      </div>
      <div className="legend">
        <span>Fill height: average time on the slide</span>
        <span>Fill strength: share of views that reached it</span>
      </div>
    </>
  );
}

function Actions({ p, onChange }) {
  const user = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState(null); // 'approve' | 'reject' | 'replace'
  const [value, setValue] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const canReview = user.role === 'admin' || user.role === 'reviewer';

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try { await fn(); setMode(null); setValue(''); onChange(); } catch (err) { setError(err); }
    setBusy(false);
  };
  const act = (action, body) => run(() => api.post(`/api/presentations/${p.id}/${action}`, body));

  return (
    <div className="stack" style={{ justifyItems: 'end' }}>
      <div className="row">
        {p.status === 'approved' && <button className="btn primary" onClick={() => navigate('/send', { state: { presentationId: p.id } })}>Send to doctors</button>}
        {canReview && p.status === 'draft' && <>
          <button className="btn" onClick={() => setMode(mode === 'replace' ? null : 'replace')}>Replace file</button>
          <button className="btn primary" disabled={busy} onClick={() => act('submit')}>Submit for MLR review</button>
        </>}
        {canReview && p.status === 'in_review' && <>
          <button className="btn" onClick={() => setMode(mode === 'reject' ? null : 'reject')}>Return for changes</button>
          <button className="btn primary" onClick={() => setMode(mode === 'approve' ? null : 'approve')}>Approve</button>
        </>}
        {user.role === 'admin' && p.status !== 'archived' && (
          <button className="btn ghost" disabled={busy} onClick={() => {
            if (window.confirm('Archive this presentation? Links already sent will stop working.')) act('archive');
          }}>Archive</button>
        )}
        {user.role === 'admin' && p.links_count === 0 && (
          <button className="btn ghost" disabled={busy} onClick={() => {
            if (window.confirm('Delete this presentation permanently?')) run(async () => { await api.del(`/api/presentations/${p.id}`); navigate('/presentations'); });
          }}>Delete</button>
        )}
      </div>
      <ErrorNote error={error} />
      {mode === 'approve' && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); act('approve', { approval_code: value }); }}>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="MLR approval code" required style={{ width: 220 }} aria-label="MLR approval code" />
          <button className="btn primary" disabled={busy}>Confirm approval</button>
        </form>
      )}
      {mode === 'reject' && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); act('reject', { comment: value }); }}>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="What needs to change?" required style={{ width: 300 }} aria-label="Review comment" />
          <button className="btn" disabled={busy}>Return to draft</button>
        </form>
      )}
      {mode === 'replace' && (
        <form className="row" onSubmit={(e) => {
          e.preventDefault();
          if (!file) return setError(new Error('Choose the new .html file'));
          const form = new FormData();
          form.append('file', file);
          run(() => api.upload(`/api/presentations/${p.id}/file`, form));
        }}>
          <input type="file" accept=".html,.htm,text/html" onChange={(e) => setFile(e.target.files[0] || null)} style={{ width: 280 }} />
          <button className="btn primary" disabled={busy}>Upload new version</button>
        </form>
      )}
    </div>
  );
}

export default function PresentationDetail() {
  const { id } = useParams();
  const { data: p, error, loading, reload } = useLoad(() => api.get(`/api/presentations/${id}`), [id]);

  if (loading && !p) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const s = p.stats;

  return (
    <>
      <Link className="crumb" to="/presentations">Presentations</Link>
      <div className="page-head">
        <div>
          <div className="row" style={{ marginBottom: 8 }}>
            <Stamp status={p.status} />
            {p.approval_code && <span className="code small">{p.approval_code}</span>}
          </div>
          <h1>{p.title}</h1>
          <p>
            {p.product || 'No product set'}, version {p.version}. Uploaded by {p.uploaded_by_name || '—'} {ago(p.created_at)}.
            {p.approved_at && ` Approved by ${p.approved_by_name} on ${date(p.approved_at, false)}.`}
          </p>
          {p.description && <p className="small muted">{p.description}</p>}
        </div>
        <Actions p={p} onChange={reload} />
      </div>

      {p.status === 'draft' && p.review_comment && (
        <div className="notice" style={{ marginBottom: 20 }}><strong>Returned by MLR review:</strong> {p.review_comment}</div>
      )}

      <section className="section">
        <h2>Engagement</h2>
        <Kpis items={[
          { label: 'Sent', value: s.links, sub: `${s.doctors_reached} doctors viewed it` },
          { label: 'Opened', value: pct(s.open_rate), sub: `${s.opened_links} of ${s.links} links` },
          { label: 'Views', value: s.sessions, sub: 'viewing sessions' },
          { label: 'Average view', value: duration(s.avg_seconds), sub: `${duration(s.total_seconds)} in total` },
        ]} />
      </section>

      <section className="section">
        <h2>Where doctors spend their time</h2>
        {s.slides.length === 0 && !p.slide_count ? (
          <div className="table-wrap"><Empty title="No slide data yet">Slide-by-slide attention appears after the first doctor opens this presentation.</Empty></div>
        ) : <AttentionStrip slides={s.slides} slideCount={p.slide_count} />}
      </section>

      <section className="section">
        <h2>Doctors</h2>
        <div className="table-wrap">
          {s.doctors.length === 0 ? <Empty title="Not sent to anyone yet" /> : (
            <table>
              <thead><tr><th>Doctor</th><th>City</th><th className="num">Views</th><th className="num">Time</th><th>Last viewed</th></tr></thead>
              <tbody>
                {s.doctors.map((d) => (
                  <tr key={d.id} className={d.sessions ? '' : 'disabled'}>
                    <td><Link to={`/doctors/${d.id}`}>{d.full_name}</Link><div className="sub">{d.specialty || '—'}</div></td>
                    <td>{d.city || '—'}</td>
                    <td className="num">{d.sessions}</td>
                    <td className="num">{duration(d.total_seconds)}</td>
                    <td>{d.last_viewed_at ? ago(d.last_viewed_at) : `Not opened, sent ${ago(d.last_sent_at)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Preview</h2>
          <a className="btn sm" href={`/api/presentations/${p.id}/file`} target="_blank" rel="noreferrer">Open in a new tab</a>
        </div>
        <iframe className="preview" title={`Preview of ${p.title}`} src={`/api/presentations/${p.id}/file`}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" />
        <p className="small muted" style={{ marginTop: 8 }}>Click inside the preview to use the keyboard to change slides. Views here are not tracked.</p>
      </section>
    </>
  );
}
