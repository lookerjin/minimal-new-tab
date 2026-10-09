"""v1.5.9: visual-only submit acknowledgment, without postponing navigation."""
from playwright.sync_api import sync_playwright
from browser_runtime import launch_chromium
from test_suggestion_motion import build_page


def state(page):
    return page.evaluate('''() => {
      const engine=document.querySelector('.engine-control');
      const combo=document.querySelector('.search-combo');
      const ring=getComputedStyle(engine,'::after');
      const ack=getComputedStyle(document.querySelector('.search-submit'));
      return {
        engine:engine.classList.contains('is-submitting'),
        combo:combo.classList.contains('is-submitting'),
        ringOpacity:Number(ring.opacity),
        ringAnimation:ring.animationName,
        ringColor:ring.backgroundImage,
        ringInset:[ring.top,ring.right,ring.bottom,ring.left],
        ackAnimation:ack.animationName,
        open:document.getElementById('query').getAttribute('aria-expanded'),
        navigation:window.__navigations.at(-1),
        theme:document.documentElement.dataset.theme,
      };
    }''')


def test_search_submit_ack_and_delayed_orbit_without_navigation_wait():
    with sync_playwright() as p:
        browser=launch_chromium(p)
        page=browser.new_page(viewport={'width':1200,'height':840})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        build_page(page)
        q=page.locator('#query')
        q.fill('golang tutorial')
        page.wait_for_timeout(300)
        q.press('Enter')
        result=state(page)
        assert result['navigation']=='https://www.google.com/search?q=golang%20tutorial',result
        assert result['combo'] and result['engine'],result
        assert result['open']=='false',result
        assert result['ringInset']==['-2px']*4,result
        assert 'engine-ring-orbit' in result['ringAnimation'],result
        assert result['ringOpacity'] < .15,result  # ring starts only after the quiet 100ms threshold
        assert 'search-submit-ack' in result['ackAnimation'],result
        page.wait_for_timeout(330)
        after=state(page)
        assert after['ringOpacity']>.9,after
        assert 'conic-gradient' in after['ringColor'],after
        assert not errors,errors
        q.fill('next search')  # Navigation blocked in mock: typing allows recovery.
        assert not state(page)['combo'] and not state(page)['engine']
        browser.close()


def test_url_direct_visit_shows_navigation_ring():
    with sync_playwright() as p:
        browser=launch_chromium(p)
        page=browser.new_page(viewport={'width':1000,'height':750})
        build_page(page)
        q=page.locator('#query')
        q.fill('github.com')
        q.press('Enter')
        result=state(page)
        assert result['navigation']=='https://github.com/',result
        assert result['combo'] and result['engine'],result
        page.wait_for_timeout(270)
        assert state(page)['ringOpacity']>.9
        browser.close()


def test_theme_reduced_motion_and_narrow_layout():
    with sync_playwright() as p:
        browser=launch_chromium(p)
        page=browser.new_page(viewport={'width':390,'height':710},reduced_motion='reduce')
        build_page(page)
        page.evaluate("document.documentElement.dataset.theme='dark'")
        page.locator('#query').fill('edge performance')
        page.locator('.search-submit').click()
        result=state(page)
        assert result['engine'] and result['combo'],result
        # Chromium applies the reduced-motion pseudo-element style on the next style tick.
        page.wait_for_timeout(30)
        result=state(page)
        assert result['ringAnimation']=='none' and result['ringOpacity']==.55,result
        assert result['ackAnimation']=='none',result
        assert result['navigation']=='https://www.google.com/search?q=edge%20performance',result
        # The ring tracks the *engine*, not the whole search form.
        bounds=page.evaluate('''() => {
          const engine=document.querySelector('.engine-control').getBoundingClientRect();
          const form=document.querySelector('.search-bar').getBoundingClientRect();
          return {engineWidth:engine.width,formWidth:form.width};
        }''')
        assert 80<bounds['engineWidth']<150 and bounds['formWidth']>bounds['engineWidth']*2,bounds
        browser.close()


def test_selected_engine_uses_ring_and_can_reset_on_page_restore():
    with sync_playwright() as p:
        browser=launch_chromium(p)
        page=browser.new_page(viewport={'width':1100,'height':800})
        build_page(page)
        page.locator('#engine-button').click()
        page.locator('#engine-menu [data-engine="bing"]').click()
        page.locator('#query').fill('test query')
        page.locator('#query').press('Enter')
        result=state(page)
        assert result['engine'] and result['combo'],result
        assert result['navigation']=='https://www.bing.com/search?q=test%20query',result
        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow'))")
        assert not state(page)['engine'] and not state(page)['combo']
        browser.close()


def test_bilingual_url_placeholder_and_accessible_label():
    with sync_playwright() as p:
        browser=launch_chromium(p)
        page=browser.new_page(viewport={'width':1200,'height':800})
        build_page(page)
        q=page.locator('#query')
        assert q.get_attribute('placeholder')=='搜索或输入 Web 地址'
        assert q.get_attribute('aria-label')=='搜索或输入 Web 地址'
        page.locator('#open-settings').click()
        page.locator('[data-locale="en"]').click()
        assert q.get_attribute('placeholder')=='Search or enter a web address'
        assert q.get_attribute('aria-label')=='Search or enter a web address'
        page.locator('[data-locale="zh"]').click()
        assert q.get_attribute('placeholder')=='搜索或输入 Web 地址'
        assert q.get_attribute('aria-label')=='搜索或输入 Web 地址'
        browser.close()


def test_bookmark_url_and_selected_search_both_show_ring():
    with sync_playwright() as p:
        browser=launch_chromium(p)
        page=browser.new_page(viewport={'width':1100,'height':800})
        build_page(page)
        q=page.locator('#query')
        q.fill('go')
        page.wait_for_timeout(400)
        bookmark=page.locator('.suggestion-item[data-key="url:https://go.dev/"]')
        assert bookmark.count()==1
        bookmark.click()
        result=state(page)
        assert result['navigation']=='https://go.dev/' and result['engine'], result
        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow'))")
        q.fill('github.com')
        page.wait_for_timeout(200)
        assert page.locator('.suggestion-item').count()>=2
        # Select the explicit force-search alternative to a URL.
        page.locator('.suggestion-item').nth(1).click()
        result=state(page)
        assert result['navigation']=='https://www.google.com/search?q=github.com' and result['engine'], result
        browser.close()
