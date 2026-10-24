# Changelog

## 0.1.2 — 2026-10-24 滑轨只在对话界面出现

侧栏切到插件 / 自动化任务 / 更多，或对话区切到轨迹等平级视图时，滑轨整体隐藏；切回对话立刻出现，不跑过场。

| 文件 | 改动 |
|---|---|
| `client.js` | 新增主面板判据：`ctx.get('layout').panelInfo` 的 `activePanelId !== null` 说明主区被别的面板占了 |
| `client.js` | 新增视图探针：`MutationObserver` + rAF 检查对话视图区里有没有 `[data-slot="conversation.trajectory.images"]`（轨迹视图的锚点） |
| `client.js` | 隐藏用内联 `display: none`（`HIDDEN_STYLE`），瞬间生效；显隐变化时重新 `reveal()`，不留下淡出状态 |
| `README.md` / `docs/ARCHITECTURE.md` | 同步说明 |

判据是**正向**的：认不出当前视图就按对话处理，宁可多显示也不误藏——新会话的 hero 屏没有消息列表，靠这条才不会把滑轨藏掉。

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
