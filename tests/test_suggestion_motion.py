"""Real Chromium geometry, motion and keyboard regression. No network or Edge extension required."""
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_runtime import launch_chromium

ROOT = Path(__file__).resolve().parents[1]


def build_page(page):
    html = re.sub(r'<script\s+src="[^"]+"\s*(?:defer)?\s*></script>', '', (ROOT/'newtab.html').read_text())
    html = re.sub(r'<link rel="stylesheet"[^>]+>', '', html)
    page.set_content(html)
    page.add_style_tag(content=(ROOT/'style.css').read_text())
    page.evaluate('''() => {
      window.__navigations = [];
      const values = new Map([['minimalSearchHistory',JSON.stringify(['github','github actions','git tutorial','git workflow','git help','go documentation'])],['onlineSuggestions','off']]);
      Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem:k=>values.get(k)||null, setItem:(k,v)=>values.set(k,String(v))
      }});
      window.chrome = {
        storage:{sync:{get:async()=>({}),set:async()=>{}},onChanged:{addListener(){}}},
        bookmarks:{getTree:async()=>[{children:[]}],search:async q=>{
          if(q.startsWith('git'))return Array.from({length:5},(_,i)=>({title:'git bookmark '+i,url:'https://example.com/git/'+i}));
          if(q.startsWith('go'))return [{title:'Go documentation',url:'https://go.dev/'}];
          return [];
        }},runtime:{getURL:p=>'chrome-extension://test/'+p},permissions:{request:async()=>true}
      };
      window.fetch=async()=>{throw Error('Offline test expected')};
    }''')
    for name in ['boot.js','site-icons.js','query-analyzer.js','suggestion-usage.js','newtab.js','bookmarks.js','frecency.js','candidate-pipeline.js','suggestions.js']:
        script=(ROOT/name).read_text()
        if name == 'newtab.js':
            script=script.replace('location.assign(action.url)','window.__navigations.push(action.url)')
            script=script.replace('location.assign(ENGINE_META[settings.engine].url+encodeURIComponent(submitted))','window.__navigations.push(ENGINE_META[settings.engine].url+encodeURIComponent(submitted))')
        page.add_script_tag(content=script)


def geometry(page):
    return page.evaluate('''() => {
      const combo=document.querySelector('.search-combo');
      const form=document.querySelector('.search-bar');
      const list=document.getElementById('search-suggestions');
      const box=form.getBoundingClientRect(),suggest=list.getBoundingClientRect();
      const style=getComputedStyle(combo,'::before');
      return {top:box.top,left:box.left,width:box.width,height:box.height,
        active:combo.classList.contains('is-suggesting'),
        panelHeight:suggest.height, backdropHeight:parseFloat(style.height),
        open:document.getElementById('query').getAttribute('aria-expanded'),
        ariaHidden:list.getAttribute('aria-hidden'),
        rowCount:list.querySelectorAll('.suggestion-item').length};
    }''')


