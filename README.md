# dsh-gear-mode

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/janrilw/dsh-gear-mode)

> 挂挡真的很爽啊 ！！

**给 DeepSeek Harness 装一列行动档位：对话区左侧滑轨一点即换挡，从「只读规划」到「全自动」，模型想升档得先问你，另有一个随时可拉的手刹。**

![档位滑轨演示](https://raw.githubusercontent.com/Janrilw/dsh-gear-mode/main/assets/gear-demo.gif)

## 它解决什么

同一个模型、同一句话，"该不该动手"往往取决于当下的意图。`dsh-gear-mode` 把这件事从口头约定变成一个**可点击、可看见、可强制**的状态：

- 提示词按需注入：**完整介绍只在会话开头注入一次**；换挡时以 steer/inject 注入一条【档位切换】通知（从什么档位换到什么档位 + 新档位行为要求）；其余每条请求只带一行实时状态（当前档位、手刹、scope）。
- 模型侧只有一个 `set_gear` 工具：**降档**直接生效，**升档**会弹卡片问你，你点了才生效。
- 只在**对话**界面显示：打开插件 / 自动化任务 / 更多这些主面板时滑轨立刻隐藏，切回对话立刻出现。
- 手刹 H 落下后，工具调用被**硬拦截**（`ctx.tools.guard`），模型只能汇报现状，不能推进任务。
- **子会话（子智能体）自动进 D 档，档位槽只读**：模型可自行降档，但拉手刹与升档都会被拒绝——子会话没有能批准或解除它们的用户。
- 状态是会话投影，resume / fork 后自动还原。

```
P   只读规划     R   只读复盘
N   交流组 ── NT 聊天 / NC 教练 / NE 解释
M   手动组 ── M- 逐步 / M+ 连续
D   委托         A   自治
H   驻停（手刹，覆盖所有档位）
```

![整体界面](https://raw.githubusercontent.com/Janrilw/dsh-gear-mode/main/assets/gear-overview.png)

## 安装

```bash
# npm
dsh plugin --profile web add dsh-gear-mode

# 或直接从仓库装
dsh plugin --profile web add github:Janrilw/dsh-gear-mode
```

把 `web` 换成你实际用的 profile 名（桌面版是 `desktop`），然后重启该 profile 即生效。

卸载：`dsh plugin --profile web remove dsh-gear-mode`。

> 这是 bundle 型插件：`package.json` 里的 `dsh.bundle.patch` 指向 [`cordis.patch.yml`](cordis.patch.yml)，装好即挂载；缺了它会被当普通依赖装进去但什么都不发生。

## 使用

### 档位

| 档位 | 名称 | 行为要点 |
|---|---|---|
| `P` | 只读规划 | 只读，构建计划；引导式提问补全细节，多步推进 |
| `R` | 只读复盘 | 只读，先给结论再看改动 |
| `NT` | 聊天 | 纯聊天，梳理思路与情绪支持，不主动代办 |
| `NC` | 教练 | 教练式引导：提问、复述、纠偏 |
| `NE` | 解释 | 直接解释原理、读代码、分析报错 |
| `M-` | 较大介入 | 每步先说明→等确认→执行最小步 |
| `M+` | 较小介入 | 小步连续推进，遇阻或需决策先停 |
| `D` | 委托 | scope 内静默做完再汇报 |
| `A` | 自治 | 按约定目标/边界/预算全自动执行至验收 |
| `H` | 驻停 | 手刹，覆盖以上全部：不推进、不调工具，立即汇报现状 |

`N` 与 `M` 是组入口，不是独立执行档；点它们会落到默认子档（`NT` / `M-`）。

子会话（子智能体）不继承父会话档位，固定从 `D` 起步；`A` 需要 contract，只留给主会话。

### 交互

- **悬停**看档位说明，**点字母**切档。
- 悬停组入口时，子档列**贴着滑轨右缘**展开，没有空隙。
- 沿滑轨**上下拖拽**可扫过档位，向右越过边界进入当前组的子档列。
- **静默淡出**：切档完成或鼠标离开 5 秒后，只剩当前档位的字母、中文与滑块；碰回当前档位才淡入全部内容。
- **手刹**：点一下 H 进入待落（环在 2.4 秒内填充），再点一下才落下；`Ctrl+Shift+H`（Windows）/ `⌘⇧H`（macOS）走同一条二次确认。落下后**按住 H 750ms** 放下（回到 P）。手刹落下时点任意档位 = 由你解除并切到该档。

<table>
  <tr>
    <td align="center"><img src="https://raw.githubusercontent.com/Janrilw/dsh-gear-mode/main/assets/gear-flyout.png" width="150" alt="子档位"></td>
    <td align="center"><img src="https://raw.githubusercontent.com/Janrilw/dsh-gear-mode/main/assets/gear-tooltip.png" width="300" alt="档位说明"></td>
  </tr>
  <tr>
    <td align="center"><sub>组入口展开子档列</sub></td>
    <td align="center"><sub>悬停看该档的行为要求</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="https://raw.githubusercontent.com/Janrilw/dsh-gear-mode/main/assets/gear-brake.png" width="130" alt="手刹"></td>
    <td align="center"><img src="https://raw.githubusercontent.com/Janrilw/dsh-gear-mode/main/assets/gear-resting.png" width="130" alt="静默淡出"></td>
  </tr>
  <tr>
    <td align="center"><sub>手刹落下：整列变淡，H 变红</sub></td>
    <td align="center"><sub>静默 5 秒：只剩当前档</sub></td>
  </tr>
</table>

### 命令

```
/gear              报告当前档位
/gear D            切到 D（同时解除手刹）
/gear H            拉手刹
/gear resume       仅解除手刹，档位不变
/gear P|R|NT|NC|NE|M-|M+|D|A
```

### 模型侧

- `set_gear({ gear, reason? })`：降档或拉手刹直接生效；升档会弹一张卡片请你批准（`ctx.userQuestions`，与自带 `exit_plan_mode` 同一套机制），你点了「允许」才切档，拒绝就保持原档位，模型不会重试。
- 注入的上下文在会话开头给一份**完整介绍**（档位列、换挡规则、手刹），此后每条请求只给一行实时状态：`mode`、`handbrake`、`scope`（沙箱模式 + 工作区根目录）。
- 每次换挡（不管来自滑轨、`/gear` 还是 `set_gear`），宿主都会以 steer/inject 注入一条【档位切换】通知，写明从什么档位换到什么档位，并附新档位的行为要求；模型按最新一条通知执行。
- 升档获批后，档位提交由 `set_gear` 的自述回执驱动：普通会话折叠 `tool/result.meta`，**PTC 会话折叠 `tool/ptc-dispatch.meta`**（模型工具经 run_code 嵌套派发时没有 tool/result 事件）——滑轨在工具返回的同一回合内立即跟随。

### 子会话（子智能体）

在子智能体会话里打开这一列，看到的是**只读**档位槽：

- **起始档位固定 `D`**，不随父会话变——父会话在 `P`，子智能体也要能干活；`A` 需要 contract，不适用于子会话。
- **滑轨只读**：点击、拖拽、手刹、`Ctrl+Shift+H` 都不发命令，只提示「子会话档位只读（起始 D 档）」。
- **模型可自行降档**（`D → M-` 等），档位显示会跟着变，但滑轨仍然只读。
- **`set_gear H` 与 `/gear H` 会被拒绝**；升档没有用户可批准，也会被拒绝（不会弹卡片到主会话）。
- 折叠会话日志时跳过从父会话继承的前缀事件，父会话的手刹不会压到子会话头上。

> 为什么不做成「子会话也能切」：宿主对子会话关掉了 slash 命令（`CommandDirectory` 返回空、`remote.commands.execute` 以 `session/agent-busy` 拒绝），前端根本没有可用的写通道。只读是宿主能力边界，不是省事。

### 提示词可外置

注入正文不硬编码：[`prompts.md`](prompts.md) 会被**每次请求读一遍**，按 `## 键` 分节；保存后下一条消息即生效，不用重启。

- 键：`INTRO`（完整介绍，只注入一次）、`P` `R` `NT` `NC` `NE` `M-` `M+` `D` `A`（各档行为要求，只保留“模型要怎么做”）、`BRAKE`。
- 逐节回退：某节缺失或为空 → 用内置那句；整份文件不存在 → 全用内置。
- 优先级：`DSH_GEAR_PROMPTS` > `prompts.local.md` > `prompts.md` > 内置。想留个人版本又不污染仓库，写 `prompts.local.md`。
- 用 npm 装时 `prompts.md` 在 `node_modules` 里，升级会被覆盖——长期改建议用副本 + `DSH_GEAR_PROMPTS`（环境变量由进程启动时继承，改完要重启一次）。

## 兼容性

- **实测**：`dsh 0.2.1-rc.5`。
- `engines.dsh`：`>=0.2.1-rc.2 <0.3.0`。不满足时宿主不会激活它。

## 权限与风险

- 写入范围：只往会话里发一条 `/gear <档位>`，其他不动；子会话档位槽只读，连这条也不发。
- 网络：不请求任何外部服务，不含遥测，不收集任何数据。
- 提示词：会话开头注入一次完整介绍（约 1 KB），之后每条请求只注入一行实时状态；每次换挡注入一条【档位切换】通知。内容全部来自本仓库的 `prompts.md`。
- 工具：`set_gear` 会出现在模型可用工具列表里；`ctx.tools.guard` 在手刹落下时拦截**全部**工具调用。
- 键盘：只注册 `Ctrl+Shift+H` / `⌘⇧H`，其余按键不抢。

## 已知限制

- 模型升档要经过你批准（弹卡片）；子会话没有可批准的用户，升档直接拒绝，降档后也升不回去。
- 手刹不中断正在跑的回合（模型需要能把现状汇报出来），它约束的是"不再推进、不再调工具"；子会话永远不落手刹。
- 滑轨位置靠测量外壳标记（`[data-shell-overlay]`、`[data-slot="main"]`）得出；若外壳改结构，位置会失准。

## License

MIT © 2026 JanrilW
