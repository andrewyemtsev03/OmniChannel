import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useLoad, ago, pct } from '../lib.js';
import { Stamp, ErrorNote, Empty, Loading } from '../components.jsx';

function UploadForm({ onCancel }) {
  const navigate = useNavigate();
  const [f, setF] = useState({ title: '', product: '', description: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setError(new Error('Choose the presentation .html file'));
    const form = new FormData();
    Object.entries(f).forEach(([k, v]) => form.append(k, v));
    form.append('file', file);
    setBusy(true);
    setError(null);
    try {
      const p = await api.upload('/api/presentations', form);
      navigate(`/presentations/${p.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form className="panel stack" onSubmit={submit}>
      <div>
        <h3>Upload a presentation</h3>
        <p className="small muted" style={{ marginTop: 4 }}>
          A single .html file, for example a presentation made with Claude. It starts as a draft and goes to MLR review before anyone can send it.
        </p>
      </div>
      <ErrorNote error={error} />
      <div className="grid-2">
        <label className="field">Title<input value={f.title} onChange={set('title')} required placeholder="Shown to doctors in the browser tab" /></label>
        <label className="field">Product<input value={f.product} onChange={set('product')} /></label>
      </div>
      <label className="field">Internal note<textarea value={f.description} onChange={set('description')} placeholder="Audience, key message, campaign…" /></label>
      <label className="field">File<input type="file" accept=".html,.htm,text/html" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
      <div className="row">
        <button className="btn primary" disabled={busy}>{busy ? 'Uploading…' : 'Upload as draft'}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function Presentations() {
  const user = useAuth();
  const [uploading, setUploading] = useState(false);
  const { data, error, loading } = useLoad(() => api.get('/api/presentations'));
  const canUpload = user.role !== 'rep';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Presentations</h1>
          <p>{canUpload
            ? 'HTML presentations, their MLR approval status, and how doctors engage with them.'
            : 'MLR-approved presentations you can send to your doctors.'}</p>
        </div>
        {canUpload && !uploading && <button className="btn primary" onClick={() => setUploading(true)}>Upload presentation</button>}
      </div>
      {uploading && <div style={{ marginBottom: 20 }}><UploadForm onCancel={() => setUploading(false)} /></div>}
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : (
        <div className="table-wrap">
          {data.length === 0 ? (
            <Empty title="No presentations yet">{canUpload ? 'Upload an HTML presentation to get started.' : 'Approved presentations will appear here.'}</Empty>
          ) : (
            <table>
              <thead><tr><th>Presentation</th><th>Status</th><th>Approval code</th><th className="num">Sent</th><th className="num">Opened</th><th>Updated</th></tr></thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/presentations/${p.id}`}>{p.title}</Link><div className="sub">{p.product || '—'}{p.version > 1 ? `, version ${p.version}` : ''}</div></td>
                    <td><Stamp status={p.status} /></td>
                    <td>{p.approval_code ? <span className="code">{p.approval_code}</span> : <span className="muted">—</span>}</td>
                    <td className="num">{p.links_count}</td>
                    <td className="num">{p.links_count ? pct(p.opened_count / p.links_count) : '—'}</td>
                    <td className="muted">{ago(p.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
