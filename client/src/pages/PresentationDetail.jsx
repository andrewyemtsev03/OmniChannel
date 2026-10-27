import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useLoad, date, duration, pct, ago } from '../lib.js';
import { Avatar, Empty, ErrorNote, FormDialog, Icon, Kpis, Notice, PageHero, Skeleton, Stamp, useFeedback } from '../ui.jsx';

// One tile per slide. Fill height = average time on the slide relative to the slowest one;
// fill strength = share of views that reached it. Rubine is the brand accent: "look here".
function AttentionStrip({ slides, slideCount }) {
  const count = Math.max(slideCount || 0, ...slides.map((s) => s.slide), 0);
  const bySlide = new Map(slides.map((s) => [s.slide, s]));
  const maxAvg = Math.max(1, ...slides.map((s) => s.avg_seconds));
  const top = slides.length ? slides.reduce((a, b) => (b.avg_seconds > a.avg_seconds ? b : a)) : null;
  return (
    <>
      {top && <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 16 }}>Doctors spend the most time on slide {top.slide} ({duration(top.avg_seconds)} on average).</p>}
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
            <div key={i} className="slide-cell" role="listitem" aria-label={`Slide ${i + 1}: average ${duration(s.avg_seconds)}, reached by ${pct(s.reach)} of views`}>
              <div className="slide-tile">
                <div className="fill" style={{ height: `${Math.max(6, (s.avg_seconds / maxAvg) * 100)}%`, opacity: 0.3 + 0.7 * s.reach }} />
                <span className="n">{i + 1}</span>
              </div>
              <div className="slide-cap"><strong>{duration(s.avg_seconds)}</strong><span>{pct(s.reach)} reached</span></div>
            </div>
          );
        })}
      </div>
      <div className="legend">
        <span><i />Taller fill: more time on the slide</span>
        <span><i className="faint" />Paler fill: fewer viewers got this far</span>
      </div>
    </>
  );
}

function Workflow({ p }) {
  const order = ['draft', 'in_review', 'approved'];
  const idx = p.status === 'archived' ? 3 : order.indexOf(p.status);
  const steps = [
    { key: 'draft', label: 'Draft', note: `Uploaded by ${p.uploaded_by_name || 'unknown'}, ${date(p.created_at, false)}` },
    { key: 'in_review', label: 'MLR review', note: p.status === 'in_review' ? `Waiting since ${ago(p.updated_at)}` : idx > 1 ? 'Reviewed' : 'Not submitted yet' },
    { key: 'approved', label: 'Approved', note: p.approved_at ? `${p.approved_by_name || 'Reviewer'}, ${date(p.approved_at, false)}` : 'Can be sent once approved' },
  ];
  return (
    <div className="card steps" aria-label="Approval progress">
      {steps.map((s, i) => {
        const done = i < idx || (i === 2 && idx >= 2);
        const current = i === idx;
        return (
          <div key={s.key} className={`wstep ${done ? 'done' : ''} ${current ? 'current' : ''} ${current && i === 2 ? 'ok' : ''}`} aria-current={current ? 'step' : undefined}>
            <span className="dot">{done ? <Icon name="check" /> : current ? <Icon name="clock" /> : <span style={{ fontSize: 12, fontWeight: 600 }}>{i + 1}</span>}</span>
            <div><strong>{s.label}</strong><span>{s.note}</span></div>
          </div>
        );
      })}
    </div>
  );
}

function Actions({ p, onChange }) {
  const user = useAuth();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [dialog, setDialog] = useState(null); // 'approve' | 'reject' | 'replace'
  const [value, setValue] = useState('');
  const [file, setFile] = useState(null);
  const canReview = user.role === 'admin' || user.role === 'reviewer';
  const open = (d) => { setValue(''); setFile(null); setDialog(d); };
  const act = async (action, body, msg) => { await api.post(`/api/presentations/${p.id}/${action}`, body); toast(msg); onChange(); };
  const safely = async (fn) => { try { await fn(); } catch (err) { toast(err.message, 'error'); } };

  return (
    <>
      {p.status === 'approved' && <button className="btn primary" onClick={() => navigate('/send', { state: { presentationId: p.id } })}><Icon name="send" />Send to doctors</button>}
      {canReview && p.status === 'draft' && <>
        <button className="btn" onClick={() => open('replace')}><Icon name="upload" />Replace file</button>
        <button className="btn primary" onClick={() => safely(() => act('submit', {}, 'Submitted for MLR review'))}>Submit for MLR review</button>
      </>}
      {canReview && p.status === 'in_review' && <>
        <button className="btn" onClick={() => open('reject')}>Return for changes</button>
        <button className="btn primary" onClick={() => open('approve')}><Icon name="check" />Approve</button>
      </>}
      {user.role === 'admin' && p.status !== 'archived' && (
        <button className="btn quiet" onClick={async () => {
          const ok = await confirm({ title: 'Archive this presentation?', confirmLabel: 'Archive', danger: true,
            body: 'Links already sent to doctors will stop working and show "material is no longer available". Statistics are kept.' });
          if (ok) safely(() => act('archive', {}, 'Presentation archived'));
        }}><Icon name="archive" />Archive</button>
      )}
      {user.role === 'admin' && p.links_count === 0 && (
        <button className="btn quiet" onClick={async () => {
          const ok = await confirm({ title: 'Delete this presentation?', confirmLabel: 'Delete', danger: true, body: 'It has not been sent to anyone, so nothing else is affected.' });
          if (ok) safely(async () => { await api.del(`/api/presentations/${p.id}`); toast('Presentation deleted'); navigate('/presentations'); });
        }}><Icon name="trash" />Delete</button>
      )}

      <FormDialog open={dialog === 'approve'} onClose={() => setDialog(null)} title="Approve for use with doctors" submitLabel="Approve"
        description="After approval the file can't be changed, and reps can send it to doctors with consent."
        onSubmit={() => act('approve', { approval_code: value }, 'Approved. Reps can now send it.')}>
        <label className="field">MLR approval code
          <input value={value} onChange={(e) => setValue(e.target.value)} required autoFocus placeholder="KZ-RX-2026-001" />
          <span className="hint">Shown to doctors at the bottom of the presentation.</span>
        </label>
      </FormDialog>
      <FormDialog open={dialog === 'reject'} onClose={() => setDialog(null)} title="Return for changes" submitLabel="Return to draft"
        description="The uploader sees your comment on this page."
        onSubmit={() => act('reject', { comment: value }, 'Returned to draft')}>
        <label className="field">What needs to change?
          <textarea value={value} onChange={(e) => setValue(e.target.value)} required autoFocus placeholder="Add the reference to the instructions on slide 4" />
        </label>
      </FormDialog>
      <FormDialog open={dialog === 'replace'} onClose={() => setDialog(null)} title="Replace the file" submitLabel="Upload new version"
        description={`This becomes version ${p.version + 1}. It stays a draft until it is submitted and approved.`}
        onSubmit={async () => {
          if (!file) throw new Error('Choose the new .html file.');
          const form = new FormData();
          form.append('file', file);
          await api.upload(`/api/presentations/${p.id}/file`, form);
          toast(`Version ${p.version + 1} uploaded`);
          onChange();
        }}>
        <label className="field">New file<input type="file" accept=".html,.htm,text/html" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
      </FormDialog>
    </>
  );
}

