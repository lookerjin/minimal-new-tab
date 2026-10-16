import pytest
from playwright.sync_api import sync_playwright
from browser_runtime import launch_chromium
from wallpaper_runtime import serve_app


@pytest.fixture
def app():
    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        page = browser.new_page()
        _, errors = serve_app(page)
        page.evaluate("localStorage.setItem('minimalSearchHistory', JSON.stringify(['git tutorial','git workflow']))")
        yield page
        assert not errors, errors
        browser.close()


def show_completion(page):
    page.locator('#query').fill('git')
    page.locator('#query-completion').wait_for(state='visible')


def test_completion_accepts_explicitly_and_only_submission_records_history(app):
    page = app
    show_completion(page)
    assert page.locator('#query').input_value() == 'git'
    assert page.locator('.completion-suffix').inner_text() == ' tutorial'
    assert page.evaluate("JSON.parse(localStorage.getItem('minimalSearchHistory')).length") == 2
    page.locator('#query').press('ArrowRight')
    assert page.locator('#query').input_value() == 'git tutorial'
    assert page.locator('#query').evaluate('(el)=>document.activeElement===el')
    assert page.evaluate('window.__navigations.length') == 0
    page.locator('#query').press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == 'https://www.google.com/search?q=git%20tutorial'
    assert page.evaluate("JSON.parse(localStorage.getItem('minimalSearchHistory'))[0]") == 'git tutorial'


def test_enter_without_accepting_searches_original_input_and_escape_cancels(app):
    page = app
    show_completion(page)
    page.locator('#query').press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == 'https://www.google.com/search?q=git'
    page.locator('#query').fill('git t')
    page.locator('#query-completion').wait_for(state='visible')
    page.locator('#query').press('Escape')
    assert page.locator('#query-completion').is_hidden()
    assert page.locator('#query').input_value() == 'git t'


def test_delete_cursor_selection_and_composition_suppress_completion(app):
    page = app
    show_completion(page)
    page.locator('#query').press('Backspace')
    page.wait_for_timeout(180)
    assert page.locator('#query-completion').is_hidden()
    show_completion(page)
    page.locator('#query').press('ArrowLeft')
    assert page.locator('#query-completion').is_hidden()
    page.locator('#query').press('ArrowRight')
    page.locator('#query-completion').wait_for(state='visible')
    page.locator('#query').press('ControlOrMeta+A')
    assert page.locator('#query-completion').is_hidden()
    page.locator('#query').dispatch_event('compositionstart')
    page.locator('#query').fill('git')
    assert page.locator('#query-completion').is_hidden()
    page.locator('#query').press('Enter')
    assert page.evaluate('window.__navigations.length') == 0
    page.locator('#query').dispatch_event('compositionend')
    page.locator('#query-completion').wait_for(state='visible')


def test_first_bookmark_completes_title_and_acceptance_keeps_its_url(app):
    page = app
    page.evaluate('''() => {
      localStorage.setItem('minimalSearchHistory','[]');
      chrome.bookmarks.search = async () => [{title:'GitHub Documentation',url:'https://github.com/'}];
    }''')
    page.locator('#query').fill('git')
    page.locator('.suggestion-item').first.wait_for(state='visible')
    page.locator('#query-completion').wait_for(state='visible')
    assert page.locator('.completion-suffix').inner_text() == 'Hub Documentation'
    assert page.locator('#query').input_value() == 'git'
    page.locator('#query').press('ArrowRight')
    assert page.locator('#query').input_value() == 'gitHub Documentation'
    assert page.evaluate('window.__navigations.length') == 0
    assert page.evaluate('window.NewTabSuggest.chosenDestination().url') == 'https://github.com/'
    page.locator('#query').press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == 'https://github.com/'


def test_unaccepted_bookmark_keeps_raw_search_and_explicit_url_behavior(app):
    page=app
    page.evaluate('''() => {
      localStorage.setItem('minimalSearchHistory','[]');
      chrome.bookmarks.search = async () => [{title:'GitHub Documentation',url:'https://github.com/'}];
    }''')
    page.locator('#query').fill('git')
    page.locator('#query-completion').wait_for(state='visible')
    page.locator('#query').press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == 'https://www.google.com/search?q=git'
    page.locator('#query').fill('github.com')
    page.wait_for_timeout(180)
    assert page.locator('#query-completion').is_hidden()
    page.locator('#query').press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == 'https://github.com/'


def test_bookmark_url_prefix_completes_when_title_does_not_match_and_edit_clears_choice(app):
    page=app
    page.evaluate('''() => {
      localStorage.setItem('minimalSearchHistory','[]');
      chrome.bookmarks.search = async () => [{title:'代码托管',url:'https://www.github.com/docs'}];
    }''')
    page.locator('#query').fill('git')
    page.locator('#query-completion').wait_for(state='visible')
    assert page.locator('.completion-suffix').inner_text() == 'hub.com/docs'
    page.locator('#query').press('ArrowRight')
    assert page.locator('#query').input_value() == 'github.com/docs'
    assert page.evaluate('window.NewTabSuggest.chosenDestination().url') == 'https://www.github.com/docs'
    page.locator('#query').fill('different search')
    assert page.evaluate('window.NewTabSuggest.chosenDestination()') is None
    page.locator('#query').press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == 'https://www.google.com/search?q=different%20search'


