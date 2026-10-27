import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useLoad, duration, pct, ago } from '../lib.js';
import { Kpis, ErrorNote, Empty, Loading } from '../components.jsx';

export default function Dashboard() {
  const { data, error, loading } = useLoad(() => api.get('/api/stats/overview'));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>Who opened which materials in the last 30 days, and how long they spent on them.</p>
        </div>
        <Link className="btn primary" to="/send">Send a presentation</Link>
      </div>
      <ErrorNote error={error} />
      {loading && !data && <Loading />}
      {data && (
        <>
          {data.whatsapp_mode === 'dry_run' && (
            <div className="notice" style={{ marginBottom: 20 }}>
              WhatsApp is in test mode. Messages are not sent automatically; reps get a click-to-chat link to send from their phone.
              Add the Cloud API credentials to the server settings to send from the company number.
            </div>
          )}
          <Kpis items={[
            { label: 'Doctors', value: data.doctors, sub: `${data.doctors_with_consent} with active СОПД` },
            { label: 'Approved presentations', value: data.approved_presentations, sub: data.in_review ? `${data.in_review} waiting for MLR review` : 'none waiting for review' },
            { label: 'Links sent', value: data.links_30d, sub: 'last 30 days' },
            { label: 'Opened', value: pct(data.open_rate_30d), sub: `${data.opened_30d} of ${data.links_30d} links` },
            { label: 'Average view', value: duration(data.avg_seconds_30d), sub: `${data.sessions_30d} viewing sessions` },
          ]} />

          <section className="section">
            <h2>Latest views</h2>
            <div className="table-wrap">
              {data.recent_views.length === 0 ? (
                <Empty title="No views yet">Views appear here as soon as a doctor opens a link you sent.</Empty>
              ) : (
                <table>
                  <thead><tr><th>Doctor</th><th>Presentation</th><th className="num">Slides seen</th><th className="num">Time</th><th>When</th></tr></thead>
                  <tbody>
                    {data.recent_views.map((v) => (
                      <tr key={v.id}>
                        <td><Link to={`/doctors/${v.doctor_id}`}>{v.full_name}</Link></td>
                        <td><Link to={`/presentations/${v.presentation_id}`}>{v.title}</Link></td>
                        <td className="num">{v.slides_seen}</td>
                        <td className="num">{duration(v.total_seconds)}</td>
                        <td className="muted">{ago(v.last_seen_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
