import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useLoad, ago, pct } from '../lib.js';
import { Chips, DeckThumb, Empty, ErrorNote, FormDialog, Icon, PageHero, Skeleton, Stamp, useFeedback } from '../ui.jsx';

export function UploadDialog({ open, onClose }) {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [f, setF] = useState({ title: '', product: '', description: '' });
  const [file, setFile] = useState(null);
  useEffect(() => { if (open) { setF({ title: '', product: '', description: '' }); setFile(null); } }, [open]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <FormDialog open={open} onClose={onClose} title="Upload a presentation" submitLabel="Upload as draft" wide
      description="A single .html file, for example a presentation made with Claude. It starts as a draft and needs MLR approval before anyone can send it."
      onSubmit={async () => {
        if (!file) throw new Error('Choose the presentation .html file.');
        const form = new FormData();
        Object.entries(f).forEach(([k, v]) => form.append(k, v));
        form.append('file', file);
        const p = await api.upload('/api/presentations', form);
        toast('Uploaded as a draft');
        navigate(`/presentations/${p.id}`);
      }}>
      <label className="field">File
        <input type="file" accept=".html,.htm,text/html" onChange={(e) => {
          const file = e.target.files[0] || null;
          setFile(file);
          if (file && !f.title) setF({ ...f, title: file.name.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ') });
        }} />
      </label>
      <div className="grid-2">
        <label className="field">Title<input value={f.title} onChange={set('title')} required placeholder="Shown to doctors in the browser tab" /></label>
        <label className="field"><span>Product <span className="opt">(optional)</span></span><input value={f.product} onChange={set('product')} /></label>
      </div>
      <label className="field"><span>Internal note <span className="opt">(optional)</span></span>
        <textarea value={f.description} onChange={set('description')} placeholder="Audience, key message, campaign" />
      </label>
    </FormDialog>
  );
}

export default function Presentations() {
  const user = useAuth();
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('all');
  const { data, error, loading } = useLoad(() => api.get('/api/presentations'));
  const canUpload = user.role !== 'rep';
  const all = data || [];
  const rows = status === 'all' ? all.filter((p) => p.status !== 'archived') : all.filter((p) => p.status === status);
  const n = (s) => all.filter((p) => p.status === s).length;

  return (
    <>
      <PageHero title="Presentations"
        actions={canUpload && <button className="btn primary" onClick={() => setUploading(true)}><Icon name="upload" />Upload presentation</button>}>
        {canUpload
          ? 'HTML presentations, their MLR approval, and how doctors engage with them.'
          : 'MLR-approved presentations you can send to your doctors.'}
      </PageHero>
      <div className="page">
        {canUpload && (
          <div className="toolbar">
            <Chips label="Filter by status" value={status} onChange={setStatus} options={[
              { value: 'all', label: 'Active', count: all.length - n('archived') },
              { value: 'approved', label: 'Approved', count: n('approved') },
              { value: 'in_review', label: 'In MLR review', count: n('in_review') },
              { value: 'draft', label: 'Drafts', count: n('draft') },
              { value: 'archived', label: 'Archived', count: n('archived') },
            ]} />
          </div>
        )}
        <ErrorNote error={error} />
        {loading && !data ? (
          <div className="deck-grid">{[0, 1, 2].map((i) => <Skeleton key={i} h={280} r={18} />)}</div>
        ) : rows.length === 0 ? (
          <div className="card">
            <Empty title={all.length ? 'Nothing here' : 'No presentations yet'}
              action={canUpload && !all.length && <button className="btn primary" onClick={() => setUploading(true)}><Icon name="upload" />Upload presentation</button>}>
              {all.length ? 'No presentations have this status.' : canUpload ? 'Upload an HTML presentation, for example one made with Claude, to get started.' : 'Approved presentations will appear here.'}
            </Empty>
          </div>
        ) : (
          <div className="deck-grid">
            {rows.map((p) => (
              <Link key={p.id} to={`/presentations/${p.id}`} className="card deck-card">
                <DeckThumb id={p.id} title={p.title} />
                <div className="body">
                  <div className="row" style={{ gap: 8 }}><Stamp status={p.status} />{p.approval_code && <span className="code">{p.approval_code}</span>}</div>
                  <div className="title">{p.title}</div>
                  <div className="meta">{p.product || 'No product'}{p.version > 1 ? `, version ${p.version}` : ''}, updated {ago(p.updated_at)}</div>
                  <div className="stats">
                    <span><b>{p.links_count}</b> sent</span>
                    <span><b>{p.links_count ? pct(p.opened_count / p.links_count) : '—'}</b> opened</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <UploadDialog open={uploading} onClose={() => setUploading(false)} />
    </>
  );
}