def test_preview_is_stable_when_late_candidates_arrive_and_old_queries_finish(app):
    page = app
    page.evaluate('''() => {
      chrome.bookmarks.search = async () => {
        await new Promise(resolve => setTimeout(resolve, 220));
        return [{title:'git bookmark',url:'https://example.com/git'}];
      };
    }''')
    show_completion(page)
    suffix = page.locator('.completion-suffix').inner_text()
    page.wait_for_timeout(400)
    assert page.locator('.completion-suffix').inner_text() == suffix
    page.locator('#query').fill('unrelated')
    page.wait_for_timeout(400)
    assert page.locator('#query-completion').is_hidden()


def test_arrow_navigation_keeps_candidate_behavior(app):
    page = app
    show_completion(page)
    page.locator('#query').press('ArrowDown')
    assert page.locator('#query-completion').is_hidden()
    assert page.evaluate('window.NewTabSuggest.chosenDestination().text') == 'git tutorial'
    page.locator('#query').press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == 'https://www.google.com/search?q=git%20tutorial'


@pytest.mark.parametrize('key,direction',[('Tab',1),('Shift+Tab',-1)])
def test_tab_cycles_all_suggestions_wraps_and_enter_confirms(app,key,direction):
    page=app
    show_completion(page)
    options=page.locator('.suggestion-item')
    count=options.count()
    assert count>=2
    selected=0
    for _ in range(count+2):
        page.locator('#query').press(key)
        selected=(selected+1)%count if direction==1 else (count-1 if selected<=0 else selected-1)
        assert options.nth(selected).get_attribute('aria-selected') == 'true'
        assert page.locator('#query').get_attribute('aria-activedescendant') == f'search-suggestion-{selected}'
        assert page.locator('#query').evaluate('(el)=>document.activeElement===el')
        assert page.locator('#query').input_value() == 'git'
        assert page.evaluate('window.__navigations.length') == 0
    chosen=page.evaluate('window.NewTabSuggest.chosenDestination().text')
    page.locator('#query').press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == 'https://www.google.com/search?q='+chosen.replace(' ','%20')


def test_tab_does_not_trap_focus_when_no_suggestions_or_after_escape(app):
    page=app
    page.locator('#query').fill('unmatched')
    page.wait_for_function('window.NewTabSuggest?.diagnostics().completedQueries>=1')
    page.locator('#query').press('Tab')
    assert not page.locator('#query').evaluate('(el)=>document.activeElement===el')
    show_completion(page)
    page.locator('#query').press('Tab')
    assert page.evaluate('window.NewTabSuggest.chosenDestination()') is not None
    page.locator('#query').press('Escape')
    assert page.evaluate('window.NewTabSuggest.chosenDestination()') is None
    page.locator('#query').press('Tab')
    assert not page.locator('#query').evaluate('(el)=>document.activeElement===el')


def test_modified_tab_and_ime_are_not_intercepted_and_edit_resets_selection(app):
    page=app
    show_completion(page)
    result=page.locator('#query').evaluate('''el=>['ctrlKey','altKey','metaKey','isComposing'].map(flag=>{
      const event=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true,[flag]:true});
      el.dispatchEvent(event);return event.defaultPrevented;
    })''')
    assert result == [False]*4
    assert page.evaluate('window.NewTabSuggest.chosenDestination()') is None
    page.locator('#query').press('Tab')
    assert page.evaluate('window.NewTabSuggest.chosenDestination()') is not None
    page.locator('#query').fill('git w')
    page.locator('#query-completion').wait_for(state='visible')
    assert page.evaluate('window.NewTabSuggest.chosenDestination()') is None
    page.locator('#query').press('Tab')
    assert page.evaluate('window.NewTabSuggest.chosenDestination().text') == 'git workflow'


@pytest.mark.parametrize('width',[400,1100])
def test_keyboard_hint_is_visible_localized_and_does_not_overlap_last_result(app,width):
    page=app
    page.set_viewport_size({'width':width,'height':800})
    show_completion(page)
    hint=page.locator('#suggestion-keyboard-help')
    hint.wait_for(state='visible')
    assert 'Tab' in hint.inner_text() and '切换建议' in hint.inner_text()
    assert page.locator('#completion-key-hint').is_visible()
    page.wait_for_function('''()=>{
      const hint=document.querySelector('#suggestion-keyboard-help').getBoundingClientRect();
      const rows=document.querySelectorAll('.suggestion-item');
      return hint.top>=rows[rows.length-1].getBoundingClientRect().bottom;
    }''')
    assert hint.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
    page.locator('#query').press('Tab')
    assert hint.is_visible()
    assert page.locator('#completion-key-hint').is_hidden()
    page.locator('#query').press('Escape')
    assert hint.is_hidden()
    page.evaluate("async()=>await saveSettings({locale:'en'})")
    show_completion(page)
    assert 'Cycle' in hint.inner_text()


def test_keyboard_navigation_scrolls_last_result_above_hint_in_short_viewport(app):
    page=app
    page.set_viewport_size({'width':400,'height':420})
    page.evaluate('''()=>{
      localStorage.setItem('minimalSearchHistory',JSON.stringify(['git result 0','git result 1']));
      chrome.bookmarks.search=async()=>Array.from({length:3},(_,i)=>({title:'git bookmark '+i,url:'https://example.com/'+i}));
    }''')
    show_completion(page)
    page.wait_for_function("document.querySelectorAll('.suggestion-item').length===6")
    page.locator('#query').press('Shift+Tab')
    page.wait_for_function('''()=>{
      const last=document.querySelector('.suggestion-item:last-child').getBoundingClientRect();
      const hint=document.querySelector('#suggestion-keyboard-help').getBoundingClientRect();
      return last.bottom<=hint.top+1;
    }''')
    assert page.locator('#search-suggestions').evaluate('(el)=>el.scrollTop>0')
    assert page.locator('.suggestion-item').last.get_attribute('aria-selected') == 'true'
