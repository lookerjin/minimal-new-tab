import pytest
from playwright.sync_api import sync_playwright
from browser_runtime import launch_chromium
from wallpaper_runtime import PNG, serve_app, open_manager, upload, choose_mode


@pytest.fixture
def app():
    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        page = browser.new_page(viewport={'width': 1100, 'height': 850}, color_scheme='light')
        _, errors = serve_app(page)
        open_manager(page)
        yield page
        assert not errors, errors
        browser.close()


def test_multi_upload_is_separate_from_apply_and_survives_reload(app):
    page = app
    upload(page)
    assert page.locator('.wallpaper-card').count() == 3
    assert page.locator('html').get_attribute('data-mode') == 'auto'
    assert page.locator('#wallpaper').get_attribute('src') is None
    assert page.evaluate('window.__saved.length') == 0
    assert page.evaluate('async () => (await readGallery()).every(row=>row.thumbnail instanceof Blob && !row.blob)')
    page.locator('.wallpaper-card').nth(1).click()
    page.wait_for_function("document.querySelector('#wallpaper').classList.contains('ready')")
    current = page.locator('.wallpaper-card.is-current').get_attribute('data-id')
    page.reload()
    page.wait_for_function("document.querySelector('#wallpaper').classList.contains('ready')")
    open_manager(page)
    assert page.locator('.wallpaper-card').count() == 3
    assert page.locator('.wallpaper-card.is-current').get_attribute('data-id') == current
    assert page.locator('#remote-control').count() == 0


def test_import_limit_skips_excess_and_full_add_click_shows_message(app):
    page=app
    upload(page,tuple(f'image-{index}.png' for index in range(52)))
    assert page.locator('.wallpaper-card').count() == 50
    assert page.evaluate('async()=> (await readGallery()).length') == 50
    assert '50 张导入上限' in page.locator('#wallpaper-status').inner_text()
    assert '2 张图片未添加' in page.locator('#wallpaper-status').inner_text()
    pickers=[]
    page.on('filechooser',lambda chooser:pickers.append(chooser))
    page.locator('#choose-image').click()
    assert '请先删除部分图片' in page.locator('#wallpaper-status').inner_text()
    assert not pickers
    assert page.locator('#wallpaper-manager').is_visible()
    assert page.locator('html').get_attribute('data-mode') == 'auto'
    assert page.locator('.builtin-wallpaper').count() == 4
    page.locator('#manage-wallpapers').click()
    page.locator('.wallpaper-card').first.click()
    page.locator('#delete-wallpapers').click()
    page.wait_for_function("document.querySelectorAll('.wallpaper-card').length===49")
    page.locator('#manage-wallpapers').click()
    upload(page,('fits.png','excess.png'))
    assert page.locator('.wallpaper-card').count() == 50
    assert page.locator('.wallpaper-card').first.get_attribute('title') == 'fits.png'
    assert '1 张图片未添加' in page.locator('#wallpaper-status').inner_text()


def test_import_limit_is_atomic_for_concurrent_database_writes(app):
    page=app
    upload(page,tuple(f'image-{index}.png' for index in range(49)))
    result=page.evaluate('''async()=>{
      const original=await dbGet('wallpaper:'+(await readGallery())[0].id);
      const record=await prepareWallpaper(new File([original],'concurrent.png',{type:'image/png'}));
      const writes=await Promise.all([
        writeGallery([{...record,id:crypto.randomUUID()}]),
        writeGallery([{...record,id:crypto.randomUUID()}])
      ]);
      return {count:(await readGallery()).length,added:writes.map(w=>w.added),skipped:writes.map(w=>w.skipped)};
    }''')
    assert result['count'] == 50
    assert sum(result['added']) == 1 and sum(result['skipped']) == 1