def test_capsule_transition_and_dynamic_results():
    with sync_playwright() as pw:
        browser=launch_chromium(pw)
        page=browser.new_page(viewport={'width':1150,'height':800})
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        build_page(page)
        q=page.locator('#query')
        page.wait_for_timeout(330)  # Existing page layout has a brief initial CSS transition.
        closed=geometry(page)
        q.fill('git')
        page.wait_for_timeout(160)
        opening=geometry(page)
        assert opening['active'] and opening['rowCount']>=2,opening
        assert 0<opening['panelHeight']<190,opening
        page.wait_for_timeout(350)
        full=geometry(page)
        assert full['panelHeight']>opening['panelHeight'],(opening,full)
        assert abs(full['backdropHeight'] - (closed['height']+full['panelHeight']))<2,full
        assert (closed['top'],closed['left'],closed['width'],closed['height']) == (full['top'],full['left'],full['width'],full['height'])
        # Retain actual DOM node for a stable candidate across input refresh.
        before=page.evaluate('''() => {window.__node=document.querySelector('.suggestion-item[data-key="text:git tutorial"]');return !!window.__node}''')
        if before:
            q.fill('git t')
            page.wait_for_timeout(25)
            reused=page.evaluate('''() => window.__node && [...document.querySelectorAll('.suggestion-item')].includes(window.__node)''')
            assert reused
        q.fill('go')
        page.wait_for_timeout(380)
        shorter=geometry(page)
        assert shorter['panelHeight']<full['panelHeight'],(full,shorter)
        assert shorter['backdropHeight']<full['backdropHeight'],(full,shorter)
        q.press('ArrowDown')
        assert page.evaluate('window.NewTabSuggest.chosenDestination()')
        q.press('Escape')
        immediately=geometry(page)
        assert immediately['open']=='false' and immediately['ariaHidden']=='true'
        assert not immediately['active']
        assert page.evaluate('window.NewTabSuggest.chosenDestination()') is None
        page.wait_for_timeout(355)
        after=geometry(page)
        assert after['panelHeight']==0 and after['backdropHeight']==closed['height'],after
        assert page.locator('#search-suggestions').is_hidden()
        assert not errors, errors
        browser.close()


def test_reduced_motion_has_no_animated_transition():
    with sync_playwright() as pw:
        browser=launch_chromium(pw)
        page=browser.new_page(viewport={'width':400,'height':640},reduced_motion='reduce')
        build_page(page)
        q=page.locator('#query')
        q.fill('git')
        page.wait_for_timeout(130)
        rect=geometry(page)
        assert rect['active'] and rect['panelHeight']>0
        duration=page.evaluate("getComputedStyle(document.querySelector('.search-combo'),'::before').transitionDuration")
        assert duration in ('0s','0.00001s'),duration
        q.press('Escape')
        assert page.locator('#search-suggestions').is_hidden()
        browser.close()


def test_rapid_typing_recovers_without_ghost_rows_or_clickable_duplicates():
    with sync_playwright() as pw:
        browser=launch_chromium(pw)
        page=browser.new_page(viewport={'width':420,'height':360})
        failures=[]
        page.on('pageerror',lambda e: failures.append(str(e)))
        build_page(page)
        q=page.locator('#query')
        q.fill('git')
        page.wait_for_timeout(160)
        assert geometry(page)['active']
        q.fill('go')
        page.wait_for_timeout(35)
        # An input edit does not clone the previous candidates into fading ghosts.
        assert page.locator('.suggestion-ghost').count() == 0
        assert len(page.locator('.suggestion-item').all_text_contents()) <= 6
        q.fill('git')
        page.wait_for_timeout(180)
        assert geometry(page)['active']
        page.wait_for_timeout(370)
        assert page.locator('.suggestion-ghost').count()==0
        assert page.locator('.suggestion-item').count() >= 2
        q.press('Backspace')  # Deleting a character must preserve the open surface.
        page.wait_for_timeout(60)
        assert geometry(page)['active']
        # Small viewports can clip and scroll; the extension UI cannot overflow the bottom.
        frame=page.evaluate('''() => {
          const combo=document.querySelector('.search-combo').getBoundingClientRect();
          const panel=document.querySelector('.search-suggestions').getBoundingClientRect();
          return {bottom:panel.bottom,viewport:innerHeight,comboBottom:combo.bottom};
        }''')
        assert frame['bottom'] <= frame['viewport']-10,frame
        q.fill('')
        assert q.get_attribute('aria-expanded')=='false'
        page.wait_for_timeout(340)
        assert page.locator('.suggestion-item').count()==0
        q.fill('git')
        page.wait_for_timeout(190)
        assert q.get_attribute('aria-expanded')=='true'
        assert not failures,failures
        browser.close()


