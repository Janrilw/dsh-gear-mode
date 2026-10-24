# dsh-gear-mode

**给 DeepSeek Harness 装一列行动档位：对话区左侧滑轨一点即换挡，从「只读规划」到「全自动」，模型只能降不能升，另有一个随时可拉的手刹。**

![档位滑轨演示](https://raw.githubusercontent.com/Janrilw/dsh-gear-mode/main/assets/gear-demo.gif)

## 它解决什么

同一个模型、同一句话，"该不该动手"往往取决于当下的意图。`dsh-gear-mode` 把这件事从口头约定变成一个**可点击、可看见、可强制**的状态：

- 换挡即向模型注入该档的行为提示词（与 `sandbox:policy` / `approval:policy` 同一注入机制，每条请求重读）。
- 模型侧只有一个只能**降档**的 `set_gear` 工具；升档必须由你从界面或 `/gear` 操作。
- 手刹 H 落下后，工具调用被**硬拦截**（`ctx.tools.guard`），模型只能汇报现状，不能推进任务。
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

- `set_gear({ gear, reason? })`：只能降档或拉手刹；升档会被拒绝并提示"请用户从界面或 `/gear` 操作"。
- 注入的上下文同时给出 `mode`、`handbrake`、`scope`（沙箱模式 + 工作区根目录）与当前档位的完整行为要求。

### 提示词可外置

注入正文不硬编码：[`prompts.md`](prompts.md) 会被**每次请求读一遍**，按 `## 键` 分节；保存后下一条消息即生效，不用重启。

- 键：`P` `R` `NT` `NC` `NE` `M-` `M+` `D` `A`、`BRAKE`、`ORDER`。
- 逐节回退：某节缺失或为空 → 用内置那句；整份文件不存在 → 全用内置。
- 优先级：`DSH_GEAR_PROMPTS` > `prompts.local.md` > `prompts.md` > 内置。想留个人版本又不污染仓库，写 `prompts.local.md`。
- 用 npm 装时 `prompts.md` 在 `node_modules` 里，升级会被覆盖——长期改建议用副本 + `DSH_GEAR_PROMPTS`（环境变量由进程启动时继承，改完要重启一次）。

## 兼容性

- **实测**：`dsh 0.2.1-rc.2`（`web` 与 `desktop` profile）。
- `engines.dsh`：`>=0.2.1-rc.2 <0.3.0`。不满足时宿主不会激活它。

## 权限与风险

- 写入范围：只往会话里发一条 `/gear <档位>`（与你在输入框里手动敲命令等价），不写文件、不改工作区。
- 网络：不请求任何外部服务，不含遥测，不收集任何数据。
- 提示词：会向每条请求注入一段运行时上下文（约 1–2 KB），内容全部来自本仓库的 `prompts.md`。
- 工具：`set_gear` 会出现在模型可用工具列表里；`ctx.tools.guard` 在手刹落下时拦截**全部**工具调用。
- 键盘：只注册 `Ctrl+Shift+H` / `⌘⇧H`，其余按键不抢。

## 已知限制

- 模型不能升档，只能降档或拉手刹——这是刻意的设计，升档必须由人操作。
- 手刹不中断正在跑的回合（模型需要能把现状汇报出来），它约束的是"不再推进、不再调工具"。
- 滑轨位置靠测量外壳标记（`[data-shell-overlay]`、`[data-slot="main"]`）得出；若外壳改结构，位置会失准。
- 深色/浅色主题都实测过；其它自定义主题未逐一验证。

## 实现要点

| 层次 | 实现 |
|---|---|
| 状态 | `gear` 会话投影（`ctx.sessionProjections`），折叠 `/gear` 的 `command/run`+`command/done` 与 `set_gear` 的 `tool/result.meta`；不新增会话事件类型 |
| 提示词 | `ctx.systemPrompt.context({ name: 'gear:mode', order: APPROVAL_POLICY })`——与 `sandbox:policy` 同一机制 |
| 用户入口 | `shell.overlay` 槽的滑轨 + `/gear` 命令，两者都只是往会话里发同一条命令 |
| 模型入口 | `set_gear` 工具，按 rank 只允许降档（P/R/NT/NC/NE=0，M-=1，M+=2，D=3，A=4） |
| 手刹 | `ctx.tools.guard()`：`brake === true` 时拒绝全部工具调用 |

依赖：Host 侧 `tools`、`systemPrompt`、`sessionProjections`（硬依赖），`commands` 可选；Client 侧 `slots`、`sessions`、`locale`。无第三方依赖，样式只用 `--dsw-alias-*` 主题 token。

更细的分层图、投影状态机、客户端手势节奏、修改指引与坑位清单见 [docs/ARCHITECTURE.md](https://github.com/Janrilw/dsh-gear-mode/blob/main/docs/ARCHITECTURE.md)。

## 验证记录

在 `web` profile 实测：滑轨渲染与交互、`/gear` 命令、投影 checkpoint、切档后模型自述档位、升档被拒、手刹后工具被拦、位置跟随侧栏、5 秒静默、手刹二次确认与 750ms 解除，均通过。

## License

MIT © 2026 JanrilW
