# Minimal New Tab — Privacy Policy / 隐私政策

Last updated: 2026-10-09 / 最近更新：2026-10-09

## English

Minimal New Tab is a browser extension that replaces the new tab page with search, read-only bookmark navigation and wallpaper choices. It has no developer-operated account system, analytics service, advertising tracker or backend database. Some features use browser synchronization or optional third-party network requests, as described below.

### Information handled and why

- **Bookmarks:** With the `bookmarks` permission, the extension reads bookmark titles, URLs and folder structure to display and search bookmarks on the user's device. It does not modify or delete bookmarks and does not send bookmark data to a developer-operated server.
- **Preferences:** Search engine, interface language, wallpaper mode and relevant remote wallpaper URL are saved using `chrome.storage.sync`. Depending on the browser's account and sync settings, this data may synchronize through the browser provider's infrastructure. A local setting also remembers whether the sidebar is open.
- **Recent searches:** Up to 30 submitted search phrases are saved in extension-local browser storage for suggestions, along with limited local suggestion-selection data used for ranking. This is not a request to read the browser's general history. Input that is typed but not submitted is not added to recent searches solely for being typed.
- **Local wallpapers:** User-selected image content is cached locally using IndexedDB. The original local image bytes are not included in `chrome.storage.sync`.
- **Online suggestions:** When the online-suggestions switch is enabled, and the query is long enough, the extension sends the current query to the selected Google, Bing or Baidu suggestion service to retrieve results. The service may receive the query, IP address and ordinary request metadata and applies its own privacy policy. Online suggestions can be disabled in settings; disabled suggestions do not make these request types.
- **Wallpaper downloads:** When Bing daily wallpaper is selected, the extension requests image metadata and images from Bing. If the user explicitly saves an HTTPS image URL, the extension requests the corresponding domain permission and fetches the image. The remote host may receive the IP address, requested URL and normal request metadata. The remote image URL setting may synchronize across browser profiles; image bytes are cached locally.
- **Searches and navigation:** When the user submits a search or visits a URL, the browser navigates to the selected search engine or destination website, which handles those requests under its own policies.

### Control and retention

Users can disable online suggestions, choose a non-network wallpaper mode, or remove the extension. Stored extension data can be cleared through browser extension/site-data controls. Synchronized preferences may additionally need to be managed through the browser account and synchronization settings. Search history and suggestion-ranking data are kept locally until cleared or the extension data is removed; the extension's recent-search list is limited to 30 entries. This extension does not sell user data or intentionally share bookmarks and local images with advertising or analytics providers.

### Contact and changes

For extension privacy questions, please use the project's issue tracker: https://github.com/lookerjin/minimal-new-tab/issues . This policy will be updated if features or data practices change.

## 简体中文

Minimal New Tab 是一款覆盖浏览器新标签页的扩展，提供搜索、只读书签导航与壁纸。扩展没有开发者运营的账户系统、统计服务、广告追踪或后端数据库。但部分功能会使用浏览器同步服务或按需访问第三方站点，具体如下。

### 处理哪些数据，为什么需要

- **书签：** 使用 `bookmarks` 权限，在本机读取书签标题、URL 和目录结构以展示及搜索；不修改、删除书签，也不主动向开发者服务器发送书签。
- **偏好设置：** 搜索引擎、界面语言、壁纸模式及相关远程壁纸 URL 保存在 `chrome.storage.sync`。根据浏览器账户和同步设置，数据可能经由浏览器服务提供方同步。侧边栏展开状态另存于本机。
- **最近搜索：** 在扩展本地浏览器存储中最多保存 30 条已提交的搜索词，并保存少量候选使用记录用于本地排序。不读取浏览器的全局浏览历史。单纯键入但未提交不会直接写入最近搜索列表。
- **本地壁纸：** 用户选定的图片内容缓存于本机 IndexedDB，不将本地图片原始字节写入 `chrome.storage.sync`。
- **在线搜索建议：** 启用在线联想、且输入达到要求长度时，将当前搜索词发送给选择的 Google、Bing 或百度联想服务。对应服务可能收到搜索词、IP 地址和常规请求元数据，并按其自身隐私政策处理。用户可以在设置中关闭在线联想，以停止此类请求。
- **壁纸下载：** 选择必应每日壁纸时，扩展向必应请求相关数据和图片。主动设置 HTTPS 图片直链时，扩展申请对应域名权限并访问该 URL，目标站点可能收到 IP 地址和通常的请求元数据。远程壁纸 URL 配置可能经浏览器同步，图片字节仍缓存于本机。
- **实际搜索与网址访问：** 用户提交搜索或访问网址后，浏览器向对应搜索引擎或目标网站发起正常访问，遵循这些第三方服务的政策。

### 用户控制与保留期限

用户可以关闭在线联想、选择不需要联网的背景模式，也可以卸载扩展；扩展数据可通过浏览器的扩展数据管理方式清除。已经同步的设置可能还需要在浏览器账户或同步配置中管理。最近搜索与本地排序数据保留到用户清除扩展数据为止，其中最近搜索最多保留 30 条。扩展不出售用户数据，也不主动将书签或本地壁纸发送给广告或分析服务。

### 联系与更新

如有隐私相关问题，请在项目 Issues 反馈：https://github.com/lookerjin/minimal-new-tab/issues 。功能或数据处理方式发生变化时，本政策会相应更新。
