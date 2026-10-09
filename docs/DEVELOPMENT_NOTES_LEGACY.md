> 历史开发笔记，仅供回溯。功能与发行说明以根目录 README 和 CHANGELOG 为准。

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

## 开发、测试和发布

项目采用 Manifest V3、原生 JavaScript、零运行时第三方依赖。

- Node 单测：`node --test tests/search-core.test.cjs`
- Chromium 集成测试：`python -m pip install -r requirements-test.txt`，再执行 `python -m playwright install chromium` 与 `python -m pytest -q tests/`
- 生成 Edge 商店 ZIP：`python scripts/package.py --version v1.5.11`，产物保存在 `dist/`。
- **发布流程**：[docs/RELEASING.md](docs/RELEASING.md)；**版本记录**：[CHANGELOG.md](CHANGELOG.md)。

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


## v1.5.1 搜索候选管线（本地开发版）

本轮保持 Manifest V3、原生 JavaScript、零新增运行时依赖与原有权限，不读取浏览器历史记录：

- **轻量启动**：当前版本在首屏预加载极小的 `query-analyzer.js`，保证网址即时回车可用。`frecency.js`、`candidate-pipeline.js`、`suggestions.js` 仍在首次输入非空搜索词后才从扩展本地并发/顺序加载（前两个模块并发，控制器随后加载）。
- **独立 Provider**：识别直接网址、最近 30 条搜索、浏览器书签搜索和在线联想；相互独立并发返回，结果按来源增量合并，去重后最多展示 6 条。
- **排序与反馈**：采用轻量文本相关性、来源优先级、选择次数、使用时间衰减与输入词关联；只在实际选中或提交时记录最多 80 条本地关联（`localStorage.minimalSuggestUsage`），不逐字保存输入。
- **保守的网址导航（v1.5.1 时的行为）**：`github.com`、`localhost:3000`、`192.168.1.10:5000` 等会作为访问网址的候选；当时没有选中建议时，回车仍按当前搜索引擎执行文本搜索。此项已在 v1.5.5 调整为直接跳转。
- **性能与隐私**：原有 110ms 书签防抖、240ms 在线建议防抖、950ms 网络中断、60 秒失败冷却和最多 40 条短期缓存继续保留。最近搜索最多 2 条、书签候选最多 3 条，保留在线建议的展示空间（本地已满则跳过多余网络请求）；网址及疑似带协议的 URL 不发送给联想服务；清空/切换/失焦均取消旧请求；关闭在线建议后不会继续发起新的联想请求。
- **兼容原始数据**：保留现有 `minimalSearchHistory` 数组格式、设置键及 IndexedDB 壁纸，不增加迁移需求。

### 本地验证

仓库开发版包含 `tests/`（不会被发布版打包）：

```bash
node --test tests/search-core.test.cjs
python -m pytest -q tests/test_search_ui.py
```

Node 单测覆盖网址识别、排序、Provider 并发与取消；Playwright 在本地 Chromium 中注入页面资源、模拟浏览器 API 和联想接口，测试候选、选中后异步更新、提交、过期结果屏蔽与隐私开关。后者依赖 Python Playwright 和本机 Chromium，仅属于模拟集成验证。

**真实 Edge 待验收**：加载扩展后的脚本延迟、扩展 API、三个线上建议服务的实时可用性、真实 CORS/Host 权限表现、扩展更新前后的本地使用记录，需要在目标浏览器进行测试。联网联想接口均不是稳定的官方公共承诺 API。

## v1.5.2 候选稳定性与延迟诊断（本地开发版）

本轮不改变权限、存储结构、网络请求策略、首屏脚本加载或最多 6 个候选的限制。

- **键盘选择锁定**：方向键选中一项后，同一轮查询里随后返回的书签或在线建议不会把该目标挤出可见列表，也不会移动高亮所在行；输入新内容或关闭列表才解除锁定。
- **确定性的去重优先级**：Provider 按注册顺序决定相同候选的保留版本，不再依赖网络或书签 API 谁先返回。相同微任务阶段完成的 Provider 合并为一次渲染通知，减少不必要的 DOM 更新。
- **轻量诊断**：记录最多 40 次*已完成*查询的延迟（第一次显示候选、本地候选、在线候选、各 Provider 总耗时），统计 P50/P95；仅保存在当前新标签页的内存里，不记录关键词、网址或候选文本，也不写入本地存储或上传。

### 在真实 Edge 中测量

1. 打开本扩展新标签页并打开开发者工具 Console。
2. 输入多个有代表性的词，每个词停顿足够久，以便本地书签和在线 Provider 完成（网络超时最长 950ms，另有防抖）；快速继续输入或关闭候选的查询会被排除在统计样本之外。
3. 在 Console 中执行：

```js
window.NewTabSuggest?.diagnostics()
```

