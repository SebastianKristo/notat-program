import React from 'react';

// De tre appikonene fra designet (Marg Ikon.dc.html). Krystall (b) er standard.
export const APP_ICONS = { a: 'Ark', b: 'Krystall', c: 'Marg' };

const paths = {
  a: <>
    <rect width="1024" height="1024" rx="228" fill="#ffffff" />
    <rect x="8" y="8" width="1008" height="1008" rx="222" fill="none" stroke="#e3e1db" strokeWidth="16" />
    <path d="M292 248 L640 206 L736 296 L760 776 L330 826 Z" fill="#ffffff" stroke="#1d1c1a" strokeWidth="46" strokeLinejoin="round" />
    <path d="M640 206 L652 310 L736 296" fill="#ece9e2" stroke="#1d1c1a" strokeWidth="38" strokeLinejoin="round" />
    <path d="M398 240 L432 812" stroke="#c4432b" strokeWidth="30" strokeLinecap="round" />
    <path d="M500 650 L486 420 L578 560 L654 404 L670 634" fill="none" stroke="#1d1c1a" strokeWidth="50" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  b: <>
    <rect width="1024" height="1024" rx="228" fill="#1d1c1a" />
    <path d="M512 150 L360 300 L520 470 Z" fill="#f3cfa9" /><path d="M512 150 L716 330 L520 470 Z" fill="#e8a87c" />
    <path d="M360 300 L310 640 L520 470 Z" fill="#c4703f" /><path d="M716 330 L690 750 L520 470 Z" fill="#a85a33" />
    <path d="M310 640 L500 872 L520 470 Z" fill="#8f4a2a" /><path d="M690 750 L500 872 L520 470 Z" fill="#5e2f1c" />
    <path d="M512 150 L716 330 L690 750 L500 872 L310 640 L360 300 Z" fill="none" stroke="#1d1c1a" strokeWidth="10" strokeLinejoin="round" />
    <path d="M520 470 L512 150 M520 470 L716 330 M520 470 L690 750 M520 470 L500 872 M520 470 L310 640 M520 470 L360 300" stroke="#1d1c1a" strokeWidth="8" opacity=".35" />
  </>,
  c: <>
    <rect width="1024" height="1024" rx="228" fill="#1d1c1a" />
    <path d="M300 210 L650 210 L740 300 L740 814 L300 814 Z" fill="#f7f5f0" />
    <path d="M300 210 L420 210 L420 814 L300 814 Z" fill="#c4432b" />
    <path d="M650 210 L650 300 L740 300 Z" fill="#cfcabd" />
    <path d="M496 420 L660 420 M496 516 L660 516 M496 612 L600 612" stroke="#1d1c1a" strokeWidth="34" strokeLinecap="round" />
  </>
};

export function AppIcon({ variant = 'b', size = 30 }) {
  return <svg width={size} height={size} viewBox="0 0 1024 1024" style={{ display: 'block', flex: 'none' }}>{paths[variant] || paths.b}</svg>;
}
