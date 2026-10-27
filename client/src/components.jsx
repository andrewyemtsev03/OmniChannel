import { STATUS_LABEL } from './lib.js';

export function Stamp({ status }) {
  return <span className={`stamp ${status}`}>{STATUS_LABEL[status] || status}</span>;
}

// Consent state for a doctor row: WhatsApp-ready, consent without WhatsApp, or missing.
export function ConsentMark({ has, whatsapp }) {
  if (whatsapp) return <span className="consent yes">WhatsApp OK</span>;
  if (has) return <span className="consent partial">No WhatsApp consent</span>;
  return <span className="consent no">No СОПД</span>;
}

export function Kpis({ items }) {
  return (
    <div className="kpis">
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

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="notice error" role="alert">{error.message || String(error)}</div>;
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <p><strong>{title}</strong></p>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Loading() {
  return <p className="muted">Loading…</p>;
}
