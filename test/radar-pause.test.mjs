// 잠시 끄기(R7, 앱 0.8.0) 웹 시험 (node --test test/*.test.mjs) — 명령 pause 꼴·이름, 글(앱 data/Pause.kt 와 같은 글 — 앱 Pause080Test 와 같은 값), 끈 날 말
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(`${REPO}/box.js`);
await import(`${REPO}/radar-cmd.js`);
const C = globalThis.RadarCmd;
const NOW = Date.UTC(2026, 9, 25, 3, 0, 0); // 2026-10-25 12:00 한국

test('명령 pause{pid,on} — 꼴 검사·이름·되풀이 안 막음(앱 WebCmd 와 같음)', () => {
  assert.ok(C.TYPES.includes('pause'));
  const on = C.make('pause', { pid: 's_1', on: true }, NOW);
  const off = C.make('pause', { pid: 's_1', on: false }, NOW);
  assert.equal(C.validate(on, NOW), '');
  assert.equal(C.validate({ ...on, on: 'true' }, NOW), 'pause');
  assert.equal(C.validate({ ...on, on: undefined }, NOW), 'pause');
  assert.equal(C.validate({ ...on, pid: 's 1' }, NOW), 'pause');
  assert.equal(C.what(on, { product: '플스5' }), '플스5 잠시 끄기');
  assert.equal(C.what(off, { product: '플스5' }), '플스5 다시 켜기');
  // 보낸 기록에 on 을 남겨 '끄는 중'/'켜는 중'을 가른다
  assert.equal(C.slim(on, 7).on, true);
  assert.equal(C.slim(off, 7).on, false);
});

test('글 = 앱 Pause.kt(디자인 080-pause-design 7장)', () => {
  const P = C.PAUSE;
  assert.equal(P.pause, '잠시 끄기');
  assert.equal(P.resume, '다시 켜기');
  assert.equal(P.undo, '되돌리기');
  assert.equal(P.toast('갤럭시탭 S9'), "'갤럭시탭 S9' 잠시 끌게요");
  assert.equal(P.pausing, '끄는 중');
  assert.equal(P.resuming, '켜는 중');
  assert.equal(P.editOff, '다시 켠 뒤에 바꿀 수 있어요');
  assert.equal(P.sectionTitle(2), '잠시 끈 물건 2');
  assert.equal(P.sectionSub, '확인·알림을 멈췄어요 · 기록은 그대로예요');
  assert.equal(P.noneOn, '켜 둔 물건이 없어요. 아래에서 다시 켤 수 있어요.');
  assert.equal(P.cardLine('10월 25일'), '잠시 꺼 둠 · 10월 25일부터 · 기록은 그대로');
  assert.equal(P.bannerTitle, '잠시 끈 물건이에요');
  assert.equal(P.bannerSub('오늘'), '오늘부터 확인·알림을 멈췄어요 · 아래는 끌 때 결과예요');
  assert.equal(P.bannerAction, '다시 켜기 ›');
  assert.equal(P.rebase, '다시 켰어요 · 세 마켓을 다시 모아 기준을 잡는 중이에요');
  assert.equal(P.rebaseSub, '이번 확인은 알림 없이 기준만 잡아요');
  assert.equal(P.listValue, '잠시 꺼 둠');
  assert.equal(P.addCard, '잠시 꺼 둠 · 누르면 그만');
  assert.equal(P.addCardSpeech('RTX 4080'), 'RTX 4080, 잠시 꺼 둠, 누르면 그만 지켜보기');
  assert.equal(P.stopRow('4080'), '4080 · 잠시 꺼 둠');
  assert.equal(P.stopHint, '지우지 않고 알림만 멈추려면 ⋯ 의 잠시 끄기를 써요.');
  assert.equal(P.headAll, '모두 잠시 꺼 둠');
  assert.equal(P.focusNone, '켜 둔 물건이 없어요 · 홈에서 다시 켜 주세요');
  assert.equal(P.whyPaused, '이미 잠시 꺼 뒀어요');
  assert.equal(P.whyOn, '이미 켜 둔 물건이에요');
});

test('끈 날 말 = 앱 Pause.dayOf (한국 시각: 오늘 · 어제 · n월 n일 · 해가 다르면 해까지)', () => {
  const kst = (y, mo, d, h = 12, mi = 0) => Date.UTC(y, mo - 1, d, h - 9, mi);
  const now = kst(2026, 10, 25, 0, 10);
  assert.equal(C.pauseDay(kst(2026, 10, 25, 0, 5), now), '오늘');
  assert.equal(C.pauseDay(kst(2026, 10, 24, 23, 30), now), '어제'); // 자정 넘김
  assert.equal(C.pauseDay(kst(2026, 10, 3), now), '10월 3일');
  assert.equal(C.pauseDay(kst(2025, 10, 25), now), '2025년 10월 25일');
});
