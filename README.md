# Minimal New Tab

一个桌面 Edge / Chromium 的极简本地新标签页扩展。只做搜索、背景和书签导航，不需要服务器、CDN 或前端框架。

## 功能

- **搜索引擎**：搜索框左侧点击选择 Google / 百度 / Bing，菜单从胶囊直接向下展开，点击空白处关闭
- **搜索建议**：输入后按需加载（最近搜索、书签匹配、引擎联想）；可关闭在线联想，离线也可直接搜索，不读取浏览器历史
- **书签导航**：参考 macOS Safari 的窄侧栏：顶部圆形返回按钮 + 当前文件夹标题 + 右侧圆形侧栏收起按钮；根目录返回会收起侧栏，文件夹点击后在同一侧栏内进入下一级；列表按照「文件夹 / 书签」分组，叶子目录只显示书签；支持书签名称、URL 和路径模糊搜索；只读，不会编辑或删除书签
- **背景**：自动跟随系统深浅色、纯白、纯黑、本地图片、必应每日壁纸或 HTTPS 图片直链
- **语言**：设置中的“中 / EN”滑块切换，支持动态语言更新
- **交互**：Safari 风格贴边半透明材质、同栏层叠式进入/返回动画、统一圆形图标按钮；支持点击空白处关闭及系统减少动效偏好
- **同步**：浏览器 `chrome.storage.sync` 同步搜索、背景模式、语言和远程图片 URL；本地上传的图片原图不跨设备同步

## 安装

1. 解压 ZIP，在磁盘上保留解压后的 `minimal-new-tab` 文件夹。
2. 打开 `edge://extensions`，开启“开发人员模式”。
3. 点击“加载解压缩的扩展”，选择包含 `manifest.json` 的 `minimal-new-tab` 文件夹。
4. 按 `Ctrl + T` 打开新标签页。

### 之前安装过本扩展

若你希望保留原本上传的本地壁纸，先备份旧文件夹，**将新文件夹里的文件复制覆盖到旧扩展目录**，不要先移除旧扩展，然后在 `edge://extensions` 点击“重新加载”。

如果将新扩展从不同路径安装，扩展 ID 可能改变，旧扩展的本地 IndexedDB 壁纸数据不一定能迁移。配置是否同步还取决于你的浏览器账号同步状态。

## 权限与数据

- `bookmarks`：只读取书签树和监听变化，绝不调用新增、编辑、移动、删除书签的 API
- `favicon`：读取 Edge / Chromium 自身缓存的网站图标，无需访问远程站点或第三方图标服务；未缓存图标时使用通用图标
- `storage`：保存少量同步配置
- `www.bing.com`：只有选用必应每日壁纸时才访问
- `suggestqueries.google.com` / `www.baidu.com` / `api.bing.com`：当在线联想开启且用户输入至少 2 个字符时，按当前引擎发起建议请求；这些是非官方或非稳定承诺的网页联想接口，不能保证长期可用
- 可选 HTTPS 域名访问：只有用户主动保存远程壁纸直链时才申请
- 壁纸原图保存在本机 IndexedDB；使用纯白、纯黑或自动模式时无需在线壁纸请求

## 验证说明

本次通过本地 Chromium + Playwright（直接注入页面资源）测试 42 项检查：4 种窗口宽度的水平居中与溢出检查、搜索引擎切换、菜单顶部坐标、中英文占位文案、书签面板开关、明暗主题、空搜索按钮状态及 Google / 百度 / Bing 的文本搜索 URL 构造。Chromium 测试中将搜索跳转改写为记录 URL，书签与同步 API 使用模拟数据；并非真实 Edge 安装或搜索引擎服务端的端到端验证。

当前执行环境限制浏览器直接打开 `chrome-extension://` 页面，因此**真实 Edge 安装、跨设备同步和实际壁纸在线下载尚未在用户环境验证**。

## 图标与书签弹层

网页书签图标通过 Chromium 扩展 `/_favicon/?pageUrl=...&size=32` API 从浏览器现有 favicon 数据中读取，只对已经渲染出的书签生成本地图标 URL；图标不存在时回退到地球图标。Bing 搜索入口和“必应每日壁纸”使用本地打包的品牌 ICO。书签浏览始终在侧边栏内进行，点击文件夹向左滑走当前列表，从右侧滑入子文件夹；返回上级反向滑动。彻底移除了 Hover 级联子菜单和跨越页面的浮层。

## 侧边栏开关

参考 macOS Safari 的侧栏图标（带竖直分割线的矩形窗口）：关闭时位于左上角，打开后位于侧栏标题右侧，两个位置共用同一图案；点击即时展开或收起。右上角不再使用「···」按钮或额外菜单。左侧返回按钮只负责上一级导航（在书签根目录时回到关闭状态）。


## Recent polish notes

