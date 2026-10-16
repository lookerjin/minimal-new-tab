# 背景与搜索验收记录

验收日期：2026-10-16。关联 Issue：[#9](https://github.com/lookerjin/minimal-new-tab/issues/9)、[#11](https://github.com/lookerjin/minimal-new-tab/issues/11)、[#12](https://github.com/lookerjin/minimal-new-tab/issues/12)。

## 已验收行为

| 范围 | 行为与验证重点 |
| --- | --- |
| 背景配置 | 参考 Issue #11 附图和用户标注，把模式和图片统一为卡片；沿用现有玻璃面板、按钮、图标与缓动。内置雪山、极光、沙丘、海岸四张离线 WebP。 |
| 网格与管理 | 桌面四列、窄屏两列，最多显示三行，整个网格一起滚动；新上传图片排在模式后、内置图片前。多选添加仅入库，点击才应用；最多导入 50 张，单张 20MB，内置图不占名额。覆盖并发写入、超额提示、批量删除和删除当前图后的回退。 |
| 关闭与取消 | 取消文件选择保留二级页面；关闭按钮、Escape、遮罩关闭后设置菜单保持关闭。保留焦点导航与减少动态效果设置。 |
| Bing 生命周期 | 使用实际缓存图作为卡片预览；新图解码后交叉淡入淡出，失败保留旧图。覆盖跨日、时区、联网恢复、可见性及更新反馈。 |
| 搜索交互 | 默认动作置顶，Tab / Shift+Tab 轮换替代建议且不改输入或焦点，Enter 与鼠标提交执行相同目标；继续编辑取消选择。书签标题和 URL 可灰字补全，右方向键接受后保留书签目标。 |
| 站内搜索 | @ 快捷入口、普通站名入口、紧凑标签、引擎菜单及 Esc 分层退出；站内历史独立且最多 100 条，仅使用同域书签，不向通用联想服务发送站内词。 |
| 规则更新 | 内置 Kagi Bangs 快照、缓存优先、固定版本 Raw / CDN 下载、校验后替换、失败保留缓存、超时与重试节流、多标签页租约。新增网络权限和数据流已同步到隐私政策。 |
| 异步与输入法 | 首次懒加载继承输入法状态；快速 Tab 等待本地候选、不等远程联想。连续 Tab 保留顺序，编辑、点击输入框、失焦、Esc、范围切换和提交取消旧等待。 |

搜索交互契约及 Ctrl+T 边界见 [搜索交互方案](docs/SEARCH_INTERACTION_PLAN.md)。

## 可复现验证

按照 [README](README.md) 安装测试依赖，运行：

```sh
node --test tests/search-core.test.cjs tests/site-search.test.cjs
python -m pytest -q tests/ --tb=short
python scripts/package.py --version v1.5.14
git diff --check
```

使用系统 Chromium 时可设置 `CHROMIUM_EXECUTABLE`；否则测试使用 Playwright Chromium。CI 还会检查全部根目录 JavaScript 的语法，并逐文件运行浏览器回归。

最终完整 Python / Playwright 回归：`128 passed in 297.05s`；Node 单元测试：13 项通过。全部根目录 JavaScript 语法检查、暂存 diff 检查及确定性打包通过。

测试包含实际 Chromium DOM、IndexedDB 和临时配置中的真实 MV3 扩展加载。扩展冒烟使用真实书签 API，验证内置背景、上传、刷新保留、取消选图、Tab 选书签导航与中文 GitHub 搜索 URL；目标页面使用可控响应，不依赖外部搜索服务在线状态。

视觉检查覆盖中文与英文、浅色与深色、桌面和 390px 窄屏、背景管理、三行滚动、紧凑站点标签、建议提示和减少动态效果。曾复现并修复取消选图冒泡关闭对话框、书签不补全、窄屏卡片重叠、网格间隙不响应滚轮、冷启动 Tab 丢焦点等问题，相关回归已加入测试。

本次由当前 Agent 顺序检查实际 diff 与未跟踪源码，未运行独立代理审查。

## 安装包与验证边界

- 本地可复现构建：`dist/minimal-new-tab-v1.5.14-edge.zip`，30 个文件，1,031,479 字节。运行资源已与源码逐字节核对，ZIP 完整性检查通过。
- SHA-256：`38cb1b60b4d605628721ee529b519373ee987a6bfecfb50d84acd150b8705056`。
- 本地 ZIP 不提交到 Git；正式分发仅使用 [发布流程](docs/RELEASING.md) 产生的 GitHub Actions 产物。
- 文件取消路径通过浏览器文件选择接口及原生 `cancel` 事件验证；未运行 Windows 文件管理器中手工点击取消的验收。
- 未运行 Edge 商店安装、审核和跨设备分发验收；真实 MV3 冒烟运行于 Chromium。
- 未实现 Ctrl+T 焦点绕行，未运行真实 Chrome / Edge 的 Ctrl+T 焦点实验。
- Raw 与 CDN 在本机可下载同一版本，不代表所有大陆网络均已验证；不可达时使用缓存或内置规则，目标站点本身仍需可访问。
