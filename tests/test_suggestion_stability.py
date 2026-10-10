"""Regression for dropdown stability during typing and backspace."""
from playwright.sync_api import sync_playwright
from browser_runtime import launch_chromium
from test_suggestion_motion import build_page, geometry


def panel_target(page):
    return page.evaluate('''() => parseFloat(getComputedStyle(document.querySelector('.search-combo'))
        .getPropertyValue('--suggestion-height'))''')


def test_backspace_does_not_collapse_while_bookmark_provider_is_pending():
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1200, 'height': 850})
        build_page(page)
        q = page.locator('#query')
        q.fill('git bookmark')  # Only the delayed bookmark provider has matches.
        page.wait_for_timeout(460)
        assert geometry(page)['active']
        height = panel_target(page)
        assert height > 0
        q.press('Backspace')
        page.wait_for_timeout(25)
        assert geometry(page)['active'], 'dropdown must not close while awaiting candidates'
        assert panel_target(page) >= height - 1
        assert page.evaluate('window.NewTabSuggest.chosenDestination()') is None
        page.wait_for_timeout(110)
        assert geometry(page)['active']
        assert geometry(page)['rowCount'] >= 1
        browser.close()


def test_height_shrinks_after_typing_settles_but_grows_immediately():
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1200, 'height': 850})
        build_page(page)
        q = page.locator('#query')
        q.fill('git')
        page.wait_for_timeout(470)
        tall = panel_target(page)
        assert tall > 170, tall
        q.fill('go')
        page.wait_for_timeout(70)
        assert geometry(page)['active']
        assert panel_target(page) >= tall - 1, 'shrink must be deferred during active typing'
        page.wait_for_timeout(450)
        short = panel_target(page)
        assert 0 < short < tall
        q.fill('git')
        page.wait_for_timeout(150)
        assert panel_target(page) > short, 'growing the panel should not be delayed'
        q.fill('')
        assert not geometry(page)['active'], 'clearing the input must close immediately'
        assert panel_target(page) == 0
        browser.close()


def test_true_no_results_eventually_closes_and_escape_still_works():
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1200, 'height': 850})
        build_page(page)
        q = page.locator('#query')
        q.fill('git')
        page.wait_for_timeout(450)
        assert geometry(page)['active']
        q.fill('zzz-no-matches-very-long')
        page.wait_for_timeout(35)
        assert geometry(page)['active']
        page.wait_for_timeout(300)
        assert not geometry(page)['active'], 'after providers settle with zero results, close the panel'
        q.fill('git')
        page.wait_for_timeout(170)
        q.press('Escape')
        assert not geometry(page)['active']
        assert q.get_attribute('aria-expanded') == 'false'
        browser.close()


def test_late_online_results_do_not_cause_collapse_and_reopen():
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1200, 'height': 850})
        build_page(page)
        page.evaluate('''() => {
          localStorage.setItem('onlineSuggestions','on');
          window.fetch = async url => {
            await new Promise(resolve => setTimeout(resolve, 220));
            const q = new URL(url).searchParams.get('q');
            return {ok:true,headers:{get:()=>null},json:async()=>[q,[q+' result']]};
          };
        }''')
        q = page.locator('#query')
        q.fill('git')
        page.wait_for_timeout(480)
        assert geometry(page)['active']
        q.fill('zzabcde')  # no local matches; only remote can respond, after 240+220ms
        page.wait_for_timeout(275)
        pending = geometry(page)
        assert pending['active'], pending
        assert pending['panelHeight'] > 0, pending
        # Retain the previous rows visually while online suggestions are pending,
        # but prevent navigation of stale results and hide them from assistive tech.
        assert pending['rowCount'] > 0, pending
        assert page.locator('#search-suggestions').evaluate('(node) => node.inert')
        assert page.locator('#search-suggestions').get_attribute('aria-hidden') == 'true'
        assert q.get_attribute('aria-expanded') == 'false'
        page.wait_for_timeout(280)
        final = geometry(page)
        assert final['active'] and final['rowCount'] == 1, final
        assert page.locator('#search-suggestions').get_attribute('aria-hidden') == 'false'
        assert not page.locator('#search-suggestions').evaluate('(node) => node.inert')
        browser.close()


def test_continuous_backspace_never_restarts_expansion():
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1200, 'height': 850})
        build_page(page)
        q = page.locator('#query')
        q.fill('git bookmark')
        page.wait_for_timeout(430)
        initial = panel_target(page)
        while len(q.input_value()) > 3:
            q.press('Backspace')
            page.wait_for_timeout(35)
            assert geometry(page)['active'], q.input_value()
            assert panel_target(page) >= initial - 1, q.input_value()
        page.wait_for_timeout(500)
        assert geometry(page)['active']
        q.fill('')
        assert not geometry(page)['active']
        browser.close()
