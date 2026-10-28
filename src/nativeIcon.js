// Bytter ikonet på hjemskjermen (iOS/Android) eller i Dock (Mac-appen).
const NAMES = { a: 'Ark', b: 'Krystall', c: 'Marg' };

async function svgToPng(svg, size = 512) {
  const img = new Image();
  img.src = 'data:image/svg+xml,' + encodeURIComponent(svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
  await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = size;
  c.getContext('2d').drawImage(img, 0, 0, size, size);
  return c.toDataURL('image/png');
}

// fromUser: false ved oppstart (Mac nullstiller Dock-ikonet ved hver start; mobil husker selv)
export async function applyNativeIcon(k, svg, fromUser) {
  const name = NAMES[k] || 'Krystall';
  try {
    if (window.Capacitor?.isNativePlatform?.()) {
      if (!fromUser) return;
      const { AppIcon } = await import('@capacitor-community/app-icon');
      if (!(await AppIcon.isSupported()).value) return 'unsupported';
      await AppIcon.change({ name, suppressNotification: true, disable: Object.values(NAMES).filter(n => n !== name) });
      return 'changed';
    }
    if (window.margDesktop?.setDockIcon && svg) { window.margDesktop.setDockIcon(await svgToPng(svg)); return 'changed'; }
  } catch (e) { console.warn('Appikon', e); return 'failed'; }
}