export default function PresentationDetail() {
  const { id } = useParams();
  const { data: p, error, loading, reload } = useLoad(() => api.get(`/api/presentations/${id}`), [id]);
  if (error) return <div className="page"><ErrorNote error={error} /></div>;
  if (loading && !p) return <div className="page stack"><Skeleton h={120} r={18} /><Skeleton h={320} r={18} /></div>;
  const s = p.stats;

  return (
    <>
      <PageHero crumb={{ to: '/presentations', label: 'Presentations' }} title={p.title} actions={<Actions p={p} onChange={reload} />}>
        <span className="row" style={{ gap: 10, display: 'inline-flex' }}>
          <Stamp status={p.status} />{p.approval_code && <span className="code">{p.approval_code}</span>}
          <span>{p.product || 'No product'}, version {p.version}</span>
        </span>
      </PageHero>

      <div className="page">
        {p.status !== 'archived' ? <Workflow p={p} /> : <Notice icon="archive">This presentation is archived. Links sent to doctors no longer open it.</Notice>}
        {p.status === 'draft' && p.review_comment && (
          <div className="section"><Notice tone="attention"><strong>Returned by MLR review:</strong> {p.review_comment}</Notice></div>
        )}

        <div className="layout-2 section">
          <div className="stack" style={{ gap: 20 }}>
            <Kpis items={[
              { label: 'Sent', value: s.links, sub: `${s.doctors_reached} doctors viewed it` },
              { label: 'Opened', value: pct(s.open_rate), sub: `${s.opened_links} of ${s.links} links` },
              { label: 'Average view', value: duration(s.avg_seconds), sub: `${s.sessions} views in total` },
            ]} />
            <div className="card">
              <div className="card-head"><div><h2>Where doctors spend their time</h2><p>Average time per slide across all views</p></div></div>
              <div className="card-body">
                {s.slides.length === 0 && !p.slide_count
                  ? <Empty title="No slide data yet">Slide-by-slide attention appears after the first doctor opens this presentation.</Empty>
                  : <AttentionStrip slides={s.slides} slideCount={p.slide_count} />}
              </div>
            </div>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="card-head" style={{ paddingBottom: 14 }}>
              <h2>Preview</h2>
              <a className="btn sm" href={`/api/presentations/${p.id}/file`} target="_blank" rel="noreferrer"><Icon name="external" />Full screen</a>
            </div>
            <iframe className="preview" title={`Preview of ${p.title}`} src={`/api/presentations/${p.id}/file`}
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" />
            <p className="small muted" style={{ padding: '10px 24px 16px', borderTop: '1px solid var(--line)' }}>Click the preview, then use arrow keys to change slides. Not tracked.</p>
          </div>
        </div>

        <div className="card section">
          <div className="card-head"><h2>Doctors</h2></div>
          {s.doctors.length === 0 ? <Empty title="Not sent to anyone yet">{p.status === 'approved' ? 'Send it to doctors to start seeing engagement.' : 'It can be sent once MLR approves it.'}</Empty> : (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table>
                <thead><tr><th>Doctor</th><th>City</th><th className="num">Views</th><th className="num">Time</th><th>Last viewed</th></tr></thead>
                <tbody>
                  {s.doctors.map((d) => (
                    <tr key={d.id} className={d.sessions ? '' : 'dim'}>
                      <td><Link className="person" to={`/doctors/${d.id}`}><Avatar name={d.full_name} size="sm" /><div><div className="name">{d.full_name}</div><div className="sub">{d.specialty || '—'}</div></div></Link></td>
                      <td>{d.city || '—'}</td>
                      <td className="num">{d.sessions}</td>
                      <td className="num">{duration(d.total_seconds)}</td>
                      <td className="nowrap">{d.last_viewed_at ? ago(d.last_viewed_at) : `Not opened, sent ${ago(d.last_sent_at)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
