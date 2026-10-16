import json
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright, expect
from browser_runtime import launch_chromium
from wallpaper_runtime import serve_app

SNAPSHOT = json.loads((Path(__file__).resolve().parents[1] / 'assets/site-search-snapshot.json').read_text(encoding='utf-8'))
HOSTS = ('api.github.com', 'raw.githubusercontent.com', 'cdn.jsdelivr.net')


@pytest.fixture
def app():
    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        context = browser.new_context()
        page = context.new_page()
        _, errors = serve_app(page)
        page.wait_for_function('window.SiteSearch?.loaded && window.SiteSearch.count > 10000')
        yield page
        assert not errors, errors
        browser.close()


def storage(page, key, value=None, write=False):
    return page.evaluate('''([key,value,write])=>new Promise((resolve,reject)=>{
      const r=indexedDB.open('minimal-new-tab-site-search',1);
      r.onsuccess=()=>{const db=r.result,tx=db.transaction('catalog',write?'readwrite':'readonly');
        let result;const store=tx.objectStore('catalog');
        const op=write?store.put(value,key):store.get(key);
        op.onsuccess=()=>result=op.result;tx.oncomplete=()=>{db.close();resolve(result)};
        tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);
    })''', [key,value,write])


def enter(page, text='@github '):
    page.locator('#query').fill(text)
    expect(page.locator('#engine-name')).to_have_text('GitHub')


def update_source(page, raw_status=503, cdn_data=None, date=None, version='a'*40):
    page.evaluate('window.SiteSearch.refresh()')  # Settle an already scheduled daily check.
    date = date or page.evaluate('new Date(Date.now()-60000).toISOString()')
    seen = []
    def route_source(route):
        url=route.request.url
        seen.append({'url':url,'headers':route.request.headers})
        if 'api.github.com' in url:
            route.fulfill(json=[{'sha':version,'commit':{'committer':{'date':date}}}])
        elif 'raw.githubusercontent.com' in url:
            route.fulfill(status=raw_status, body='offline' if raw_status != 200 else '[]')
        elif cdn_data is None:
            route.fulfill(status=503,body='offline')
        else:
            route.fulfill(json=cdn_data)
    for host in HOSTS:
        page.route(f'https://{host}/**',route_source)
    storage(page,'state',{},True)
    seen.clear()
    return seen


def rules():
    return [{'s':f'Site {i}','d':'example.test','t':f'site{i}',
             'u':'https://example.test/search?q={{{s}}}'} for i in range(100)]


def test_offline_snapshot_aliases_chinese_and_punctuation_navigation(app):
    page=app
    assert page.evaluate('SiteSearch.version') == SNAPSHOT['version']
    assert page.evaluate("SiteSearch.lookup('github.com').id") == 'gh'
    enter(page,'@gh 中文 router & #?')
    assert page.locator('#query').input_value() == '中文 router & #?'
    page.locator('#query').press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == 'https://github.com/search?q=%E4%B8%AD%E6%96%87+router+%26+%23%3F'
    assert page.evaluate("JSON.parse(localStorage.getItem('minimalSiteSearchHistory'))[0].site") == 'gh'
    assert page.evaluate("localStorage.getItem('minimalSearchHistory')") is None


def test_at_picker_cycles_both_directions_and_enter_activates_without_navigation(app):
    page=app
    page.locator('#query').fill('@')
    expect(page.locator('.suggestion-item')).to_have_count(6)
    page.locator('#query').press('Tab')
    assert page.evaluate('NewTabSuggest.chosenDestination().site.id') == 'gh'
    page.locator('#query').press('Shift+Tab')
    assert page.evaluate('NewTabSuggest.chosenDestination().site.id') != 'gh'
    page.locator('#query').press('Tab')
    page.locator('#query').press('Enter')
    expect(page.locator('#engine-name')).to_have_text('GitHub')
    assert page.locator('#query').input_value() == ''
    assert page.locator('#query').evaluate('(el)=>document.activeElement===el')
    assert page.evaluate('window.__navigations') == []
    assert page.locator('#exit-site-search').is_visible()


def test_full_name_action_click_and_all_exit_methods_preserve_default_engine(app):
    page=app
    page.locator('#query').fill('github')
    action=page.locator('.suggestion-item').filter(has_text='切换到 GitHub 搜索')
    action.click()
    page.locator('#query').fill('keep this')
    page.locator('#query').press('Escape')
    assert page.evaluate('NewTabScope.site.id') == 'gh'
    page.locator('#query').press('Escape')
    assert page.locator('#query').input_value() == 'keep this'
    expect(page.locator('#engine-name')).to_have_text('Google')
    assert page.locator('#engine-menu').get_attribute('aria-hidden') == 'true'
    enter(page,'@github ')
    page.locator('#query').press('Backspace')
    expect(page.locator('#engine-name')).to_have_text('Google')
    enter(page,'@github retain')
    page.locator('#exit-site-search').click()
    assert page.locator('#query').input_value() == 'retain'
    assert page.evaluate('NewTabScope.site') is None
    assert page.evaluate('window.__saved') == []
    assert page.locator('#engine-menu').get_attribute('aria-hidden') == 'true'


