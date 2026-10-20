// 웹 → 앱 상호 확인 자료(docs/command-v1.md 9장): 웹 코드(radar-cmd.js + box.js)가 잠근 명령 상자와 열린 내용 짝.
//   node test/fixtures/make-cmds.mjs  →  test/fixtures/web-cmds.json
// 앱 담당: DashBox.deriveKey(password, salt, iter) → DashBox.open(box, key, "junggo-radar-cmd") 가 plain 과 같은지 시험해요.
// 비밀번호·소금은 시험 전용(실제 값 아님). 상자는 만들 때마다 iv 가 달라져서, 시험은 '열어서 같음'만 봐요.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, '../..');
await import(`${REPO}/box.js`);
await import(`${REPO}/radar-cmd.js`);
const BOX = globalThis.JunggoBox, C = globalThis.RadarCmd;

export const PASSWORD = 'cmd-시험-비밀번호-0721';
export const SALT = 'Y21kLXRlc3Qtc2FsdC0wNw=='; // 'cmd-test-salt-07' (16바이트)
export const ITER = 100000;
export const AT = Date.UTC(2026, 9, 20, 5, 0, 0); // 2026-10-20 14:00 한국

// 종류마다 하나 이상 — 칸 꼴은 command-v1 4장 그대로
export function plains() {
  let i = 0;
  const rand = () => String(i++).padStart(5, '0').replace(/\d/g, (d) => 'abcdefghij'[d]);
  const at = (k) => AT + k * 1000;
  const mk = (type, f, k) => C.make(type, f, at(k), rand);
  return [
    mk('add', { q: '4080', card: 'gpu:4080' }, 1),
    mk('add', { q: '에어팟 프로2, airpods pro 2' }, 2),
    mk('edit', { pid: 's_4080', set: { thresholdPct: 20, targetPrice: '110만', excludeWords: '본체，노트북, 케이스', maxAgeDays: 60, maxKm: 5, matchMode: 'content' },
      base: { thresholdPct: 15, targetPrice: 1200000, excludeWords: ['본체', '노트북'], maxAgeDays: null, maxKm: null, matchMode: 'title' } }, 3),
    mk('edit', { pid: 's_4080', set: { bandMin: '35', bandMax: '', priceMin: '1.5만', priceMax: '500원', basicFilter: false, lowestAlert: false, variantPick: 'SUPER', category: 'pc', regionWords: '정왕동, 배곧동', keyword: '4080, 4080s', includeWords: '' },
      base: { bandMin: 850000, bandMax: null, priceMin: null, priceMax: null, basicFilter: true, lowestAlert: true, variantPick: '', category: '', regionWords: [], keyword: '4080', includeWords: [] } }, 4),
    mk('identify', { pid: 's_ps5', set: { category: 'game', bandMin: 350000, bandMax: 520000, excludeWords: ['타이어', '게임'], includeWords: ['미개봉'] } }, 5),
    mk('remove', { pid: 's_5080' }, 6),
    mk('move', { pid: 's_5080', dir: 'up' }, 7),
    mk('focus', { op: 'start', ids: ['s_4080', 's_ps5'], hours: 2, everyMin: 10 }, 8),
    mk('focus', { op: 'stop' }, 9),
    mk('check', { pid: 's_4080' }, 10),
    mk('check', {}, 11),
    mk('adhoc', { q: '4080 super' }, 12),
    mk('saveAdhoc', { q: '4080 super', variantPick: 'SUPER' }, 13),
    mk('star', { key: 'j:1001', pid: 's_4080', on: true }, 14),
    mk('star', { key: 'j:1001', on: false }, 15),
    mk('hide', { pid: 's_4080', key: 'b:1000' }, 16),
    mk('unhide', { pid: 's_4080', key: 'b:1000' }, 17),
    mk('unhideAll', { pid: 's_4080' }, 18),
    mk('excludeWord', { pid: 's_4080', word: '직거래', key: 'j:1001' }, 19),
    mk('watch', { key: 'd:2001', op: 'pin' }, 20),
    mk('watch', { key: 'd:2001', op: 'remove' }, 21),
    mk('share', { url: 'https://m.bunjang.co.kr/products/123456789' }, 22),
    mk('opened', { key: 'j:1001', pid: 's_4080' }, 23),
    mk('inboxRead', { ids: ['n_1', 'n_2'] }, 24),
    mk('inboxRead', { all: true }, 25),
    mk('recent', { op: 'del', q: '4080 super' }, 26),
    mk('recent', { op: 'clear' }, 27),
    mk('prefs', { set: { defaultPct: 18, autoWatchN: 3, intensity: 'save', quiet: { on: true, start: 23, end: 7 }, digestOn: false },
      base: { defaultPct: 15, autoWatchN: 2, intensity: 'normal', quiet: { on: true, start: 1, end: 7 }, digestOn: true } }, 28),
    mk('home', { set: { daangnHome: '정왕동, 배곧동, 은행동', distanceBase: '정왕동' }, base: { daangnHome: '정왕동', distanceBase: '' } }, 29),
  ];
}

export async function build() {
  const key = await BOX.deriveKey(PASSWORD, SALT, ITER);
  const items = [];
  for (const plain of plains()) items.push({ type: plain.type, plain, box: await C.seal(plain, key, SALT, ITER) });
  return {
    note: '웹 radar-cmd.js 가 잠근 명령(docs/command-v1.md 9장). 앱: DashBox.open(box, key, "junggo-radar-cmd") == plain. 비밀번호·소금은 시험 전용',
    label: C.LABEL, title: C.TITLE, password: PASSWORD, salt: SALT, iter: ITER, items,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = await build();
  fs.writeFileSync(path.join(DIR, 'web-cmds.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`web-cmds.json: ${out.items.length}개`);
}
