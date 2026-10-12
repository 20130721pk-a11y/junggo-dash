// refresh.src.mjs 에 압축한 수집기(collect.jb.min.js, collect.d.min.js)를 넣어 ../refresh.mjs 를 만든다.
// 사용: node collector/src/build.mjs   (어느 폴더에서 실행해도 이 파일의 폴더 기준으로 읽고 쓴다)
// replace 의 두 번째 인자를 함수로 줘야 코드 안의 "$&" 같은 글자가 치환 패턴으로 해석되지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, f), 'utf8');
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const src = read('refresh.src.mjs');
const min = { jb: read('collect.jb.min.js'), d: read('collect.d.min.js') };
for (const [part, code] of Object.entries(min)) {
  // 수집기 원문은 한 줄짜리 함수 + 마지막 줄 "await junggoCollect(__CONFIG__);" 이어야 한다
  if (!code.startsWith('async function junggoCollect(') || !code.endsWith('\nawait junggoCollect(__CONFIG__);')) throw new Error(`collect.${part}.min.js 모양이 달라요`);
  if (code.slice(0, code.lastIndexOf('\n')).includes('\n')) throw new Error(`collect.${part}.min.js 함수 안에 줄바꿈이 있어요`);
  // 보이지 않는 글자가 있으면 Claude 가 옮겨 적을 때 빠뜨리기 쉽다
  const bad = (c) => (c < 0x20 && c !== 0x0a) || (c >= 0x7f && c <= 0xa0) || c === 0xad || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff;
  const odd = [...code].filter((ch) => bad(ch.codePointAt(0)));
  if (odd.length) throw new Error(`collect.${part}.min.js 에 보이지 않는 글자가 ${odd.length}개 있어요`);
}
const out = src.replace('__COLLECT_JB__', () => JSON.stringify(min.jb)).replace('__COLLECT_D__', () => JSON.stringify(min.d));
if (out.includes('__COLLECT_')) throw new Error('자리 표시가 남아 있어요');
const dest = path.join(here, '..', 'refresh.mjs');
fs.writeFileSync(dest, out);
const fn = (code) => code.slice(0, code.lastIndexOf('\nawait junggoCollect('));
console.log(JSON.stringify({
  file: path.relative(process.cwd(), dest) || dest,
  bytes: Buffer.byteLength(out),
  sha256: sha(out),
  collector: Object.fromEntries(Object.entries(min).map(([p, c]) => [p, { chars: fn(c).length, sha256: sha(fn(c)) }])),
}, null, 1));
