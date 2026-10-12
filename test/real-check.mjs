// 실제 사이트로 한 번 돌려 보기 (시험용 비밀번호·일반 검색어, 건수만 찍는다)
import fs from 'node:fs';
import { run } from '../collector/run.mjs';
import { keyring, open, LABEL } from '../collector/seal.mjs';
const PW = 'ci-only-test-password';
const env = { DASH_PASSWORD: PW, GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY, INIT_SEARCHES: JSON.stringify({ searches: [{ id: 's_citest0001', keyword: '아이폰 15', createdAt: 1 }, { id: 's_citest0002', keyword: '닌텐도 스위치', category: 'game', createdAt: 2 }], config: { area: '서울 강남구' } }) };
fs.rmSync('ci', { recursive: true, force: true });
const t0 = Date.now();
const st = await run({ prevDir: 'ci/none', outDir: 'ci/out', workDir: 'ci/work', env });
const v = open(JSON.parse(fs.readFileSync('ci/out/view.enc', 'utf8')), keyring(PW), LABEL.view);
for (const s of v.searches) {
  const r = v.results[s.id];
  const by = {};
  for (const t of r.items) by[t[0]] = (by[t[0]] || 0) + 1;
  console.log(s.id, JSON.stringify({ pf: Object.fromEntries(Object.entries(r.pf).map(([k, x]) => [k, { st: x.st, raw: x.raw, n: x.n, total: x.total, error: x.error, partial: x.partial }])), items: by, sold: r.sold.length, near: r.items.filter((t) => t[11] === 1).length, withDetail: r.items.filter((t) => t[0] === 'b' && t[13] && t[13].sn).length }));
}
console.log('bd', JSON.stringify(v.refresh.bd), 'status', JSON.stringify(st), 'sec', ((Date.now() - t0) / 1000).toFixed(1), 'view bytes', fs.statSync('ci/out/view.enc').size, 'state bytes', fs.statSync('ci/out/state.enc').size);
