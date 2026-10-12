// collect.js(수집기 원본)를 마켓별로 압축해 collect.jb.min.js(중고나라·번개장터) / collect.d.min.js(당근)를 만든다.
// PART 를 'jb' 또는 'd' 로 고정해 쓰지 않는 마켓 코드는 빠진다.
// 사용: npm install --prefix <폴더> terser@5.31.6   (이 판으로 지금의 압축본과 글자까지 같게 나온다 — 2026-10-12 확인)
//       TERSER_DIR=<폴더> node collector/src/minify.mjs [출력 폴더 = 이 파일의 폴더]
// 그다음 node collector/src/build.mjs 로 collector/refresh.mjs 를 다시 만든다.
// 주의: collect.js 에 \u 이스케이프나 보이지 않는 글자를 쓰지 말 것 (Claude 가 실행문을 옮겨 적을 때 틀리기 쉽다).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] || here);
const require = createRequire(path.join(path.resolve(process.env.TERSER_DIR || here), 'noop.js'));
const { minify } = require('terser');

const src = fs.readFileSync(path.join(here, 'collect.js'), 'utf8');
const fnSrc = src.slice(src.indexOf('async function junggoCollect'), src.lastIndexOf('await junggoCollect'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (const part of ['jb', 'd']) {
  const out = await minify(fnSrc, {
    compress: { passes: 3, global_defs: { PART: part }, unused: true, dead_code: true },
    mangle: { reserved: ['junggoCollect'] },
    format: { ascii_only: false },
  });
  const code = out.code + '\nawait junggoCollect(__CONFIG__);';
  // 문법 확인만 (실행하지 않는다)
  new AsyncFunction('__CONFIG__', code.replace('await junggoCollect(__CONFIG__);', 'return await junggoCollect(__CONFIG__);'));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `collect.${part}.min.js`), code);
  console.log(part, 'chars', code.length, 'daangn?', code.includes('buySellArticles'), 'joongna?', code.includes('search-api.joongna'));
}
