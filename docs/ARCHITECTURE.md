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
                    │ gear 会话投影 { gear, brake, running, subagent } ← 真源 │
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

## Host 半边（`index.js`，709 行）

### 数据模型

```js
GEARS = ['P','R','NT','NC','NE','M-','M+','D','A']   // 自治程度从低到高
RANK  = { P:0, R:0, NT:0, NC:0, NE:0, 'M-':1, 'M+':2, D:3, A:4 }
SUBAGENT_GEAR = 'D'                                  // 子会话固定起始档
```

`SUBAGENT_GEAR` 选 `D` 而不是 `A`：`A` 要求 contract（目标、边界、预算、停止条件），子智能体通常只拿到一段任务简报，直接进 `A` 会先去问契约；`D` 在 scope 内静默做完即可。子会话也**不继承**父会话档位——父会话在 `P`，子智能体仍要从 `D` 起步，否则 delegation 就没意义了。

`RANK` 是升降档分野的唯一判据：`set_gear` 在 `RANK[目标] <= RANK[当前]` 时直接放行；`RANK[目标] > RANK[当前]` 时走 `requestUpshift` 弹卡片请用户裁决（批准后才返回新档位，投影照常提交）。P/R/N 三组子档同为 0 级——它们都不推进执行，只是说话方式不同，所以互切不算升档。

### 升档审批（`requestUpshift`）

仿自带 `exit_plan_mode` 的做法，用 `ctx.get('userQuestions')` 的 `ask()` 在对话流里弹一张选择卡（`id: 'gear-upshift'`，两个选项：「允许升到 X」/「保持 Y」，模型给的理由进 `detail`）。三种结局：

| 结局 | 触发 | 工具返回 | 提示词 |
|---|---|---|---|
| `approved` | 用户点了「允许升到 X」 | `{gear: X, changed: true}` | 下一步换成新档 |
| `declined` | 点了「保持 Y」/ 关闭卡片 / 本轮中断 | `{gear: 原档, changed: false, declined: X}` | 不变，并告诉模型"不要重复申请" |
| `unavailable` | 没有 `userQuestions` 服务，或 `CALLER_NOT_LIVE` / `DELEGATED_CALLER`（子 agent、无 UI 的 profile） | 抛错（退回旧的硬拒绝） | 不变 |

投影侧不看 `declined`：`gearMode` 里档位没变，状态就不动。所以"被拒绝"不产生任何持久化痕迹，只体现在工具返回里。

### 子会话（子智能体）

判据只有一个：`session.header.origin === 'subagent'`（`isSubagentSession()`）。子会话的四条规矩：

| 规矩 | 实现 |
|---|---|
| 起始 `D`，不继承父档 | `init(header, inheritedEventCount)` 按 `header.origin` 选 `SUBAGENT_GEAR` 或 `'P'` |
| 不折叠继承前缀 | `init` 把 `inheritedEventCount` 记进 `state.inherited`；`apply` 对 `event.seq < state.inherited` 直接返回原状态 |
| 永远不落手刹 | `clampBrake()`：`command/done` 与 `tool/result` 两条提交路径都把 `brake` 强制成 `false` |
| 不能升档、不能拉 H | `set_gear` 里 `H` 直接抛错；`RANK[目标] > RANK[当前]` 时不弹卡片、直接抛错；`/gear H` 返回错误文案 |

为什么必须跳过继承前缀：子会话折叠自家日志时会先扫到从父会话复制过来的事件。不跳过的话，父会话上一轮的 `A` 甚至落下的 `H` 会原样压到子会话头上——后者更致命：子会话没有用户可以解除手刹，`tools.guard` 会把它永久锁死。

为什么不弹升档卡片：`requestUpshift` 的 `userQuestions.ask({ agent })` 在子会话里会以 `DELEGATED_CALLER` / `CALLER_NOT_LIVE` 失败，原来的写法是"等不到人再硬拒绝"；现在提前短路，避免请求挂到主会话的用户面前。

`stateVersion: 4` 让旧检查点失效并整体重折（0.2.0 开发期 3 号形状短暂带过 `upshifts` 字段，升版本强制弃掉）；`stateSchema` 对 `subagent`/`inherited`/`briefed` 只做可选校验，所以内存里残留的旧状态也不会炸。

### 投影状态机

状态形状 `{ gear, brake, running, subagent, inherited, briefed }`；`init(header, inheritedEventCount)` 是主会话 `{ gear:'P', brake:false, running:null, subagent:false, inherited:0, briefed:false }`，子会话 `{ gear:'D', … , subagent:true, inherited }`。`briefed` 记录完整介绍是否已注入。

