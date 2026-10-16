from datetime import datetime, timezone
import pytest
from playwright.sync_api import sync_playwright
from browser_runtime import launch_chromium
from wallpaper_runtime import serve_app, open_manager, choose_mode


@pytest.fixture
def app():
    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        context = browser.new_context(timezone_id='Asia/Shanghai', color_scheme='light')
        page = context.new_page()
        page.clock.install(time=datetime(2026, 10, 16, 4, 0, tzinfo=timezone.utc))
        state, errors = serve_app(page)
        open_manager(page)
        yield page, state
        assert not errors, errors
        browser.close()


def ready(page):
    page.wait_for_function("document.querySelector('#bing-status').textContent.includes('已更新')")


def test_bing_caches_metadata_and_attribution_without_repeat_requests(app):
    page, state = app
    choose_mode(page, 'bing')
    ready(page)
    assert state['metadata'] == state['images'] == 1
    assert '© Photographer' in page.locator('#credit').inner_text()
    page.evaluate("window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_timeout(100)
    assert state['metadata'] == 1
    page.reload()
    page.wait_for_function("document.querySelector('#wallpaper').classList.contains('ready')")
    assert state['metadata'] == 1


def test_bing_card_uses_actual_cached_image_and_survives_switch_to_solid(app):
    page,state=app
    assert page.locator('#bing-preview').is_hidden()
    assert 'coast.webp' not in page.locator('.mode-bing .background-preview').evaluate('(el)=>getComputedStyle(el).backgroundImage')
    choose_mode(page,'bing')
    ready(page)
    page.wait_for_function("document.querySelector('#bing-preview').complete && document.querySelector('#bing-preview').naturalWidth===1")
    source=page.locator('#bing-preview').get_attribute('src')
    assert source.startswith('blob:')
    assert page.locator('#bing-preview').is_visible()
    choose_mode(page,'white')
    assert page.locator('#wallpaper').get_attribute('src') is None
    assert page.locator('#bing-preview').evaluate('(el)=>el.complete && el.naturalWidth===1')
    page.reload()
    open_manager(page)
    page.wait_for_function("!document.querySelector('#bing-preview').hidden && document.querySelector('#bing-preview').naturalWidth===1")
    assert state['metadata'] == 1
    assert page.locator('html').get_attribute('data-mode') == 'white'


def test_bing_card_refreshes_on_new_day_and_retains_image_on_failure(app):
    page,state=app
    choose_mode(page,'bing')
    ready(page)
    source=page.locator('#bing-preview').get_attribute('src')
    state['fail']=True
    page.clock.set_fixed_time(datetime(2026,10,17,4,0,tzinfo=timezone.utc))
    page.evaluate("window.dispatchEvent(new Event('online'))")
    page.wait_for_function("document.querySelector('#bing-status').textContent.includes('正在使用缓存')")
    assert page.locator('#bing-preview').get_attribute('src') == source
    state['fail']=False
    page.locator('#retry-bing').click()
    ready(page)
    assert page.locator('#bing-preview').get_attribute('src') != source
    assert page.locator('#bing-preview').evaluate('(el)=>el.complete && el.naturalWidth===1')


def test_second_tab_can_display_cache_completed_by_first_tab(app):
    page, state = app
    state['hold'] = True
    choose_mode(page, 'bing')
    page.wait_for_function("document.querySelector('#retry-bing').disabled")
    other = page.context.new_page()
    other_state, other_errors = serve_app(other)
    assert other.locator('html').get_attribute('data-mode') == 'bing'
    assert other_state['metadata'] == 0
    state['held'][0].fulfill(json={'images':[{'url':'/test-wallpaper.png','copyright':'First tab cache'}]})
    ready(page)
    other.evaluate("window.dispatchEvent(new Event('focus'))")
    other.wait_for_function("document.querySelector('#wallpaper').classList.contains('ready')")
    assert other.locator('#credit').inner_text() == 'First tab cache'
    assert other_state['metadata'] == 0
    assert not other_errors, other_errors
    other.close()


def test_offline_keeps_old_image_and_online_retry_deduplicates(app):
    page, state = app
    choose_mode(page, 'bing')
    ready(page)
    previous = page.locator('#wallpaper').get_attribute('src')
    state['fail'] = True
    page.clock.set_fixed_time(datetime(2026, 10, 17, 4, 0, tzinfo=timezone.utc))
    page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_function("document.querySelector('#bing-status').textContent.includes('正在使用缓存')")
    assert page.locator('#wallpaper').get_attribute('src') == previous
    assert state['metadata'] == 2
    state['fail'] = False
    page.evaluate("for(let i=0;i<5;i++)window.dispatchEvent(new Event('online'))")
    ready(page)
    assert state['metadata'] == 3
    page.wait_for_timeout(550)
    assert page.locator('#wallpaper-previous').get_attribute('src') is None


def test_corrupt_download_keeps_good_cache_and_retry_button_recovers(app):
    page, state = app
    choose_mode(page, 'bing')
    ready(page)
    state['corrupt'] = True
    page.clock.set_fixed_time(datetime(2026, 10, 17, 4, 0, tzinfo=timezone.utc))
    page.evaluate("window.dispatchEvent(new Event('online'))")
    page.wait_for_function("document.querySelector('#bing-status').textContent.includes('正在使用缓存')")
    assert page.evaluate("async()=> (await dbGet('bing')).day") == '2026-10-16'
    state['corrupt'] = False
    page.locator('#retry-bing').click()
    ready(page)
    assert page.evaluate("async()=> (await dbGet('bing')).day") == '2026-10-17'


def test_delayed_bing_cannot_replace_newer_solid_background(app):
    page, state = app
    state['hold'] = True
    choose_mode(page, 'bing')
    page.wait_for_function("document.querySelector('#bing-status').textContent.includes('正在更新')")
    choose_mode(page, 'white')
    state['held'][0].fulfill(json={'images':[{'url':'/test-wallpaper.png','copyright':'Delayed'}]})
    page.wait_for_timeout(180)
    assert page.locator('html').get_attribute('data-mode') == 'white'
    assert page.locator('#wallpaper').get_attribute('src') is None
    assert page.locator('#credit').is_hidden()


def test_day_boundary_retries_even_if_yesterday_failed_recently(app):
    page, state = app
    state['fail'] = True
    page.clock.set_fixed_time(datetime(2026, 10, 16, 15, 59, tzinfo=timezone.utc))
    choose_mode(page, 'bing')
    page.wait_for_function("document.querySelector('#retry-bing').disabled === false && document.querySelector('#bing-status').textContent.includes('联网后')")
    assert state['metadata'] == 1
    state['fail'] = False
    page.clock.set_fixed_time(datetime(2026, 10, 16, 16, 1, tzinfo=timezone.utc))
    page.evaluate("window.dispatchEvent(new Event('focus'))")
    ready(page)
    assert page.evaluate("async()=> (await dbGet('bing')).day") == '2026-10-17'
    assert state['metadata'] == 2


def test_visible_tab_crosses_midnight_and_reduced_motion_skips_crossfade():
    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        page = browser.new_page(timezone_id='Asia/Shanghai', reduced_motion='reduce')
        page.clock.install(time=datetime(2026, 10, 16, 15, 59, 59, tzinfo=timezone.utc))
        state, errors = serve_app(page)
        open_manager(page)
        choose_mode(page, 'bing')
        ready(page)
        page.clock.fast_forward(2000)
        page.wait_for_function("async()=> (await dbGet('bing')).day === '2026-10-17'")
        assert state['metadata'] == 2
        assert page.locator('#wallpaper-previous').get_attribute('src') is None
        assert page.locator('#wallpaper').evaluate('(el)=>parseFloat(getComputedStyle(el).transitionDuration) < .001')
        assert not errors, errors
        browser.close()


def test_timezone_change_rechecks_local_calendar_day():
    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        # One CDP session owns both timezone overrides; a separate session cannot
        # replace an override already owned by Playwright's browser context.
        page = browser.new_page()
        session = page.context.new_cdp_session(page)
        session.send('Emulation.setTimezoneOverride', {'timezoneId':'Asia/Shanghai'})
        page.clock.install(time=datetime(2026, 10, 16, 4, 0, tzinfo=timezone.utc))
        state, errors = serve_app(page)
        open_manager(page)
        choose_mode(page, 'bing')
        ready(page)
        assert page.evaluate('today()') == '2026-10-16'
        session.send('Emulation.setTimezoneOverride', {'timezoneId':'America/Los_Angeles'})
        assert page.evaluate('today()') == '2026-10-15'
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        page.wait_for_function("async()=> (await dbGet('bing')).day === '2026-10-15'")
        assert state['metadata'] == 2
        assert not errors, errors
        browser.close()


def test_request_started_yesterday_does_not_mark_today_as_cached(app):
    page, state = app
    page.clock.set_fixed_time(datetime(2026, 10, 16, 15, 59, 59, tzinfo=timezone.utc))
    state['hold'] = True
    choose_mode(page, 'bing')
    page.wait_for_function("document.querySelector('#retry-bing').disabled")
    page.clock.set_fixed_time(datetime(2026, 10, 16, 16, 0, 1, tzinfo=timezone.utc))
    state['held'][0].fulfill(json={'images':[{'url':'/test-wallpaper.png','copyright':'Yesterday'}]})
    ready(page)
    assert page.evaluate("async()=> (await dbGet('bing')).day") == '2026-10-16'
    state['hold'] = False
    page.evaluate("window.dispatchEvent(new Event('focus'))")
    page.wait_for_function("async()=> (await dbGet('bing')).day === '2026-10-17'")
    assert state['metadata'] == 2
