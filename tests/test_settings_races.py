"""Regression tests for failed sync writes and superseded wallpaper selection."""
from playwright.sync_api import sync_playwright
from test_settings_controls import setup


def test_failed_engine_write_restores_persisted_state():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page()
        setup(page)
        page.evaluate("() => { chrome.storage.sync.set = async () => {throw Error('quota exceeded')}; }")
        page.locator('#engine-button').click()
        page.locator('#engine-menu [data-engine="bing"]').click()
        page.wait_for_function("document.querySelector('#status').textContent.includes('Could not save')")
        assert page.locator('#engine-name').inner_text() == 'Google'
        assert page.locator('#engine-menu [data-engine="google"]').get_attribute('aria-checked') == 'true'
        browser.close()


def test_failed_background_write_restores_mode_and_theme():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(color_scheme='light')
        setup(page)
        page.evaluate("() => { chrome.storage.sync.set = async () => {throw Error('quota exceeded')}; }")
        page.locator('#open-settings').click()
        page.locator('label.mode-card:has(input[value="black"])').click()
        page.wait_for_function("document.querySelector('#status').textContent.includes('Failed to save')")
        assert page.locator('input[name="mode"]:checked').get_attribute('value') == 'auto'
        assert page.locator('html').get_attribute('data-theme') == 'light'
        browser.close()


def test_cached_wallpaper_decode_cannot_supersede_later_solid_choice():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(color_scheme='light')
        setup(page)
        page.evaluate("""() => {
          window.dbGet = async key => key === 'local' ? new Blob(['image'], {type:'image/png'}) : null;
          window.Image = class {
            set src(value) { this._src = value; }
            decode() { return new Promise(resolve => { window.__finishDecode = resolve; }); }
          };
          const originalSet = chrome.storage.sync.set;
          chrome.storage.sync.set = async data => {
            if (data.newTabPrefs.mode === 'white') {
              await new Promise(resolve => { window.__finishWhiteSave = resolve; });
            }
            return originalSet(data);
          };
        }""")
        page.locator('#open-settings').click()
        page.locator('label.mode-card:has(input[value="local"])').click()
        page.wait_for_function('typeof window.__finishDecode === "function"')
        page.locator('label.mode-card:has(input[value="white"])').click()
        page.wait_for_function('typeof window.__finishWhiteSave === "function"')
        page.evaluate('window.__finishDecode()')
        page.wait_for_timeout(100)
        page.evaluate('window.__finishWhiteSave()')
        page.wait_for_timeout(150)
        assert page.locator('input[name="mode"]:checked').get_attribute('value') == 'white'
        assert page.locator('#wallpaper').get_attribute('src') is None
        assert page.locator('html').get_attribute('data-mode') == 'white'
        assert page.evaluate("window.__saved.at(-1).mode") == 'white'
        browser.close()


def test_rapid_settings_writes_are_serial_and_own_echoes_do_not_revert_ui():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page()
        setup(page)
        page.evaluate("""() => {
          window.__writing = [];
          chrome.storage.sync.set = data => new Promise(resolve => {
            window.__writing.push({settings:data.newTabPrefs,resolve});
          });
        }""")
        page.locator('#engine-button').click()
        page.locator('#engine-menu [data-engine="bing"]').click()
        page.wait_for_function('window.__writing.length===1')
        page.locator('#engine-button').click()
        page.locator('#engine-menu [data-engine="baidu"]').click()
        assert page.locator('#engine-name').inner_text() == 'Baidu'
        assert page.evaluate('window.__writing.length') == 1
        # An onChanged echo of the first write must not flicker the newer Bing/Baidu choice.
        page.evaluate("window.__storageListeners[0]({newTabPrefs:{newValue:window.__writing[0].settings}}, 'sync')")
        assert page.locator('#engine-name').inner_text() == 'Baidu'
        page.evaluate('window.__writing[0].resolve()')
        page.wait_for_function('window.__writing.length===2')
        page.evaluate('window.__writing[1].resolve()')
        page.wait_for_timeout(80)
        assert page.evaluate('window.__writing.map(v=>v.settings.engine)') == ['bing', 'baidu']
        assert page.locator('#engine-name').inner_text() == 'Baidu'
        browser.close()


