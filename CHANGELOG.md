# Changelog

## 0.1.4 — 2026-10-26 子会话自动 D 档，档位槽只读

修一个长期 bug：在子智能体（subagent）会话里点档位会报 `切档失败: session … is owned by subagent routing`。根因不在前端——宿主的 `CommandDirectory` 对子会话直接返回空，`remote.commands.execute` 的 `resolveAgent` 也不走 subagent delivery，所以子会话根本无法执行 `/gear`。按「子会话自动给 D 档、档位槽只读」重做：

| 文件 | 改动 |
|---|---|
| `index.js` | 投影升到 `stateVersion: 2`：`init(header, inheritedEventCount)` 按 `header.origin` 起始 P / D；状态增加 `subagent`、`inherited`；子会话跳过继承前缀、`brake` 强制 `false`；提交分支改用 `{ ...state }` 保留字段 |
| `index.js` | `set_gear`：子会话 `H` 直接抛错；升档不弹卡片、直接抛错；`/gear H` 在子会话里返回错误 |
| `index.js` | 注入提示词：子会话第 4 段换成只读说明，且不出现「随时可拉手刹」段 |
| `client.js` | `useSessions` 判子会话（列表 `origin` + `sessions.subagentAddress`），`locked` 后 `send` / `request` / 手刹 / 拖拽 / `Ctrl+Shift+H` 全部拦截，只弹说明 |
| `client.js` | 新增 `data-locked`、`.dshgear-tip-lock`、`notice.subagent` / `tip.subagent`（zh/en）；把 `session/agent-busy` + `subagent routing` 翻成人话 |
| `test/gear-projection.test.mjs` | 新增 12 项投影单测（`npm test`） |
| `docs/ARCHITECTURE.md` / `README.md` | 子会话语义、只读判据、坑位与验证步骤 |
| `package.json` | 0.1.4 + `scripts.test` |

行为矩阵：

| 会话 | 起始档 | 滑轨 | `set_gear` | `/gear` |
|---|---|---|---|---|
| 主会话 | P | 可切 | 原规则（升档弹卡片） | 原规则 |
| 普通 fork | 继承父档 | 可切 | 原规则 | 原规则 |
| 子智能体 | D（不继承） | 只读 | 可降档；H 与升档报错 | 宿主不可用；H 报错 |

子会话里模型自行降档后，滑轨显示当前档位（如 `M-`），仍只读。

> **为什么不给子会话 A**：`A` 要求 contract（目标、边界、预算、停止条件），子智能体通常只拿到一段任务简报，直接进 `A` 会先去问契约。`D` 在 scope 内静默做完即可。
>
> **为什么不是「继承父档」**：父会话在 `P` 时子智能体也要能干活，否则 delegation 没意义。
>
> **降档后的子会话无法自己升回去**：没有用户可批准。这是有意的——要更高自治，回到主会话再说。

## 0.1.3 — 2026-10-25 修冷启动丢档位列

0.1.2 在 npm 上这一版带着一个致命 bug：**第一次启动 DeepSeek Harness 时档位列不出现**，关掉重开一次才有。原因见下面 0.1.2 里的「同版修复」——显隐门的 `useEffect` 落在提前 `return null` 之后，冷启动首帧没有会话时少跑一个 hook，会话恢复后多跑一个，React 抛 #310，宿主把 `shell.overlay` 里的条目报废。

| 文件 | 改动 |
|---|---|
| `client.js` | `hidden` + 显隐 `useEffect` 上移到 `reveal` 之后、提前 `return null` 之前（1304 → 1311 行） |
| `docs/ARCHITECTURE.md` | 不变量第 8 条：hook 必须写在任何提前 `return` 之前 |
| `docs/ARCHITECTURE.md` | 坑位：槽位条目抛错只会被静默摘掉，控制台 `slot entry crashed in '<slot>'`，条目的 `active` 标记变 `false`，可用 `Slots` / `listSubTree` 直查 |

## 0.1.2 — 2026-10-24 滑轨只在对话界面出现

侧栏切到**插件 / 自动化任务 / 更多**（任何打开主面板的入口）时，滑轨整体隐藏；切回对话立刻出现，不跑过场。

