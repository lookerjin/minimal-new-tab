"""Complete search journeys: input, Tab selection, execution and return to editing."""
from pathlib import Path
import pytest
from playwright.sync_api import sync_playwright, expect
from browser_runtime import launch_chromium
from wallpaper_runtime import serve_app


@pytest.fixture
def app():
    with sync_playwright() as pw:
        browser=launch_chromium(pw)
        page=browser.new_page()
        _,errors=serve_app(page)
        page.wait_for_function('SiteSearch.loaded')
        yield page
        assert not errors,errors
        browser.close()


def alternatives(page):
    page.evaluate('''()=>{
      localStorage.setItem('minimalSearchHistory',JSON.stringify(['git tutorial','git workflow']));
      chrome.bookmarks.search=async()=>[{title:'git documentation',url:'https://github.com/docs'}];
    }''')
    page.locator('#query').fill('git')
    page.locator('.suggestion-item[data-key="url:https://github.com/docs"]').wait_for()


def release_controller(page,held):
    # Dependencies can still be loading when Tab is pressed; pump events until
    # the deliberately paused controller request actually reaches its route.
    for _ in range(150):
        if held:break
        page.wait_for_timeout(20)
    assert held
    held[0].fulfill(content_type='application/javascript',body=(Path(__file__).resolve().parents[1]/'suggestions.js').read_text(encoding='utf-8'))


def test_default_action_is_visible_and_plain_enter_does_not_use_bookmark(app):
    page=app
    alternatives(page)
    first=page.locator('.suggestion-item').first
    expect(first).to_contain_text('使用 Google 搜索“git”')
    expect(first).to_have_attribute('aria-selected','true')
    assert page.evaluate('NewTabSuggest.chosenDestination()') is None
    page.locator('#query').press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == 'https://www.google.com/search?q=git'


@pytest.mark.parametrize('key',['Tab','ArrowDown'])
def test_first_cycle_skips_default_wraps_back_and_keeps_focus(app,key):
    page=app
    alternatives(page)
    q=page.locator('#query')
    count=page.locator('.suggestion-item').count()
    q.press(key)
    expect(page.locator('.suggestion-item').nth(1)).to_have_attribute('aria-selected','true')
    assert page.evaluate('NewTabSuggest.chosenDestination()') is not None
    for _ in range(count-1):
        q.press(key)
    expect(page.locator('.suggestion-item').first).to_have_attribute('aria-selected','true')
    assert page.evaluate('NewTabSuggest.chosenDestination()') is None
    assert q.input_value() == 'git'
    assert q.evaluate('(el)=>document.activeElement===el')
    q.press('Shift+Tab')
    expect(page.locator('.suggestion-item').last).to_have_attribute('aria-selected','true')


@pytest.mark.parametrize('submit',['Enter','button'])
def test_selected_bookmark_enter_and_submit_button_have_same_destination(app,submit):
    page=app
    page.evaluate("chrome.bookmarks.search=async()=>[{title:'GitHub Docs',url:'https://github.com/docs'}]")
    q=page.locator('#query')
    q.fill('git')
    page.locator('.suggestion-item[data-key="url:https://github.com/docs"]').wait_for()
    q.press('Tab')
    expect(page.locator('#confirm-hint-label')).to_have_text('打开')
    expect(page.locator('.search-submit')).to_have_attribute('aria-label','打开书签')
    assert q.input_value() == 'git'
    if submit=='Enter':q.press('Enter')
    else:page.locator('.search-submit').click()
    assert page.evaluate('window.__navigations.at(-1)') == 'https://github.com/docs'


def test_typing_and_clicking_input_return_to_original_text_without_old_destination(app):
    page=app
    alternatives(page)
    q=page.locator('#query')
    q.press('Shift+Tab')
    assert page.evaluate('NewTabSuggest.chosenDestination()') is not None
    q.press('End')
    q.press('x')
    assert q.input_value() == 'gitx'
    assert page.evaluate('NewTabSuggest.chosenDestination()') is None
    q.press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == 'https://www.google.com/search?q=gitx'
    q.fill('git')
    page.locator('.suggestion-item[data-key="url:https://github.com/docs"]').wait_for()
    q.press('Shift+Tab')
    q.click()
    assert page.evaluate('NewTabSuggest.chosenDestination()') is None
    assert q.input_value() == 'git'


