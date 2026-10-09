"""Chromium DOM integration test. Run: python -m pytest -q tests/test_search_ui.py
The actual extension APIs are mocked; no external browser traffic is required.
"""
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def test_search_ui():
    html = (ROOT / 'newtab.html').read_text()
    html = re.sub(r'<script\s+src="[^"]+"\s*(?:defer)?\s*></script>', '', html)
    html = re.sub(r'<link rel="stylesheet"[^>]+>', '', html)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1100, 'height': 850})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.set_content(html)
        page.add_style_tag(content=(ROOT / 'style.css').read_text())
        page.evaluate("""() => {
          window.__navigations = [];
          window.__remote = [];
          const localValues = new Map();
          Object.defineProperty(window, 'localStorage', {configurable:true, value: {
            getItem: key => localValues.has(key) ? localValues.get(key) : null,
            setItem: (key, value) => localValues.set(key,String(value)),
            removeItem: key => localValues.delete(key)
          }});
          window.chrome = {
            storage: {
              sync: {get: async () => ({}), set: async () => {}},
              onChanged: {addListener: () => {}}
            },
            bookmarks: {
              getTree: async () => [{children:[]}],
              search: async (q) => {
                if (q === 'python') await new Promise(r => setTimeout(r, 450));
                if (q === 'many') return Array.from({length:12}, (_,i) => ({
                  id:String(100+i), title:'many link '+i, url:'https://example.org/many/'+i
                }));
                return [
                  {id:'1',title:'GitHub',url:'https://github.com/'},
                  {id:'2',title:'GitLab',url:'https://gitlab.com/'},
                  {id:'3',title:'Go documentation',url:'https://go.dev/doc/'},
                  {id:'4',title:'Python docs',url:'https://docs.python.org/'},
                  {id:'5',title:'中文文档',url:'https://example.org/chinese'},
                ].filter(row => (row.title + ' ' + row.url).toLowerCase().includes(q.toLowerCase()));
              }
            },
            permissions: {request: async () => true},
            runtime: {getURL: p => 'chrome-extension://test/' + p}
          };
          window.fetch = async (url, options) => {
            window.__remote.push(url);
            if (url.includes('slow')) await new Promise(r => setTimeout(r,380));
            if (options?.signal?.aborted) throw new DOMException('AbortError','AbortError');
            const values = url.includes('slow') ? ['slow unique result'] :
              url.includes('many') ? ['many online help'] : ['git tutorial','git workflow','github docs'];
            return new Response(JSON.stringify(['query', values]),
              {status:200, headers:{'content-type':'application/json'}});
          };
        }""")
        for name in ['boot.js','site-icons.js','newtab.js','bookmarks.js',
                     'query-analyzer.js','frecency.js','candidate-pipeline.js','suggestions.js']:
            js = (ROOT / name).read_text()
            if name == 'newtab.js':
                js = js.replace('location.assign(destination.url)', 'window.__navigations.push(destination.url)')
                js = js.replace('location.assign(ENGINE_META[settings.engine].url+encodeURIComponent(submitted))',
                                'window.__navigations.push(ENGINE_META[settings.engine].url+encodeURIComponent(submitted))')
            page.add_script_tag(content=js)
        q = page.locator('#query')
        q.fill('git')
        page.wait_for_timeout(165)
        options = page.locator('.suggestion-item')
        assert options.count() >= 2
        first = options.first.inner_text()
        assert 'Git' in first, first
        # A selection must survive the later online batch reordering the list.
        q.press('ArrowDown')
        selected_before = page.evaluate('window.NewTabSuggest.chosenDestination()')
        assert selected_before['type'] in ('bookmark','history')
        page.wait_for_timeout(300)
        assert page.evaluate('window.__remote.length') == 1
        selected_after = page.evaluate('window.NewTabSuggest.chosenDestination()')
        assert selected_before['url'] == selected_after['url']
        assert options.count() >= 3
        q.press('Enter')
        assert page.evaluate('window.__navigations.length') == 1
        stats = page.evaluate("JSON.parse(localStorage.getItem('minimalSuggestUsage'))")
        assert stats and stats[0]['key'].startswith('url:')

        q.fill('github.com')
        page.wait_for_timeout(340)
        assert page.locator('.suggestion-label').first.inner_text() == '访问网址'
        assert page.evaluate('window.__remote.length') == 1  # URLs stay local.
        # No URL auto-navigation on an unselected search.
        q.press('Enter')
        assert page.evaluate('window.__navigations.at(-1)').startswith('https://www.google.com/search?q=')

        # Stale bookmark results must not appear for a newer query.
        q.fill('python')
        page.wait_for_timeout(155)
        q.fill('go')
        page.wait_for_timeout(520)
        texts = page.locator('.suggestion-title').all_inner_texts()
        assert not any('Python docs' == item for item in texts), texts
        assert any('Go documentation' == item for item in texts), texts

        # Plenty of matching bookmarks must not suppress online suggestions.
        q.fill('many')
        page.wait_for_timeout(320)
        assert page.locator('.suggestion-label').all_inner_texts().count('书签') <= 3
        assert '搜索建议' in page.locator('.suggestion-label').all_inner_texts()

        # An old network response cannot overwrite the next query.
        q.fill('slow')
        page.wait_for_timeout(275)  # remote request started
        q.fill('fast')
        page.wait_for_timeout(440)
        assert 'slow unique result' not in page.locator('.suggestion-title').all_inner_texts()

        # Privacy control prevents future online requests.
        page.locator('#open-settings').click()
        page.locator('#online-suggestions').uncheck()
        page.locator('#close-settings').click()
        before = page.evaluate('window.__remote.length')
        q.fill('new search')
        page.wait_for_timeout(370)
        assert page.evaluate('window.__remote.length') == before
        q.press('Escape')
        assert page.locator('#search-suggestions').is_hidden()
        # IME composition must not produce intermediate suggestions.
        q.fill('')
        q.dispatch_event('compositionstart')
        q.fill('中')
        assert page.locator('#search-suggestions').is_hidden()
        q.dispatch_event('compositionend')
        page.wait_for_timeout(170)
        assert '中文文档' in page.locator('.suggestion-title').all_inner_texts()
        q.press('Escape')
        assert page.locator('#search-suggestions').is_hidden()
        assert page.evaluate("document.querySelector('#query').getAttribute('aria-activedescendant')") is None
        assert not errors, errors
        browser.close()