def test_failed_cached_photo_restores_previous_background():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(color_scheme='light')
        setup(page)
        page.locator('#open-settings').click()
        page.locator('label.mode-card:has(input[value="black"])').click()
        page.wait_for_function("window.__saved.some(p => p.mode === 'black')")
        page.evaluate("""() => {
          window.dbGet = async key => key === 'local' ? new Blob(['image'], {type:'image/png'}) : null;
          window.Image = class {
            set src(value) { this._src = value; }
            decode() { return Promise.resolve(); }
          };
          chrome.storage.sync.set = async data => {
            if (data.newTabPrefs.mode === 'local')throw Error('quota exceeded');
            window.__saved.push(data.newTabPrefs);
          };
        }""")
        page.locator('label.mode-card:has(input[value="local"])').click()
        page.wait_for_function("document.querySelector('#status').textContent.length > 0")
        assert page.locator('input[name="mode"]:checked').get_attribute('value') == 'black'
        assert page.locator('html').get_attribute('data-theme') == 'dark'
        assert page.locator('#wallpaper').get_attribute('src') is None
        browser.close()


def test_failed_local_photo_save_does_not_replace_cached_image():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(color_scheme='light')
        setup(page)
        page.evaluate("""() => {
          window.__cache = new Map([['local',new Blob(['old photo'],{type:'image/png'})]]);
          window.dbGet = async key => window.__cache.get(key);
          window.dbPut = async (key,value) => { window.__cache.set(key,value); };
          window.Image = class { set src(value){} decode(){return Promise.resolve()} };
          chrome.storage.sync.set = async data => { if(data.newTabPrefs.mode==='local')throw Error('quota exceeded'); };
        }""")
        # The picker is hidden; Playwright can still simulate an actual local-file choice.
        page.locator('#image-file').set_input_files({
            'name': 'new.png', 'mimeType': 'image/png', 'buffer': b'a sample image'
        })
        page.wait_for_function("document.querySelector('#status').textContent.includes('Could not save image')")
        assert page.locator('input[name="mode"]:checked').get_attribute('value') == 'auto'
        assert page.evaluate("async () => await window.__cache.get('local').text()") == 'old photo'
        browser.close()


def test_canceled_upload_does_not_change_local_cache_after_delayed_idb_write():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(color_scheme='light')
        setup(page)
        page.evaluate("""() => {
          window.__cache = new Map([['local',new Blob(['previous'],{type:'image/png'})]]);
          window.dbGet = async key => window.__cache.get(key);
          window.dbPut = async (key,value) => {
            if(key==='local' && !window.__finishCacheWrite){
              await new Promise(resolve => {window.__finishCacheWrite=resolve});
            }
            window.__cache.set(key,value);
          };
          window.Image = class { set src(value){} decode(){return Promise.resolve()} };
        }""")
        page.locator('#image-file').set_input_files({'name':'new.png','mimeType':'image/png','buffer':b'new photo'})
        page.wait_for_function('typeof window.__finishCacheWrite === "function"')
        page.locator('#open-settings').click()
        page.locator('label.mode-card:has(input[value="white"])').click()
        page.evaluate('window.__finishCacheWrite()')
        page.wait_for_timeout(170)
        assert page.locator('input[name="mode"]:checked').get_attribute('value') == 'white'
        assert page.evaluate("async () => await window.__cache.get('local').text()") == 'previous'
        browser.close()


def test_external_sync_changes_apply_only_when_local_writes_are_idle():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page()
        setup(page)
        page.evaluate("""() => {
          chrome.storage.sync.set = data => new Promise(resolve => {
            window.__completeSave=resolve;
          });
        }""")
        page.locator('#engine-button').click()
        page.locator('#engine-menu [data-engine="bing"]').click()
        page.wait_for_function('typeof window.__completeSave === "function"')
        # While a local change is being saved, a conflicting external echo is deferred.
        page.evaluate("""() => window.__storageListeners[0]({
          newTabPrefs: {newValue:{engine:'baidu',mode:'auto',locale:'zh',remoteUrl:''}}
        },'sync')""")
        assert page.locator('#engine-name').inner_text() == 'Bing'
        page.evaluate('window.__completeSave()')
        page.wait_for_timeout(40)
        assert page.locator('#engine-name').inner_text() == 'Bing'
        # Once the local write completes, changes made on another device apply normally.
        page.evaluate("""() => window.__storageListeners[0]({
          newTabPrefs: {newValue:{engine:'baidu',mode:'auto',locale:'en',remoteUrl:''}}
        },'sync')""")
        assert page.locator('#engine-name').inner_text() == 'Baidu'
        assert page.locator('html').get_attribute('lang') == 'en'
        browser.close()
