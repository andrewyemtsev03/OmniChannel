import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_LABEL, initials } from './lib.js';

/* ---------------- icons (24px grid, 1.8 stroke) ---------------- */
const PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  upload: <><path d="M12 15V4m0 0-4 4m4-4 4 4" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>,
  send: <><path d="M21 3 10 14" /><path d="m21 3-7 18-4-7-7-4 18-7Z" /></>,
  chat: <path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5Z" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.5A6.5 6.5 0 0 1 21.5 20" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V13M12 16.5v.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  eye: <><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
  archive: <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></>,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></>,
  shield: <><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></>,
  slides: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
};

export function Icon({ name, className = '' }) {
  return (
    <svg className={`ic ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

/* ---------------- brand pieces ---------------- */
export function Circles({ className = '', tone }) {
  return <div className={`circles ${tone || ''} ${className}`} aria-hidden="true"><i className="a" /><i className="b" /></div>;
}

export function PageHero({ title, children, actions, crumb }) {
  return (
    <div className="hero">
      <div className="hero-circles"><Circles /></div>
      <div className="hero-inner">
        <div className="hero-text">
          {crumb && <Link className="crumb" to={crumb.to}><Icon name="chevronLeft" />{crumb.label}</Link>}
          <h1>{title}</h1>
          {children && <p>{children}</p>}
        </div>
        {actions && <div className="hero-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function Avatar({ name, size = '' }) {
  return <span className={`avatar ${size}`} aria-hidden="true">{initials(name)}</span>;
}

export function Stamp({ status }) {
  const icon = status === 'approved' ? 'check' : status === 'in_review' ? 'clock' : null;
  return <span className={`stamp ${status}`}>{icon && <Icon name={icon} />}{STATUS_LABEL[status] || status}</span>;
}

// Consent state: WhatsApp-ready, consent without WhatsApp, or missing.
export function ConsentMark({ has, whatsapp }) {
  if (whatsapp) return <span className="consent yes">WhatsApp ready</span>;
  if (has) return <span className="consent partial">Links only</span>;
  return <span className="consent no">No СОПД</span>;
}

export function Kpis({ items }) {
  return (
    <div className="card kpis">
      {items.map((k) => (
        <div className="kpi" key={k.label}>
          <div className="v">{k.value}</div>
          <div className="l">{k.label}</div>
          {k.sub && <div className="s">{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function Notice({ tone = 'info', icon, children }) {
  return (
    <div className={`notice ${tone === 'attention' ? 'attention' : ''}`} role={tone === 'attention' ? 'alert' : undefined}>
      <Icon name={icon || (tone === 'attention' ? 'alert' : 'info')} />
      <div className="grow">{children}</div>
    </div>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <Notice tone="attention">{error.message || String(error)}</Notice>;
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <div className="mark" aria-hidden="true"><i /><i /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r }) {
  return <span className="skeleton" style={{ height: h, width: w, borderRadius: r }} />;
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="card card-pad stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div className="row" key={i} style={{ flexWrap: 'nowrap' }}>
          <Skeleton h={36} w={36} r="50%" />
          <div style={{ flex: 1, display: 'grid', gap: 6 }}><Skeleton h={13} w="38%" /><Skeleton h={11} w="22%" /></div>
          <Skeleton h={13} w="16%" />
        </div>
      ))}
    </div>
  );
}

export function Chips({ value, onChange, options, label }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}{o.count !== undefined && <span className="n">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, label }) {
  return (
    <label className="search">
      <Icon name="search" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label || placeholder} />
    </label>
  );
}

// Scaled-down live render of an HTML deck. Sandboxed exactly like the full preview.
export function DeckThumb({ id, title }) {
  return (
    <div className="thumb">
      <iframe src={`/api/presentations/${id}/file`} title={`Thumbnail of ${title}`} loading="lazy" tabIndex={-1}
        sandbox="allow-scripts" aria-hidden="true" />
      <div className="veil" />
    </div>
  );
}

/* ---------------- dialog ---------------- */
export function Dialog({ open, onClose, title, description, children, footer, wide, tone }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`dialog ${wide ? 'wide' : ''}`} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-labelledby="dlg-title">
      {open && (
        <>
          <div className="dialog-head">
            <h2 id="dlg-title" style={tone === 'attention' ? { color: 'var(--rubine-700)' } : undefined}>{title}</h2>
            {description && <p>{description}</p>}
            <button type="button" className="btn icon close" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

// A dialog whose body is a form: handles busy state and errors, closes on success.
export function FormDialog({ open, onClose, title, description, submitLabel, onSubmit, children, wide, danger }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { if (open) { setError(null); setBusy(false); } }, [open]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
      onClose();
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} wide={wide} tone={danger ? 'attention' : undefined}>
      <form onSubmit={submit} className="stack" style={{ gap: 16 }}>
        <ErrorNote error={error} />
        {children}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" className="btn quiet" onClick={onClose}>Cancel</button>
          <button className={`btn ${danger ? 'danger solid' : 'primary'}`} disabled={busy}>{busy ? 'Working…' : submitLabel}</button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------------- confirm + toast providers ---------------- */
const FeedbackContext = createContext(null);
export const useFeedback = () => useContext(FeedbackContext);

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const toast = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  // confirm({ title, body, confirmLabel, danger }) -> Promise<boolean>
  const confirm = useCallback((opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve })), []);
  const close = (result) => { confirmState?.resolve(result); setConfirmState(null); };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <Dialog open={Boolean(confirmState)} onClose={() => close(false)} title={confirmState?.title}
        tone={confirmState?.danger ? 'attention' : undefined}
        footer={<>
          <button type="button" className="btn quiet" onClick={() => close(false)}>Cancel</button>
          <button type="button" className={`btn ${confirmState?.danger ? 'danger solid' : 'primary'}`} onClick={() => close(true)} autoFocus>
            {confirmState?.confirmLabel || 'Confirm'}
          </button>
        </>}>
        <p style={{ color: 'var(--text-2)' }}>{confirmState?.body}</p>
      </Dialog>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`}>
            <Icon name={t.tone === 'error' ? 'alert' : 'check'} /><div>{t.message}</div>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

/* ---------------- small hooks ---------------- */
export function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function useClickOutside(onOutside) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOutside(); };
    const k = (e) => { if (e.key === 'Escape') onOutside(); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [onOutside]);
  return ref;
}
