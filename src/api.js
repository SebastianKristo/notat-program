// Felles kall mot Marg-serveren. Settes opp av App med serveradresse og innlogging.
let base = '', headers = {};
export const configureApi = (server, authHeader) => { base = (server || '').replace(/\/$/, ''); headers = authHeader || {}; };
export const loggedIn = () => !!headers.Authorization;
export const fileUrl = u => !u ? '' : u.startsWith('/api/') ? base + u : u;

export async function api(path, opts = {}) {
  const r = await fetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', ...headers, ...opts.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Feil ' + r.status), j);
  return j;
}
export const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) });

// Krymper bilder i nettleseren før opplasting
async function shrink(file, max = 1800) {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') return file;
  const img = await createImageBitmap(file).catch(() => null); if (!img) return file;
  const k = Math.min(1, max / Math.max(img.width, img.height));
  if (k === 1 && file.size < 1.5e6) return file;
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(ok => c.toBlob(b => ok(new File([b], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })), 'image/jpeg', .86));
}

// Laster opp til serveren når du er logget inn; ellers lagres en liten data-URL lokalt.
export async function uploadFile(file, max) {
  const f = await shrink(file, max);
  if (loggedIn()) {
    const r = await fetch(base + '/api/files', { method: 'POST', headers: { ...headers, 'Content-Type': f.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(f.name) }, body: f });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Opplasting feilet');
    return { url: j.url, name: f.name, mime: f.type, size: f.size };
  }
  if (f.size > 1.5e6) throw new Error('Logg inn for å laste opp filer større enn 1,5 MB');
  const url = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); });
  return { url, name: f.name, mime: f.type, size: f.size };
}
export const pickFile = accept => new Promise(ok => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept || ''; i.onchange = () => ok(i.files[0] || null); i.click(); });

// Åpner en adresse i systemets nettleser (Capacitor-appene) eller i en ny fane/vindu
export async function openExternal(url) {
  if (window.Capacitor?.isNativePlatform?.()) { const { Browser } = await import('@capacitor/browser'); return Browser.open({ url }); }
  window.open(url, '_blank');
}
