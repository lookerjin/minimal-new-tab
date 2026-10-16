# Microsoft Edge Add-ons — submission drafts (v1.5.14)

Status: draft; do not submit until the package has passed real Edge installation testing and the privacy URL is live.

## Product name / 名称

Minimal New Tab

## Short descriptions / 简短介绍（来自 Manifest）

- zh-CN: 简洁的新标签页：快速搜索、书签导航、壁纸和可关闭的在线搜索建议。
- en-US: A minimal new tab with fast search, bookmarks, wallpapers, and optional online search suggestions.

## 中文商店详情

Minimal New Tab 为 Microsoft Edge 带来简洁、轻盈的新标签页：打开新标签页，即可通过一个搜索框完成搜索或访问网址，使用书签侧栏快速打开常用网页，并按喜好设置背景。界面提供简体中文与英文，支持键盘操作及系统减少动态效果的偏好。

主要功能：搜索引擎可在 Google、Bing 和百度之间切换；输入时综合本机最近搜索、书签匹配及可选在线联想展示建议，支持方向键选择；书签侧栏按文件夹导航，仅读取书签，不执行修改或删除；背景配置将跟随系统、纯色、必应每日背景、四张离线内置图片与上传图片放在同一卡片网格，支持多选添加和批量删除上传图片。部分界面偏好可通过浏览器同步，本地上传的图片不会跨设备同步。

隐私和网络行为：在线联想启用时，搜索词会发送到所选搜索引擎的建议服务；可在设置里关闭。必应壁纸会访问 Bing 图片服务，本地上传不访问外部服务。扩展没有独立用户账户或开发者运营的分析服务器。详情请阅读隐私政策。

支持 `@站点` 临时站内搜索，或从搜索建议进入站点模式；Esc 可退出且不改变默认引擎。规则来自 Kagi Bangs 社区，内置离线快照并在后台经 GitHub API、GitHub Raw / jsDelivr 更新。更新请求不含搜索词；站内模式不请求通用搜索引擎联想，只使用对应站点的本机历史和同域书签。

注意：本扩展会替换 Edge 的默认新标签页。开发者模式安装与商店版本可能具有不同扩展 ID，原有本地数据不会自动迁移。

## English store description

Minimal New Tab gives Microsoft Edge a clean, lightweight new tab experience focused on the essentials: fast search, convenient bookmark navigation, and flexible wallpapers. Search the web or enter a URL from a single field, then use the bookmark sidebar to quickly open your favorite pages. The interface supports English and Simplified Chinese, keyboard navigation, and reduced-motion preferences.

Choose between Google, Bing, and Baidu for search. Suggestions can combine recent searches stored on your device, matching browser bookmarks, and optional online suggestions from the selected search provider. Use the arrow keys to navigate results. The bookmark sidebar supports folders and search, and only reads your bookmarks; it never edits or deletes them.

Customize the background in one card grid with a system-matched theme, solid colors, Bing's daily background, four bundled offline images, and your own uploads. Background settings support multi-image uploads and batch deletion of uploaded images. Some preferences can sync through the browser when synchronization is enabled. Uploaded local images stay on the device.

Privacy matters: online suggestions send typed queries to the selected provider when enabled and can be turned off in Settings. Bing daily wallpaper contacts Bing when selected. The extension does not operate its own account or analytics backend. See the linked privacy policy for full details.

Use `@site` or a site-search suggestion to temporarily search within a website; Esc exits without changing the default engine. Community-maintained Kagi Bangs rules ship with an offline snapshot and update in the background via GitHub API and GitHub Raw / jsDelivr, without query data. Site-search suggestions use only that site's local history and same-domain bookmarks, not general search-provider suggestions.

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

Online search suggestions are enabled by default and can be disabled in Settings. When enabled, entering a sufficiently long query may contact the selected Google/Bing/Baidu suggestion endpoint. Bing daily wallpaper requests metadata and images from Bing; local image uploads do not make network requests. Selecting local or solid-color backgrounds avoids wallpaper network requests. No developer-operated remote service, login, or telemetry is required. The page UI supports an internal language switch between Simplified Chinese and English.

This is the initial submission. The first listing should be Hidden so the publisher can validate the store-distributed installation and Edge sync behavior before making it publicly discoverable.

Site-search rules are parsed JSON data, not executable code. The extension checks GitHub API for a revision, then downloads that immutable revision from GitHub Raw or jsDelivr. Cached/bundled data works when those hosts are unavailable. Update requests omit credentials, referrers and search terms; site-specific local search history is capped at 100 entries. The three additional host permissions support these data-only updates. To verify, enter `@github ` followed by a query, submit, then return and use Esc to exit site mode.

## Pre-submit checks

- [ ] Run CI on PR and main; validate release artifact SHA-256.
- [ ] Install ZIP as unpacked in real Edge; check localization, bookmarks, suggestion toggle, permissions, wallpapers.
- [ ] Publish privacy policy to a stable publicly readable URL.
- [ ] Ensure the project license and third-party artwork attribution are appropriate.
- [ ] Upload logo and screenshots for both languages.
- [ ] Tag and publish only the tested, merged main commit.
- [ ] In Partner Center review the real privacy questionnaire before making any data practice claims.