结果中 `moduleLoadMs` 为首次输入后加载本地候选、排序和建议控制器三个 JS 模块的耗时；URL 解析器已在页面启动时加载，不计入这个数字。`firstCandidate`、`firstLocal`、`firstOnline` 为从建议模块开始处理当前关键词到对应候选首次显示的时间；`providers.bookmark` / `providers.online` 等包含防抖时间和接口等待时间。各项返回 `{samples, p50Ms, p95Ms}`，没有数据时为 `null`。首次输入的**完整体感延迟**需要把 `moduleLoadMs` 和第一次查询的建议处理时间一起考虑；两个统计量不能直接当成精确端到端指标。

这些数据仅用于同一设备、相似书签规模和网络状态下的前后对照。模拟 Chromium 集成测试不代表真实 Edge 的 P95，也未验证线上联想接口稳定性。

仓库测试：

```bash
node --test tests/search-core.test.cjs
python -m pytest -q tests/test_search_ui.py
```

## v1.5.3 搜索建议动效

- **统一连续胶囊**：输入搜索词、出现候选时，建议列表从现有搜索栏向下生长。不再显示独立的悬浮卡片；搜索栏自身宽度、位置、高度不随候选变化。
- **与引擎菜单一致的动效节奏**：外壳展开、收缩使用 300ms 的 `cubic-bezier(.2,.75,.25,1)`，通过伪元素延展单一背景/描边，顶部轮廓保持固定。
- **连续输入与删除**：按候选 key 复用 DOM，避免每次输入销毁所有选项；候选位移使用 FLIP，新增项轻微淡入滑入，移除项使用 170ms 的非交互幽灵行淡出；高度始终根据实际行高度计算，而不是读当前滚动容器的 `scrollHeight`。
- **可逆状态**：清空、Esc、失焦时立刻关闭键盘选择与 `aria-expanded`，但保留可视区域约 300ms 收起动画；快速重新输入能取消正在收起的状态。关闭期间的旧候选不可点击，也不会提交。
- **适配**：最多展示 6 条，窄小视口下限制列表高度并允许滚动；遵循 `prefers-reduced-motion`，不播放过渡和位移动画。
- **性能约束**：候选模块仍然首次输入后懒加载；无第三方动画库、无新增扩展权限、无新增网络请求。新增内容仅涉及样式、少量 DOM 协调代码与测试。

### 本地验证

执行 `node --test tests/search-core.test.cjs` 和 `python -m pytest -q tests/`。Chromium 测试使用模拟的扩展 API 与在线服务，不等于真实 Edge 扩展的端到端验证。主要覆盖动画的 0→N、N→M、N→0 高度过渡、搜索栏几何稳定、快速切换候选、键盘选择、退出过程、窄视口及系统减少动效设置。


## v1.5.4 搜索建议滚动条动效修复

- 搜索建议容器保留纵向滚动能力，但隐藏原生滚动条；解决展开、退格缩短以及收起时滚动条短暂闪现的问题。
- 保持原有的胶囊高度动画、候选过渡、键盘选择和 reduced-motion 行为不变。小视口仍可通过鼠标滚轮、触摸板及键盘导航滚动建议。

## v1.5.5 智能搜索与跳转

- **回车动作决策**：明确选择的候选优先；未选候选时，完整 URL（`github.com`、`https://github.com/...`、`localhost:3000` 等）直接访问，普通文字交给当前搜索引擎。不能仅因为第一个书签匹配，就改变默认回车目标。
- **双动作候选**：输入 URL 时，列表固定优先展示“访问网址”和“使用 Google / 百度 / Bing 搜索”。选择第二项可强制搜索 URL 字符串；可使用方向键 + Enter 或点击候选。候选的高亮锁定与原有动画保持不变。
- **即时提交稳定**：体积很小的 `query-analyzer.js` 作为 `defer` 脚本在主页面前加载，免除粘贴 URL 立即 Enter 时的异步竞态；其他三个搜索建议模块继续在首次输入后懒加载。不新增扩展权限、联网接口或第三方依赖。
- **反馈和无障碍**：右侧圆形提交按钮的 `aria-label` 和 `title` 会根据当前默认动作显示“访问网址”或“搜索”，手动选择候选后同步更新；被选中的 URL 导航不写入最近搜索记录。
- **安全边界**：只自动访问明确的 HTTP(S) 地址；含空格、账号密码、非 HTTP(S) scheme、异常端口等依旧按文本搜索处理。对 `node.js` 等语义与域名形式重合的输入可显式选择搜索。

本地验证：`node --test tests/search-core.test.cjs`、`python -m pytest -q tests/`。浏览器测试模拟 Chrome 扩展 API 与网络响应，真实 Edge 需验收。


## v1.5.6 设置控件细化

- 搜索引擎下拉菜单顺序调整为 Google → Bing → Baidu，保留原有配置值和切换逻辑。
- 在线搜索建议改为小型滑动开关；背景模式采用选中行高亮 + 右侧勾选标记，未选项不再显示原生单选圆圈。
- 原生 checkbox/radio 保留在 DOM 中，原有同步、键盘操作、屏幕阅读器语义和焦点反馈保持不变。
- CSS 适配明暗主题及系统减少动效设置；无额外脚本、网络请求或运行时依赖。


