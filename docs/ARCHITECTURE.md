# 架构

给后续改这个插件的人看的。读完应该能回答三个问题：**状态存在哪、谁在改它、我该动哪个文件。**

## 一分钟看懂

```
                    ┌──────────────── 浏览器（client.js）────────────────┐
用户点击/拖拽/按键 ──▶ GearRail 组件 ──session.command('/gear NT')──┐      │
                    └───────────────────────────────────────────────┼──────┘
                                                                    ▼
                    ┌──────────────── 宿主（index.js）──────────────┴──────┐
                    │ /gear 命令 handler                                  │
                    │      ↓ command/run, command/done                    │
                    │ gear 会话投影  { gear, brake, running }  ← 唯一真源  │
                    │      ├── systemPrompt.context('gear:mode') → 模型    │
                    │      ├── tools.guard()  → 手刹时拒绝全部工具调用      │
                    │      └── wire.view → 前端 faceOf('gear') 订阅         │
                    └─────────────────────────────────────────────────────┘
```

一句话：**状态只有一个真源（宿主侧的会话投影），客户端只负责显示与发命令。**

## 文件地图

| 文件 | 作用 | 改它的频率 |
|---|---|---|
| `index.js` | Host 半边：投影、命令、工具、守卫、提示词装配 | 改机制时 |
| `client.js` | Client 半边：bundle 装载、滑轨 UI、手势、说明栏、CSS | 改界面时 |
| `prompts.md` | 注入给模型的正文（可按档位覆盖，**每请求重读**） | 改文案时，最高频 |
| `locale/zh.json` `locale/en.json` | 插件在「插件市场/管理器」里的标题与描述 | 很少 |
| `cordis.patch.yml` | 挂载声明：`insert` 一个 `gear-mode` 条目 | 几乎不动 |
| `package.json` | `dsh.bundle` / `dsh.client` / `files` / `engines` | 改发布面时 |
| `screenshots.json` | 市场详情页要展示的截图（相对路径，1–8 张） | 换图时 |
| `assets/` | README 与市场用的图 | 换图时 |
| `docs/ARCHITECTURE.md` | 本文 | 改架构时顺手更新 |

> `client.js` 里的中文字典（`ZH`/`EN`）只管**滑轨 UI 文案**（键名、说明、手刹提示），和 `locale/*.json` 的 meta 不是一回事。

## Host 半边（`index.js`，518 行）

### 数据模型

```js
GEARS = ['P','R','NT','NC','NE','M-','M+','D','A']   // 自治程度从低到高
RANK  = { P:0, R:0, NT:0, NC:0, NE:0, 'M-':1, 'M+':2, D:3, A:4 }
```

`RANK` 是升降档分野的唯一判据：`set_gear` 在 `RANK[目标] <= RANK[当前]` 时直接放行；`RANK[目标] > RANK[当前]` 时走 `requestUpshift` 弹卡片请用户裁决（批准后才返回新档位，投影照常提交）。P/R/N 三组子档同为 0 级——它们都不推进执行，只是说话方式不同，所以互切不算升档。

### 升档审批（`requestUpshift`）

仿自带 `exit_plan_mode` 的做法，用 `ctx.get('userQuestions')` 的 `ask()` 在对话流里弹一张选择卡（`id: 'gear-upshift'`，两个选项：「允许升到 X」/「保持 Y」，模型给的理由进 `detail`）。三种结局：

| 结局 | 触发 | 工具返回 | 提示词 |
|---|---|---|---|
| `approved` | 用户点了「允许升到 X」 | `{gear: X, changed: true}` | 下一步换成新档 |
| `declined` | 点了「保持 Y」/ 关闭卡片 / 本轮中断 | `{gear: 原档, changed: false, declined: X}` | 不变，并告诉模型"不要重复申请" |
| `unavailable` | 没有 `userQuestions` 服务，或 `CALLER_NOT_LIVE` / `DELEGATED_CALLER`（子 agent、无 UI 的 profile） | 抛错（退回旧的硬拒绝） | 不变 |