def test_site_journey_uses_tab_and_enter_then_escape_returns_one_layer_at_a_time(app):
    page=app
    q=page.locator('#query')
    q.fill('github')
    page.locator('.suggestion-item').filter(has_text='切换到 GitHub 搜索').wait_for()
    q.press('Tab')
    assert page.evaluate('NewTabSuggest.chosenDestination().type') == 'site'
    expect(page.locator('#confirm-hint-label')).to_have_text('切换')
    q.press('Enter')
    expect(page.locator('#engine-name')).to_have_text('GitHub')
    assert q.input_value() == ''
    assert q.evaluate('(el)=>document.activeElement===el')
    page.evaluate("SiteSearch.remember(SiteSearch.lookup('gh'),'golang router')")
    q.fill('golang')
    page.locator('.suggestion-item').filter(has_text='golang router').wait_for()
    expect(page.locator('.suggestion-item').first).to_contain_text('在 GitHub 中搜索')
    q.press('Tab')
    q.press('Escape')
    assert page.evaluate('NewTabScope.site.id') == 'gh'
    assert page.evaluate('NewTabSuggest.chosenDestination()') is None
    assert q.input_value() == 'golang'
    expect(q).to_have_attribute('aria-expanded','false')
    q.press('Escape')
    assert page.evaluate('NewTabScope.site') is None
    assert q.input_value() == 'golang'
    expect(page.locator('#engine-name')).to_have_text('Google')
    assert page.evaluate('window.__saved') == []


def test_site_submit_keeps_scope_and_uses_original_or_tab_selected_query(app):
    page=app
    page.evaluate("SiteSearch.remember(SiteSearch.lookup('gh'),'router tutorial')")
    q=page.locator('#query')
    q.fill('@github router')
    page.locator('.suggestion-item').filter(has_text='router tutorial').wait_for()
    q.press('Tab')
    q.press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == 'https://github.com/search?q=router+tutorial'
    assert page.evaluate('NewTabScope.site.id') == 'gh'
    q.fill('original')
    q.press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == 'https://github.com/search?q=original'


def test_left_control_opens_menu_in_both_scopes_and_menu_supports_tab(app):
    page=app
    q=page.locator('#query')
    q.fill('@github preserve')
    page.locator('#engine-button').click()
    expect(page.locator('#engine-menu')).to_have_attribute('aria-hidden','false')
    assert page.evaluate('NewTabScope.site.id') == 'gh'
    assert page.locator('#engine-menu [aria-checked=true]').count() == 0
    # After pointer opening, Tab starts with Google; the scope × does not interrupt.
    page.locator('#engine-button').press('Tab')
    assert page.locator('[data-engine=google]').evaluate('(el)=>document.activeElement===el')
    page.locator('[data-engine=google]').press('Enter')
    expect(page.locator('#engine-name')).to_have_text('Google')
    assert page.evaluate('NewTabScope.site') is None
    assert q.input_value() == 'preserve'
    page.locator('#engine-button').press('Enter')
    assert page.locator('[data-engine=google]').evaluate('(el)=>document.activeElement===el')
    page.locator('[data-engine=google]').press('Tab')
    assert page.locator('[data-engine=bing]').evaluate('(el)=>document.activeElement===el')
    page.locator('[data-engine=bing]').press('Enter')
    expect(page.locator('#engine-name')).to_have_text('Bing')
    assert q.evaluate('(el)=>document.activeElement===el')


def test_single_default_does_not_trap_tab_and_ime_does_not_select_or_submit(app):
    page=app
    q=page.locator('#query')
    q.fill('no matches here')
    expect(page.locator('.suggestion-item')).to_have_count(1)
    q.press('Tab')
    expect(page.locator('.search-submit')).to_be_focused()
    q.fill('hello')
    q.dispatch_event('compositionstart')
    q.fill('中文')
    q.press('Tab')
    assert page.evaluate('NewTabSuggest.chosenDestination()') is None
    q.press('Enter')
    assert page.evaluate('window.__navigations') == []
    q.dispatch_event('compositionend')
    expect(page.locator('.suggestion-item').first).to_contain_text('中文')


def test_cold_input_composition_does_not_open_suggestions_or_submit(app):
    page=app
    assert page.evaluate('typeof window.NewTabSuggest') == 'undefined'
    q=page.locator('#query')
    q.dispatch_event('compositionstart')
    q.fill('中文')
    page.wait_for_function('window.NewTabSuggest !== undefined')
    expect(q).to_have_attribute('aria-expanded','false')
    assert page.locator('#query-completion').is_hidden()
    q.press('Enter')
    assert page.evaluate('window.__navigations') == []
    q.dispatch_event('compositionend')
    expect(page.locator('.suggestion-default')).to_contain_text('中文')


