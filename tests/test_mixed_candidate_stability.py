"""Mixed-source query snapshots must not reverse the search capsule's height mid-edit."""
from playwright.sync_api import sync_playwright
from browser_runtime import launch_chromium
from test_suggestion_motion import build_page, geometry


def target_height(page):
    return page.evaluate('''() => parseFloat(document.querySelector('.search-combo')
        .style.getPropertyValue('--suggestion-height')) || 0''')


def enable_delayed_online(page, wait=90):
    page.evaluate('''wait => {
      localStorage.setItem('onlineSuggestions', 'on');
      window.fetch = async url => {
        await new Promise(resolve => setTimeout(resolve, wait));
        const q = new URL(url).searchParams.get('q') || '';
        return {ok:true, headers:{get:()=>null}, json:async()=>[q,
          [q + ' remote A', q + ' remote B', q + ' remote C']]};
      };
    }''', wait)


def test_mixed_sources_do_not_shrink_then_expand_during_backspace():
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1150, 'height': 850})
        build_page(page)
        enable_delayed_online(page)
        q = page.locator('#query')
        q.fill('git')
        page.wait_for_timeout(550)
        before = target_height(page)
        assert before >= 225
        q.fill('git t')  # Recent searches arrive first; remote suggestions later.
        page.wait_for_timeout(220)
        assert geometry(page)['active']
        assert target_height(page) >= before - 1, 'an incomplete candidate snapshot must not shrink the shell'
        page.wait_for_timeout(330)
        after = target_height(page)
        assert 0 < after < before, 'eventual height must reflect the final candidate count'
        assert geometry(page)['active']
        browser.close()


def test_backspace_burst_with_mixed_sources_keeps_capsule_height():
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1150, 'height': 850})
        build_page(page)
        enable_delayed_online(page)
        q = page.locator('#query')
        q.fill('git bookmark')
        page.wait_for_timeout(540)
        before = target_height(page)
        assert before > 0
        for query in ('git bookmar', 'git bookma', 'git bookm', 'git book', 'git boo', 'git bo', 'git b', 'git'):
            q.fill(query)
            page.wait_for_timeout(35)
            assert geometry(page)['active'], query
            assert target_height(page) >= before - 1, query
        page.wait_for_timeout(450)
        assert geometry(page)['active']
        q.fill('')
        assert not geometry(page)['active']
        assert target_height(page) == 0
        browser.close()


def test_mixed_provider_completion_preserves_keyboard_selection():
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1150, 'height': 850})
        build_page(page)
        enable_delayed_online(page)
        q = page.locator('#query')
        q.fill('git t')
        page.wait_for_timeout(60)
        q.press('ArrowDown')
        selected = page.evaluate('window.NewTabSuggest.chosenDestination()')
        assert selected and selected['type'] == 'history'
        page.wait_for_timeout(470)
        current = page.evaluate('window.NewTabSuggest.chosenDestination()')
        assert current and current['text'] == selected['text']
        assert geometry(page)['active']
        browser.close()


def test_reduced_motion_still_defers_intermediate_provider_shrink():
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1150, 'height': 850}, reduced_motion='reduce')
        build_page(page)
        enable_delayed_online(page)
        q = page.locator('#query')
        q.fill('git')
        page.wait_for_timeout(550)
        before = target_height(page)
        q.fill('git t')
        page.wait_for_timeout(220)
        assert target_height(page) >= before - 1
        page.wait_for_timeout(330)
        assert 0 < target_height(page) < before
        browser.close()
