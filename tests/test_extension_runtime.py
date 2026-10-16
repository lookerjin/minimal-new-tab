"""Load an unpacked MV3 extension in a temporary Chromium profile with real browser APIs."""
import os
from pathlib import Path
import re
import tempfile
from playwright.sync_api import sync_playwright, expect
from wallpaper_runtime import PNG

ROOT = Path(__file__).resolve().parents[1]


def test_unpacked_newtab_storage_gallery_and_lazy_completion():
    with tempfile.TemporaryDirectory(prefix='minimal-new-tab-test-') as profile, sync_playwright() as pw:
        options = {
            'headless': True, 'channel': 'chromium',
            'args': ['--no-sandbox', f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}'],
        }
        if os.getenv('CHROMIUM_EXECUTABLE'):
            options['executable_path'] = os.environ['CHROMIUM_EXECUTABLE']
        elif Path('/usr/bin/chromium').is_file():
            options['executable_path'] = '/usr/bin/chromium'
        context = pw.chromium.launch_persistent_context(profile, **options)
        try:
            page = context.new_page()
            for host in ('api.github.com', 'raw.githubusercontent.com', 'cdn.jsdelivr.net'):
                page.route(f'https://{host}/**', lambda route: route.fulfill(status=503, body='offline'))
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto('chrome://newtab/')
            page.locator('#query').wait_for(state='visible')
            assert page.evaluate('typeof chrome.runtime.id') == 'string'
            page.locator('#open-settings').click()
            page.locator('#online-suggestions').uncheck()
            page.locator('#open-wallpapers').click()
            expect(page.locator('.builtin-wallpaper')).to_have_count(4)
            with page.expect_file_chooser() as chooser:
                page.locator('#choose-image').click()
            chooser.value.set_files([])
            page.locator('#image-file').dispatch_event('cancel',{'bubbles':True})
            expect(page.locator('#wallpaper-manager')).to_be_visible()
            page.locator('[data-builtin=alpine]').click()
            expect(page.locator('#wallpaper')).to_have_class(re.compile(r'\bready\b'))
            page.reload()
            expect(page.locator('#wallpaper')).to_have_class(re.compile(r'\bready\b'))
            assert page.evaluate("async()=> (await chrome.storage.sync.get('newTabPrefs')).newTabPrefs.wallpaperId") == 'builtin:alpine'
            page.locator('#open-settings').click()
            page.locator('#open-wallpapers').click()
            page.locator('input[value=auto]').check()
            expect(page.locator('#wallpaper')).not_to_have_attribute('src',re.compile('.+'))
            page.locator('#image-file').set_input_files({'name':'real-extension.png','mimeType':'image/png','buffer':PNG})
            expect(page.locator('.wallpaper-card')).to_have_count(1)
            assert page.locator('#wallpaper').get_attribute('src') is None
            page.locator('.wallpaper-card').click()
            expect(page.locator('#wallpaper')).to_have_class(re.compile(r'\bready\b'))
            page.reload()
            expect(page.locator('#wallpaper')).to_have_class(re.compile(r'\bready\b'))
            assert page.evaluate("async()=> (await chrome.storage.sync.get('newTabPrefs')).newTabPrefs.mode") == 'local'
            page.evaluate("localStorage.setItem('minimalSearchHistory',JSON.stringify(['git test']))")
            page.locator('#query').fill('git')
            page.locator('#query-completion').wait_for(state='visible')
            page.locator('#query').press('ArrowRight')
            assert page.locator('#query').input_value() == 'git test'
            page.evaluate("async()=>await chrome.bookmarks.create({title:'Docs reference',url:'https://example.test/reference'})")
            page.route('https://example.test/reference',lambda route:route.fulfill(content_type='text/html',body='<h1>Bookmark destination</h1>'))
            page.locator('#query').fill('doc')
            page.locator('#query-completion').wait_for(state='visible')
            page.locator('#query').press('Tab')
            assert page.locator('#query').input_value() == 'doc'
            assert page.evaluate('window.NewTabSuggest.chosenDestination().url') == 'https://example.test/reference'
            page.locator('#query').press('Enter')
            expect(page).to_have_url('https://example.test/reference')
            expect(page.locator('h1')).to_have_text('Bookmark destination')
            page.goto('chrome://newtab/')
            page.wait_for_function('() => window.SiteSearch?.count > 10000')
            page.route('https://github.com/search?*',lambda route:route.fulfill(content_type='text/html',body='<h1>GitHub search</h1>'))
            page.locator('#query').fill('@github 中文 router')
            expect(page.locator('#engine-name')).to_have_text('GitHub')
            assert page.evaluate("async()=> (await chrome.storage.sync.get('newTabPrefs')).newTabPrefs.engine") == 'google'
            page.locator('#query').press('Enter')
            expect(page).to_have_url('https://github.com/search?q=%E4%B8%AD%E6%96%87+router')
            expect(page.locator('h1')).to_have_text('GitHub search')
            assert not errors, errors
        finally:
            context.close()
