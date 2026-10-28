import React from 'react';

const S = ({ size = 22, children, fill }) => <svg width={size} height={size} viewBox="0 0 24 24" fill={fill || 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;

export const Icon = {
  home: p => <S {...p} fill="currentColor"><path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></S>,
  chat: p => <S {...p}><path d="M12 4.5c4.7 0 8.5 3.2 8.5 7.1s-3.8 7.1-8.5 7.1c-.9 0-1.8-.1-2.7-.4L4.5 20l1.3-3.4c-1.4-1.3-2.3-3-2.3-4.9 0-4 3.8-7.2 8.5-7.2z" /></S>,
  cal: p => <S {...p}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M4 9.5h16" /><path d="M8.5 13.5h.01M12 13.5h.01M15.5 13.5h.01M8.5 16.5h.01M12 16.5h.01" strokeWidth="2.2" /></S>,
  inbox: p => <S {...p}><path d="M4 13.5 6.2 7A2 2 0 0 1 8.1 5.5h7.8A2 2 0 0 1 17.8 7L20 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M4 13.5h4.5l1 2h5l1-2H20" /></S>,
  search: ({ size = 24 }) => <S size={size}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></S>,
  write: () => <S size={24}><path d="M11 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13" /><path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" /></S>,
  back: () => <S size={22}><path d="M15 5l-7 7 7 7" /></S>,
  share: () => <S size={20}><path d="M12 3.5v11M8 7.5l4-4 4 4" /><path d="M6 11v7.5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V11" /></S>,
  doc: ({ size = 22 }) => <S size={size}><path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" /><path d="M14 3.5V8h4M8.5 12.5h7M8.5 16h5" /></S>,
  db: ({ size = 22 }) => <S size={size}><rect x="4" y="4.5" width="16" height="15" rx="2" /><path d="M4 9.5h16M4 14.5h16M10 4.5v15" /></S>
};

export function Logo({ size = 30, r, round }) {
  return <span style={{ width: size, height: size, flex: 'none', borderRadius: round ? '50%' : (r ?? size / 2), background: 'var(--text)', color: 'var(--bg)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: size * 0.45 }}>M</span>;
}

// Linjeikoner for sider (fanen «Ikon» i ikonvelgeren), 16 px, strek 1,7
export const LINE_ICONS = {
  side: 'M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5zM14 3.5V8h4',
  mappe: 'M3.5 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
  bok: 'M5 4.5h10a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3zM5 16.5a3 3 0 0 1 3-3h10',
  stjerne: 'M12 3.8l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z',
  hjerte: 'M12 19.5s-7.5-4.4-7.5-9.6A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6z',
  hus: 'M3.5 11.2 12 4l8.5 7.2V19a1 1 0 0 1-1 1H15v-5.5H9V20H4.5a1 1 0 0 1-1-1z',
  kalender: 'M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4',
  sjekk: 'M4.5 12.5l4.5 4.5 10.5-10.5',
  lyn: 'M13 3 5.5 13.5h6L10.5 21 18.5 10h-6z',
  idé: 'M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.5 10.9V16h7v-1.6A6 6 0 0 0 12 3.5z',
  mål: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  graf: 'M4.5 19.5h15M7 16V11M11 16V6.5M15 16v-6M19 16V8.5',
  kode: 'M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15',
  musikk: 'M9 18.5V6l10-2v12.5M9 18.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  kamera: 'M4 8.5h3l1.5-2.5h7L17 8.5h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  verktøy: 'M14.5 6.5a4 4 0 0 1 5 5L11 20a2.1 2.1 0 0 1-3-3l8.5-8.5M14.5 6.5l3 3',
  globus: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z',
  lås: 'M6 11h12v9.5H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  flagg: 'M5.5 20.5v-16M5.5 4.5h11l-2 4 2 4h-11',
  sky: 'M7 18.5a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6-1.3A4.2 4.2 0 0 1 17.5 18.5z',
  plante: 'M12 20.5v-9M12 11.5C12 7 8.5 5 5 5c0 4 3 6.5 7 6.5zM12 14c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5z',
  pakke: 'M4 7.5 12 3.5l8 4v9l-8 4-8-4zM4 7.5l8 4 8-4M12 11.5v9',
  snakk: 'M12 4.5c4.7 0 8.5 3.2 8.5 7.1s-3.8 7.1-8.5 7.1c-.9 0-1.8-.1-2.7-.4L4.5 20l1.3-3.4c-1.4-1.3-2.3-3-2.3-4.9 0-4 3.8-7.2 8.5-7.2z'
};
export const ICON_COLORS = { grå: '#9b9a97', brun: '#a27763', oransje: '#d9730d', gul: '#cb912f', grønn: '#448361', blå: '#337ea9', lilla: '#9065b0', rosa: '#c14c8a', rød: '#d44c47' };
export function LineIcon({ name, color = 'grå', size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={ICON_COLORS[color] || color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}><path d={LINE_ICONS[name] || LINE_ICONS.side} /></svg>;
}