def test_scrollbar_stays_hidden_during_resize_but_small_viewport_still_scrolls():
    """Transient overflow must not cause scrollbar flashes; real overflow remains scrollable."""
    with sync_playwright() as pw:
        browser = launch_chromium(pw, args=['--no-sandbox', '--disable-features=OverlayScrollbar'])
        page = browser.new_page(viewport={'width': 1150, 'height': 800})
        build_page(page)
        q = page.locator('#query')
        q.fill('git')
        page.wait_for_timeout(45)
        opening = page.evaluate('''() => {
          const el = document.querySelector('.search-suggestions');
          return {height:el.clientHeight, content:el.scrollHeight,
            scrollbar:getComputedStyle(el).scrollbarWidth,
            webkitScrollbarDisplay:getComputedStyle(el, '::-webkit-scrollbar').display};
        }''')
        assert opening['content'] > opening['height'] + 10, opening  # actual transition overflow
        assert opening['scrollbar'] == 'none', opening
        assert opening['webkitScrollbarDisplay'] == 'none', opening
        q.fill('')
        assert page.evaluate("getComputedStyle(document.querySelector('.search-suggestions')).scrollbarWidth") == 'none'
        # On constrained heights, content is legitimately scrollable after the animation.
        page.set_viewport_size({'width': 420, 'height': 300})
        q.fill('git')
        page.wait_for_timeout(450)
        compact = page.evaluate('''() => {
          const el = document.querySelector('.search-suggestions');
          const before = el.scrollTop;
          el.scrollTop = el.scrollHeight;
          return {height:el.clientHeight, content:el.scrollHeight, before, after:el.scrollTop,
            scrollbar:getComputedStyle(el).scrollbarWidth};
        }''')
        assert compact['content'] > compact['height'], compact
        assert compact['after'] > compact['before'], compact
        assert compact['scrollbar'] == 'none', compact
        browser.close()


def test_backspace_does_not_restart_row_animations_or_replace_shared_candidates():
    """Capture the DOM animation budget across a burst of edits and delayed online snapshots."""
    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        page = browser.new_page(viewport={'width': 1150, 'height': 850})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        build_page(page)
        page.evaluate("""() => {
          localStorage.setItem('onlineSuggestions', 'on');
          window.fetch = async url => {
            await new Promise(resolve => setTimeout(resolve, 65));
            const query = new URL(url).searchParams.get('q') || '';
            return new Response(JSON.stringify([query,
              Array.from({length: 5}, (_, index) => query + ' remote ' + index)]),
              {status: 200, headers: {'content-type': 'application/json'}});
          };
          window.__motionCalls = [];
          const animate = Element.prototype.animate;
          Element.prototype.animate = function(...args) {
            if (this.classList.contains('suggestion-item') ||
                this.classList.contains('suggestion-ghost')) {
              window.__motionCalls.push({key: this.dataset.key, at: performance.now(),
                ghost: this.classList.contains('suggestion-ghost')});
            }
            return animate.apply(this, args);
          };
        }""")
        q = page.locator('#query')
        q.fill('git tutorial')
        page.wait_for_timeout(650)
        assert page.locator('.suggestion-item').count() >= 3
        # Keep the same DOM node for a suggestion that survives each backspace.
        page.evaluate("""() => {
          window.__retained = document.querySelector(
            '.suggestion-item[data-key="text:git tutorial"]');
          window.__motionCalls = [];
        }""")
        assert page.evaluate("window.__retained !== null")
        for _ in range(5):
            q.press('Backspace')
            page.wait_for_timeout(48)
            assert page.locator('.suggestion-ghost').count() == 0
        page.wait_for_timeout(560)
        assert page.evaluate("""() => [...document.querySelectorAll('.suggestion-item')]
          .includes(window.__retained)""")
        motion = page.evaluate('window.__motionCalls')
        assert not any(call['ghost'] for call in motion), motion
        assert len(motion) <= 6, f'Multiple row-animation batches restarted: {motion}'
        assert page.locator('.suggestion-item').count() <= 6
        assert geometry(page)['active']
        assert not errors, errors
        browser.close()