投影侧不看 `declined`：`gearMode` 里档位没变，状态就不动。所以"被拒绝"不产生任何持久化痕迹，只体现在工具返回里。

### 投影状态机

状态形状 `{ gear, brake, running }`，`init` 是 `{ gear:'P', brake:false, running:null }`。

| 事件 | 条件 | 结果 |
|---|---|---|
| `command/run` | `data.name === 'gear'` 且参数可解析 | 挂起 `running = { commandId, next }`，**状态不动** |
| `command/done` | `commandId` 对得上且 `kind === 'success'` | 提交 `running.next`，清 `running` |
| `command/done` | `commandId` 对得上但失败 | 只清 `running`，状态不动 |
| `tool/result` | `meta.gearMode` 是合法 `{gear,brake}` | 直接采纳（`set_gear` 的自述回执） |

**为什么要有 `running`**：`command/run` 先到、handler 在中间执行、`command/done` 后到。handler 读状态时仍应看到旧档位，`done` 之后才提交——切档因此是原子的，不会出现"命令执行到一半状态就变了"。

投影**不新增会话事件类型**，只折叠既有事件，所以 resume / fork 后自动还原，不需要迁移。

`wire` 只暴露 `{ gear, brake }`（不含 `running`）；`viewOf` 用 `WeakMap` 按 state 对象缓存，未变化时引用稳定，避免前端被无谓唤醒。

### 四个出口

| 出口 | 代码 | 作用 |
|---|---|---|
| 提示词 | `systemPrompt.context({ name:'gear:mode', order: getContextOrder('APPROVAL_POLICY') })` | 与 `sandbox:policy` 同机制，每条请求重读 |
| 用户命令 | `commands.register({ name:'gear' })` | `/gear P` / `/gear H` / `/gear resume` / `/gear`（报告） |
| 模型工具 | `tools.register({ name:'set_gear' })` | 只降档 + 只拉手刹；`presentationMeta` 回传 `gearMode` 给投影 |
| 手刹守卫 | `tools.guard(exec)` | `brake === true` 时返回拒绝理由，拦下**全部**工具调用 |

注入文本由 `text(context)` 现场拼装，固定六段（后两段按状态出现）：

```
HARNESS · 实时档位（…）                      ← 标题
状态：mode=P；handbrake=off；scope=sandbox:…  ← 实时状态
P R N M D A …                              ← ORDER（主列顺序与读档纪律）
档位工具：set_gear 只允许向上调整…             ← 工具规则
【H 手刹…】…                                ← 仅 brake=true 时
【当前档位 P｜只读规划】…                      ← 该档正文
【H 手刹】随时可拉…                           ← 仅 brake=false 时
```

`scope` 来自 `ctx.get('sandboxPolicy').resolve({ session })`，拿不到就写"宿主未暴露沙箱范围"——**不假装知道**。

### 提示词外置层（`prompts.md`）

`loadPrompts()` 每次调用都读文件，按 `"路径\0全文"` 做 stamp 判等；改一个字才重解析，所以"保存即生效"且几乎没有 IO 代价。

优先级：`DSH_GEAR_PROMPTS` → `prompts.local.md` → `prompts.md` → 代码内置 `GEAR_TEXT`。逐节回退：某节缺失或为空 → 用内置那句。

## Client 半边（`client.js`，1311 行）

### Bundle 契约

```js
window.__ModuleLoader__.load({
  id: 'dsh-gear-mode',        // ← 必须等于 package.json 的 name
  factory(require) { … return { inject: ['slots','sessions','locale'], apply(ctx) { … } } },
});
```

`id` 与包名不一致的症状最迷惑：`--dump-config` 里一切正常，页面却什么都不渲染，控制台只说 `loaded without registering "…" via __ModuleLoader__.load`。**改包名时这里必须同步。**

