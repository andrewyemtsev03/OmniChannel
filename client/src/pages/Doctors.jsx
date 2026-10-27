import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useLoad, ago, phone, plural } from '../lib.js';
import {
  Avatar, Chips, ConsentMark, Dialog, Empty, ErrorNote, FormDialog, Icon, Notice, PageHero, SearchInput, SkeletonRows, useFeedback,
} from '../ui.jsx';

export const EMPTY_DOCTOR = { full_name: '', specialty: '', institution: '', city: '', phone: '', email: '', proxima_id: '', rep_id: '' };

// Add / edit doctor in a dialog. onSave receives the field values and may throw.
export function DoctorDialog({ open, onClose, initial, onSave, title, submitLabel }) {
  const user = useAuth();
  const [f, setF] = useState(EMPTY_DOCTOR);
  const reps = useLoad(() => (user.role === 'rep' ? Promise.resolve([]) : api.get('/api/users')), [user.role]);
  useEffect(() => { if (open) setF({ ...EMPTY_DOCTOR, ...(initial || {}), rep_id: initial?.rep_id ?? '' }); }, [open, initial]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <FormDialog open={open} onClose={onClose} title={title} submitLabel={submitLabel} wide
      onSubmit={() => onSave({ ...f, rep_id: f.rep_id || null })}>
      <label className="field">Full name
        <input value={f.full_name} onChange={set('full_name')} required placeholder="Фамилия Имя Отчество" autoFocus />
      </label>
      <div className="grid-2">
        <label className="field">Specialty <input value={f.specialty || ''} onChange={set('specialty')} placeholder="Кардиолог" /></label>
        <label className="field">City <input value={f.city || ''} onChange={set('city')} placeholder="Алматы" /></label>
      </div>
      <label className="field">Institution <input value={f.institution || ''} onChange={set('institution')} placeholder="Городская поликлиника №1" /></label>
      <div className="grid-2">
        <label className="field">WhatsApp phone
          <input value={f.phone || ''} onChange={set('phone')} placeholder="+7 701 123 45 67" inputMode="tel" />
          <span className="hint">8 701… and +7 701… both work.</span>
        </label>
        <label className="field"><span>Email <span className="opt">(optional)</span></span><input type="email" value={f.email || ''} onChange={set('email')} /></label>
      </div>
      <div className="grid-2">
        <label className="field"><span>Proxima ID <span className="opt">(optional)</span></span>
          <input value={f.proxima_id || ''} onChange={set('proxima_id')} />
          <span className="hint">Links this record to the doctor in Proxima CRM.</span>
        </label>
        {user.role !== 'rep' && (
          <label className="field">Medical rep
            <select value={f.rep_id ?? ''} onChange={set('rep_id')}>
              <option value="">Not assigned</option>
              {(reps.data || []).filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        )}
      </div>
    </FormDialog>
  );
}

function ImportDialog({ open, onClose, onDone }) {
  const { toast } = useFeedback();
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setFile(null); setResult(null); setError(null); } }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setError(new Error('Choose a CSV file first.'));
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    setError(null);
    try {
      const r = await api.upload('/api/doctors/import', form);
      setResult(r);
      onDone();
      toast(`Imported: ${r.created} added, ${r.updated} updated`);
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Import doctors" wide
      description="Upload a CSV export from Proxima or Excel. Existing doctors are matched by Proxima ID, then by phone, and updated.">
      <form onSubmit={submit} className="stack">
        <ErrorNote error={error} />
        {result && (
          <Notice icon="check">
            <strong>Added {result.created}, updated {result.updated}{result.skipped ? `, skipped ${result.skipped}` : ''}.</strong>
            {result.errors.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{result.errors.map((x) => <li key={x}>{x}</li>)}</ul>}
          </Notice>
        )}
        <label className="field">CSV file
          <input type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files[0] || null); setResult(null); }} />
          <span className="hint">Columns: full_name or ФИО, specialty, institution or ЛПУ, city, phone, email, proxima_id, rep_email. Comma or semicolon separated.</span>
        </label>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn quiet" onClick={onClose}>{result ? 'Done' : 'Cancel'}</button>
          <button className="btn primary" disabled={busy || !file}><Icon name="upload" />{busy ? 'Importing…' : 'Import file'}</button>
        </div>
      </form>
    </Dialog>
  );
}

const FILTERS = {
  all: () => true,
  ready: (d) => d.whatsapp_consent,
  links: (d) => d.has_consent && !d.whatsapp_consent,
  missing: (d) => !d.has_consent,
};