| 文件 | 改动 |
|---|---|
| `client.js` | 新增判据：`ctx.get('layout').panelInfo` 的 `activePanelId !== null` 说明主区被别的面板占了，隐藏滑轨 |
| `client.js` | 隐藏用内联 `display: none`（`HIDDEN_STYLE`），瞬间生效；回到对话时重新 `reveal()`，不停在 5 秒静默的淡出态 |
| `README.md` / `docs/ARCHITECTURE.md` | 同步说明 |

判据**全程容错**：布局服务缺席、形状不对、读快照抛错，一律当作「在对话里」照常显示。显隐只会在读到明确的非 null 面板 id 时发生，判据出问题只会「该藏没藏」，不会把滑轨藏没。

> **轨迹视图没有纳入**：它是对话区内部的 tab（`conversation.view` 的兄弟视图），探针只能靠 DOM 锚点猜，实测不可靠。真有需要时再单独做，宁可先不藏。

### 同版修复：冷启动滑轨整场消失（React #310）

现象：第一次启动 DeepSeek Harness 时档位列不出现，关掉重开一次才有。

根因：显隐门的 `useEffect` 写在了组件末尾，落在 `mainId === undefined` 的提前 `return null` **之后**。冷启动首帧还没有会话 → 走 null 分支，这次少跑一个 hook；会话恢复后重新渲染 → 多跑一个 hook → React 抛 #310（`Rendered more hooks than during the previous render`）→ 宿主把整个槽位条目报废（`slot entry crashed in 'shell.overlay'`），本进程内不再挂载，只有重启才会重新注册。第二次启动时会话从缓存同步恢复，第一帧就带着 `mainId`，hook 序列恒定，所以不炸。

| 文件 | 改动 |
|---|---|
| `client.js` | `hidden` + 显隐 `useEffect` 上移到 `reveal` 之后、提前 `return null` 之前；现在最后一个 hook 在第 952 行、唯一的提前 return 在第 1059 行，hook 序列恒定 |
| `docs/ARCHITECTURE.md` | 新增不变量第 8 条（hook 必须写在提前 return 之前）+ 坑位「槽位条目抛错会被静默摘掉，看 `active` 标记」 |

## 0.1.1 — 2026-10-24 模型升档改成「先问用户」

`set_gear` 升档不再一律硬拒绝，改为用 `ctx.userQuestions` 弹一张卡片请用户裁决（与自带 `exit_plan_mode` 同一套机制）。

| 文件 | 改动 |
|---|---|
| `index.js` | 新增 `requestUpshift()`：`ask()` 一张 `id: 'gear-upshift'` 的选择卡，两个选项「允许升到 X」/「保持 Y」，模型给的理由进 `detail` |
| `index.js` | `set_gear`：升档三分支——批准返回新档位（投影照常提交）；拒绝/关卡片返回 `{gear: 原档, changed: false, declined: X}` 并附「不要重复申请」；没有回答者（子 agent、`CALLER_NOT_LIVE`/`DELEGATED_CALLER`）退回旧硬拒绝 |
| `index.js` | 手刹检查提到升档之前，手刹落下时不再弹卡片；`output.schema` 加可选 `declined`；`execute` 改 async |
| `index.js` | 提示词与工具描述同步：「升档会弹卡片请用户批准，被拒绝就保持原档位」 |
| `README.md` / `docs/ARCHITECTURE.md` | 同步描述与不变量第 4 条，架构文档新增「升档审批」小节 |

仓库内 `package.json` 版本号同步为 `0.1.1`。投影 `stateVersion` 不变（`gearMode` 形状没动）。

## 0.1.0 — 2026-10-24 首次公开发布准备

从「本地私有目录」变成「可分发插件」的一次性改造。**仓库外的改动也在下面，回滚照抄即可。**

### 仓库内（`G:\BinaryLife\dsh-gear-mode`）

