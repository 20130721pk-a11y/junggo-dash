"""디자인 v2(0.8.1) 화면 스크린샷 — 시안(앱 docs/design/v2/mockups)과 견주려고 찍어요. 시험이 아니라 사진만.
python3 test/shots-v2.py [폴더]  → 홈 · 물건 화면(목록·시세) · 관심 매물 · 알림함 · 판단 창, 390px·1280px
묶음은 시험 자료(test/fixtures/radar-bundle.control.json, 지어낸 매물)를 잠그지 않은 디버그 꼴(?src=)로 씀 — 명령은 보내지 않아요."""
import datetime as dt
import functools
import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'junggo-v2-shots')
os.makedirs(OUT, exist_ok=True)
subprocess.check_call(['node', os.path.join(REPO, 'test/fixtures/make-control.mjs')], stdout=subprocess.DEVNULL)
B = json.load(open(os.path.join(REPO, 'test/fixtures/radar-bundle.control.json'), encoding='utf-8'))
site = tempfile.mkdtemp(prefix='jd-v2-')
for f in ('index.html', 'box.js', 'radar-view.js', 'radar-cmd.js', 'radar-ui.js'):
    shutil.copy(os.path.join(REPO, f), os.path.join(site, f))
os.makedirs(os.path.join(site, 'fx'))
json.dump(B, open(os.path.join(site, 'fx', 'radar.json'), 'w', encoding='utf-8'), ensure_ascii=False)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=site))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:%d/index.html?src=./fx' % srv.server_address[1]
AT = dt.datetime.fromtimestamp((B['made'] + 3 * 60e3) / 1000, tz=dt.timezone.utc)
PID = B['products'][0]['id']
SHOTS = [('home', ''), ('product', '#p=' + PID), ('watch', '#watch'), ('inbox', '#inbox')]

with sync_playwright() as pw:
    br = pw.chromium.launch()
    for w, h in ((390, 844), (1280, 900)):
        ctx = br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if w < 500 else 1)
        page = ctx.new_page()
        page.clock.set_fixed_time(AT)
        for name, frag in SHOTS:
            page.goto(BASE + frag)
            page.wait_for_selector('#page > *')
            page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(OUT, f'{name}-{w}.png'), full_page=True)
        # 물건 화면 시세 칸 · 판단 창
        page.goto(BASE + '#p=' + PID)
        page.wait_for_selector('.subtabs button')
        page.locator('.subtabs button').nth(1).click()
        page.wait_for_timeout(200)
        page.screenshot(path=os.path.join(OUT, f'product-price-{w}.png'), full_page=True)
        page.locator('.subtabs button').nth(0).click()
        page.wait_for_selector('.rows .row')
        page.locator('.rows .row').first.click()
        page.wait_for_selector('.drawer')
        page.wait_for_timeout(200)
        page.screenshot(path=os.path.join(OUT, f'sheet-{w}.png'))
        ctx.close()
    br.close()
print('스크린샷', OUT)
