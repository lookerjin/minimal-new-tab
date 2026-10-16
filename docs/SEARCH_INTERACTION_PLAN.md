# 搜索框交互方案

日期：2026-10-16。状态：方案已确认并实施。验证结果见 [验收记录](../design-qa.md)。

主要操作链为输入 → Tab / Shift+Tab → Enter，保留 ↑↓ 等价操作。继续使用现有引擎入口、书签补全、站点发现和 @ 快捷入口，复用项目现有控件与动画。

## 行为契约

1. 普通词默认搜索，明确网址默认访问；建议首行显示默认动作和默认选中态。首按 Tab 进入第一条替代建议，反向和循环可回默认动作。只有默认动作时不拦截 Tab。
2. Tab / Shift+Tab 和 ↑↓ 只改变高亮，不替换输入、不移动焦点、不进入站内搜索。Enter 执行当前动作，鼠标点击建议或提交按钮使用相同规则。
3. 搜索词行提交搜索，书签 / 网址行访问网址，站点入口行切换搜索范围。站点入口明确显示“切换到 GitHub 搜索”，避免把切换与提交混为一谈。
4. 高亮后继续输入、删除、粘贴或点击输入框，取消候选并基于原输入编辑；已有站点范围保留。晚到结果不改变已选目标。失焦关闭建议，保留文字与范围。
5. 灰字仅预览首条可补全的实际建议，默认动作行不参与。→ 接受补全；接受书签标题或 URL 后保留书签目的地，后续编辑清除旧目的地。Tab 选择后可直接 Enter，无需先接受灰字。
6. 普通输入完整站名时提供一个明确的切换候选；@ 显示常用站点并可继续筛选，`@github ` 和带查询粘贴继续可用。切换后输入焦点保留，空查询不提交。
7. 左侧主按钮在普通和站内状态都打开搜索目标菜单，可用 Tab / Shift+Tab 和 Enter 选择。切回普通引擎保留关键词；站点标签 × 直接退出。临时站点不更改持久化的默认引擎。
8. Esc 先关闭建议、高亮和灰字，再按一次才退出站内范围，保留关键词。空输入 Backspace 和 × 提供直接退出路径。建议关闭后 Tab 恢复页面焦点导航。
9. 输入法组合阶段不显示候选、不轮换、不提交；懒加载控制器继承已有组合状态。首次快速 Tab 保留意图，等待本地候选最多 300ms，不等在线联想。连续 Tab 依序处理；编辑、点击输入、失焦、Esc、范围切换和提交使旧等待失效。
10. 提示以“Tab 切换 · Enter 确认 · Esc 收起”为主；书签显示“Enter 打开”，站点入口显示“Enter 切换”。→ 只在可接受灰字时提示。站内建议使用独立历史及同域书签，站内词不发通用联想服务。

## 完整操作链

| 目标 | 操作 | 验收重点 |
| --- | --- | --- |
| 直接搜索 | 输入 golang → Enter | 默认行为明确，晚到候选不会变成书签导航。 |
| 书签或建议 | 输入 git → Tab 轮换 → Enter | 焦点不离输入框，无需先补全，目的地可预测。 |
| 站内搜索 | 输入 github → Tab 选切换入口 → Enter → 输入 golang → Enter | 切换与提交文案区分，同一输入框完成；也可使用 @github golang。 |
| 返回编辑 | Tab 选中 → 继续打字，或 Esc 收起 | 保留原输入；第一次 Esc 保留站点；建议关闭后可 Tab 离开。 |

## 设计参考与取舍

参考 [Chrome Tab-to-search](https://support.google.com/chrome/answer/157179?hl=en)、[Firefox Unified Search](https://support.mozilla.org/en-US/kb/search-firefox-address-bar)、[Safari Quick Website Search](https://support.apple.com/en-qa/guide/safari/sfria1042d31/mac) 和 [DuckDuckGo Bangs](https://duckduckgo.com/duckduckgo-help-pages/features/bangs) 的目标可见、输入捷径和统一入口。

本项目 Tab 已用于轮换候选，因此不再叠加 Tab 直接进入站点；切换始终由 Enter 确认。保留现有范围标签及引擎入口，减少用户重新学习的成本。规则复用 Kagi Bangs 数据并后台更新，不逐站维护映射、不调用 DuckDuckGo 跳转服务，也不读取浏览器原生规则库。

## Ctrl+T 焦点：独立待办

[Chrome 官方说明](https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages)规定新标签页首先将键盘焦点交给地址栏。页面的 `autofocus` / `input.focus()` 不能作为可靠接管保证，DOM 焦点也不等于浏览器内容区获得键盘输入。

[Chromium Extensions 社区讨论](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/abJf8SLWMSM)提出导航到普通扩展 URL 或替换标签的绕行，但可能显示扩展 URL 或闪动；讨论较旧，未在本项目真实 Chrome / Edge 上验证。另可通过 [commands API](https://developer.chrome.com/docs/extensions/reference/api/commands)探索独立快捷键，不能假定可覆盖浏览器保留键位。

本次未加入重定向、循环抢焦点或创建并关闭标签的逻辑。未来实验需实际操作 Ctrl+T、连续新建、Ctrl+L、刷新、恢复标签和禁用扩展，检查丢字、URL 显示、闪动及多余标签；其结果不阻塞当前页内搜索交互。
