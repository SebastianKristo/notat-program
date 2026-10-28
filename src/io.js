// Import og eksport: Markdown, Obsidian-hvelv, Notion-ZIP, JSON og PDF (utskrift).
const rid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Markdown → blokker ----------
export function mdToBlocks(md) {
  const out = [], lines = String(md).replace(/\r/g, '').split('\n'); let para = [], inCode = false, code = [];
  const flush = () => { const t = para.join(' ').trim(); if (t) out.push({ id: rid(), type: 'p', text: clean(t) }); para = []; };
  const clean = t => t.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a, b) => b || a).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\W)\*([^*]+)\*/g, '$1$2').replace(/`([^`]+)`/g, '$1');
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (/^```/.test(l)) { if (inCode) { out.push({ id: rid(), type: 'callout', icon: '⌨️', text: code.join('\n') }); code = []; } else flush(); inCode = !inCode; continue; }
    if (inCode) { code.push(raw); continue; }
    let m;
    if (!l.trim()) { flush(); continue; }
    if ((m = l.match(/^(#{1,6})\s+(.*)/))) { flush(); out.push({ id: rid(), type: 'h', text: clean(m[2]) }); continue; }
    if ((m = l.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)/))) { flush(); out.push({ id: rid(), type: 'todo', text: clean(m[2]), done: m[1] !== ' ' }); continue; }
    if ((m = l.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)/))) { flush(); out.push({ id: rid(), type: 'li', text: clean(m[1]) }); continue; }
    if ((m = l.match(/^>\s?(.*)/))) { flush(); out.push({ id: rid(), type: 'quote', text: clean(m[1]) }); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(l.trim())) { flush(); out.push({ id: rid(), type: 'divider', text: '' }); continue; }
    if ((m = l.match(/^\$\$(.*)\$\$$/))) { flush(); out.push({ id: rid(), type: 'math', text: m[1] }); continue; }
    if ((m = l.match(/^!\[([^\]]*)\]\(([^)]+)\)/))) { flush(); if (/^(https?:|data:)/.test(m[2])) out.push({ id: rid(), type: 'image', url: m[2], text: m[1] }); continue; }
    para.push(l.trim());
  }
  flush();
  return out.length ? out : [{ id: rid(), type: 'p', text: '' }];
}

// ---------- Blokker → Markdown / HTML ----------
export function pageToMd(p) {
  const lines = [`# ${p.title || 'Uten tittel'}`, ''];
  for (const b of p.blocks || []) {
    const t = b.text || '';
    lines.push({ h: `## ${t}`, li: `- ${t}`, todo: `- [${b.done ? 'x' : ' '}] ${t}`, quote: `> ${t}`, callout: `> ${b.icon || '💡'} ${t}`, math: `$$${t}$$`, divider: '---', toggle: `<details><summary>${t}</summary>\n\n${b.body || ''}\n</details>`, image: `![${t}](${b.url || ''})` }[b.type] ?? t);
    if (!['li', 'todo'].includes(b.type)) lines.push('');
  }
  return lines.join('\n');
}
export function blocksToHtml(p, fileUrl = u => u) {
  return (p.blocks || []).map(b => {
    const t = esc(b.text);
    switch (b.type) {
      case 'h': return `<h2>${t}</h2>`;
      case 'li': return `<ul><li>${t}</li></ul>`;
      case 'todo': return `<p>${b.done ? '☑' : '☐'} ${b.done ? `<s>${t}</s>` : t}</p>`;
      case 'quote': return `<blockquote>${t}</blockquote>`;
      case 'callout': return `<div class="callout">${esc(b.icon || '💡')} ${t}</div>`;
      case 'math': return `<div class="math">${t}</div>`;
      case 'toggle': return `<details open><summary>${t}</summary><p>${esc(b.body)}</p></details>`;
      case 'divider': return '<hr>';
      case 'image': return b.url ? `<img src="${esc(fileUrl(b.url))}" alt="${t}">` : '';
      default: return t ? `<p>${t}</p>` : '';
    }
  }).join('\n');
}
const PRINT_CSS = `body{font:15px/1.6 -apple-system,'IBM Plex Sans',system-ui,sans-serif;color:#2b2a27;margin:0}main{max-width:720px;margin:0 auto;padding:40px 24px}
h1{font-size:32px;margin:6px 0 18px}.callout{background:#f1f1ef;border-radius:8px;padding:12px 14px;margin:8px 0}.math{background:#f7f7f5;border-radius:8px;padding:14px;text-align:center;font:italic 19px Georgia,serif}
blockquote{border-left:3px solid #2b2a27;margin:8px 0;padding-left:14px}img{max-width:100%}.icon{font-size:44px}section{break-after:page}`;
export function printPages(pages, fileUrl) {
  const w = window.open('', '_blank'); if (!w) return false;
  w.document.write(`<!doctype html><html lang="no"><head><meta charset="utf-8"><title>${esc(pages.length === 1 ? pages[0].title : 'Marg')}</title><style>${PRINT_CSS}</style></head><body>${pages.map(p =>
    `<section><main>${p.icon && !/^(doc|db|i:|u:)/.test(p.icon) ? `<div class="icon">${esc(p.icon)}</div>` : ''}<h1>${esc(p.title || 'Uten tittel')}</h1>${blocksToHtml(p, fileUrl)}</main></section>`).join('')}</body></html>`);
  w.document.close(); setTimeout(() => w.print(), 300); return true;
}

