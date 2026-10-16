"""Background catalog, visible motion, native styling, and independent close lifecycle."""
import pytest
from playwright.sync_api import sync_playwright
from browser_runtime import launch_chromium
from wallpaper_runtime import serve_app, open_manager, upload


@pytest.fixture
def app():
    with sync_playwright() as pw:
        browser=launch_chromium(pw)
        page=browser.new_page(viewport={'width':1100,'height':800})
        _,errors=serve_app(page)
        yield page
        assert not errors, errors
        browser.close()


def test_single_background_grid_has_four_ready_offline_builtin_images(app):
    page=app
    open_manager(page)
    assert page.locator('#wallpaper-title').inner_text() == '背景'
    assert page.locator('#background-options > .wallpaper-option').count() == 8
    assert page.locator('input[name=mode]').count() == 4
    assert page.locator('#library-title,.library-heading,.library-help').count() == 0
    page.wait_for_function("[...document.querySelectorAll('.builtin-wallpaper img')].every(img=>img.complete && img.naturalWidth>1000)")
    assert page.locator('#background-count').inner_text() == '8 个背景'
    assert page.locator('#image-file').get_attribute('multiple') is not None


@pytest.mark.parametrize('name',['alpine','aurora','dunes','coast'])
def test_builtins_apply_reload_and_work_without_external_network(app,name):
    page=app
    open_manager(page)
    page.locator(f'[data-builtin={name}]').click()
    page.wait_for_function('(name)=>document.querySelector(`[data-builtin="${name}"]`).classList.contains("is-current")',arg=name)
    page.wait_for_function("document.querySelector('#wallpaper').classList.contains('ready')")
    assert page.evaluate("JSON.parse(localStorage.getItem('__prefs')).wallpaperId") == 'builtin:'+name
    page.reload()
    page.wait_for_function("document.querySelector('#wallpaper').classList.contains('ready')")
    open_manager(page)
    assert page.locator(f'[data-builtin={name}]').get_attribute('aria-pressed') == 'true'
    assert page.locator('#wallpaper').evaluate('(img)=>img.naturalWidth') > 1000


@pytest.mark.parametrize('action',['button','escape','backdrop'])
def test_closing_background_settings_does_not_reopen_settings_menu(app,action):
    page=app
    open_manager(page)
    if action=='button': page.locator('#close-wallpapers').click()
    elif action=='escape': page.keyboard.press('Escape')
    else: page.mouse.click(5,5)
    page.locator('#wallpaper-manager').wait_for(state='hidden')
    assert page.locator('#settings').get_attribute('aria-hidden') == 'true'
    assert page.locator('#open-settings').get_attribute('aria-expanded') == 'false'
    assert page.locator('#open-settings').evaluate('(el)=>document.activeElement===el')
    open_manager(page)
    assert page.locator('#wallpaper-title').inner_text() == '背景'


def test_cancelling_file_picker_keeps_background_dialog_and_selection(app):
    page=app
    open_manager(page)
    page.locator('[data-builtin=alpine]').click()
    page.wait_for_function("document.querySelector('[data-builtin=alpine]').getAttribute('aria-pressed') === 'true'")
    with page.expect_file_chooser() as chooser:
        page.locator('#choose-image').click()
    assert chooser.value.is_multiple()
    chooser.value.set_files([])
    # Chromium's native picker dispatches this bubbling event when cancelled.
    page.locator('#image-file').dispatch_event('cancel',{'bubbles':True})
    page.wait_for_timeout(250)
    assert page.locator('#wallpaper-manager').is_visible()
    assert page.locator('[data-builtin=alpine]').get_attribute('aria-pressed') == 'true'
    assert page.locator('#settings').get_attribute('aria-hidden') == 'true'
    assert page.locator('.wallpaper-card').count() == 0
    upload(page,('after-cancel.png',))
    assert page.locator('.wallpaper-card').count() == 1


def test_open_close_motion_interpolates_and_preserves_dialog_until_exit_finishes(app):
    page=app
    page.locator('#open-settings').click()
    # Sample immediately in the click task so CPU load cannot skip the entry animation.
    opening=page.evaluate('''() => {
      document.querySelector('#open-wallpapers').click();
      const el=document.querySelector('#wallpaper-manager');
      el.getAnimations().find(a=>a.effect.getTiming().duration===320).pause();
      return {open:el.open,opacity:Number(getComputedStyle(el).opacity),
        motion:el.getAnimations().map(a=>({duration:a.effect.getTiming().duration,frames:a.effect.getKeyframes()}))};
    }''')
    assert opening['open'] and opening['opacity'] < 1
    assert any(m['duration']==320 and m['frames'][0]['transform'] != m['frames'][-1]['transform'] for m in opening['motion'])
    # Sample the real browser animation at controlled times, independently of host frame rate.
    frames=page.evaluate('''()=>{
      const el=document.querySelector('#wallpaper-manager');
      const motion=el.getAnimations().find(a=>a.effect.getTiming().duration===320);
      motion.pause();
      const samples=[80,240].map(time=>{
        motion.currentTime=time;
        return Number(getComputedStyle(el).opacity);
      });
      motion.play();return samples;
    }''')
    assert 0<frames[0]<frames[1]<1
    page.evaluate("async()=>await Promise.all(document.querySelector('#wallpaper-manager').getAnimations().map(a=>a.finished))")
    closing=page.evaluate('''() => {
      document.querySelector('#close-wallpapers').click();
      const el=document.querySelector('#wallpaper-manager');
      return {open:el.open,closing:el.classList.contains('is-closing'),durations:el.getAnimations().map(a=>a.effect.getTiming().duration)};
    }''')
    assert closing['open'] and closing['closing'] and 200 in closing['durations']
    page.locator('#wallpaper-manager').wait_for(state='hidden')
    assert page.locator('#settings').get_attribute('aria-hidden') == 'true'