def test_scope_filters_history_bookmarks_and_never_calls_general_suggestions(app):
    page=app
    requests=[]
    page.on('request',lambda request: requests.append(request.url))
    page.evaluate('''()=>{
      localStorage.setItem('onlineSuggestions','on');
      localStorage.setItem('minimalSearchHistory',JSON.stringify(['router global']));
      SiteSearch.remember(SiteSearch.lookup('gh'),'router scoped');
      SiteSearch.remember(SiteSearch.lookup('yt'),'router other site');
      chrome.bookmarks.search=async()=>[
        {title:'router GitHub',url:'https://github.com/router'},
        {title:'router subdomain',url:'https://docs.github.com/router'},
        {title:'router unrelated',url:'https://github.com.evil.test/router'}];
    }''')
    enter(page,'@github router')
    expect(page.locator('.suggestion-item')).to_have_count(4)
    texts=page.locator('.suggestion-item:not(.suggestion-default) .suggestion-title').all_text_contents()
    assert set(texts) == {'router scoped','router GitHub','router subdomain'}
    page.wait_for_timeout(400)
    assert not any('suggestqueries.' in url or '/osjson' in url or '/sugrec' in url for url in requests)
    page.locator('.suggestion-item').filter(has_text='router GitHub').click()
    assert page.evaluate('window.__navigations.at(-1)') == 'https://github.com/router'


def test_unknown_prefix_stays_visible_and_composition_defers_scope_conversion(app):
    page=app
    page.locator('#query').fill('@no-such-site-unique word')
    page.locator('#query').press('Enter')
    expect(page.locator('#site-search-notice')).to_contain_text('没有找到')
    assert page.evaluate('window.__navigations') == []
    page.locator('#query').dispatch_event('compositionstart')
    page.locator('#query').fill('@github 中文')
    page.locator('#query').press('Enter')
    assert page.evaluate('NewTabScope.site') is None
    assert page.evaluate('window.__navigations') == []
    page.locator('#query').dispatch_event('compositionend')
    expect(page.locator('#engine-name')).to_have_text('GitHub')


def test_cache_first_survives_packaged_snapshot_unavailable_and_repairs_bad_cache(app):
    page=app
    page.route('**/assets/site-search-snapshot.json',lambda route:route.abort())
    page.reload()
    page.wait_for_function('SiteSearch.loaded')
    assert page.evaluate('SiteSearch.count') > 10000
    broken={**SNAPSHOT,'rules':[]}
    storage(page,'active',broken,True)
    page.unroute('**/assets/site-search-snapshot.json')
    page.reload()
    page.wait_for_function('SiteSearch.loaded')
    assert page.evaluate('SiteSearch.count') > 10000
    assert len(storage(page,'active')['rules']) == len(SNAPSHOT['rules'])


def test_update_falls_back_to_same_revision_cdn_then_daily_throttles(app):
    page=app
    seen=update_source(page,cdn_data=rules())
    assert page.evaluate('SiteSearch.refresh()') is True
    assert page.evaluate('SiteSearch.version') == 'a'*40
    assert page.evaluate('SiteSearch.count') == 100
    assert len(seen) == 3
    assert f"/{'a'*40}/data/bangs.json" in seen[1]['url']
    assert f"@{'a'*40}/data/bangs.json" in seen[2]['url']
    assert all('cookie' not in row['headers'] and 'referer' not in row['headers'] for row in seen)
    assert storage(page,'active')['version'] == 'a'*40
    assert page.evaluate('SiteSearch.refresh()') is False
    assert len(seen) == 3


@pytest.mark.parametrize('payload', [[], {'rules':[]}, [{'s':'broken'}]*100])
def test_broken_remote_data_keeps_old_cache_and_backoff(app,payload):
    page=app
    seen=update_source(page,cdn_data=payload,raw_status=200)
    assert page.evaluate('SiteSearch.refresh()') is False
    assert page.evaluate('SiteSearch.version') == SNAPSHOT['version']
    assert storage(page,'active')['version'] == SNAPSHOT['version']
    count=len(seen)
    assert page.evaluate('SiteSearch.refresh()') is False
    assert len(seen) == count
    enter(page,'@github still works')


