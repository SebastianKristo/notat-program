import { useEffect, useState } from 'react';

// Innstillinger som gjelder denne enheten (ikke synkes): tema, kontrast, skriftstørrelse m.m.
const KEY = 'marg:prefs';
export const DEFAULT_PREFS = { theme: 'system', contrast: 'system', font: 'standard', fullWidth: false, enterNewBlock: true, sbHome: true, sbInbox: true, sbCal: true, sbRecent: true, sbFav: true, sort: 'manual', notifyDesktop: false, mentions: true, reminders: true };
const read = () => { try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...DEFAULT_PREFS }; } };

export function usePrefs() {
  const [prefs, setPrefs] = useState(read);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* privat modus */ }
    const r = document.documentElement;
    r.dataset.theme = prefs.theme;
    const hc = prefs.contrast === 'on' || (prefs.contrast === 'system' && window.matchMedia('(prefers-contrast: more)').matches);
    r.dataset.contrast = hc ? 'high' : 'normal';
    r.style.setProperty('--zoom', { small: .92, standard: 1, large: 1.1 }[prefs.font] || 1);
    const light = prefs.theme === 'light' || (prefs.theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', light ? '#ffffff' : '#191919');
  }, [prefs]);
  return [prefs, (k, v) => setPrefs(p => ({ ...p, [k]: v }))];
}
