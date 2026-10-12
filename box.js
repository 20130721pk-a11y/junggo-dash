// 꿀매 레이더 — 페이지 쪽 잠그기/열기 (WebCrypto). collector/seal.mjs 와 형식이 같아야 한다.
//   상자 = { v:1, kdf:"PBKDF2-SHA256", iter, salt, iv, ct } — 열쇠 PBKDF2-SHA256, 내용 AES-256-GCM(gzip(JSON)), AAD = 용도 이름
(function (root) {
  'use strict';
  const ITER = 600000;
  const LABEL = { view: 'junggo-view', state: 'junggo-state', edit: 'junggo-edit' };
  const enc = new TextEncoder();
  function b64e(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b64d(b) {
    const s = atob(String(b || ''));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  async function pipe(u8, stream) {
    return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer());
  }
  const newSalt = () => b64e(crypto.getRandomValues(new Uint8Array(16)));
  async function deriveKey(password, saltB64, iter) {
    if (!password) throw new Error('비밀번호를 적어 주세요');
    const base = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(saltB64), iterations: iter || ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  const exportKey = async (key) => b64e(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
  const importKey = (b64) => crypto.subtle.importKey('raw', b64d(b64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  function isBox(box) {
    return !!(box && typeof box === 'object' && box.v === 1 && box.kdf === 'PBKDF2-SHA256' && typeof box.salt === 'string' && typeof box.iv === 'string' && typeof box.ct === 'string');
  }
  async function seal(obj, key, saltB64, label, iter) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const pt = await pipe(enc.encode(JSON.stringify(obj)), new CompressionStream('gzip'));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(label) }, key, pt));
    return { v: 1, kdf: 'PBKDF2-SHA256', iter: iter || ITER, salt: saltB64, iv: b64e(iv), ct: b64e(ct) };
  }
  // 비밀번호가 틀리면 오류 (name: 'OperationError')
  async function open(box, key, label) {
    if (!isBox(box)) throw new Error('잠근 상자 형식이 아니에요');
    const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(box.iv), additionalData: enc.encode(label) }, key, b64d(box.ct)));
    const raw = await pipe(pt, new DecompressionStream('gzip'));
    return JSON.parse(new TextDecoder().decode(raw));
  }
  root.JunggoBox = { ITER, LABEL, newSalt, deriveKey, exportKey, importKey, isBox, seal, open };
})(typeof self !== 'undefined' ? self : globalThis);