def test_older_revision_ignored_and_concurrent_updates_deduplicated(app):
    page=app
    seen=update_source(page,cdn_data=rules(),date='2020-01-01T00:00:00Z')
    assert page.evaluate('SiteSearch.refresh()') is False
    assert len(seen) == 1
    assert page.evaluate('SiteSearch.version') == SNAPSHOT['version']
    seen=update_source(page,cdn_data=rules())
    second=page.context.new_page()
    _, errors=serve_app(second)
    second.wait_for_function('SiteSearch.loaded')
    # Both pages share real IndexedDB. Only one claims the refresh lease.
    held=[]
    page.route('https://api.github.com/**',lambda route:held.append(route))
    page.evaluate("window.__update=SiteSearch.refresh(); 'started'")
    page.wait_for_timeout(80)
    assert held
    assert second.evaluate('SiteSearch.refresh()') is False
    assert page.evaluate('SiteSearch.version') == SNAPSHOT['version']
    held[0].fulfill(json=[{'sha':'a'*40,'commit':{'committer':{
        'date':page.evaluate('new Date(Date.now()-60000).toISOString()')}}}])
    assert page.evaluate('window.__update') is True
    assert len(seen) == 2  # The held metadata request bypasses the recording route.
    assert not errors
    second.reload()
    second.wait_for_function('SiteSearch.loaded')
    assert second.evaluate('SiteSearch.version') == 'a'*40
    second.close()


def test_metadata_outage_and_download_timeout_retain_usable_rules(app):
    page=app
    storage(page,'state',{},True)
    assert page.evaluate('SiteSearch.refresh()') is False
    assert page.evaluate("SiteSearch.lookup('github').id") == 'gh'
    seen=update_source(page,cdn_data=rules())
    stalled=[]
    page.route('https://raw.githubusercontent.com/**',lambda route:stalled.append(route))
    assert page.evaluate('SiteSearch.refresh()') is True
    assert stalled
    assert page.evaluate('SiteSearch.version') == 'a'*40
    assert len(seen) == 2


def test_local_loading_does_not_block_plain_search_and_stale_prefix_does_not_steal_input(app):
    page=app
    storage(page,'active',None,True)
    held=[]
    page.route('**/assets/site-search-snapshot.json',lambda route:held.append(route))
    page.reload(wait_until='domcontentloaded')
    page.locator('#query').fill('@github ')
    page.locator('#query').fill('ordinary query')
    page.locator('#query').press('Enter')
    assert page.evaluate('window.__navigations.at(-1)') == 'https://www.google.com/search?q=ordinary%20query'
    assert page.evaluate('SiteSearch.loaded') is False
    assert held
    held[0].fulfill(json=SNAPSHOT)
    page.wait_for_function('SiteSearch.loaded')
    assert page.locator('#query').input_value() == 'ordinary query'
    assert page.evaluate('NewTabScope.site') is None


@pytest.mark.parametrize('width,theme,locale', [(1280,'light','zh'),(390,'dark','zh'),(390,'light','en')])
def test_scope_keyboard_help_and_control_bounds(app,width,theme,locale):
    page=app
    page.set_viewport_size({'width':width,'height':740})
    page.emulate_media(reduced_motion='reduce')
    page.evaluate('''([theme,locale])=>{
      document.documentElement.dataset.theme=theme;settings.locale=locale;applyLocale();
      SiteSearch.remember(SiteSearch.lookup('gh'),'router tutorial');
    }''',[theme,locale])
    enter(page,'@github rou')
    page.locator('#suggestion-keyboard-help').wait_for(state='visible')
    assert page.locator('#site-search-key-hint').is_hidden()
    expect(page.locator('#dismiss-key-hint')).to_be_visible()
    bounds=page.evaluate('''()=>{
      const r=selector=>{const a=document.querySelector(selector).getBoundingClientRect();return {left:a.left,right:a.right,width:a.width,height:a.height}};
      return {input:r('#query'),engine:r('#engine-button'),exit:r('#exit-site-search'),help:r('#suggestion-keyboard-help'),
        last:r('#dismiss-key-hint'),animations:document.querySelector('#engine-control').getAnimations().length};
    }''')
    assert bounds['input']['width'] >= 110
    assert bounds['engine']['width'] <= 110
    assert bounds['engine']['height'] <= 34
    assert bounds['engine']['right'] <= bounds['input']['left']
    assert bounds['exit']['right'] <= bounds['engine']['right']
    assert bounds['last']['right'] <= bounds['help']['right']+1
    assert bounds['animations'] == 0
