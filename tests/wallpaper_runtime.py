"""Serve the actual app with real IndexedDB and local, deterministic MV3/Bing substitutes."""
import base64
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')


def serve_app(page):
    errors = []
    state = {'metadata': 0, 'images': 0, 'fail': False, 'corrupt': False, 'hold': False, 'held': []}
    page.on('pageerror', lambda error: errors.append(str(error)))

    def app_route(route):
        name = urlparse(route.request.url).path.lstrip('/') or 'newtab.html'
        path = ROOT / name
        if not path.is_file() or ROOT not in path.resolve().parents:
            route.abort()
            return
        if name == 'newtab.js':
            script = path.read_text(encoding='utf-8')
            script = script.replace('location.assign(action.url)', 'window.__navigations.push(action.url)')
            script = script.replace('location.assign(target)', 'window.__navigations.push(target)')
            script = script.replace('location.assign(ENGINE_META[settings.engine].url+encodeURIComponent(submitted))',
                                    'window.__navigations.push(ENGINE_META[settings.engine].url+encodeURIComponent(submitted))')
            route.fulfill(content_type='application/javascript', body=script)
        else:
            route.fulfill(path=path)

    def bing_route(route):
        if 'HPImageArchive' in route.request.url:
            state['metadata'] += 1
            if state['hold']:
                state['held'].append(route)
            elif state['fail']:
                route.fulfill(status=503, body='offline')
            else:
                route.fulfill(json={'images': [{'url': '/test-wallpaper.png', 'copyright': 'Test landscape © Photographer',
                                                'startdate': '20261016'}]})
        else:
            state['images'] += 1
            route.fulfill(content_type='image/png', body=b'invalid' if state['corrupt'] else PNG)

    page.route('https://app.test/**', app_route)
    page.route('https://www.bing.com/**', bing_route)
    for host in ('api.github.com', 'raw.githubusercontent.com', 'cdn.jsdelivr.net'):
        page.route(f'https://{host}/**', lambda route: route.fulfill(status=503, body='offline'))
    page.add_init_script('''(() => {
      window.__navigations = []; window.__saved = []; window.__storageListeners = [];
      window.chrome = {
        storage:{sync:{get:async()=>({newTabPrefs:JSON.parse(localStorage.getItem('__prefs')||'{}')}),
          set:async data=>{
            if(window.__failSave)throw Error('quota exceeded');
            localStorage.setItem('__prefs',JSON.stringify(data.newTabPrefs)); window.__saved.push(data.newTabPrefs);
          }},onChanged:{addListener:listener=>window.__storageListeners.push(listener)}},
        bookmarks:{getTree:async()=>[{children:[]}],search:async()=>[]},
        runtime:{getURL:path=>'https://app.test/'+path}
      };
      localStorage.setItem('onlineSuggestions','off');
    })();''')
    page.goto('https://app.test/newtab.html')
    page.wait_for_function("document.querySelector('input[name=mode]:checked') !== null")
    return state, errors


def open_manager(page):
    page.locator('#open-settings').click()
    page.locator('#open-wallpapers').click()
    page.wait_for_function("document.querySelector('#background-options').getAttribute('aria-busy') === 'false'")


def upload(page, names=('one.png', 'two.png', 'three.png')):
    page.locator('#image-file').set_input_files([
        {'name': name, 'mimeType': 'image/png', 'buffer': PNG} for name in names
    ])
    page.wait_for_function("!document.querySelector('#choose-image').disabled")


def choose_mode(page, mode):
    page.locator(f'label.mode-card:has(input[value="{mode}"])').click()
    page.wait_for_function('(mode) => document.documentElement.dataset.mode === mode', arg=mode)
