import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useLoad, ago, phone } from '../lib.js';
import { ConsentMark, ErrorNote, Empty, Loading } from '../components.jsx';

export const EMPTY_DOCTOR = { full_name: '', specialty: '', institution: '', city: '', phone: '', email: '', proxima_id: '', rep_id: '' };

export function DoctorForm({ initial = EMPTY_DOCTOR, onSave, onCancel, saveLabel }) {
  const user = useAuth();
  const [f, setF] = useState({ ...EMPTY_DOCTOR, ...initial, rep_id: initial.rep_id ?? '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const reps = useLoad(() => (user.role === 'rep' ? Promise.resolve([]) : api.get('/api/users')), [user.role]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...f, rep_id: f.rep_id || null });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form className="panel stack" onSubmit={submit}>
      <ErrorNote error={error} />
      <div className="grid-2">
        <label className="field">Full name<input value={f.full_name} onChange={set('full_name')} required placeholder="Фамилия Имя Отчество" /></label>
        <label className="field">Specialty<input value={f.specialty || ''} onChange={set('specialty')} placeholder="Кардиолог" /></label>
        <label className="field">Institution<input value={f.institution || ''} onChange={set('institution')} /></label>
        <label className="field">City<input value={f.city || ''} onChange={set('city')} /></label>
        <label className="field">WhatsApp phone<input value={f.phone || ''} onChange={set('phone')} placeholder="+7 701 123 45 67" inputMode="tel" /></label>
        <label className="field">Email<input type="email" value={f.email || ''} onChange={set('email')} /></label>
        <label className="field">Proxima ID<input value={f.proxima_id || ''} onChange={set('proxima_id')} /><span className="hint">Links this record to the doctor in Proxima CRM.</span></label>
        {user.role !== 'rep' && (
          <label className="field">Medical rep
            <select value={f.rep_id ?? ''} onChange={set('rep_id')}>
              <option value="">Not assigned</option>
              {(reps.data || []).filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="row">
        <button className="btn primary" disabled={busy}>{saveLabel}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function ImportPanel({ onDone }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setError(new Error('Choose a CSV file first'));
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    setError(null);
    try {
      const r = await api.upload('/api/doctors/import', form);
      setResult(r);
      onDone();
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };

  return (
    <form className="panel stack" onSubmit={submit}>
      <div>
        <h3>Import doctors from CSV</h3>
        <p className="small muted" style={{ marginTop: 4 }}>
          Export from Proxima or Excel. Columns: full_name (or ФИО), specialty, institution (ЛПУ), city, phone, email, proxima_id, rep_email.
          Comma or semicolon separated. Existing doctors are matched by Proxima ID, then by phone.
        </p>
      </div>
      <ErrorNote error={error} />
      {result && (
        <div className="notice ok">
          Added {result.created}, updated {result.updated}{result.skipped ? `, skipped ${result.skipped}` : ''}.
          {result.errors.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}
      <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files[0] || null)} />
      <div><button className="btn primary" disabled={busy}>{busy ? 'Importing…' : 'Import file'}</button></div>
    </form>
  );
}

export default function Doctors() {
  const user = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const [consent, setConsent] = useState('all');
  useEffect(() => { const t = setTimeout(() => setSearch(term.trim()), 250); return () => clearTimeout(t); }, [term]);
  const [panel, setPanel] = useState(null); // 'add' | 'import' | null
  const [selected, setSelected] = useState(new Set());
  const list = useLoad(
    () => api.get(`/api/doctors?search=${encodeURIComponent(search)}&consent=${consent}`),
    [search, consent]
  );

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const rows = list.data || [];
  const allSelected = rows.length > 0 && rows.every((d) => selected.has(d.id));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Doctors</h1>
          <p>Healthcare professionals and their consent to personal data processing (СОПД). Materials can only be sent to doctors with an active consent.</p>
        </div>
        <div className="row">
          {user.role === 'admin' && <button className="btn" onClick={() => setPanel(panel === 'import' ? null : 'import')}>Import CSV</button>}
          <button className="btn primary" onClick={() => setPanel(panel === 'add' ? null : 'add')}>Add doctor</button>
        </div>
      </div>

      {panel === 'import' && <div style={{ marginBottom: 20 }}><ImportPanel onDone={list.reload} /></div>}
      {panel === 'add' && (
        <div style={{ marginBottom: 20 }}>
          <DoctorForm saveLabel="Add doctor" onCancel={() => setPanel(null)}
            onSave={async (f) => { const d = await api.post('/api/doctors', f); navigate(`/doctors/${d.id}`); }} />
        </div>
      )}

      <div className="section-head">
        <div className="row" style={{ flex: 1 }}>
          <input type="search" placeholder="Search by name, city, specialty, institution or phone" value={term}
            onChange={(e) => setTerm(e.target.value)} style={{ maxWidth: 420 }} aria-label="Search doctors" />
          <select value={consent} onChange={(e) => setConsent(e.target.value)} style={{ width: 'auto' }} aria-label="Filter by consent">
            <option value="all">All doctors</option>
            <option value="active">With active СОПД</option>
            <option value="none">Without СОПД</option>
          </select>
        </div>
        {selected.size > 0 && (
          <button className="btn primary" onClick={() => navigate('/send', { state: { doctorIds: [...selected] } })}>
            Send presentation to {selected.size}
          </button>
        )}
      </div>

      <ErrorNote error={list.error} />
      {list.loading && !list.data ? <Loading /> : (
        <div className="table-wrap">
          {rows.length === 0 ? (
            <Empty title={search || consent !== 'all' ? 'No doctors match these filters' : 'No doctors yet'}>
              {search || consent !== 'all' ? 'Try a different search or filter.' : 'Add a doctor or import a CSV export from Proxima.'}
            </Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={allSelected} aria-label="Select all"
                      onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((d) => d.id)))} />
                  </th>
                  <th>Doctor</th><th>Institution</th><th>Phone</th><th>Consent</th><th>Rep</th><th>Last viewed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Select ${d.full_name}`} /></td>
                    <td><Link to={`/doctors/${d.id}`}>{d.full_name}</Link><div className="sub">{d.specialty || '—'}</div></td>
                    <td>{d.institution || '—'}<div className="sub">{d.city}</div></td>
                    <td className="nowrap">{phone(d.phone)}</td>
                    <td><ConsentMark has={d.has_consent} whatsapp={d.whatsapp_consent} /></td>
                    <td>{d.rep_name || <span className="muted">—</span>}</td>
                    <td className="muted">{ago(d.last_viewed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {rows.length >= 1000 && <p className="small muted" style={{ marginTop: 8 }}>Showing the first 1,000 doctors. Use search to narrow the list.</p>}
    </>
  );
}
