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
  return <span style={{ width: size, height: size, flex: 'none', borderRadius: round ? '50%' : (r ?? size / 2), background: '#ebebe9', color: '#191919', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: size * 0.45 }}>M</span>;
}