- Settings button is positioned in the top-right, mirroring the collapsed bookmark button on the left.
- Search-engine selection opens on click, with an anchored continuous surface and consistent SVG checkmark.
- The engine button and input are separate; layout does not reflow during dropdown animation.
- Font CSS prefers openly licensed Noto Sans SC / Noto Sans CJK SC / Source Han Sans SC locally, with no network fetch; computers without these fonts fall back to their available sans-serif. Install Noto Sans CJK SC on each computer if exact typography is required. Font files are not redistributed in this package.
- Native favicon cache can contain only 16px images; favicon display is reduced to 18px to avoid a blurred 28px upsample, and bookmark text is enlarged.

## 本次改进

- 胶囊顶部圆角不再插值变化，下拉只改变向下延伸的背景高度。
- 书签 favicon 不再统一加灰色底板；彩色品牌图标保持透明原貌；只在可读取图像像素、且确认是透明黑白图形时应用小型对比度底板。图像无法分析时保留原样，不额外联网；缺失 Favicon 使用随主题变色的地球图标。
- Google、百度、Bing 搜索图标使用本地打包的原始 `.ico`（品牌资源归对应品牌方所有，不再使用自绘的 SVG）。
- 点击「本地图片 / 图片链接」仅打开配置控件，不立即改背景。成功选图 / 下载并解码后才应用；取消或失败保持原背景。
- 「必应每日壁纸」移至「本地图片」前面。
- 尚无已缓存图片的设备，照片模式采用系统明暗色兜底，不再显示固定暗底。


- 页签图标：新标签页 HTML 指定独立的透明 PNG Favicon，与扩展图标分开；图形采用黑色轮廓以适配 Edge 的单色标签页渲染。
- 百度标志：使用用户提供的原始 ICO，其自带白色图底；不额外叠加底板。


## Edge vertical tabs: transparent icon trial

The page uses one transparent PNG favicon. The extension keeps its original
branded Manifest icons (16/48/128px), separate from the page favicon.
The new-tab artwork is based on Microsoft Fluent UI System Icons (MIT; see license).
This is an experimental compatibility fix; Edge's Ctrl+T vertical-tab behavior
can only be verified in a real Edge installation. No added network requests.

## 搜索栏（文本搜索）

- **搜索功能**：只保留 Google / 百度 / Bing 的关键字搜索；选择引擎、输入文本、按回车或点击常驻的圆形右箭头即可跳转搜索结果。空输入时右箭头弱化并禁用。
- **视觉与布局**：保留已确认的中性色搜索栏（最大宽度 724px、高度 51px）和左上书签/右上设置按钮统一样式；始终在网页视口内水平居中。
- **不再提供图片或文件搜索**：彻底移除了搜索栏里的 `＋`、系统文件选择器、附件列表与预览、Google Lens 上传表单、对应样式和翻译。**设置面板中的本地壁纸选择和远程壁纸功能仍然保留**，这是独立的背景功能。
- **图标**：搜索引擎使用本地原始品牌 ICO；扩展管理图标与 Edge 新标签页透明 PNG 图标继续独立。

## 回归说明

此次本地测试覆盖 1365×850、1024×768、390×800、320×720，并核对明暗主题、顶部两枚按钮背景色一致性；未检测到 JavaScript 页面异常。测试脚本和预览图不打包进扩展。仍需在真实 Edge 中确认 `Ctrl+T` 图标、垂直标签栏开合、壁纸持久化及实际搜索结果。

## v1.5.0 搜索建议与性能约束

- **打开新标签页**：不加载 `suggestions.js`，不读取最近搜索，不调用书签搜索和在线建议接口。只有首次输入非空内容才异步加载建议模块。
- **本地建议**：最近 30 条实际提交的搜索词保存在本机 `localStorage`（不上传、不同步）；浏览器 `chrome.bookmarks.search` 仅在输入后防抖查询，不在首屏遍历整棵书签树。
- **在线建议**：输入至少 2 个字符，停顿 240ms 后最多请求当前搜索引擎一个接口，950ms 即中断；关闭输入、清空、切换关键词会取消未完成请求。失败后对该引擎冷却 60 秒，避免反复阻塞与浪费流量。最多保留 40 条短期内存缓存；最多展示 6 条建议。
- **隐私开关**：设置面板提供“在线搜索建议”开关，默认开启。关闭后不会请求联想服务，但最近搜索与书签依然工作。即使开启，输入内容只有在实际开始输入并通过防抖后才发送到相应提供商。
- **网络与兼容性边界**：联想接口非正式产品 API，可能遇到地域限制、403、接口格式变更或超时。任何错误都只影响联想列表，搜索提交不依赖接口响应；并非对真实 Edge 新标签页的速度进行了原生对照。扩展更新新增三个限定域名的 Host 权限，Edge 可能请求用户批准。
- **键盘**：方向键选择、Enter 使用选中建议、Esc 关闭；支持 IME 中文拼音输入。下拉浮层独立于搜索栏，不参与居中布局计算。

### 本地开发验证

使用 Chromium 144 的模拟扩展 API，`test_suggestions.py` 完成 25 项测试和原版/新版各 15 次页面加载对照。在本次隔离执行环境中，`chrome-extension://` 真正安装行为和三个在线接口的实时可用性未被验证，仍需在目标 Edge 设备验收。性能数据不是与原生 Edge 新标签页的基准比较。
