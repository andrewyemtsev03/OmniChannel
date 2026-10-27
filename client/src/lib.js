import { useCallback, useEffect, useState } from 'react';

// Loads data on mount and whenever deps change. Returns { data, error, loading, reload }.
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      setState({ data: await load(), error: null, loading: false });
    } catch (error) {
      setState({ data: null, error, loading: false });
    }
  }, [load]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function duration(seconds) {
  const s = Math.round(seconds || 0);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}:${String(s % 60).padStart(2, '0')}`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function date(value, withTime = true) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function ago(value) {
  if (!value) return 'never';
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return date(value, false);
}

export const pct = (x) => `${Math.round((x || 0) * 100)}%`;

export function phone(p) {
  if (!p) return '—';
  const m = p.match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+7 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : `+${p}`;
}

export const STATUS_LABEL = { draft: 'Draft', in_review: 'In MLR review', approved: 'Approved', archived: 'Archived' };
export const CHANNEL_LABEL = { any: 'All channels', whatsapp: 'WhatsApp', email: 'Email', portal: 'HCP portal' };
export const METHOD_LABEL = { written: 'Signed paper form', egov: 'eGov Mobile', digital: 'Digital form', other: 'Other' };
