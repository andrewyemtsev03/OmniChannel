import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useLoad, duration, pct, ago, greeting, plural } from '../lib.js';
import { Avatar, Empty, ErrorNote, Icon, Kpis, Notice, PageHero, Skeleton, useWidth } from '../ui.jsx';

const shortDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// Views per day, last 30 days. One series in STADA blue; hover a column for its value.
function TrendChart({ data }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const H = 190, top = 12, bottom = 26, left = 30;
  const plotW = Math.max(0, width - left);
  const plotH = H - top - bottom;
  const max = niceMax(Math.max(0, ...data.map((d) => d.views)));
  const slot = data.length ? plotW / data.length : 0;
  const bw = Math.max(2, Math.min(24, slot - 2));
  const y = (v) => top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const total = data.reduce((a, d) => a + d.views, 0);

  const barPath = (x, v) => {
    const h = (v / max) * plotH;
    if (h <= 0) return '';
    const r = Math.min(4, h, bw / 2), y0 = top + plotH, y1 = y0 - h;
    return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + bw - r}Q${x + bw},${y1} ${x + bw},${y1 + r}V${y0}Z`;
  };

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg height={H} role="img" aria-label={`Views per day over the last 30 days, ${total} in total`}>
          <g className="grid">{ticks.map((t) => <line key={t} x1={left} x2={width} y1={y(t)} y2={y(t)} />)}</g>
          <g className="axis">
            {ticks.map((t) => <text key={t} x={0} y={y(t) + 4}>{t}</text>)}
            {data.map((d, i) => (i % 7 === 2 || i === data.length - 1) && (
              <text key={d.day} x={left + i * slot + slot / 2} y={H - 6} textAnchor="middle">{i === data.length - 1 ? 'Today' : shortDay(d.day)}</text>
            ))}
          </g>
          {data.map((d, i) => {
            const x = left + i * slot + (slot - bw) / 2;
            return (
              <g key={d.day}>
                <rect className="hit" x={left + i * slot} y={top} width={slot} height={plotH}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
                <path className={`bar ${hover === i ? 'hover' : ''}`} d={barPath(x, d.views)} pointerEvents="none" />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <div className="tip" style={{ left: left + hover * slot + slot / 2, top: y(data[hover].views) }}>
          <b>{plural(data[hover].views, 'view', 'views')}</b> on {shortDay(data[hover].day)}
        </div>
      )}
      <details className="table-toggle">
        <summary>Show as table</summary>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Day</th><th className="num">Views</th></tr></thead>
            <tbody>{data.filter((d) => d.views > 0).map((d) => <tr key={d.day}><td>{shortDay(d.day)}</td><td className="num">{d.views}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Attention({ data, canReview }) {
  const missing = data.doctors - data.doctors_with_consent;
  const items = [];
  if (canReview && data.review_queue.length) {
    items.push(<div className="todo-group" key="g1">Waiting for MLR review</div>);
    data.review_queue.forEach((p) => items.push(
      <Link className="todo-item" key={`r${p.id}`} to={`/presentations/${p.id}`}>
        <span className="badge"><Icon name="clock" /></span>
        <span><span className="t">{p.title}</span><span className="d" style={{ display: 'block' }}>Submitted {ago(p.updated_at)} by {p.uploaded_by_name || 'unknown'}</span></span>
      </Link>
    ));
  }
  if (data.followups.length) {
    items.push(<div className="todo-group" key="g2">Not opened yet, consider a follow-up</div>);
    data.followups.forEach((f) => items.push(
      <Link className="todo-item" key={`f${f.id}`} to={`/doctors/${f.doctor_id}`}>
        <Avatar name={f.full_name} size="sm" />
        <span><span className="t">{f.full_name}</span><span className="d" style={{ display: 'block' }}>«{f.title}» sent {ago(f.created_at)}</span></span>
      </Link>
    ));
  }
  if (missing > 0) {
    items.push(<div className="todo-group" key="g3">Consent</div>);
    items.push(
      <Link className="todo-item" key="consent" to="/doctors?filter=missing">
        <span className="badge"><Icon name="shield" /></span>
        <span><span className="t">{plural(missing, 'doctor has', 'doctors have')} no СОПД</span><span className="d" style={{ display: 'block' }}>Record their consent before sending materials</span></span>
      </Link>
    );
  }
  return (
    <div className="card">
      <div className="card-head"><h2>Needs your attention</h2></div>
      {items.length ? <div className="todo" style={{ paddingTop: 4, paddingBottom: 8 }}>{items}</div> : (
        <Empty title="You're all caught up">Nothing is waiting for review, and every link you sent has been opened.</Empty>
      )}
    </div>
  );
}

export default function Dashboard() {
  const user = useAuth();
  const { data, error, loading } = useLoad(() => api.get('/api/stats/overview'));

  return (
    <>
      <PageHero title={greeting(user.name)}
        actions={<Link className="btn primary" to="/send"><Icon name="send" />Send a presentation</Link>}>
        How doctors engaged with your materials in the last 30 days.
      </PageHero>
      <div className="page">
        <ErrorNote error={error} />
        {loading && !data && (
          <div className="stack"><Skeleton h={112} r={18} /><div className="layout-2"><Skeleton h={300} r={18} /><Skeleton h={300} r={18} /></div></div>
        )}
        {data && (
          <>
            {data.whatsapp_mode === 'dry_run' && (
              <div style={{ marginBottom: 20 }}>
                <Notice icon="chat">
                  <strong>WhatsApp is in test mode.</strong> Messages aren't sent automatically. Reps get an "Open WhatsApp" button that fills in the message on their phone. Links are still personal and tracked.
                </Notice>
              </div>
            )}
            <Kpis items={[
              { label: 'Doctors', value: data.doctors, sub: `${data.doctors_with_consent} with active СОПД` },
              { label: 'Approved materials', value: data.approved_presentations, sub: data.in_review ? `${data.in_review} in MLR review` : 'none waiting for review' },
              { label: 'Links sent', value: data.links_30d, sub: 'last 30 days' },
              { label: 'Opened', value: pct(data.open_rate_30d), sub: `${data.opened_30d} of ${data.links_30d} links` },
              { label: 'Average view', value: duration(data.avg_seconds_30d), sub: plural(data.sessions_30d, 'viewing session', 'viewing sessions') },
            ]} />

            <div className="layout-2 section">
              <div className="stack" style={{ gap: 20 }}>
                <div className="card">
                  <div className="card-head">
                    <div><h2>Views per day</h2><p>Every time a doctor opens a link, last 30 days</p></div>
                  </div>
                  <div className="card-body"><TrendChart data={data.daily_views} /></div>
                </div>

                <div className="card">
                  <div className="card-head"><h2>Latest views</h2></div>
                  {data.recent_views.length === 0 ? (
                    <Empty title="No views yet" action={<Link className="btn" to="/send">Send a presentation</Link>}>
                      Views show up here as soon as a doctor opens a link you sent.
                    </Empty>
                  ) : (
                    <div className="table-wrap" style={{ marginTop: 8 }}>
                      <table>
                        <thead><tr><th>Doctor</th><th>Presentation</th><th className="num">Slides</th><th className="num">Time</th><th>When</th></tr></thead>
                        <tbody>
                          {data.recent_views.map((v) => (
                            <tr key={v.id}>
                              <td><Link className="person" to={`/doctors/${v.doctor_id}`}><Avatar name={v.full_name} size="sm" /><span className="name">{v.full_name}</span></Link></td>
                              <td><Link to={`/presentations/${v.presentation_id}`}>{v.title}</Link></td>
                              <td className="num">{v.slides_seen}</td>
                              <td className="num">{duration(v.total_seconds)}</td>
                              <td className="muted nowrap">{ago(v.last_seen_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              <Attention data={data} canReview={user.role !== 'rep'} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
