import { useEffect, useRef, useState } from 'react';

const AKEY = 'marg:auth';
const loadAuth = () => { try { return JSON.parse(localStorage.getItem(AKEY)) || {}; } catch { return {}; } };
const saveAuth = a => { try { localStorage.setItem(AKEY, JSON.stringify(a)); } catch { /* ignore */ } };
const strip = ({ server, ...d }) => d;
const uniq = a => [...new Set(a)];
// Per side vinner den sist endrede versjonen (p.t); ved likt tidspunkt vinner serveren.
const mergePages = (l = {}, r = {}) => { const o = { ...l }; for (const [id, p] of Object.entries(r)) if (!o[id] || (p.t || 0) >= (o[id].t || 0)) o[id] = p; return o; };
const merge = (local, remote = {}) => ({ ...local, pages: mergePages(local.pages, remote.pages), rows: local.rows || remote.rows || [], recent: uniq([...(local.recent || []), ...(remote.recent || [])]), priv: uniq([...(local.priv || []), ...(remote.priv || [])]) });

export function useSync(data, setData) {
  const [auth, setAuthS] = useState(loadAuth);
  const [status, setStatus] = useState(auth.token ? 'kobler til' : 'lokal');
  const dirty = useRef(false), first = useRef(true), timer = useRef(), busy = useRef(false);
  const base = data.server.replace(/\/$/, '');
  const setAuth = a => { setAuthS(a); saveAuth(a); };
  const api = (path, opt = {}) => fetch(base + path, { ...opt, headers: { 'Content-Type': 'application/json', ...(auth.token ? { Authorization: 'Bearer ' + auth.token } : {}), ...opt.headers } });

  const push = async (d, version) => {
    if (busy.current) return; busy.current = true;
    try {
      let r = await api('/api/workspace', { method: 'PUT', body: JSON.stringify({ baseVersion: version, data: strip(d) }) });
      if (r.status === 409) {
        const remote = await r.json(), merged = merge(d, remote.data);
        setData(x => ({ ...merged, server: x.server })); dirty.current = false;
        r = await api('/api/workspace', { method: 'PUT', body: JSON.stringify({ baseVersion: remote.version, data: strip(merged) }) });
      }
      if (r.status === 401) { setAuth({}); setStatus('logget ut'); return; }
      if (!r.ok) throw new Error();
      const { version: v } = await r.json(); setAuth({ ...auth, version: v }); auth.version = v; dirty.current = false; setStatus('synket');
    } catch { setStatus('frakoblet'); } finally { busy.current = false; }
  };

  const pull = async () => {
    try {
      const r = await api('/api/workspace');
      if (r.status === 401) { setAuth({}); setStatus('logget ut'); return; }
      const w = await r.json();
      if (!w.data) return push(data, 0);
      if (w.version !== auth.version) {
        if (dirty.current) { const m = merge(data, w.data); setData(x => ({ ...m, server: x.server })); return push(m, w.version); }
        setData(x => ({ ...w.data, server: x.server })); first.current = true;
        setAuth({ ...auth, version: w.version }); auth.version = w.version;
      }
      setStatus('synket');
    } catch { setStatus('frakoblet'); }
  };

  useEffect(() => { if (!auth.token) return; pull(); const i = setInterval(() => !dirty.current && pull(), 30000); return () => clearInterval(i); }, [auth.token, base]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    dirty.current = true;
    if (!auth.token) return;
    clearTimeout(timer.current); setStatus('lagrer');
    timer.current = setTimeout(() => push(data, auth.version || 0), 1200);
  }, [data]);

  const login = async (email, password, register) => {
    const r = await fetch(base + (register ? '/api/register' : '/api/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Fikk ikke kontakt med serveren');
    dirty.current = true; setAuth({ token: j.token, email, version: 0 });
  };
  const logout = () => { api('/api/logout', { method: 'POST' }).catch(() => {}); setAuth({}); setStatus('lokal'); };

  return { auth, status, login, logout, authHeader: auth.token ? { Authorization: 'Bearer ' + auth.token } : {} };
}
