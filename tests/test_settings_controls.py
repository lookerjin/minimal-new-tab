"""Settings visual controls regression, using Chromium and mocked MV3 APIs."""
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_runtime import launch_chromium

ROOT = Path(__file__).resolve().parents[1]


def setup(page):
    html = (ROOT / 'newtab.html').read_text()
    html = re.sub(r'<script\s+src="[^"]+"\s*(?:defer)?\s*></script>', '', html)
    html = re.sub(r'<link rel="stylesheet"[^>]+>', '', html)
    page.set_content(html)
    page.add_style_tag(content=(ROOT/'style.css').read_text())
    page.evaluate('''() => {
      const values = new Map();
      window.__saved = [];
      window.__storageListeners = [];
      Object.defineProperty(window, 'localStorage', {configurable: true, value: {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
      }});
      window.chrome = {
        storage: {
          sync: {get: async () => ({}), set: async obj => {window.__saved.push(obj.newTabPrefs)}},
          onChanged: {addListener: listener => window.__storageListeners.push(listener)}
        },
        bookmarks: {getTree: async () => [{children:[]}], search: async () => []},
        permissions: {request: async () => true},
        runtime: {getURL: path => 'chrome-extension://test/' + path}
      };
      window.fetch = async () => {throw new Error('network disabled in test')};
    }''')
    for name in ['boot.js','site-icons.js','query-analyzer.js','suggestion-usage.js','newtab.js','bookmarks.js']:
        page.add_script_tag(content=(ROOT/name).read_text())


def test_engine_order_and_selection_stays_functional():
    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        page = browser.new_page(viewport={'width':1100,'height':850})
        setup(page)
        assert page.locator('#engine-menu [data-engine]').evaluate_all('(buttons) => buttons.map(b=>b.dataset.engine)') == ['google','bing','baidu']
        page.locator('#engine-button').click()
        page.locator('#engine-menu [data-engine="bing"]').click()
        assert page.locator('#engine-name').inner_text() == 'Bing'
        assert page.evaluate('window.__saved.at(-1).engine') == 'bing'
        page.locator('#engine-button').click()
        page.locator('#engine-menu [data-engine="baidu"]').click()
        assert page.locator('#engine-name').inner_text() == 'Baidu'
        assert page.evaluate('window.__saved.at(-1).engine') == 'baidu'
        browser.close()


def test_settings_controls_keep_native_keyboard_state_and_motion_support():
    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        page = browser.new_page(viewport={'width':700,'height':720})
        setup(page)
        page.locator('#open-settings').click()
        toggle = page.locator('#online-suggestions')
        assert toggle.is_checked()
        assert toggle.evaluate('(node) => getComputedStyle(node).opacity') == '0'
        assert page.locator('.suggest-toggle-track').count() == 1
        page.locator('.suggest-pref-row').click()
        assert not toggle.is_checked()
        assert page.evaluate("localStorage.getItem('onlineSuggestions')") == 'off'
        page.locator('[data-locale="en"]').focus()
        page.keyboard.press('Tab')
        assert toggle.evaluate('(node) => document.activeElement === node && node.matches(":focus-visible")')
        assert page.locator('.suggest-pref-row').evaluate('(node) => getComputedStyle(node).outlineStyle') == 'solid'
        page.keyboard.press('Space')
        assert toggle.is_checked()
        assert page.evaluate("localStorage.getItem('onlineSuggestions')") == 'on'

        assert page.locator('.mode-selection').count() == 6
        radios = page.locator('input[name="mode"]')
        assert radios.count() == 6
        assert page.locator('input[name="mode"]:checked').get_attribute('value') == 'auto'
        assert page.locator('.mode-card:has(input:checked) .mode-selection').count() == 1
        page.locator('label.mode-card:has(input[value="white"])').click()
        assert page.locator('input[name="mode"]:checked').get_attribute('value') == 'white'
        page.wait_for_function("window.__saved.some(p => p.mode === 'white')")
        toggle.focus()
        page.keyboard.press('Tab')
        assert page.locator('input[name="mode"][value="white"]').evaluate('(node) => document.activeElement === node && node.matches(":focus-visible")')
        assert page.locator('.mode-card:has(input[value="white"])').evaluate('(node) => getComputedStyle(node).outlineStyle') == 'solid'
        page.keyboard.press('ArrowDown')
        assert page.locator('input[name="mode"]:checked').get_attribute('value') == 'black'
        page.wait_for_function("window.__saved.some(p => p.mode === 'black')")
        assert page.locator('.mode-card:has(input:checked) .mode-selection').count() == 1
        page.wait_for_timeout(270) # Let the intentionally small selection transition finish.
        # Selected visual marker is visible; others are hidden without losing radio semantics.
        assert page.locator('.mode-card:has(input:checked) .mode-selection').evaluate('(node) => getComputedStyle(node).opacity') == '1'
        assert page.locator('.mode-card:not(:has(input:checked)) .mode-selection').first.evaluate('(node) => getComputedStyle(node).opacity') == '0'
        page.evaluate("document.documentElement.dataset.theme = 'dark'")
        assert page.locator('.suggest-toggle-track').evaluate('(node) => getComputedStyle(node).width') == '39px'
        browser.close()


def test_reduced_motion_settings_controls_do_not_animate():
    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        page = browser.new_page(viewport={'width':400,'height':640}, reduced_motion='reduce')
        setup(page)
        for selector in ['.suggest-toggle-track', '.suggest-toggle-thumb', '.mode-selection']:
            assert page.locator(selector).first.evaluate('(node) => getComputedStyle(node).transitionDuration') in ('0s','0.00001s')
        browser.close()