### apply 里做的三件事

1. `locale.register(NS, { zh: ZH, en: EN })` —— 滑轨 UI 文案
2. `locale.bind(NS)` 得到 `t()`
3. `slots.inject('shell.overlay', () => slots.register({ name:'shell.overlay', id:'gear-mode', order:20, locale:NS, label }, Bound))`

挂在 `shell.overlay` 而不是布局槽位，是为了「任意页面都在、不占布局、不遮侧栏」；代价是位置得自己量（见下）。

### 读：不缓存状态

```
sessions.binding(mainId)?.session.projections.faceOf('gear')
   → face.subscribe / face.getSnapshot
   → React.useSyncExternalStore(...)
```

组件里没有"本地档位"变量。**所有显示都从宿主快照推导**，所以刷新、多标签、模型自己 `set_gear`，界面永远一致。

### 写：只发命令

```js
session.command('/gear NT')   // 切档
session.command('/gear H')    // 落手刹
session.command('/gear P')    // 长按 H 750ms 解除并回 P
```

失败时把原因写进 `notice` 显示出来，**不静默吞**。

### 组件状态

| state / ref | 用途 |
|---|---|
| `settled` | 切档动画是否结束（决定中文小标签何时出现） |
| `dragging` / `preview` | 拖拽扫档：手指下的临时高亮，松手才发命令 |
| `armed` / `holding` | 手刹二次确认的窗口期 / 长按解锁进度 |
| `tip` / `tipHeld` | 说明栏当前档位 / 离场后留住 320ms 供淡出 |
| `resting` | 5 秒静默后只留当前档 |
| `inside` | 指针是否在控件内（决定是否唤醒） |
| `anchorLeft` | 量出来的左偏移（像素由 DOM 决定，不写死） |
| `notice` | 命令失败的 toast |
| `gesture` `suppress` `*Timer` `spotRef` | 手势与计时器句柄，避免重渲染丢状态 |

### 交互节奏

| 行为 | 规则 |
|---|---|
| 切档 | 点字母即发命令；N/M 是组入口，点了落到 `DEFAULT_SUB`（NT / M-） |
| 拖拽 | 沿滑轨上下扫档；向右越过边界进入当前组的子档列 |
| 说明栏 | 悬停出；离场留 `TIP_OUT_MS`(320ms) 淡出；位置随档位平滑跟随 |
| 手刹落下 | 两次触发（点击两次 / `Ctrl+Shift+H` 两次），窗口 `ARM_MS`(2400ms) |
| 手刹解除 | 按住 H `HOLD_MS`(750ms)，进度环画满后发 `/gear P` |
| 静默 | 切档或指针离开 `REST_MS`(5000ms) 后只剩当前档；碰回当前档唤醒 |

### 锚点测量

```js
const layer = el.closest('[data-shell-overlay]') ?? el.offsetParent;
const main  = frame.querySelector('[data-slot="main"]');
left = Math.round(col.getBoundingClientRect().left - layer.getBoundingClientRect().left + GAP);
```

只认外壳自己的稳定标记（`[data-shell-overlay]`、`[data-slot="main"]`），**不碰带哈希的类名、不写死像素**。`ResizeObserver` + `MutationObserver` + `window.resize` 三路跟进侧栏拖拽/折叠、右栏开合。

### 显隐门（只在对话界面出现）

滑轨挂在 `shell.overlay`，这一层永远在页面上，所以「只在对话里出现」要靠组件自己判断。判据只有一个：

```js
ctx.get('layout').panelInfo.getSnapshot().activePanelId !== null   // 主面板占着主区
```

`ctx.layout` 是外壳公开的面板服务（官方的 plugin-manager、workspace 也这么读），`activePanelId` 为 `null` 就是对话本身，非 `null` 就是插件 / 自动化任务 / 更多这类主面板。订阅用 `panelInfo.subscribe(read)`，卸载时退订。