export default function Doctors() {
  const user = useAuth();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const filter = FILTERS[params.get('filter')] ? params.get('filter') : 'all';
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null); // 'add' | 'import'
  const [selected, setSelected] = useState(new Set());
  useEffect(() => { const t = setTimeout(() => setSearch(term.trim()), 250); return () => clearTimeout(t); }, [term]);
  const list = useLoad(() => api.get(`/api/doctors?search=${encodeURIComponent(search)}`), [search]);

  const all = list.data || [];
  const rows = useMemo(() => all.filter(FILTERS[filter]), [all, filter]);
  const count = (k) => all.filter(FILTERS[k]).length;
  const allSelected = rows.length > 0 && rows.every((d) => selected.has(d.id));
  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <>
      <PageHero title="Doctors"
        actions={<>
          {user.role === 'admin' && <button className="btn" onClick={() => setDialog('import')}><Icon name="upload" />Import CSV</button>}
          <button className="btn primary" onClick={() => setDialog('add')}><Icon name="plus" />Add doctor</button>
        </>}>
        Healthcare professionals and their consent to personal data processing (СОПД). Materials can only be sent to doctors with an active consent.
      </PageHero>

      <div className="page">
        <div className="toolbar">
          <SearchInput value={term} onChange={setTerm} placeholder="Search name, city, specialty, institution, phone" label="Search doctors" />
          <Chips label="Filter by consent" value={filter} onChange={(v) => setParams(v === 'all' ? {} : { filter: v })} options={[
            { value: 'all', label: 'All', count: all.length },
            { value: 'ready', label: 'WhatsApp ready', count: count('ready') },
            { value: 'links', label: 'Links only', count: count('links') },
            { value: 'missing', label: 'No СОПД', count: count('missing') },
          ]} />
        </div>

        <ErrorNote error={list.error} />
        {list.loading && !list.data ? <SkeletonRows rows={6} /> : (
          <div className="card">
            {rows.length === 0 ? (
              search || filter !== 'all' ? (
                <Empty title="No doctors match" action={<button className="btn" onClick={() => { setTerm(''); setParams({}); }}>Clear filters</button>}>
                  Try another search or filter.
                </Empty>
              ) : (
                <Empty title="No doctors yet" action={<button className="btn primary" onClick={() => setDialog('add')}><Icon name="plus" />Add doctor</button>}>
                  Add doctors one by one, or import a CSV export from Proxima.
                </Empty>
              )
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="check"><input type="checkbox" checked={allSelected} aria-label="Select all shown"
                        onChange={() => setSelected(allSelected ? new Set() : new Set([...selected, ...rows.map((d) => d.id)]))} /></th>
                      <th>Doctor</th><th>Institution</th><th>Phone</th><th>Consent</th><th>Rep</th><th>Last viewed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.id} className={`link ${selected.has(d.id) ? 'selected' : ''}`} onClick={() => navigate(`/doctors/${d.id}`)}>
                        <td className="check" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Select ${d.full_name}`} />
                        </td>
                        <td>
                          <div className="person"><Avatar name={d.full_name} />
                            <div><div className="name">{d.full_name}</div><div className="sub">{d.specialty || 'No specialty'}</div></div>
                          </div>
                        </td>
                        <td>{d.institution || <span className="muted">—</span>}<div className="sub">{d.city}</div></td>
                        <td className="nowrap">{phone(d.phone)}</td>
                        <td><ConsentMark has={d.has_consent} whatsapp={d.whatsapp_consent} /></td>
                        <td>{d.rep_name || <span className="muted">—</span>}</td>
                        <td className="muted nowrap">{d.last_viewed_at ? ago(d.last_viewed_at) : 'Never'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {all.length >= 1000 && <p className="small muted" style={{ marginTop: 10 }}>Showing the first 1,000 doctors. Search to narrow the list.</p>}

        {selected.size > 0 && (
          <div className="selbar" role="region" aria-label="Selection">
            <strong>{plural(selected.size, 'doctor', 'doctors')} selected</strong>
            <span className="spacer" />
            <button className="btn quiet sm" onClick={() => setSelected(new Set())}>Clear</button>
            <button className="btn primary" onClick={() => navigate('/send', { state: { doctorIds: [...selected] } })}><Icon name="send" />Send a presentation</button>
          </div>
        )}
      </div>

      <DoctorDialog open={dialog === 'add'} onClose={() => setDialog(null)} title="Add a doctor" submitLabel="Add doctor"
        onSave={async (f) => { const d = await api.post('/api/doctors', f); toast(`${d.full_name} added`); navigate(`/doctors/${d.id}`); }} />
      <ImportDialog open={dialog === 'import'} onClose={() => setDialog(null)} onDone={list.reload} />
    </>
  );
}
