import crypto from 'node:crypto';

// AES-256-GCM for API-nøkler og passord i settings-tabellen. Nøkkelen kommer fra MARG_SECRET.
const key = () => {
  const s = process.env.MARG_SECRET;
  if (!s) throw new Error('MARG_SECRET mangler');
  return crypto.createHash('sha256').update(s).digest();
};
export const encrypt = text => {
  if (!text) return '';
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return 'enc:' + Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
};
export const decrypt = val => {
  if (!val?.startsWith('enc:')) return val || '';
  const b = Buffer.from(val.slice(4), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
};
