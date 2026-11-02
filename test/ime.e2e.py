#!/usr/bin/env python3
"""웹 '결과 안에서 찾기' 칸 한글 조합 시험 (11/2 대표 제보: '아스트라'가 'ㅇㅏㅅㅡㅌㅡㄹㅏ'로 갈라짐).

    python3 test/ime.e2e.py

크롬 IME 조합을 CDP(Input.imeSetComposition·insertText)로 흉내 내요. 조합 중엔 칸이 다시 그려지면 안 되고(같은 칸),
조합이 끝나면 글이 '아스'로 남고 목록이 걸러져야 해요. 시험 자료는 badge.e2e.py 와 같은 묶음(지어낸 매물).
"""
import functools, http.server, json, os, shutil, sys, tempfile, threading
from playwright.sync_api import sync_playwright

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = json.load(open(os.path.join(REPO, 'test/fixtures/app-badge.json'), encoding='utf-8'))['bundle']
site = tempfile.mkdtemp(prefix='jd-ime-')
for f in ('index.html', 'box.js', 'radar-view.js', 'radar-cmd.js', 'radar-ui.js'):
    shutil.copy(os.path.join(REPO, f), os.path.join(site, f))
os.makedirs(os.path.join(site, 'd'))
json.dump(B, open(os.path.join(site, 'd', 'radar.json'), 'w', encoding='utf-8'), ensure_ascii=False)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=site))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ROOT = 'http://127.0.0.1:%d/index.html?src=./d#p=%s' % (srv.server_address[1], B['products'][0]['id'])
fails = []


def check(c, m):
    print(('ok - ' if c else 'FAIL - ') + m)
    if not c:
        fails.append(m)


with sync_playwright() as pw:
    br = pw.chromium.launch()
    for w in (1280, 390):
        page = br.new_page(viewport={'width': w, 'height': 900})
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(ROOT)
        page.wait_for_selector('#fQ')
        page.evaluate("document.getElementById('fQ').dataset.mark = 'orig'")
        page.focus('#fQ')
        cdp = page.context.new_cdp_session(page)
        replaced = False
        for word in ('아', '스'):
            for part in {'아': ['ㅇ', '아'], '스': ['ㅅ', '스']}[word]:
                cdp.send('Input.imeSetComposition', {'text': part, 'selectionStart': 1, 'selectionEnd': 1})
                page.wait_for_timeout(30)
                if page.evaluate("(document.getElementById('fQ')||{}).dataset?.mark") != 'orig':
                    replaced = True
            cdp.send('Input.insertText', {'text': word})
            page.wait_for_timeout(60)
            page.evaluate("document.getElementById('fQ').dataset.mark = 'orig'")
        page.wait_for_timeout(200)
        v = page.input_value('#fQ')
        check(not replaced, f'[{w}] 조합 중엔 찾기 칸을 다시 그리지 않아요')
        check(v == '아스', f"[{w}] 친 글이 '아스' 그대로예요 (지금 {v!r})")
        check(page.evaluate("document.activeElement && document.activeElement.id") == 'fQ', f'[{w}] 초점이 찾기 칸에 남아요')
        check(not errs, f'[{w}] 페이지 오류 없음 {errs[:1]}')
        page.close()
    br.close()
srv.shutdown()
print('통과' if not fails else '실패 %d' % len(fails))
sys.exit(1 if fails else 0)
