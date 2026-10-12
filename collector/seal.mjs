// 데이터 잠그기 (Node 쪽). 페이지(index.html)의 같은 이름 함수와 형식이 같아야 한다.
//
// 잠근 상자 = { v:1, kdf:"PBKDF2-SHA256", iter, salt, iv, ct }  (salt·iv·ct 는 base64)
//   열쇠 = PBKDF2-SHA256(비밀번호, salt, iter) → 32바이트, 내용 = AES-256-GCM(gzip(JSON)), ct 끝 16바이트가 인증 태그
//   추가 인증 데이터(AAD) = 용도 이름(label: junggo-view | junggo-state | junggo-edit) → 다른 용도의 상자로 바꿔치기할 수 없다
import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const ITER = 600000;
export const LABEL = { view: 'junggo-view', state: 'junggo-state', edit: 'junggo-edit' };

export const newSalt = () => crypto.randomBytes(16).toString('base64');

export function deriveKey(password, saltB64, iter = ITER) {
  if (!password) throw new Error('비밀번호가 없어요');
  if (!Number.isInteger(iter) || iter < 100000 || iter > 5000000) throw new Error('반복 횟수가 이상해요');
  const salt = Buffer.from(String(saltB64 || ''), 'base64');
  if (salt.length < 16) throw new Error('salt 가 이상해요');
  return crypto.pbkdf2Sync(Buffer.from(String(password), 'utf8'), salt, iter, 32, 'sha256');
}

// 비밀번호 하나로 salt 마다 열쇠를 한 번만 만든다 (PBKDF2 는 느리다)
export function keyring(password) {
  const cache = new Map();
  return (saltB64, iter = ITER) => {
    const k = `${iter}:${saltB64}`;
    if (!cache.has(k)) cache.set(k, deriveKey(password, saltB64, iter));
    return cache.get(k);
  };
}

export function seal(obj, key, saltB64, label, iter = ITER) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(label, 'utf8'));
  const pt = zlib.gzipSync(Buffer.from(JSON.stringify(obj), 'utf8'), { level: 9 });
  const ct = Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]);
  return { v: 1, kdf: 'PBKDF2-SHA256', iter, salt: saltB64, iv: iv.toString('base64'), ct: ct.toString('base64') };
}

export function isBox(box) {
  return !!(box && typeof box === 'object' && box.v === 1 && box.kdf === 'PBKDF2-SHA256' && typeof box.salt === 'string' && typeof box.iv === 'string' && typeof box.ct === 'string');
}

// keyFor: (salt, iter) => 열쇠. 비밀번호가 틀리거나 내용이 바뀌었으면 오류
export function open(box, keyFor, label, maxBytes = 50 * 1024 * 1024) {
  if (!isBox(box)) throw new Error('잠근 상자 형식이 아니에요');
  const key = keyFor(box.salt, Number.isInteger(box.iter) ? box.iter : ITER);
  const raw = Buffer.from(box.ct, 'base64');
  if (raw.length < 17) throw new Error('내용이 비어 있어요');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'));
  d.setAAD(Buffer.from(label, 'utf8'));
  d.setAuthTag(raw.subarray(raw.length - 16));
  const pt = Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]);
  return JSON.parse(zlib.gunzipSync(pt, { maxOutputLength: maxBytes }).toString('utf8'));
}