def test_accepting_bookmark_completion_then_cycling_back_updates_default_action(app):
    page=app
    page.evaluate("chrome.bookmarks.search=async()=>[{title:'GitHub Docs',url:'https://github.com/docs'}]")
    q=page.locator('#query')
    q.fill('git')
    page.locator('#query-completion').wait_for(state='visible')
    q.press('ArrowRight')
    assert q.input_value() == 'gitHub Docs'
    assert page.evaluate('NewTabSuggest.chosenDestination().type') == 'bookmark'
    expect(page.locator('.suggestion-default')).to_contain_text('搜索“gitHub Docs”')
    q.press('Shift+Tab')
    assert page.evaluate('NewTabSuggest.chosenDestination()') is None
    q.press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == 'https://www.google.com/search?q=gitHub%20Docs'


@pytest.mark.parametrize('steps',[1,2])
def test_first_tab_waits_for_lazy_controller_without_leaving_input(app,steps):
    page=app
    held=[]
    page.route('**/suggestions.js',lambda route:held.append(route))
    page.evaluate("localStorage.setItem('minimalSearchHistory',JSON.stringify(['git tutorial']))")
    q=page.locator('#query')
    q.fill('git')
    for _ in range(steps):q.press('Tab')
    assert q.evaluate('(el)=>document.activeElement===el')
    release_controller(page,held)
    page.wait_for_function('window.NewTabSuggest !== undefined')
    page.evaluate('async()=>{await NewTabSuggest.ready();}')
    if steps==1:page.wait_for_function('window.NewTabSuggest.chosenDestination()?.text === "git tutorial"')
    else:
        expect(page.locator('.suggestion-default')).to_have_attribute('aria-selected','true')
        assert page.evaluate('NewTabSuggest.chosenDestination()') is None
    assert q.input_value() == 'git'
    q.press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == ('https://www.google.com/search?q=git%20tutorial' if steps==1 else 'https://www.google.com/search?q=git')


@pytest.mark.parametrize('change',['escape','edit','scope_exit','blur','click'])
def test_pending_first_tab_is_cancelled_by_escape_or_edit(app,change):
    page=app
    held=[]
    page.route('**/suggestions.js',lambda route:held.append(route))
    page.evaluate("localStorage.setItem('minimalSearchHistory',JSON.stringify(['git tutorial']))")
    q=page.locator('#query')
    q.fill('@github git' if change=='scope_exit' else 'git')
    q.press('Tab')
    if change=='escape':q.press('Escape')
    elif change=='edit':q.fill('different')
    elif change=='scope_exit':page.locator('#exit-site-search').click()
    elif change=='click':q.click()
    else:
        page.locator('#open-settings').click()
        page.locator('#close-settings').click()
        q.click()
    release_controller(page,held)
    page.wait_for_function('window.NewTabSuggest !== undefined')
    page.evaluate('async()=>{await NewTabSuggest.ready();}')
    assert page.evaluate('NewTabSuggest.chosenDestination()') is None
    if change=='escape':expect(q).to_have_attribute('aria-expanded','false')
    else:expect(page.locator('.suggestion-default')).to_contain_text('different' if change=='edit' else 'git')
    assert q.evaluate('(el)=>document.activeElement===el')


def test_slow_local_provider_does_not_trap_tab(app):
    page=app
    page.evaluate('()=>{chrome.bookmarks.search=()=>new Promise(()=>{});}')
    q=page.locator('#query')
    q.fill('no local match')
    page.wait_for_function('window.NewTabSuggest !== undefined')
    q.press('Tab')
    expect(page.locator('.search-submit')).to_be_focused()
    assert page.evaluate('NewTabSuggest.chosenDestination()') is None


def test_enter_during_lazy_loading_executes_now_and_cancels_pending_tab(app):
    page=app
    held=[]
    page.route('**/suggestions.js',lambda route:held.append(route))
    page.evaluate("localStorage.setItem('minimalSearchHistory',JSON.stringify(['git tutorial']))")
    q=page.locator('#query')
    q.fill('git')
    q.press('Tab')
    q.press('Enter')
    assert page.evaluate('window.__navigations') == ['https://www.google.com/search?q=git']
    release_controller(page,held)
    page.wait_for_function('window.NewTabSuggest !== undefined')
    expect(q).to_have_attribute('aria-expanded','false')
    assert page.evaluate('NewTabSuggest.chosenDestination()') is None
