// 당근 robots.txt 의 User-agent: * 묶음과, 수집기가 쓰는 경로가 허용되는지 (읽기만)
const ua = 'junggo-dash/1.0 (+https://github.com/20130721pk-a11y/junggo-dash; personal use, robots check)';
const res = await fetch('https://www.daangn.com/robots.txt', { headers: { 'User-Agent': ua } });
const txt = await res.text();
console.log('status', res.status, 'bytes', txt.length);
const lines = txt.split(/\r?\n/);
// 묶음 나누기
const groups = [];
let cur = null, agentLine = false;
for (const raw of lines) {
  const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(raw.replace(/#.*/, '').trim());
  if (!m) continue;
  const k = m[1].toLowerCase(), v = m[2].trim();
  if (k === 'user-agent') { if (!cur || !agentLine) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v); agentLine = true; }
  else { agentLine = false; if (cur) cur.rules.push(`${m[1]}: ${v}`); }
}
console.log('groups', groups.length);
for (const g of groups) console.log(`- agents(${g.agents.length}): ${g.agents.slice(0, 6).join(', ')}${g.agents.length > 6 ? ' …' : ''} | rules(${g.rules.length}): ${g.rules.slice(0, 40).join(' ; ')}`);
const other = lines.filter((l) => /^(sitemap|crawl-delay|host)\s*:/i.test(l.trim()));
console.log('other', other.join(' | '));