| 文件 | 改动 |
|---|---|
| `package.json` | 包名 `@local/dsh-gear-mode` → `dsh-gear-mode`；删 `private: true`；版本 `1.0.0` → `0.1.0`；新增 `license: MIT`、`author`、`repository`、`bugs`、`homepage`、`keywords`、`engines.dsh: ">=0.2.1-rc.2 <0.3.0"`、`publishConfig.access: public` |
| `cordis.patch.yml` | `name` 同步为 `dsh-gear-mode` |
| `client.js` | `window.__ModuleLoader__.load({ id })` 由 `@local/dsh-gear-mode` → `dsh-gear-mode`（**最容易漏的一处**：漏了会「插件在，但左侧栏不渲染」） |
| `client.js` | 浅色主题玻璃底板/圆点/阴影：新增 `--dshgear-*` 变量，浅色用 `#b4b4b4` 圆点 + `rgba(0,0,0,3.5%)` 底板 + 双层阴影；深色用 `#4b4b4b` 圆点（`body[data-ds-dark-theme]` 覆盖） |
| `client.js` | `.dshgear-cn`（档位字母下方小字）背景改 `bg-layer-2`（浅色下为白底） |
| `assets/` | 新增 `gear-overview.png`、`gear-tooltip.png`、`gear-flyout.png`、`gear-brake.png`、`gear-resting.png`、`gear-demo.gif`；删除旧的 `preview*.png`、`overview.png` |
| `LICENSE` | 新增 MIT，`Copyright (c) 2026 JanrilW` |
| `.gitignore` | 新增 `node_modules/`、`*.log`、`.DS_Store`、`Thumbs.db` |
| 目录 | `G:\DOCUMENT\my\packages\dsh-gear-mode` → `G:\BinaryLife\dsh-gear-mode`（旧目录已删除） |

### 仓库外（profile 配置，**不在 git 里**）

`C:\Users\Mr.Ricecake\.dsh\profiles\desktop\package.json` 与 `profiles\web\package.json`，各两处：

```diff
   "dependencies": {
-    "@local/dsh-gear-mode": "link:G:/DOCUMENT/my/packages/dsh-gear-mode",
+    "dsh-gear-mode": "link:G:/BinaryLife/dsh-gear-mode",
   },
   "dsh": { "profile": { "bundles": [
-    "@local/dsh-gear-mode"
+    "dsh-gear-mode"
   ] } }
```

`pnpm-lock.yaml`（两个 profile 都有）：

```diff
-      '@local/dsh-gear-mode':
-        specifier: link:G:/DOCUMENT/my/packages/dsh-gear-mode
-        version: link:G:/DOCUMENT/my/packages/dsh-gear-mode
+      'dsh-gear-mode':
+        specifier: link:G:/BinaryLife/dsh-gear-mode
+        version: link:G:/BinaryLife/dsh-gear-mode
```

`node_modules` 里的软链（`pnpm install` 在桌面 profile 上被拒，见下，因此手工重建）：

```powershell
Remove-Item "<profile>\node_modules\@local\dsh-gear-mode" -Force -Recurse
New-Item -ItemType SymbolicLink -Path "<profile>\node_modules\dsh-gear-mode" -Target "G:\BinaryLife\dsh-gear-mode"
```

### 验证记录

- `dsh --profile web --dump-config` → `- id: gear-mode` / `name: dsh-gear-mode` ✅
- `dsh --profile desktop ...` → **被拒绝**：`profile "desktop" is managed exclusively by the Electron application`（桌面 profile 只能由 app 自己管，CLI 不碰）
- `web` profile 起服务并实际加载：`.dshgear-rail` 渲染成功，六个键齐全，无 boot error ✅

### 踩坑记录

1. `mv` 原目录被占用（Permission denied）→ 先 `cp -a`，等 app 释放后再删旧目录。
2. `dsh plugin --profile desktop install` → 拒绝（见上），且 `pnpm install` 会要求 purge `node_modules`（无 TTY 直接中止）→ 改为手工重建软链 + 手改 lock，避免整目录重装。
3. `client.js` 的 `__ModuleLoader__.load({ id })` 是**第五处**写死包名的地方；配错了症状是「配置里能看到 gear-mode，但页面什么都不渲染」。

### 回滚

把上面三张表的 diff 反向改回，重建 `node_modules\@local\dsh-gear-mode` 软链指向旧路径，重启 app。旧目录已删，需要先 `git` 或备份恢复。