def test_manage_multi_delete_preserves_unselected_then_falls_back_for_current(app):
    page = app
    upload(page)
    page.locator('.wallpaper-card').first.click()
    page.wait_for_function("document.querySelector('.wallpaper-card.is-current')")
    source = page.locator('#wallpaper').get_attribute('src')
    page.locator('#manage-wallpapers').click()
    page.locator('.wallpaper-card').nth(1).click()
    page.locator('.wallpaper-card').nth(2).click()
    assert page.locator('.wallpaper-card.is-selected').count() == 2
    assert page.locator('#wallpaper').get_attribute('src') == source
    page.locator('#delete-wallpapers').click()
    page.wait_for_function("document.querySelectorAll('.wallpaper-card').length === 1")
    assert page.locator('.wallpaper-card.is-current').count() == 1
    page.locator('#select-all-wallpapers').click()
    assert page.locator('.wallpaper-card.is-selected').count() == 1
    current_id = page.locator('.wallpaper-card').get_attribute('data-id')
    page.locator('#select-all-wallpapers').click()
    assert page.locator('#delete-wallpapers').is_disabled()
    page.locator('#select-all-wallpapers').click()
    page.locator('#delete-wallpapers').click()
    page.wait_for_function("document.querySelectorAll('.wallpaper-card').length === 0")
    assert page.locator('html').get_attribute('data-mode') == 'auto'
    assert page.locator('#wallpaper').get_attribute('src') is None
    assert page.evaluate("async(id)=> !(await dbGet('wallpaper:'+id))", current_id)
    page.locator('#manage-wallpapers').click()
    page.locator('#wallpaper-batch').wait_for(state='hidden')


def test_invalid_files_and_write_failure_keep_existing_library(app):
    page = app
    upload(page, ('existing.png',))
    page.locator('#image-file').set_input_files([
        {'name':'bad.png', 'mimeType':'image/png', 'buffer':b'broken'},
        {'name':'new.png', 'mimeType':'image/png', 'buffer':PNG}
    ])
    page.wait_for_function("document.querySelectorAll('.wallpaper-card').length === 2")
    assert '1 张图片无效' in page.locator('#wallpaper-status').inner_text()
    page.evaluate("() => { window.writeGallery = async()=>{throw Error('disk full')}; }")
    upload(page, ('failed.png',))
    assert page.locator('.wallpaper-card').count() == 2
    assert '无法保存' in page.locator('#wallpaper-status').inner_text()
    assert page.evaluate('async()=> (await readGallery()).length') == 2


def test_oversized_image_is_rejected_without_changing_background(app):
    page = app
    page.evaluate('''() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(20*1024*1024+1)],'huge.png',{type:'image/png'}));
      const input = document.querySelector('#image-file');
      input.files = transfer.files; input.dispatchEvent(new Event('change'));
    }''')
    page.wait_for_function("document.querySelector('#wallpaper-status').textContent.includes('20MB')")
    assert page.locator('.wallpaper-card').count() == 0
    assert page.locator('html').get_attribute('data-mode') == 'auto'


def test_gallery_transaction_rolls_back_all_images_on_storage_failure(app):
    page = app
    upload(page, ('keep.png',))
    page.evaluate('''() => {
      const put = IDBObjectStore.prototype.put;
      let writes = 0;
      IDBObjectStore.prototype.put = function(...args) {
        if (this.name === 'wallpapers' && ++writes === 2) throw new DOMException('Full', 'QuotaExceededError');
        return put.apply(this, args);
      };
    }''')
    upload(page, ('first.png','second.png'))
    assert '无法保存' in page.locator('#wallpaper-status').inner_text()
    assert page.evaluate('async()=> (await readGallery()).length') == 1
    assert page.evaluate("async()=>await imageTransaction(['images'],'readonly',(tx,done)=>{tx.objectStore('images').count().onsuccess=e=>done(e.target.result)})") == 1


def test_failed_apply_and_failed_delete_do_not_destroy_images(app):
    page = app
    upload(page, ('keep.png',))
    choose_mode(page, 'black')
    page.evaluate('window.__failSave = true')
    page.locator('.wallpaper-card').click()
    page.wait_for_function("document.querySelector('#wallpaper-status').textContent.includes('无法设置')")
    assert page.locator('html').get_attribute('data-mode') == 'black'
    assert page.locator('#wallpaper').get_attribute('src') is None
    page.evaluate('window.__failSave = false')
    page.locator('.wallpaper-card').click()
    page.wait_for_function("document.querySelector('.wallpaper-card.is-current')")
    page.evaluate('window.__failSave = true')
    page.locator('#manage-wallpapers').click()
    page.locator('#select-all-wallpapers').click()
    page.locator('#delete-wallpapers').click()
    page.wait_for_function("document.querySelector('#wallpaper-status').textContent.includes('删除失败')")
    assert page.locator('.wallpaper-card.is-current').count() == 1
    assert page.evaluate('async()=> (await readGallery()).length') == 1