判据**全程容错**——这也是被实测教训定出来的：

- 服务缺席、`getSnapshot`/`subscribe` 形状不对、读快照抛错 → 一律当作「在对话里」，滑轨照常显示。
- 只用 `useState` + `useEffect` 写入显隐，**不在渲染期调用任何未知服务**：渲染期抛错会连带整块 slot 一起挂掉，用户看到的就是「滑轨没了」。
- 新会话的 hero 屏、无消息会话都走同一条路径，不会被误藏。

隐藏用内联 `display: none`（`HIDDEN_STYLE`，模块级常量保持引用稳定），不跑过场；`hidden` 变回 `false` 时调一次 `reveal()`，避免回来时还停在 5 秒静默的淡出态。`display: none` 不影响锚点测量——量的是 `[data-slot="main"]`，不是滑轨自己。

> **轨迹视图没有纳入**：它是对话区内部的 tab（`conversation.view` 的兄弟视图），只能靠 DOM 锚点猜，实测有假阳性（锚点在对话页也在）。等真有需求时再做，宁可先不藏。

### CSS 分层

1. **主题变量**：`.dshgear-root` 上定义 `--dshgear-dot` / `--dshgear-pane-bg` / `--dshgear-pane-ring` / `--dshgear-pane-shadow` / `--dshgear-key-raised`；`body[data-ds-dark-theme] .dshgear-root` 覆盖成深色值。**这是浅色/深色唯一开关**，别再散写 `rgba(255,255,255,…)`。
2. **结构**：rail（玻璃底板）→ dots（点阵，用 `mask-image` 围绕 `--dshgear-spot` 聚焦）→ thumb（滑动高亮）→ key（字母）→ cn（中文小标签）→ flyout（子档列，`left:46px` 紧贴）→ sub → brake。
3. **状态**：全部走 `data-*`（`data-active` `data-preview` `data-open` `data-armed` `data-braked` `data-resting` `data-settled` `data-dragging`），JS 只改属性不拼样式。

几何常量在文件顶部（`RAIL_H=556` `KEY_H=88` `SUB_H=38` `THUMB_W/H=36/44`…），CSS 里的尺寸由模板字符串插入，改一处即可。

## 一次切档的完整时序

1. 用户点 `N`（组入口）→ 组件把 `preview` 指到 `NT`，发 `/gear NT`
2. 宿主 `commands` handler 读当前状态，返回 `{ kind:'success', text:'P｜只读规划 → NT｜纯聊天' }`
3. 投影收到 `command/run`：挂起 `running.next = { gear:'NT', brake:false }`
4. `command/done` 成功 → 提交状态，`running` 清空
5. `wire.view` 生成新 `{gear,brake}`，经 `face` 广播
6. 前端 `useSyncExternalStore` 拿到新快照 → 高亮、中文标签、说明栏全部跟着变
7. 下一次模型请求：`systemPrompt.context` 重新拼装，注入新的档位正文
8. 若手刹落下：`tools.guard` 从下一次工具调用起返回拒绝理由

## 不变量（改动时别破坏）

1. **状态只有一个真源**：宿主投影。客户端不许自己存档位、不许本地折叠命令。
2. **客户端只能通过 `/gear` 写**，不直接改投影。
3. **`__ModuleLoader__.load({ id })` 的 id === package name**。
4. **升档要过人这一关**：`/gear` 或滑轨直接切；`set_gear` 升档必须走 `requestUpshift` 拿到用户批准，没有回答者就退回硬拒绝。
5. **手刹只能由用户解除**：`set_gear` 拒绝解除，唯一路径是 `/gear resume`（或 UI 长按 → `/gear P`）。
6. **`wire` 形状改动必须递增 `stateVersion`**，否则老会话的投影状态会被新代码误读。
7. **`viewOf` 要保持引用稳定**，否则每次事件都会引起一次前端重渲染。
8. **组件的 hook 必须全部写在任何提前 `return` 之前**。`mainId === undefined` 时会提前 `return null`，hook 排在它后面就会「这次少跑、下次多跑」，React 抛 #310，宿主把整个槽位条目报废（`slot entry crashed in 'shell.overlay'`）——表现为档位列整场消失，只有重启才会重新注册。