def test_lazy_bootstrap():
    """Exercise the real dynamic script loader (local responses are routed in memory)."""
    html = (ROOT / 'newtab.html').read_text()
    html = re.sub(r'<script\s+src="[^"]+"\s*(?:defer)?\s*></script>', '', html)
    html = re.sub(r'<link rel="stylesheet"[^>]+>', '', html)
    html = html.replace('<head>', '<head><base href="https://mock.test/">')
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        loaded = []

        def respond(route):
            name = route.request.url.rsplit('/', 1)[-1]
            if name.endswith('.js'):
                loaded.append(name)
            if name in ('query-analyzer.js', 'frecency.js', 'candidate-pipeline.js', 'suggestions.js'):
                route.fulfill(status=200, content_type='application/javascript', body=(ROOT / name).read_text())
            else:
                route.abort()

        page.route('**/*', respond)
        page.set_content(html)
        page.evaluate("""() => {
          const values = new Map();
          Object.defineProperty(window, 'localStorage', {configurable:true,value:{
            getItem:k=>values.has(k)?values.get(k):null,
            setItem:(k,v)=>values.set(k,String(v))
          }});
          window.chrome = {
            storage: {sync:{get:async()=>({}),set:async()=>{}},onChanged:{addListener(){}}},
            bookmarks: {getTree:async()=>[{children:[]}],search:async(q)=>[{title:'GitHub',url:'https://github.com/'}]},
            runtime: {getURL:x=>'chrome-extension://test/'+x}
          };
          window.fetch = async () => new Response(JSON.stringify(['git', ['git tutorial']]), {status:200});
        }""")
        page.add_script_tag(content=(ROOT / 'newtab.js').read_text())
        assert page.evaluate('typeof window.NewTabSuggest') == 'undefined'
        assert loaded == []
        page.locator('#query').fill('git')
        page.wait_for_function("typeof window.NewTabSuggest !== 'undefined'")
        page.wait_for_timeout(200)
        assert set(loaded) == {'query-analyzer.js', 'frecency.js', 'candidate-pipeline.js', 'suggestions.js'}
        assert page.locator('.suggestion-item').count() >= 1
        assert not errors, errors
        browser.close()