def test_failed_delete_transaction_restores_current_background(app):
    page = app
    upload(page, ('keep.png',))
    page.locator('.wallpaper-card').click()
    page.wait_for_function("document.querySelector('#wallpaper').classList.contains('ready')")
    current_id = page.locator('.wallpaper-card').get_attribute('data-id')
    page.evaluate("() => { window.writeGallery = async()=> {throw Error('storage failure')}; }")
    page.locator('#manage-wallpapers').click()
    page.locator('#select-all-wallpapers').click()
    page.locator('#delete-wallpapers').click()
    page.wait_for_function("document.querySelector('#wallpaper-status').textContent.includes('删除失败')")
    assert page.locator('html').get_attribute('data-mode') == 'local'
    assert page.locator('.wallpaper-card.is-current').get_attribute('data-id') == current_id
    assert page.evaluate('async()=> (await readGallery()).length') == 1


def test_delete_remembered_image_clears_reference_without_changing_solid_mode(app):
    page = app
    upload(page, ('remembered.png',))
    page.locator('.wallpaper-card').click()
    page.wait_for_function("document.querySelector('#wallpaper').classList.contains('ready')")
    choose_mode(page, 'black')
    page.locator('#manage-wallpapers').click()
    page.locator('#select-all-wallpapers').click()
    page.locator('#delete-wallpapers').click()
    page.wait_for_function("document.querySelectorAll('.wallpaper-card').length === 0")
    assert page.locator('html').get_attribute('data-mode') == 'black'
    assert page.evaluate("JSON.parse(localStorage.getItem('__prefs')).wallpaperId") == ''
    assert page.locator('html').get_attribute('data-mode') == 'black'


def test_upload_finishes_without_overriding_later_background_choice(app):
    page = app
    page.evaluate('''() => {
      const original = writeGallery;
      window.writeGallery = async (...args) => {
        await new Promise(resolve => { window.__finishUpload = resolve; });
        return original(...args);
      };
    }''')
    page.locator('#image-file').set_input_files({'name':'later.png','mimeType':'image/png','buffer':PNG})
    page.wait_for_function('typeof window.__finishUpload === "function"')
    choose_mode(page, 'white')
    page.evaluate('window.__finishUpload()')
    page.wait_for_function("document.querySelectorAll('.wallpaper-card').length === 1")
    assert page.locator('html').get_attribute('data-mode') == 'white'
    assert page.locator('#wallpaper').get_attribute('src') is None


def test_image_switch_crossfades_and_releases_outgoing_layer(app):
    page = app
    upload(page, ('first.png', 'second.png'))
    page.locator('.wallpaper-card').first.click()
    page.wait_for_function("document.querySelector('#wallpaper').classList.contains('ready')")
    page.wait_for_timeout(500)
    old_source = page.locator('#wallpaper').get_attribute('src')
    page.locator('.wallpaper-card').nth(1).click()
    page.wait_for_function('(old) => document.querySelector("#wallpaper").src !== old', arg=old_source)
    assert page.locator('#wallpaper-previous').get_attribute('src') == old_source
    page.wait_for_timeout(100)
    opacity = page.locator('#wallpaper-previous').evaluate('(el)=>Number(getComputedStyle(el).opacity)')
    assert 0 < opacity < 1
    page.wait_for_function("!document.querySelector('#wallpaper-previous').hasAttribute('src')")


@pytest.mark.parametrize('width', [400, 1100])
def test_dialog_keyboard_layout_locale_and_thumbnail_cleanup(width):
    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        page = browser.new_page(viewport={'width':width,'height':720})
        _, errors = serve_app(page)
        open_manager(page)
        upload(page)
        assert page.locator('#wallpaper-manager').evaluate('(el)=>el.scrollWidth <= el.clientWidth')
        page.locator('.wallpaper-card').first.focus()
        page.keyboard.press('Enter')
        page.wait_for_function("document.querySelector('.wallpaper-card.is-current')")
        page.keyboard.press('Escape')
        page.locator('#wallpaper-manager').wait_for(state='hidden')
        assert page.locator('#open-settings').evaluate('(el)=>document.activeElement===el')
        assert page.locator('#settings').get_attribute('aria-hidden') == 'true'
        assert page.evaluate('galleryUrls.length') == 0
        page.locator('#open-settings').click()
        page.locator('[data-locale=en]').click()
        page.locator('#open-wallpapers').click()
        assert page.locator('#wallpaper-title').inner_text() == 'Background'
        assert page.locator('#manage-wallpapers').inner_text() == 'Manage'
        assert not errors, errors
        browser.close()
