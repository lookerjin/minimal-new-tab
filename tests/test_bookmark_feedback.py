"""Bookmark sidebar should start closed and deliberate link visits feed local suggestion ranking."""
from pathlib import Path

from playwright.sync_api import sync_playwright
from browser_runtime import launch_chromium
from test_settings_controls import setup

ROOT = Path(__file__).resolve().parents[1]


def test_new_tab_sidebar_is_not_restored_and_never_persists_open_state():
    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        page = browser.new_page()
        setup(page)
        assert page.locator('#bookmark-sidebar').get_attribute('aria-hidden') == 'true'
        page.locator('#open-bookmarks').click()
        assert page.locator('#bookmark-sidebar').get_attribute('aria-hidden') == 'false'
        assert page.evaluate("localStorage.getItem('bookmarkSidebarOpen')") is None
        page.locator('#bookmark-close').click()
        assert page.locator('#bookmark-sidebar').get_attribute('aria-hidden') == 'true'
        # An old value from an earlier version must be ignored on startup.
        page.evaluate("localStorage.setItem('bookmarkSidebarOpen','1')")
        page.add_script_tag(content=(ROOT / 'bookmarks.js').read_text())
        assert page.locator('#bookmark-sidebar').get_attribute('aria-hidden') == 'true'
        browser.close()


def test_bookmark_sidebar_click_contributes_usage_without_search_history():
    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        page = browser.new_page()
        setup(page)
        page.evaluate("""() => {
          chrome.bookmarks.getTree = async () => [{children:[
            {id:'site',title:'GitHub Documentation',url:'https://github.com'}
          ]}];
          // Test navigation intent without leaving the mocked extension page.
          document.addEventListener('click', e => {
            if (e.target.closest('a.bookmark-row')) e.preventDefault();
          }, {capture:true});
        }""")
        page.locator('#open-bookmarks').click()
        link = page.locator('a.bookmark-row.link')
        link.wait_for()
        link.click()
        data = page.evaluate("JSON.parse(localStorage.getItem('minimalSuggestUsage'))")
        assert len(data) == 1
        assert data[0]['key'] == 'url:https://github.com/'
        assert data[0]['count'] == 1
        assert page.evaluate("localStorage.getItem('minimalSearchHistory')") is None
        # A folder or a simple open/close should not count as a site visit.
        page.locator('#bookmark-close').click()
        page.locator('#open-bookmarks').click()
        assert len(page.evaluate("JSON.parse(localStorage.getItem('minimalSuggestUsage'))")) == 1
        page.add_script_tag(content=(ROOT / 'frecency.js').read_text())
        page.evaluate("""() => {
          const bookmark = SuggestionUsage.decorate({
            type:'bookmark',text:'GitHub Documentation',url:'https://github.com/'},'git');
          const history = SuggestionUsage.decorate({type:'history',text:'git lessons'},'git');
          window.__bookmarkRanksHigher = FrecencyRank.score(bookmark,'git') >
            FrecencyRank.score(history,'git');
        }""")
        assert page.evaluate("window.__bookmarkRanksHigher")
        browser.close()
