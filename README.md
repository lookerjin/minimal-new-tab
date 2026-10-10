# Minimal New Tab

一个本地优先、简洁快速的桌面 **Microsoft Edge / Chromium 新标签页扩展**。使用 Manifest V3、原生 HTML/CSS/JavaScript；不依赖服务器、构建框架或运行时第三方 JS 包。

> 当前仓库开发版本：**1.5.14（尚未发布）**；最近正式发行版：**v1.5.13**。正式 ZIP 由 GitHub Actions 发布到 GitHub Release；Edge 商店上架仍在准备中。

## 功能

- **统一搜索框**：Google / Bing / 百度搜索，以及网址直接跳转；支持方向键、最近搜索、书签建议和在线联想。
- **流畅交互**：搜索建议按需加载、候选异步合并与稳定高度过渡、提交反馈与轻量胶囊流光。
- **书签导航**：本地只读书签检索和分层侧边栏，不会修改书签。
- **背景**：跟随系统、白色、黑色、本地图片、必应每日壁纸、HTTPS 图片直链。
- **双语与辅助功能**：简体中文 / 英语、键盘导航、`prefers-reduced-motion`。
- **配置同步**：设置保存在浏览器 `chrome.storage.sync` 中；本机上传的壁纸图片存于 IndexedDB，不跨设备同步。

## 安装

### Edge 商店安装（待上架）

首次上架会先采用 Hidden，审核通过后可通过商店链接安装；公开上架后将提供正式安装入口。**开发者模式安装和商店安装可能使用不同扩展 ID，彼此的数据不会自动迁移。**

### 开发者模式安装

1. 获取仓库源码或 GitHub Release ZIP，解压到固定文件夹。
2. 打开 `edge://extensions`，开启开发人员模式。
3. 点击“加载解压缩的扩展”，选择包含 `manifest.json` 的目录。
4. 按 `Ctrl + T` 打开新标签页。

更新开发者模式版本时，尽可能在同一路径覆盖文件并点击“重新加载”，不要先卸载，否则可能失去本地图片缓存。有关商店发布后的迁移限制，见 [发布指南](docs/RELEASING.md)。

## 数据与权限

| 权限 / 外部访问 | 用途 |
| --- | --- |
| `storage` | 浏览器同步设置；最近搜索保存在本机 `localStorage` |
| `bookmarks` | 用户请求时只读检索书签，不修改、删除书签 |
| `favicon` | 使用浏览器已缓存的网站图标 |
| Google / Bing / Baidu 联想域名 | 在线搜索建议开启后，向当前搜索引擎发送输入关键词；关闭后不发送联想请求 |
| `www.bing.com` | 选择必应每日壁纸时下载图像 |
| 可选 HTTPS 域名权限 | 用户选择特定远程壁纸时，按需申请访问权限 |

本地壁纸图片仅保存在用户设备的 IndexedDB 中。项目不自行搭建遥测或用户信息服务。**隐私政策草案**：见 [docs/PRIVACY.md](docs/PRIVACY.md)（正式提交前须确认公开 URL 和数据披露）。

## 开发与测试

要求：Node.js 22+、Python 3.12+、Chromium（或 Playwright Chromium）。

```sh
node --test tests/search-core.test.cjs
python -m pip install -r requirements-test.txt
python -m playwright install chromium
python -m pytest -q tests/
python scripts/package.py --version v1.5.12
```

打包脚本生成 `dist/minimal-new-tab-v1.5.12-edge.zip`，其中 `manifest.json` 位于 ZIP 根目录，并附带 SHA-256 校验文件。测试使用模拟的浏览器 API，不等于已完成真实 Edge 扩展安装验收。

## 发布

- `feat/**` → Pull Request → `main` → Actions 的 **Release / Run workflow** → 自动 annotated Tag + GitHub Release。
- GitHub Actions 负责完整回归、一次打包及校验，Release 直接复用已通过 CI 的 ZIP；仍保留手动推送版本 Tag 的备用触发方式。
- 首次 Edge Add-ons Hidden 发布需要通过微软 Partner Center 手动提交；后续版本可进一步接入官方 Update API。
- 详见 [发布说明](docs/RELEASING.md) 与 [更新日志](CHANGELOG.md)。

## 其他说明

本仓库的源码可见性与 Edge 商店的 Public / Hidden 选项相互独立。品牌搜索引擎图标归各自权利人所有。Fluent 图标许可证详见 `LICENSE-FLUENT-ICONS.txt`；项目整体的代码许可方式尚未正式指定。

开发过程中的长期历史笔记保留在 [历史文档](docs/DEVELOPMENT_NOTES_LEGACY.md) 中。