def test_manage_only_targets_uploaded_cards_and_keeps_native_selection_and_hover(app):
    page=app
    open_manager(page)
    upload(page,('one.png','two.png'))
    assert page.locator('#background-count').inner_text() == '10 个背景'
    before=page.locator('.wallpaper-card').first.bounding_box()
    page.locator('.wallpaper-card').first.hover()
    page.wait_for_function("getComputedStyle(document.querySelector('.wallpaper-card')).transform !== 'none'")
    page.wait_for_timeout(250)
    after=page.locator('.wallpaper-card').first.bounding_box()
    assert after['y'] < before['y']
    page.locator('#manage-wallpapers').click()
    assert page.locator('[data-builtin]:disabled').count() == 4
    assert page.locator('input[name=mode]:disabled').count() == 4
    page.locator('#select-all-wallpapers').click()
    assert page.locator('.wallpaper-card.is-selected').count() == 2
    assert page.locator('.builtin-wallpaper.is-selected').count() == 0
    page.locator('#manage-wallpapers').click()
    assert page.locator('[data-builtin]:disabled').count() == 0


def test_reduced_motion_skips_open_close_and_card_animation():
    with sync_playwright() as pw:
        browser=launch_chromium(pw)
        page=browser.new_page(reduced_motion='reduce')
        _,errors=serve_app(page)
        open_manager(page)
        assert page.locator('#wallpaper-manager').evaluate('(el)=>el.getAnimations().length') == 0
        assert page.locator('.builtin-wallpaper').first.evaluate('(el)=>parseFloat(getComputedStyle(el).transitionDuration) < .001')
        page.locator('#close-wallpapers').click()
        assert page.locator('#wallpaper-manager').is_hidden()
        assert page.locator('#settings').get_attribute('aria-hidden') == 'true'
        assert not errors,errors
        browser.close()


def test_narrow_grid_scrolls_without_squeezing_or_overlapping_rows(app):
    page=app
    page.set_viewport_size({'width':400,'height':600})
    open_manager(page)
    layout=page.evaluate('''()=>{
      const grid=document.querySelector('#background-options'),dialog=document.querySelector('#wallpaper-manager');
      const boxes=[...grid.querySelectorAll(':scope > .wallpaper-option')].map(el=>el.getBoundingClientRect());
      return {gaps:boxes.slice(2).map((r,i)=>r.top-boxes[i].bottom),scrolls:grid.scrollHeight>grid.clientHeight,
        horizontalOverflow:dialog.scrollWidth>dialog.clientWidth, footerBottom:document.querySelector('.background-footer').getBoundingClientRect().bottom};
    }''')
    assert all(gap>=9 for gap in layout['gaps']),layout
    assert layout['scrolls'] and not layout['horizontalOverflow']
    assert layout['footerBottom']<600


def test_grid_caps_at_three_rows_and_all_cards_scroll_together(app):
    page=app
    page.set_viewport_size({'width':1100,'height':1100})
    open_manager(page)
    upload(page,('old-1.png','old-2.png','old-3.png','old-4.png'))
    page.evaluate("async()=>await Promise.all(document.querySelector('#wallpaper-manager').getAnimations({subtree:true}).map(a=>a.finished))")
    page.wait_for_function('''()=>{
      const grid=document.querySelector('#background-options');
      return Math.abs(grid.clientHeight-grid.scrollHeight)<=1;
    }''')
    # Four modes + four uploads + four builtins exactly fill three rows.
    height=page.locator('#background-options').evaluate('(el)=>el.clientHeight')
    upload(page,('latest.png',))
    page.evaluate("async()=>await Promise.all(document.querySelector('#wallpaper-manager').getAnimations({subtree:true}).map(a=>a.finished))")
    assert page.locator('.wallpaper-card').first.get_attribute('title') == 'latest.png'
    layout=page.evaluate('''()=>{
      const grid=document.querySelector('#background-options');
      const mode=grid.querySelector('.wallpaper-mode').getBoundingClientRect();
      const newest=grid.querySelector('.wallpaper-card').getBoundingClientRect();
      return {height:grid.clientHeight,scrolls:grid.scrollHeight>grid.clientHeight,
        modeTop:mode.top,newTop:newest.top,newLeft:newest.left,modeLeft:mode.left,cardHeight:mode.height};
    }''')
    assert abs(layout['height']-height)<=1
    assert layout['scrolls']
    assert abs(layout['newLeft']-layout['modeLeft'])<1
    assert abs(layout['newTop']-layout['modeTop']-layout['cardHeight']-12)<1
    page.locator('#background-options').hover()
    page.mouse.wheel(0,180)
    page.wait_for_function("document.querySelector('#background-options').scrollTop>50")
    assert page.locator('.wallpaper-mode').first.bounding_box()['y']<layout['modeTop']-50
    upload(page,('new-batch-first.png','new-batch-second.png'))
    assert page.locator('.wallpaper-card').first.get_attribute('title') == 'new-batch-first.png'
    assert page.locator('.wallpaper-card').nth(1).get_attribute('title') == 'new-batch-second.png'
    assert page.locator('#background-options').evaluate('(el)=>el.scrollTop') == 0