| 事件 | 条件 | 结果 |
|---|---|---|
| 任意 | `state.subagent === true` 且 `event.seq < state.inherited` | 原状态；继承前缀不改子会话档位 |
| `user/message` | `data.source.kind === 'runtime-context'` | `briefed = true`（完整介绍已随首条请求注入过） |
| `tool/result` / `tool/ptc-dispatch` | `meta.gearMode` 是合法 `{gear,brake}`（PTC 分支还要求 `name === 'set_gear'`） | 直接采纳，提交档位。**PTC 会话里模型工具经 run_code 嵌套派发，没有 tool/call / tool/result 事件**，`meta.gearMode` 挂在 `tool/ptc-dispatch` 上——漏折它滑轨就不跟随（0.1.x 的滑轨不跟随 bug 正是这一条） |
| `command/run` | `data.name === 'gear'` 且参数可解析 | 挂起 `running = { commandId, next }`，**状态不动** |
| `command/done` | `commandId` 对得上且 `kind === 'success'` | 提交 `running.next`（子会话的 `brake` 被钳成 `false`），清 `running` |
| `command/done` | `commandId` 对得上但失败 | 只清 `running`，状态不动 |
| `tool/result` | `meta.gearMode` 是合法 `{gear,brake}` | 直接采纳（`set_gear` 的自述回执），子会话钳掉 `brake` |

提交分支全部用 `{ ...state, … }` 展开：`subagent` / `inherited` 必须原样带过去，否则下一次 `apply` 就丢了判据。

**为什么要有 `running`**：`command/run` 先到、handler 在中间执行、`command/done` 后到。handler 读状态时仍应看到旧档位，`done` 之后才提交——切档因此是原子的，不会出现"命令执行到一半状态就变了"。

投影**不新增会话事件类型**，只折叠既有事件，所以 resume / fork 后自动还原，不需要迁移。

`wire` 只暴露 `{ gear, brake }`（不含 `running` / `subagent` / `inherited`）；子会话的只读判据走会话元数据（列表行 `origin` 或 `sessions.subagentAddress()`），不塞进 wire。`viewOf` 用 `WeakMap` 按 state 对象缓存，未变化时引用稳定，避免前端被无谓唤醒。

### 五个出口

| 出口 | 代码 | 作用 |
|---|---|---|
| 提示词 | `systemPrompt.context({ name:'gear:mode', order: getContextOrder('APPROVAL_POLICY') })` | 首条请求注入完整介绍（一次）；之后每条请求只带一行实时状态 |
| 换挡通知 | `agent.steer` / `agent.inject` | 换挡真正生效时注入一次【档位切换】通知（从什么档位换到什么档位 + 新档位行为要求）；回合中用 `steer`，空闲用 `inject` 只入队不唤醒 |
| 用户命令 | `commands.register({ name:'gear' })` | `/gear P` / `/gear H` / `/gear resume` / `/gear`（报告）；子会话里 `/gear H` 报错 |
| 模型工具 | `tools.register({ name:'set_gear' })` | 降档直接生效；升档弹卡片；H 直接落手刹（子会话拒绝 H 与升档）；`presentationMeta` 回传 `gearMode` 给投影 |
| 手刹守卫 | `tools.guard(exec)` | `brake === true` 时返回拒绝理由，拦下**全部**工具调用 |

注入文本由 `text(context)` 按会话阶段分两种形态：

**首条请求（briefed=false）——完整介绍，只出现一次**（子会话多一段只读说明）：

```
HARNESS · 行动档位 · 完整介绍（…）            ← 标题
<INTRO 正文：档位列 / 换挡规则 / 手刹>          ← INTRO（可被 prompts.md 的 ## INTRO 覆盖）
【子会话】…                                ← 仅子会话
【当前档位 P｜只读规划】…                      ← 该档正文
```

**之后每条请求（briefed=true）——一行实时状态：**

```
HARNESS · 档位：P（只读规划）；handbrake=off；scope=sandbox:…；行为要求以最新一条【档位切换】通知为准
【H 手刹｜已落下】…                          ← 仅 brake=true 时
```

`briefed` 是投影状态：折叠到第一条 `source.kind === 'runtime-context'` 的用户消息（宿主把运行时上下文写进会话日志的那条）时置 true，之后不再注入介绍。resume / fork 重放日志自动恢复；子会话跳过继承前缀，第一条请求重新拿一份完整介绍；compaction 若折叠掉旧上下文消息，重折后介绍会自然补上。

每次换挡还会有一条**换挡通知**（不经 `systemPrompt.context`，走 `agent.steer/inject`）：

