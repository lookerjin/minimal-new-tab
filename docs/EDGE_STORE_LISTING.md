# Microsoft Edge Add-ons — submission drafts (v1.5.12)

Status: draft; do not submit until the package has passed real Edge installation testing and the privacy URL is live.

## Product name / 名称

Minimal New Tab

## Short descriptions / 简短介绍（来自 Manifest）

- zh-CN: 简洁的新标签页：快速搜索、书签导航、壁纸和可关闭的在线搜索建议。
- en-US: A minimal new tab with fast search, bookmarks, wallpapers, and optional online search suggestions.

## 中文商店详情

Minimal New Tab 为 Microsoft Edge 带来简洁、轻盈的新标签页：打开新标签页，即可通过一个搜索框完成搜索或访问网址，使用书签侧栏快速打开常用网页，并按喜好设置背景。界面提供简体中文与英文，支持键盘操作及系统减少动态效果的偏好。

主要功能：搜索引擎可在 Google、Bing 和百度之间切换；输入时综合本机最近搜索、书签匹配及可选在线联想展示建议，支持方向键选择；书签侧栏按文件夹导航，仅读取书签，不执行修改或删除；壁纸可选择跟随系统、纯色、本地上传图片、必应每日壁纸或用户指定的 HTTPS 图片链接。部分界面偏好可通过浏览器同步，本地上传的图片不会跨设备同步。

隐私和网络行为：在线联想启用时，搜索词会发送到所选搜索引擎的建议服务；可在设置里关闭。必应壁纸和用户主动选择的远程壁纸会访问相应图片服务。扩展没有独立用户账户或开发者运营的分析服务器。详情请阅读隐私政策。

注意：本扩展会替换 Edge 的默认新标签页。开发者模式安装与商店版本可能具有不同扩展 ID，原有本地数据不会自动迁移。

## English store description

Minimal New Tab gives Microsoft Edge a clean, lightweight new tab experience focused on the essentials: fast search, convenient bookmark navigation, and flexible wallpapers. Search the web or enter a URL from a single field, then use the bookmark sidebar to quickly open your favorite pages. The interface supports English and Simplified Chinese, keyboard navigation, and reduced-motion preferences.

Choose between Google, Bing, and Baidu for search. Suggestions can combine recent searches stored on your device, matching browser bookmarks, and optional online suggestions from the selected search provider. Use the arrow keys to navigate results. The bookmark sidebar supports folders and search, and only reads your bookmarks; it never edits or deletes them.

Customize the background with a system-matched theme, solid colors, your own image, Bing's daily wallpaper, or an HTTPS image URL. Some preferences can sync through the browser when synchronization is enabled. Uploaded local wallpaper images stay on the device.

Privacy matters: online suggestions send typed queries to the selected provider when enabled and can be turned off in Settings. Remote wallpapers contact the relevant image host when selected. The extension does not operate its own account or analytics backend. See the linked privacy policy for full details.

Note: This extension replaces Edge's default new tab page. Data from an unpacked developer version may not automatically transfer to the store-installed extension because extension IDs can differ.

## Suggested Partner Center fields

- Availability: Hidden for initial review and private install testing, then Public when verified.
- Website: https://github.com/lookerjin/minimal-new-tab
- Support: https://github.com/lookerjin/minimal-new-tab/issues
- Privacy Policy URL (after PR merged): https://github.com/lookerjin/minimal-new-tab/blob/main/docs/PRIVACY.md
- Language entries: English (United States), Chinese (Simplified).
- Logo: square PNG, minimum 128×128 px; recommended 300×300 px.
- Screenshots (optional, recommended): 1280×800 px, up to six. Show new-tab overview, mixed suggestions, bookmarks, backgrounds, settings.
- Promotional tiles (optional): 440×280 / 1400×560.

## Certification notes (English)

This extension replaces the new tab page via chrome_url_overrides. It is usable without signing into a separate account. To check bookmarks, add or use existing browser bookmarks and open the bookmarks sidebar. The extension requests bookmarks permission to read bookmarks only, storage to sync preferences, and favicon to display cached site icons. It does not request the browser history permission.

Online search suggestions are enabled by default and can be disabled in Settings. When enabled, entering a sufficiently long query may contact the selected Google/Bing/Baidu suggestion endpoint. Remote wallpaper modes may request images from Bing or a user-selected HTTPS host. The optional host permission prompt is triggered when a user explicitly saves a remote image URL. Selecting local or solid-color backgrounds avoids wallpaper network requests. No developer-operated remote service, login, or telemetry is required. The page UI supports an internal language switch between Simplified Chinese and English.

This is the initial submission. The first listing should be Hidden so the publisher can validate the store-distributed installation and Edge sync behavior before making it publicly discoverable.

## Pre-submit checks

- [ ] Run CI on PR and main; validate release artifact SHA-256.
- [ ] Install ZIP as unpacked in real Edge; check localization, bookmarks, suggestion toggle, permissions, wallpapers.
- [ ] Publish privacy policy to a stable publicly readable URL.
- [ ] Ensure the project license and third-party artwork attribution are appropriate.
- [ ] Upload logo and screenshots for both languages.
- [ ] Tag and publish only the tested, merged main commit.
- [ ] In Partner Center review the real privacy questionnaire before making any data practice claims.