## 改哪里（速查）

| 想改 | 动这些 |
|---|---|
| 某档的措辞 | `prompts.md` 对应 `## 键`（不重启、不刷新即生效） |
| 内置兜底文案 | `index.js` 的 `GEAR_TEXT` / `BRAKE_TEXT` / `ORDER_TEXT` |
| 新增一个档位 | `index.js`：`GEARS` `RANK` `GEAR_NAME` `GEAR_TEXT`；`client.js`：`MAIN` `GROUPS` `DEFAULT_SUB` `PARENT` `ALL` + `ZH`/`EN` 里的 `gear.* name.* desc.*`；`prompts.md` 加一节 |
| 命令别名 | `index.js` 的 `ALIASES` |
| 滑轨尺寸/节奏 | `client.js` 顶部常量 + CSS 里的模板插入 |
| 浅色/深色观感 | `.dshgear-root` 与 `body[data-ds-dark-theme] .dshgear-root` 两组变量 |
| 手刹规则 | `client.js`：`pressBrake` / `stopHold`、`ARM_MS` / `HOLD_MS`；宿主：`tools.guard` |
| 工具描述 | `index.js` 的 `tools.register({ description, parameters })` |
| 挂在别的位置 | 测量 effect（`[data-slot="main"]`）+ `GAP` |
| 市场展示图 | `screenshots.json` + `assets/` |

## 坑位清单

- **包名有 5 处**：`package.json`、`cordis.patch.yml`、profile 的 `dependencies`、profile 的 `bundles`、**`client.js` 的 `id`**。前四个漏了报错明显，第五个只表现为"页面空白"。
- **`dsh plugin --profile desktop …` 会被拒**（`managed exclusively by the Electron application`）；桌面 profile 的 `node_modules` 只能手工维护，且 `pnpm install` 在非 TTY 下会要求 purge 整个 `node_modules`。
- **`prompts.md` 必须留在 `files` 里**，否则 npm 安装后读不到，静默回落到内置文案。
- **槽位条目抛错会被静默摘掉**：DSH 的错误边界只把该条目换成崩溃占位，控制台是 `slot entry crashed in '<slot>'`，页面其他部分照常；条目的 `active` 标记会从 `true` 变 `false`（`cordis_inspect_query` 的 `client` / `Slots` / `listSubTree` 能直接看到）。改 `client.js` 后如果滑轨没出现，先查这个标记，别怀疑样式。
- **`raw.githubusercontent.com` 有 CDN 延迟**：刚推的 README/图，raw 链接可能还是旧版；仓库页面与 API 是新的。
- **CRLF**：Windows 上 git 会提示 `LF will be replaced by CRLF`，属正常，不要为此加 `.gitattributes` 强行改，除非要跑只认 LF 的 lint。
- **`client.js` 是单文件产出的**：宿主一个包只发一个 bundle，`client.<name>.js` 这类 chunk 虽然存在，但版本号取的是 `client.js` 的哈希，改 CSS 不同步改它会被 `immutable` 缓存钉死——所以样式只能留在同一个文件里。

## 本地验证

```bash
# 1. 语法
node --check index.js && node --check client.js

# 2. 装配（CLI profile 才能 dump）
dsh --profile web --dump-config | grep -A2 gear-mode

# 3. 真跑（另开一个 profile，别动正在用的）
dsh --profile web --port 5999 --no-open

# 4. 打包内容
npm pack --dry-run
```

桌面 profile 不受 CLI 管，验证只能靠"重启后看栏在不在"。