```
【档位切换】P（只读规划）→ D（自动执行）
【当前档位 D｜自动执行】<该档正文>
```

手刹的拉起/放下走同一通道（正文换成 BRAKE）。通知由 `gearNoticeText()` 拼装、`deliverGearNotice()` 投递；回合进行中 `steer`（最近一步送达），空闲 `inject`（只入队不唤醒）。

`scope` 来自 `ctx.get('sandboxPolicy').resolve({ session })`，拿不到就写"宿主未暴露沙箱范围"——**不假装知道**。

### 提示词外置层（`prompts.md`）

`loadPrompts()` 每次调用都读文件，按 `"路径\0全文"` 做 stamp 判等；改一个字才重解析，所以"保存即生效"且几乎没有 IO 代价。

优先级：`DSH_GEAR_PROMPTS` → `prompts.local.md` → `prompts.md` → 代码内置 `INTRO_TEXT` / `GEAR_TEXT` / `BRAKE_TEXT`。逐节回退：某节缺失或为空 → 用内置那句。`INTRO` 段只随首条请求注入一次，各档段随换挡通知注入；键 `ORDER` 已由 `INTRO` 取代（外部旧文件里的 `## ORDER` 会被忽略）。

## Client 半边（`client.js`，1392 行）

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

### 只读判据（子会话）

```js
const subagent = useSessions((state) => {
  if (mainId === undefined) return false;
  if (state.byId[mainId]?.origin === 'subagent') return true;      // 列表行
  return sessions.subagentAddress(mainId) !== undefined;           // 持久化子视图兜底
});
const locked = subagent;
```

两条证据互为兜底：列表行直接带 `origin: "subagent"`；还没进列表的持久化子视图，`sessions.subagentAddress(id)`（宿主 facade 上的公开方法）也能靠 `subagentCatalog` / summary 反推父会话。**不要**用 `session.command` 的报错来反推——那是最后一道兜底（`send` 里把 `session/agent-busy` + `subagent routing` 翻成同一句提示）。

`locked` 之后：`send` / `request` / `engageBrake` / `armBrake` / `startHold` / `onPointerDown` / `Ctrl+Shift+H` 全部在发命令前返回，只弹 `notice.subagent`。渲染侧加 `data-locked`，悬停说明栏追加一行 `tip.subagent`。

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
| `notice` | 命令失败的 toast（子会话只读时也走这里） |
| `gesture` `suppress` `*Timer` `spotRef` | 手势与计时器句柄，避免重渲染丢状态 |
| `subagent` / `locked` | 子会话只读判据（`useSessions` 派生，不落在本地 state 里） |

### 交互节奏

| 行为 | 规则 |
|---|---|
| 切档 | 点字母即发命令；N/M 是组入口，点了落到 `DEFAULT_SUB`（NT / M-） |
| 拖拽 | 沿滑轨上下扫档；向右越过边界进入当前组的子档列 |
| 说明栏 | 悬停出；离场留 `TIP_OUT_MS`(320ms) 淡出；位置随档位平滑跟随 |
| 手刹落下 | 两次触发（点击两次 / `Ctrl+Shift+H` 两次），窗口 `ARM_MS`(2400ms) |
| 手刹解除 | 按住 H `HOLD_MS`(750ms)，进度环画满后发 `/gear P` |
| 静默 | 切档或指针离开 `REST_MS`(5000ms) 后只剩当前档；碰回当前档唤醒 |
| 子会话 | 滑轨只读：点击/拖拽/手刹/快捷键都不发命令，只弹「子会话档位只读（起始 D 档）」；档位仍随宿主变化（模型可自行降档） |

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
3. **状态**：全部走 `data-*`（`data-active` `data-preview` `data-open` `data-armed` `data-braked` `data-resting` `data-settled` `data-dragging` `data-locked`），JS 只改属性不拼样式。`data-locked` 加在 `.dshgear-root` 上，配 `.dshgear-tip-lock` 说明行与 `cursor: not-allowed`。

几何常量在文件顶部（`RAIL_H=556` `KEY_H=88` `SUB_H=38` `THUMB_W/H=36/44`…），CSS 里的尺寸由模板字符串插入，改一处即可。

## 一次切档的完整时序