// ---------- ZIP (lagring uten komprimering, lesing med deflate) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const [name, content] of files) {
    const n = enc.encode(name), d = typeof content === 'string' ? enc.encode(content) : content, crc = crc32(d);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
    parts.push(new Uint8Array(h.buffer), n, d);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), n); off += 30 + n.length + d.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
export async function readZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(buf.buffer), out = [];
  let e = buf.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Ikke en ZIP-fil');
  let p = dv.getUint32(e + 16, true); const n = dv.getUint16(e + 10, true), dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue;
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = buf.subarray(start, start + csize);
    out.push({ name, read: async () => method === 0 ? raw : new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) });
  }
  return out;
}
export const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };

// ---------- Import ----------
// files: [{ path: 'Mappe/Under/Side.md', text }]. Mapper blir sider med undersider.
export function importMarkdownFiles(files, { stripNotionIds = false } = {}) {
  const pages = {}, folderPage = {}, roots = [];
  const title = s => { let t = s.replace(/\.md$/i, ''); if (stripNotionIds) t = t.replace(/\s+[0-9a-f]{32}$/i, ''); return t; };
  const ensureFolder = parts => {
    if (!parts.length) return null;
    const key = parts.join('/'); if (folderPage[key] !== undefined) return folderPage[key];
    const parent = ensureFolder(parts.slice(0, -1));
    // Notion: «Side abc.md» og mappen «Side abc/» hører sammen
    const existing = Object.entries(pages).find(([, p]) => p._path === key);
    if (existing) return (folderPage[key] = existing[0]);
    const id = 'p' + rid(); pages[id] = { icon: 'i:mappe:grå', title: title(parts[parts.length - 1]), props: [], blocks: [{ id: rid(), type: 'p', text: '' }], parent, t: Date.now(), _path: key };
    if (!parent) roots.push(id);
    return (folderPage[key] = id);
  };
  for (const f of files.sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path))) {
    const parts = f.path.split('/').filter(Boolean), file = parts.pop();
    if (/^\./.test(file) || parts.some(p => p.startsWith('.'))) continue;
    const parent = ensureFolder(parts), blocks = mdToBlocks(f.text);
    let t = title(file);
    if (blocks[0]?.type === 'h' && blocks[0].text === t) blocks.shift();
    const key = [...parts, file.replace(/\.md$/i, '')].join('/');
    const id = 'p' + rid(); pages[id] = { icon: 'doc', title: t, props: [], blocks: blocks.length ? blocks : [{ id: rid(), type: 'p', text: '' }], parent, t: Date.now(), _path: key };
    if (!parent) roots.push(id);
  }
  for (const p of Object.values(pages)) delete p._path;
  return { pages, roots };
}
export async function filesFromZip(blob) {
  const entries = await readZip(blob), files = [], dec = new TextDecoder();
  for (const e of entries) if (/\.md$/i.test(e.name)) files.push({ path: e.name, text: dec.decode(await e.read()) });
  return files;
}
