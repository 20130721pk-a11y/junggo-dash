// 처리한 요청 이슈를 닫는다 (데이터를 올린 뒤에만 실행). 실패한 요청에만 짧은 안내 댓글을 단다(공개되므로 내용 없이).
//   node collector/close.mjs work/close.json
import fs from 'node:fs';

const [file = 'work/close.json'] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
let list = [];
try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { list = []; }
if (!token || !repo || !Array.isArray(list) || !list.length) process.exit(0);

const api = (p, method, body) => fetch(`https://api.github.com/repos/${repo}${p}`, {
  method,
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
let closed = 0;
for (const r of list) {
  if (!Number.isInteger(r.number)) continue;
  try {
    if (!r.ok && r.note) await api(`/issues/${r.number}/comments`, 'POST', { body: String(r.note).slice(0, 300) });
    const res = await api(`/issues/${r.number}`, 'PATCH', { state: 'closed', state_reason: r.ok ? 'completed' : 'not_planned' });
    if (res.ok) closed++;
  } catch {
    // 다음 실행 때 다시 처리된다 (열린 요청은 매번 다시 읽는다)
  }
}
console.log(`[꿀매 레이더] 요청 ${list.length}개 중 ${closed}개 닫음`);