1. 用户点 `N`（组入口）→ 组件把 `preview` 指到 `NT`，发 `/gear NT`
2. 宿主 `commands` handler 读当前状态，先注入一条换挡通知（`agent.status === 'running'` 用 `steer`，空闲用 `inject` 只入队不唤醒），再返回 `{ kind:'success', text:'P｜只读规划 → NT｜纯聊天' }`
3. 投影收到 `command/run`：挂起 `running.next = { gear:'NT', brake:false }`
4. `command/done` 成功 → 提交状态，`running` 清空
5. `wire.view` 生成新 `{gear,brake}`，经 `face` 广播
6. 前端 `useSyncExternalStore` 拿到新快照 → 高亮、中文标签、说明栏全部跟着变
7. 模型下一次进入步骤时：收件箱里的换挡通知被采纳（含新档位正文），运行时上下文只带一行实时状态
8. 若手刹落下：`tools.guard` 从下一次工具调用起返回拒绝理由

## 不变量（改动时别破坏）

1. **状态只有一个真源**：宿主投影。客户端不许自己存档位、不许本地折叠命令。
2. **客户端只能通过 `/gear` 写**，不直接改投影。
3. **`__ModuleLoader__.load({ id })` 的 id === package name**。
4. **升档要过人这一关**：`/gear` 或滑轨直接切；`set_gear` 升档必须走 `requestUpshift` 拿到用户批准，没有回答者就退回硬拒绝；子会话没有回答者，直接拒绝、不弹卡片。
5. **手刹只能由用户解除**：`set_gear` 拒绝解除，唯一路径是 `/gear resume`（或 UI 长按 → `/gear P`）；子会话永远不落手刹（投影钳制 + 工具拒绝）。
6. **`wire` 形状改动必须递增 `stateVersion`**，否则老会话的投影状态会被新代码误读。
7. **`viewOf` 要保持引用稳定**，否则每次事件都会引起一次前端重渲染。
8. **组件的 hook 必须全部写在任何提前 `return` 之前**。`mainId === undefined` 时会提前 `return null`，hook 排在它后面就会「这次少跑、下次多跑」，React 抛 #310，宿主把整个槽位条目报废（`slot entry crashed in 'shell.overlay'`）——表现为档位列整场消失，只有重启才会重新注册。
9. **子会话的只读边界在宿主，不在前端**：前端 `data-locked` 只是体验；真正的边界是「起始 D + 跳过继承前缀 + `brake` 钳制 + `set_gear`/`/gear` 拒绝 H 与升档」。别只改前端就以为修好了。
10. **提交分支必须展开旧状态**（`{ ...state, … }`）：`subagent` / `inherited` 丢了，下一次 `apply` 的继承守卫就失效。
11. **换挡通知只注入一次、绝不唤醒空闲会话**：状态真的变化才注入；`agent.status === 'running'` 用 `steer`，否则用 `inject`；通知失败只记日志，不影响换挡。
12. **完整介绍只注入一次**：`briefed` 折叠第一条 `runtime-context` 用户消息；不要在每条请求里重复介绍。
13. **档位提交折叠两条回执**：普通会话 `tool/result.meta.gearMode`，PTC 会话 `tool/ptc-dispatch.meta.gearMode`（run_code 嵌套派发没有 tool/result 事件）。升档的即时答复不会落日志——user-questions 服务在工具完成后撤回排队的答复，别指望折叠它。

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
| 子会话只读 | 宿主：`SUBAGENT_GEAR`、`init`/`apply` 的 `inherited` 守卫、`clampBrake`、`set_gear` 的 `isSubagentSession` 分支；前端：`subagent` 判据 + `locked` 守卫 + `data-locked` |
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
- **子会话里 slash 命令是被宿主关掉的**：`CommandDirectory` 对 `sessions.subagentAddress(id) !== undefined` 的会话直接返回 `[]`，`remote.commands.execute` 也会以 `session/agent-busy` 拒绝（`resolveAgent` 不走 subagent delivery）。所以子会话的滑轨只能做成只读——想在前端点档位，宿主根本不会执行 `/gear`。
- **`client.js` 是单文件产出的**：宿主一个包只发一个 bundle，`client.<name>.js` 这类 chunk 虽然存在，但版本号取的是 `client.js` 的哈希，改 CSS 不同步改它会被 `immutable` 缓存钉死——所以样式只能留在同一个文件里。

## 本地验证

```bash
# 1. 语法
node --check index.js && node --check client.js

# 2. 投影单测（node:test，无第三方依赖）
npm test

# 3. 装配（CLI profile 才能 dump）
dsh --profile web --dump-config | grep -A2 gear-mode

# 4. 真跑（另开一个 profile，别动正在用的）
dsh --profile web --port 5999 --no-open

# 5. 打包内容
npm pack --dry-run
```

桌面 profile 不受 CLI 管，验证只能靠"重启后看栏在不在"。