## v1.5.7 稳定性修复（不新增功能）

- **设置同步失败回滚**：搜索引擎、语言和背景模式仍即时显示最新选择，但如果 `chrome.storage.sync.set` 失败，恢复到最后成功保存的状态。连续修改时写入按操作顺序执行，旧请求失败不会撤销新选择。
- **同步事件隔离**：过滤本页 `storage.onChanged` 的写入回声；本地设置写入期间优先保留用户当前选择，在空闲时仍能响应其他设备的同步变更。
- **壁纸异步取消**：切换背景、重新选图或取消待选图片会使旧的读取/解码操作失效，旧图片不会在稍后覆盖当前选择。
- **缓存回滚**：本地/远程图片的新缓存写入与设置保存按顺序处理；若保存失败或操作被取消，会尽力恢复此前缓存，避免下次打开时显示未成功保存的图片。
- **保留现有体验**：不改变搜索建议、Frecency、300ms 动画、控件视觉或扩展权限。

新增 `tests/test_settings_races.py`，覆盖存储异常、快速多次修改、浏览器同步事件、延迟解码、缓存写入中取消与失败回滚。测试中浏览器 API 与图片解码均可控地模拟；仍需在真实 Edge 扩展环境验收 IndexedDB 与跨设备同步。


## v1.5.8 搜索建议稳定展开（不新增功能）

- **输入与退格过程中保持面板稳定**：已展开的胶囊不再因为历史候选暂时为空就立刻收起；等待书签/在线 Provider 返回时保持外壳，候选更新后继续在原面板显示。
- **异步空结果防抖**：只有本次请求的全部 Provider 结束且没有候选，才在至少 180ms 输入稳定窗口之后关闭；清空、Esc、失焦仍立即开始原有的 300ms 收起动画。
- **非对称高度变化**：候选增加立即伸展；减少时等最后一次输入起约 180ms 再向下调整，连续退格会刷新等待时机；仍保留原来的 300ms 缓动曲线。
- **保留退场过渡**：Provider 连续通知不再中途删除未完成的候选淡出幽灵行；旧候选一旦失效就不能点击、不能作为回车目标。
- **无性能与隐私成本扩张**：没有第三方依赖、扩展权限或新网络请求；`prefers-reduced-motion` 与小窗口滚动照旧工作。

新增 `tests/test_suggestion_stability.py`，模拟仅书签有结果、在线建议延迟 460ms、连续退格、大小变化、清空和 Esc；这些测试在 Chromium 注入模拟扩展 API，不替代真实 Edge 安装验收。


## v1.5.9 搜索提交确认与引擎流光（轻量交互）

- **立即确认**：按 Enter 或点击提交时，右侧箭头做 220ms 的轻微按压反馈；同时取消未完成的搜索建议请求、关闭候选面板。
- **局部流光**：仅在通过 Google / Bing / Baidu 搜索时，当前搜索引擎胶囊外侧出现约 2px 的短弧流光。CSS 延迟 100ms 才启动，绕胶囊约 1.25s 一圈。直接访问 URL 不显示引擎流光。
- **无导航延迟**：仍在当前 submit 回调中同步调用 `location.assign()`，没有等待动画、帧调度或网络；浏览器可能在离开扩展页前绘制部分或全部动画。
- **兼容性**：适配明暗主题、窄屏和 `prefers-reduced-motion`（不旋转）；用户继续编辑或页面从往返缓存恢复时清除提交状态。
- **无额外权限或依赖**：仅使用现有 DOM 类名、CSS 渐变和动画，不发起额外网络连接；网络阶段延迟不会因此降低。

新增 `tests/test_submit_feedback.py`：Chromium 模拟导航、URL/搜索路径、延迟流光、主题和减动效。真实 Edge 的跨站导航反馈仍需手动体验。

## v1.5.10 统一导航流光与双语搜索提示

- 搜索栏默认占位文案：中文「搜索或输入 Web 地址」，英文「Search or enter a web address」；设置中切换语言后立即更新，输入框无障碍名称保持一致。
- 直接输入 `github.com` / `localhost:3000`，或选择书签网址后提交，也使用现有左侧引擎胶囊的延迟细线流光；它表示「已发起页面导航」，并不表示网址是通过搜索引擎打开的。
- 普通关键词搜索和搜索建议中强制搜索保留原有行为；同步调用 `location.assign()`，不为动画增加等待、权限或网络请求。
- 跳转失败后继续输入或从往返缓存返回仍会清除反馈状态；减少动效时显示静态描边。

### v1.5.11 — Mixed-source backspace stability

- Keep suggestion panel height stable while history, bookmarks, and online suggestion providers are still settling. Partial candidate snapshots can add rows immediately, but cannot contract the capsule.
- After all providers settle, shrink to the final candidate count using the existing input-idle delay; clearing the input, Escape, or blur still closes immediately.
- The same behavior applies when reduced motion is enabled. No changes to ranking, navigation, remote requests, or permissions.
