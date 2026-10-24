/**
 * 行动档位（gear mode）——Client 半边：对话区左侧的档位滑轨。
 *
 * 只做两件事：读 `gear` 会话投影的视图（宿主算好的 `{ gear, brake }`），
 * 以及把用户的操作发回宿主的 `/gear` 命令。没有任何本地折叠或本地状态机，
 * 所以宿主（含 resume / fork）永远是唯一真相。
 *
 * 挂在 `shell.overlay`（root 作用域的 list 槽）：整层点击穿透，只有滑轨本身
 * 接管指针事件。左缘贴着主区（左侧栏右边那一列）的左边缘，随侧栏收放实时跟随；
 * 位移、点阵聚光、滑块、子档侧栏、手刹进度都照搬档位demo 里的滑轨动效，
 * 子档与说明栏朝对话区展开。
 *
 * 切换完成 5 秒后若指针不在滑轨上，淡出到只剩当前档位；手刹 Ctrl+Shift+H / 点击都要
 * 连按两次才落下（手刹落下后才开始长按 750ms 解除）。
 * 样式用宿主主题 token，文字走 Client locale。
 */
window.__ModuleLoader__.load({
  id: 'dsh-gear-mode',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'gear-mode';

    const ZH = {
      'rail.label': '行动档位',
      'flyout.label': '子档位',
      'brake.label': '驻停',
      'brake.hint': '连按两次驻停（Ctrl+Shift+H）· 落下后长按 750ms 解锁并切到 P',
      'brake.on': '已驻停',
      'brake.release': '长按 750 毫秒放下手刹并回到 P',
      'brake.engage': '手刹：连按两次落下（Ctrl+Shift+H），紧急停止并覆盖所有档位',
      'brake.armed': '再按一次落下手刹（Ctrl+Shift+H）',
      'brake.tip': '已驻停。长按 H 解锁，直接切到 P 档。',
      'error.command': '切档失败',
      'error.noCommand': '宿主没有提供 /gear 命令',
      'error.noSession': '这个会话还没准备好，稍后再试',
      'gear.P': '规划',
      'gear.R': '复盘',
      'gear.N': '交流',
      'gear.NT': '聊天',
      'gear.NC': '教练',
      'gear.NE': '解释',
      'gear.M': '手动',
      'gear.M-': '逐步',
      'gear.M+': '连续',
      'gear.D': '委托',
      'gear.A': '自治',
      'gear.H': '驻停',
      'name.P': 'Plan',
      'name.R': 'Review',
      'name.N': 'Neutral',
      'name.NT': 'Talk',
      'name.NC': 'Coach',
      'name.NE': 'Explain',
      'name.M': 'Manual',
      'name.M-': 'Step',
      'name.M+': 'Flow',
      'name.D': 'Dash',
      'name.A': 'Auto',
      'desc.P': '只读规划：只读，构建计划；用引导式提问补全细节，多步推进。',
      'desc.R': '只读复盘：审查日志、资料、代码；先给结论与整理建议，你认可后再动。',
      'desc.N': 'Neutral 组：只读档。N 是组入口，不是独立执行档。',
      'desc.NT': '聊天、梳理思路与情绪支持；不主动代做。',
      'desc.NC': '通过提问、复述与纠偏进行教练式引导。',
      'desc.NE': '解释原理、阅读代码与回答报错。',
      'desc.M': 'Manual 组：每步先说明，确认后执行最小步。M 是组入口。',
      'desc.M-': '每步先说明，确认后执行最小步并汇报。',
      'desc.M+': '小步连续推进，每步汇报，关键点确认。',
      'desc.D': '在已批准范围内静默执行、测试与交付；高风险仍需确认。',
      'desc.A': '绑定目标、边界、预算与停止条件，全自动执行到验收。',
    };

    const EN = {
      'rail.label': 'Action gear',
      'flyout.label': 'sub-gears',
      'brake.label': 'Hold',
      'brake.hint': 'Press twice to hold (Ctrl+Shift+H) · hold 750 ms to release into P',
      'brake.on': 'Engaged',
      'brake.release': 'Press for 750 ms to release the handbrake into P',
      'brake.engage': 'Handbrake: press twice to drop it (Ctrl+Shift+H) — an emergency stop over every gear',
      'brake.armed': 'Press again to drop the handbrake (Ctrl+Shift+H)',
      'brake.tip': 'Engaged. Press H for 750 ms to release into P.',
      'error.command': 'Gear switch failed',
      'error.noCommand': 'The host offers no /gear command',
      'error.noSession': 'This session is not ready yet; retry in a moment',
      'gear.P': 'Plan',
      'gear.R': 'Review',
      'gear.N': 'Neutral',
      'gear.NT': 'Talk',
      'gear.NC': 'Coach',
      'gear.NE': 'Explain',
      'gear.M': 'Manual',
      'gear.M-': 'Step',
      'gear.M+': 'Flow',
      'gear.D': 'Dash',
      'gear.A': 'Auto',
      'gear.H': 'Hold',
      'name.P': 'Plan',
      'name.R': 'Review',
      'name.N': 'Neutral',
      'name.NT': 'Talk',
      'name.NC': 'Coach',
      'name.NE': 'Explain',
      'name.M': 'Manual',
      'name.M-': 'Step',
      'name.M+': 'Flow',
      'name.D': 'Dash',
      'name.A': 'Auto',
      'desc.P': 'Read-only planning: inspect, ask guiding questions, plan in steps.',
      'desc.R': 'Read-only review: audit logs, docs and code; conclusions before changes.',
      'desc.N': 'Neutral group: read-only gears. N is a group entry, not a gear.',
      'desc.NT': 'Talk it through; support, do not solve.',
      'desc.NC': 'Coach through questions, restating and correcting.',
      'desc.NE': 'Explain principles, read code, answer errors.',
      'desc.M': 'Manual group: explain first, then the smallest confirmed step.',
      'desc.M-': 'Explain, wait, run the smallest step, report.',
      'desc.M+': 'Small continuous steps with briefs; confirm key points.',
      'desc.D': 'Execute, test and deliver silently inside the approved scope.',
      'desc.A': 'Bind goal, boundary, budget and stop conditions; run to acceptance.',
    };

    /** 主列顺序。 */
    const MAIN = ['P', 'R', 'N', 'M', 'D', 'A'];
    /** 组入口 → 子档（自上而下）。 */
    const GROUPS = { N: ['NT', 'NC', 'NE'], M: ['M-', 'M+'] };
    /** 组入口的默认子档：点 N/M 本身时落在这一档（N/M 不是独立执行档）。 */
    const DEFAULT_SUB = { N: 'NT', M: 'M-' };
    /** 子档 → 所在组。 */
    const PARENT = { NT: 'N', NC: 'N', NE: 'N', 'M-': 'M', 'M+': 'M' };
    /** 全部可取档位。 */
    const ALL = ['P', 'R', 'NT', 'NC', 'NE', 'M-', 'M+', 'D', 'A'];

    /** 滑轨几何（与档位demo 同一套节奏）。 */
    const RAIL_H = 556;
    const PAD = 14;
    const KEY_H = 88;
    const SUB_H = 38;
    const THUMB_W = 36;
    const THUMB_H = 44;
    const HOLD_MS = 750;
/** 手刹的二次确认窗口：第一次按下后，环在这段时间内填满即自动取消。 */
const ARM_MS = 2400;
/** 切档完成后的静默期：指针不在滑轨上时，5 秒后淡出到只留当前档位。 */
const REST_MS = 5000;
/** 滑轨与主区左缘的间隙（避开左侧栏的拖拽手柄）。 */
const GAP = 8;
/** 说明栏退场：代码消失后仍留这么久，让 CSS 淡出跑完再卸载。 */
const TIP_OUT_MS = 320;
/** 非对话界面时的内联样式：模块级常量，引用稳定，省一次 diff。 */
const HIDDEN_STYLE = { display: 'none' };
    /** 档位中心在滑轨内的 y：58 + i*88。 */
    const spotOf = (index) => PAD + index * KEY_H + KEY_H / 2;
    /** 滑块落点。 */
    const thumbOf = (index) => PAD + index * KEY_H + (KEY_H - THUMB_H) / 2;
    /** 子档列顶部：让整列垂直居中在组键上。 */
    const branchTopOf = (group) => spotOf(MAIN.indexOf(group)) - (GROUPS[group].length * SUB_H) / 2;

    const CSS = `
.dshgear-root {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  pointer-events: none;
  font: inherit;
  color: var(--dsw-alias-label-primary);
  -webkit-user-select: none;
  user-select: none;
  /* 玻璃底板：浅色下整列比页面略深（透明玻璃遮光），档位字与标签的底比它更浅 */
  --dshgear-dot: #b4b4b4;
  --dshgear-pane-bg: color-mix(in srgb, #000 3.5%, transparent);
  --dshgear-pane-ring: color-mix(in srgb, #000 6%, transparent);
  --dshgear-pane-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 6px 18px rgba(0, 0, 0, 0.05);
  --dshgear-key-raised: 0 1px 2px rgba(0, 0, 0, 0.1), 0 2px 6px rgba(0, 0, 0, 0.06);
}
body[data-ds-dark-theme] .dshgear-root {
  --dshgear-dot: #4b4b4b;
  --dshgear-pane-bg: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 62%, transparent);
  --dshgear-pane-ring: color-mix(in srgb, #fff 7%, transparent);
  --dshgear-pane-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  --dshgear-key-raised: 0 1px 3px rgba(0, 0, 0, 0.35);
}
.dshgear-control {
  position: relative;
  width: 46px;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: auto;
  touch-action: none;
  transform-origin: left center;
}
.dshgear-rail {
  position: relative;
  box-sizing: border-box;
  width: 46px;
  height: ${RAIL_H}px;
  padding: ${PAD}px 0;
  border-radius: 14px;
  overflow: hidden;
  background: var(--dshgear-pane-bg);
  box-shadow: inset 0 0 0 1px var(--dshgear-pane-ring), var(--dshgear-pane-shadow);
  transition: opacity 400ms ease, background 700ms ease, box-shadow 700ms ease;
  isolation: auto;
  --dshgear-spot: 58px;
}
.dshgear-rail[data-braked="true"] { opacity: 0.6; }
.dshgear-dots {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image: radial-gradient(circle, var(--dshgear-dot) 1.35px, transparent 1.75px);
  background-size: 10px 10px;
  background-position: 1px 3px;
  -webkit-mask-image: radial-gradient(ellipse 39px 116px at 50% var(--dshgear-spot), #000 0%, #0009 38%, transparent 100%);
  mask-image: radial-gradient(ellipse 39px 116px at 50% var(--dshgear-spot), #000 0%, #0009 38%, transparent 100%);
  transition: opacity 250ms ease;
}
.dshgear-thumb {
  position: absolute;
  box-sizing: border-box;
  top: 0;
  left: 5px;
  z-index: 1;
  width: ${THUMB_W}px;
  height: ${THUMB_H}px;
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dshgear-key-raised);
  pointer-events: none;
  transition: transform 600ms cubic-bezier(0.2, 0.85, 0.2, 1), opacity 400ms ease;
}
.dshgear-key {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 46px;
  height: ${KEY_H}px;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 19px;
  font-weight: 500;
  cursor: pointer;
  transition: color 400ms ease, transform 500ms ease, opacity 700ms ease;
}
.dshgear-key:hover { color: var(--dsw-alias-label-primary); }
.dshgear-key[data-active="true"],
.dshgear-key[data-preview="true"] { color: var(--dsw-alias-label-primary); transform: scale(1.08); }
.dshgear-key[data-preview="true"] { transform: scale(1.12); }
.dshgear-key:focus-visible,
.dshgear-brake:focus-visible,
.dshgear-sub:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -4px; border-radius: 6px; }
.dshgear-cn {
  position: absolute;
  left: 50%;
  top: 57px;
  transform: translate(-50%, -3px);
  padding: 2px 4px;
  border-radius: 3px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 9px;
  font-weight: 400;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 250ms ease, transform 300ms ease;
}
.dshgear-root[data-settled="true"] .dshgear-key[data-active="true"] .dshgear-cn { opacity: 1; transform: translate(-50%, 0); }
.dshgear-root[data-dragging="true"] .dshgear-cn { opacity: 0 !important; }
.dshgear-flyout {
  position: absolute;
  left: 46px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 44px;
  border-radius: 0 6px 6px 0;
  background: var(--dshgear-pane-bg);
  box-shadow: inset 0 0 0 1px var(--dshgear-pane-ring);
  transform-origin: left center;
  transform: translateX(-12px) scaleX(0.25);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: transform 320ms cubic-bezier(0.2, 0.85, 0.2, 1), opacity 200ms ease,
    visibility 0s linear 320ms;
}
.dshgear-flyout[data-open="true"] {
  transform: translateX(0) scaleX(1);
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition: transform 320ms cubic-bezier(0.2, 0.85, 0.2, 1), opacity 200ms ease,
    visibility 0s;
}
.dshgear-flyout[data-frozen="true"] { opacity: 0.3 !important; }
.dshgear-branch-dots {
  position: absolute;
  inset: -7px -4px;
  z-index: 0;
  pointer-events: none;
  background-image: radial-gradient(circle, var(--dshgear-dot) 1.15px, transparent 1.5px);
  background-size: 10px 10px;
  background-position: center;
  opacity: 0;
  transition: opacity 250ms ease;
  -webkit-mask-image: radial-gradient(ellipse 32px 65px at 50% var(--dshgear-sub-spot, 26px), #000a, transparent);
  mask-image: radial-gradient(ellipse 32px 65px at 50% var(--dshgear-sub-spot, 26px), #000a, transparent);
}
.dshgear-flyout[data-open="true"] .dshgear-branch-dots { opacity: 1; }
.dshgear-sub-thumb {
  position: absolute;
  right: 4px;
  top: calc(var(--dshgear-sub-spot, 26px) - 19px);
  z-index: 1;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dshgear-key-raised);
  opacity: 0;
  pointer-events: none;
  transition: top 200ms cubic-bezier(0.2, 0.85, 0.2, 1), opacity 200ms ease;
}
.dshgear-flyout[data-current="true"] .dshgear-sub-thumb,
.dshgear-flyout[data-tracking="true"] .dshgear-sub-thumb { opacity: 1; }
.dshgear-sub {
  position: relative;
  z-index: 2;
  flex: 0 0 ${SUB_H}px;
  width: 44px;
  height: ${SUB_H}px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: color 200ms ease;
}
.dshgear-sub:hover { color: var(--dsw-alias-label-primary); }
.dshgear-sub[data-active="true"],
.dshgear-sub[data-preview="true"] { color: var(--dsw-alias-label-primary); font-weight: 600; }
.dshgear-brake {
  position: relative;
  isolation: isolate;
  width: 44px;
  height: 44px;
  margin: 13px 0 0;
  padding: 0;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: color 350ms ease, box-shadow 350ms ease, opacity 700ms ease;
}
.dshgear-brake:hover { color: var(--dsw-alias-label-primary); }
.dshgear-brake:focus-visible { border-radius: 50%; }
.dshgear-brake-glyph { display: block; transform: translateY(-1px); }
.dshgear-brake[data-armed="true"] { color: var(--dsw-alias-state-error-primary); }
.dshgear-brake[data-armed="true"] .dshgear-brake-progress {
  opacity: 1;
  stroke-dashoffset: 0;
  transition: stroke-dashoffset ${ARM_MS}ms linear, opacity 100ms ease;
}
.dshgear-brake[data-braked="true"] { color: var(--dsw-alias-state-error-primary); }
.dshgear-brake[data-locked="true"] { box-shadow: 0 0 0 4px color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); }
.dshgear-brake-icon {
  position: absolute;
  inset: 0;
  width: 44px;
  height: 44px;
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  pointer-events: none;
}
.dshgear-brake-progress {
  stroke: var(--dsw-alias-state-error-primary);
  stroke-width: 3.5;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  transform: rotate(-90deg);
  transform-origin: 22px 22px;
  opacity: 0;
  transition: stroke-dashoffset 0s linear, opacity 150ms ease;
}
.dshgear-brake[data-holding="true"] .dshgear-brake-progress {
  opacity: 1;
  stroke-dashoffset: 0;
  transition: stroke-dashoffset ${HOLD_MS}ms linear, opacity 100ms ease;
}
.dshgear-brake-dots {
  position: absolute;
  inset: -20px -12px -20px -12px;
  z-index: -1;
  pointer-events: none;
  background-image: radial-gradient(circle, var(--dsw-alias-state-error-primary) 1.35px, transparent 1.75px);
  background-size: 10px 10px;
  background-position: center;
  opacity: 0;
  transform: translateY(-9px) scale(0.88);
  transition: opacity 450ms ease, transform 550ms cubic-bezier(0.2, 0.85, 0.2, 1);
  -webkit-mask-image: radial-gradient(ellipse 34px 44px at 50% 50%, #000b 15%, #0006 45%, transparent 100%);
  mask-image: radial-gradient(ellipse 34px 44px at 50% 50%, #000b 15%, #0006 45%, transparent 100%);
}
.dshgear-brake[data-braked="true"] .dshgear-brake-dots { opacity: 1; transform: translateY(0) scale(1); }
.dshgear-brake-cn {
  position: absolute;
  left: 50%;
  top: 40px;
  transform: translate(-50%, -3px);
  padding: 2px 4px;
  border-radius: 3px;
  background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-state-error-primary);
  font-size: 9px;
  font-weight: 400;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 250ms ease, transform 300ms ease;
}
.dshgear-root[data-settled="true"] .dshgear-brake[data-braked="true"] .dshgear-brake-cn { opacity: 1; transform: translate(-50%, 0); }
.dshgear-tip {
  position: absolute;
  left: 52px;
  z-index: 4;
  width: max-content;
  max-width: min(230px, calc(100vw - 174px));
  padding: 9px 12px;
  text-align: left;
  border-radius: 5px;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  color: var(--dsw-alias-label-secondary);
  font-size: 16.5px;
  font-weight: 400;
  line-height: 1.8;
  transform-origin: left center;
  opacity: 0;
  visibility: hidden;
  transform: translateX(-6px) scale(0.97);
  pointer-events: none;
  transition: opacity 220ms ease, transform 280ms cubic-bezier(0.2, 0.85, 0.2, 1),
    top 320ms cubic-bezier(0.2, 0.85, 0.2, 1), left 320ms cubic-bezier(0.2, 0.85, 0.2, 1),
    visibility 0s linear 280ms;
}
.dshgear-tip[data-show="true"] {
  opacity: 1;
  visibility: visible;
  transform: translateX(0) scale(1);
  pointer-events: none;
  transition: opacity 220ms ease, transform 280ms cubic-bezier(0.2, 0.85, 0.2, 1),
    top 320ms cubic-bezier(0.2, 0.85, 0.2, 1), left 320ms cubic-bezier(0.2, 0.85, 0.2, 1),
    visibility 0s;
}
.dshgear-tip { animation: dshgear-tip-in 260ms ease both; }
@keyframes dshgear-tip-in {
  from { opacity: 0; transform: translateX(-6px) scale(0); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}
.dshgear-tip-mode {
  display: flex;
  align-items: baseline;
  gap: 10px;
  color: var(--dsw-alias-label-primary);
  font-size: 22.5px;
  font-weight: 600;
  letter-spacing: -0.2px;
}
.dshgear-tip-mode small { font-size: 15px; font-weight: 400; color: var(--dsw-alias-label-secondary); letter-spacing: 0; }
.dshgear-tip-desc { margin-top: 7px; }
.dshgear-toast {
  position: absolute;
  left: 52px;
  bottom: -6px;
  z-index: 4;
  width: max-content;
  max-width: 220px;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-overlay);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  color: var(--dsw-alias-state-error-primary);
  font-size: 10px;
  line-height: 1.5;
  pointer-events: none;
}
/* —— 静默淡出：只留当前档位的字母、中文与滑块，其余退成极淡的字母 —— */
.dshgear-root[data-resting="true"] .dshgear-rail { background: transparent; box-shadow: none; }
.dshgear-root[data-resting="true"] .dshgear-dots { opacity: 0; }
.dshgear-root[data-resting="true"] .dshgear-key { opacity: 0.16; }
.dshgear-root[data-resting="true"] .dshgear-key:hover,
.dshgear-root[data-resting="true"] .dshgear-key:focus-visible { opacity: 0.55; }
.dshgear-root[data-resting="true"] .dshgear-key[data-active="true"] { opacity: 1; }
.dshgear-root[data-resting="true"] .dshgear-key[data-active="true"]:hover { opacity: 1; }
.dshgear-root[data-resting="true"] .dshgear-key[data-active="true"] .dshgear-cn {
  opacity: 1;
  transform: translate(-50%, 0);
}
.dshgear-root[data-resting="true"] .dshgear-brake { opacity: 0.16; }
.dshgear-root[data-resting="true"] .dshgear-brake[data-braked="true"] { opacity: 1; }
.dshgear-root[data-resting="true"] .dshgear-brake-cn,
.dshgear-root[data-resting="true"] .dshgear-brake[data-braked="true"] .dshgear-brake-cn { opacity: 0; }
.dshgear-root[data-resting="true"] .dshgear-flyout[data-open="true"] {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateX(-10px) scaleX(0.86);
}
.dshgear-root[data-resting="true"] .dshgear-tip[data-show="true"] {
  opacity: 0;
  visibility: hidden;
}
@media (max-height: 780px) {
  .dshgear-control { transform: scale(0.86); }
}
@media (max-height: 660px) {
  .dshgear-control { transform: scale(0.72); }
}
@media (max-width: 760px) {
  .dshgear-control { transform: scale(0.8); }
  .dshgear-tip { max-width: min(200px, calc(100vw - 120px)); }
}
@media (max-width: 540px) {
  .dshgear-control { transform: scale(0.7); }
}
@media (prefers-reduced-motion: reduce) {
  .dshgear-thumb, .dshgear-key, .dshgear-cn, .dshgear-flyout, .dshgear-sub-thumb,
  .dshgear-tip, .dshgear-brake-dots, .dshgear-rail, .dshgear-brake { transition: none !important; }
  .dshgear-tip { animation: none !important; }
}
`;

    const label = (t, code) => t(`gear.${code}`);
    const modeName = (t, code) => t(`name.${code}`);
    const describe = (t, code) => t(`desc.${code}`);

    /**
     * 右侧档位滑轨。
     * @param props 槽位标准属性（`useSessions` 等）。
     */
    function GearRail(props) {
      const sessions = props.__gearSessions;
      const t = props.__gearT;
      const useSessions = props.useSessions;

      /** 主视图正在显示的会话（mainView 保留计数 > 0 的那一个）。 */
      const mainId = useSessions((state) => {
        for (const id of state.ids) {
          const row = state.byId[id];
          if (row !== undefined && (row.retainedBy.mainView ?? 0) > 0) return id;
        }
        return undefined;
      });
      /** 会话尚未打开绑定时，用列表里带回来的投影缓存兜底。 */
      const cached = useSessions((state) => (mainId === undefined ? undefined : state.projectionsBySession[mainId]));

      const session = mainId === undefined ? undefined : sessions.binding(mainId)?.session;
      const face = session === undefined ? undefined : session.projections.faceOf('gear');
      const subscribe = React.useCallback(
        (listener) => (face === undefined ? () => {} : face.subscribe(listener)),
        [face],
      );
      const read = React.useCallback(() => (face === undefined ? undefined : face.getSnapshot()), [face]);
      const live = React.useSyncExternalStore(subscribe, read);

      const snapshot = live ?? cached?.values?.gear ?? undefined;
      const gear = snapshot !== undefined && ALL.includes(snapshot.gear) ? snapshot.gear : undefined;
      const braked = snapshot !== undefined && snapshot.brake === true;
      const active = gear ?? 'P';
      const activeMain = PARENT[active] ?? active;
      const activeIndex = Math.max(0, MAIN.indexOf(activeMain));

      const [settled, setSettled] = React.useState(true);
      const [dragging, setDragging] = React.useState(false);
      const [preview, setPreview] = React.useState(null);
      const [holding, setHolding] = React.useState(false);
      const [tip, setTip] = React.useState(null);
      /** 正在退场的说明栏代码：淡出期间仍按它算位置，避免框跳一下。 */
      const [tipHeld, setTipHeld] = React.useState(null);
      const [notice, setNotice] = React.useState(null);
      /** 静默淡出中（只剩当前档位与极淡的其他字母）。 */
      const [resting, setResting] = React.useState(false);
      /** 指针是否在滑轨区域内：在区域内不开始静默倒计时。 */
      const [inside, setInside] = React.useState(false);
      /** 手刹已被按了一次，等待第二次确认。 */
      const [armed, setArmed] = React.useState(false);
      /** 滑轨左缘（相对浮层原点）；量不到时退回 CSS 里的 8px。 */
      const [anchorLeft, setAnchorLeft] = React.useState(null);
      /** 交互计数：每次都要重新开始一轮 5 秒静默。 */
      const [pulse, setPulse] = React.useState(0);

      /**
       * 主面板（插件 / 自动化任务 / 更多等）是否占着主区——只有对话界面才显示滑轨。
       * 全程容错：服务缺席或读失败一律当作在对话里，判据不会把滑轨搞没。
       */
      const [panelOpen, setPanelOpen] = React.useState(false);
      React.useEffect(() => {
        let off = null;
        try {
          const pi = typeof props.__gearPanel === 'function' ? props.__gearPanel() : undefined;
          if (pi !== undefined && typeof pi.getSnapshot === 'function' && typeof pi.subscribe === 'function') {
            const read = () => {
              try {
                const snap = pi.getSnapshot();
                const id = snap === undefined || snap === null ? null : snap.activePanelId ?? null;
                setPanelOpen(id !== null);
              } catch {
                /* 读失败保持原样，不改变显隐 */
              }
            };
            read();
            const ret = pi.subscribe(read);
            off = typeof ret === 'function' ? ret : null;
          }
        } catch {
          /* 布局服务缺席：当作一直在对话里 */
        }
        return () => {
          if (off === null) return;
          try {
            off();
          } catch {
            /* 退订失败不影响显示 */
          }
        };
      }, [props.__gearPanel]);

      const rootRef = React.useRef(null);
      const railRef = React.useRef(null);
      const controlRef = React.useRef(null);
      const gesture = React.useRef(null);
      const suppress = React.useRef(0);
      const holdTimer = React.useRef(null);
      const tipTimer = React.useRef(null);
      const settleTimer = React.useRef(null);
      const armTimer = React.useRef(null);
      const restTimer = React.useRef(null);


      /** 目前展示的档位：拖拽预览优先，其次是宿主状态。 */
      const shownMain = preview !== null ? preview.group : activeMain;
      const shownIndex = Math.max(0, MAIN.indexOf(shownMain));

      /** 点阵聚光缓动（与档位demo 的 lerp 一致：每帧 0.13，收敛阈值 0.15）。 */
      const spotRef = React.useRef(spotOf(activeIndex));
      const spotTarget = spotOf(shownIndex);
      React.useEffect(() => {
        let frame = 0;
        const step = () => {
          const el = railRef.current;
          if (el === null) return;
          spotRef.current += (spotTarget - spotRef.current) * 0.13;
          if (Math.abs(spotTarget - spotRef.current) < 0.15) {
            spotRef.current = spotTarget;
            el.style.setProperty('--dshgear-spot', `${spotTarget}px`);
            return;
          }
          el.style.setProperty('--dshgear-spot', `${spotRef.current}px`);
          frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
      }, [spotTarget]);

      /** 动效落定后才显示中文小标签（与档位demo 的 settled 一致）。 */
      React.useEffect(() => {
        setSettled(false);
        if (settleTimer.current !== null) clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => {
          settleTimer.current = null;
          setSettled(true);
        }, 460);
        return () => {
          if (settleTimer.current !== null) clearTimeout(settleTimer.current);
          settleTimer.current = null;
        };
      }, [activeMain, active, preview]);

      React.useEffect(
        () => () => {
          if (holdTimer.current !== null) clearTimeout(holdTimer.current);
          if (tipTimer.current !== null) clearTimeout(tipTimer.current);
          if (armTimer.current !== null) clearTimeout(armTimer.current);
          if (restTimer.current !== null) clearTimeout(restTimer.current);
        },
        [],
      );

      /**
       * 滑轨左缘 = 主区（左侧栏右边那一列）的左边缘 + GAP。
       *
       * 不写死像素：侧栏拖拽、折叠、右栏开合都靠 ResizeObserver 逐帧跟随；
       * `[data-shell-overlay]` 与 `[data-slot="main"]` 是外壳自己的稳定标记，
       * 不用带哈希的类名。
       */
      React.useEffect(() => {
        const el = rootRef.current;
        if (el === null) return undefined;
        // 浮层容器：优先用外壳自己的标记，退而求其次用 offsetParent（正是 left/top 的基准）。
        const layer = el.closest('[data-shell-overlay]') ?? el.offsetParent ?? el.parentElement;
        const frame = layer === null ? null : layer.parentElement;
        if (layer === null || frame === null) return undefined;
        let column = null;
        const resize = new ResizeObserver(() => measure());
        const mutations = new MutationObserver(() => measure());
        function measure() {
          const main = frame.querySelector('[data-slot="main"]');
          if (main === null) return;
          let col = main;
          for (let guard = 0; col.parentElement !== frame && guard < 24; guard += 1) {
            if (col.parentElement === null) return;
            col = col.parentElement;
          }
          if (column !== col) {
            if (column !== null) resize.disconnect();
            resize.observe(col);
            column = col;
          }
          const left = Math.round(col.getBoundingClientRect().left - layer.getBoundingClientRect().left + GAP);
          setAnchorLeft((prev) => (prev === left ? prev : left));
        }
        measure();
        mutations.observe(frame, { attributes: true, childList: true });
        window.addEventListener('resize', measure);
        return () => {
          resize.disconnect();
          mutations.disconnect();
          window.removeEventListener('resize', measure);
        };
      }, [mainId]);

      React.useEffect(() => {
        if (notice === null) return undefined;
        const timer = setTimeout(() => setNotice(null), 2600);
        return () => clearTimeout(timer);
      }, [notice]);

      const hideTip = React.useCallback(() => {
        if (tipTimer.current !== null) clearTimeout(tipTimer.current);
        tipTimer.current = null;
        setTip(null);
      }, []);

      const showTip = React.useCallback((code) => {
        if (tipTimer.current !== null) clearTimeout(tipTimer.current);
        setTip(code);
        tipTimer.current = setTimeout(() => {
          tipTimer.current = null;
          setTip(null);
        }, 5000);
      }, []);

      /** 回到滑轨（悬停当前档位、按下、聚焦）：淡入全部内容并重新开始一轮 5 秒。 */
      const reveal = React.useCallback(() => {
        setResting(false);
        setPulse((n) => n + 1);
      }, []);

      /** 5 秒静默：指针不在滑轨区域内时，切档完成 5 秒后淡出到只剩当前档位。 */
      React.useEffect(() => {
        if (restTimer.current !== null) {
          clearTimeout(restTimer.current);
          restTimer.current = null;
        }
        if (inside || dragging || preview !== null || holding || armed) {
          // 指针就在滑轨里：不排新的淡出，但也不主动淡入——淡入只由「碰到当前档位」触发。
          return undefined;
        }
        restTimer.current = setTimeout(() => {
          restTimer.current = null;
          hideTip();
          setResting(true);
        }, REST_MS);
        return () => {
          if (restTimer.current !== null) {
            clearTimeout(restTimer.current);
            restTimer.current = null;
          }
        };
      }, [inside, dragging, preview, holding, braked, armed, active, pulse, hideTip]);

      /** 说明栏的代码消失后先留在树上把淡出跑完，再卸载。 */
      React.useEffect(() => {
        if (tip !== null) {
          setTipHeld(tip);
          return undefined;
        }
        const timer = setTimeout(() => setTipHeld(null), TIP_OUT_MS);
        return () => clearTimeout(timer);
      }, [tip]);

      /** 把一条 `/gear` 命令发给宿主；失败时把原因显示出来，不静默吞掉。 */
      const send = React.useCallback(
        (line) => {
          const face2 = mainId === undefined ? undefined : sessions.binding(mainId)?.session;
          if (face2 === undefined) {
            setNotice(t('error.noSession'));
            return;
          }
          Promise.resolve(face2.command(line)).then(
            (result) => {
              if (result === undefined || !result.ok) {
                const reason = result !== undefined && !result.ok ? result.error?.message ?? result.error?.code : 'unknown';
                setNotice(`${t('error.command')}: ${reason}`);
                return;
              }
              if (!result.value.matched) setNotice(t('error.noCommand'));
            },
            (error) => setNotice(`${t('error.command')}: ${error instanceof Error ? error.message : String(error)}`),
          );
        },
        [mainId, sessions, t],
      );

      /** 取消手刹的待落状态。 */
      const clearArm = React.useCallback(() => {
        if (armTimer.current !== null) {
          clearTimeout(armTimer.current);
          armTimer.current = null;
        }
        setArmed(false);
        hideTip();
      }, [hideTip]);

      /** 真正落下手刹。 */
      const engageBrake = React.useCallback(() => {
        clearArm();
        send('/gear H');
      }, [clearArm, send]);

      /**
       * 手刹要按两次：第一次只进入待落状态（环开始填充），窗口内再按一次才落下。
       * 快捷键与鼠标走同一条路径，避免误触。
       */
      const armBrake = React.useCallback(() => {
        if (braked) return;
        if (armed) {
          engageBrake();
          return;
        }
        setArmed(true);
        showTip('H');
        if (armTimer.current !== null) clearTimeout(armTimer.current);
        armTimer.current = setTimeout(() => {
          armTimer.current = null;
          setArmed(false);
          hideTip();
        }, ARM_MS);
      }, [armed, braked, engageBrake, showTip, hideTip]);

      /** 手刹已经落下时，清掉待落状态（比如第一次按下后命令才生效）。 */
      React.useEffect(() => {
        if (!braked) return;
        clearArm();
      }, [braked, clearArm]);

      /** Ctrl+Shift+H（顺带支持 ⌘H）：连按两次落下手刹；输入框里也照样生效。 */
      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (event.defaultPrevented || event.isComposing) return;
          if (!event.ctrlKey && !event.metaKey) return;
          if (event.altKey || !event.shiftKey) return;
          if (String(event.key).toLowerCase() !== 'h') return;
          event.preventDefault();
          event.stopPropagation();
          if (event.repeat) return;
          reveal();
          armBrake();
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
      }, [armBrake, reveal]);

      const request = React.useCallback(
        (code) => {
          const target = ALL.includes(code) ? code : DEFAULT_SUB[code];
          if (target === undefined) return;
          reveal();
          showTip(target);
          send(`/gear ${target}`);
        },
        [reveal, send, showTip],
      );

      /** 指针路径已在 pointerup 提交；这里只接键盘激活与捕获丢失后的兜底点击。 */
      const clickRequest = (code) => {
        if (Date.now() < suppress.current) return;
        request(code);
      };

      /** 手刹：按下即落下，按住 750ms 放下（落回 P）。 */
      const startHold = React.useCallback(() => {
        if (holdTimer.current !== null) return;
        setHolding(true);
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null;
          setHolding(false);
          send('/gear P');
        }, HOLD_MS);
      }, [send]);

      const stopHold = React.useCallback(() => {
        setHolding(false);
        if (holdTimer.current !== null) {
          clearTimeout(holdTimer.current);
          holdTimer.current = null;
        }
      }, []);

      const pressBrake = React.useCallback(() => {
        if (braked) startHold();
        else armBrake();
      }, [braked, startHold, armBrake]);

      const localPoint = (event) => {
        const el = railRef.current;
        if (el === null) return { x: 0, y: 0 };
        const rect = el.getBoundingClientRect();
        const scale = rect.height === 0 ? 1 : rect.height / RAIL_H;
        return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
      };

      /** 拖拽预览：竖直方向选主键，越过左边界后进入该组子档列。 */
      const previewGesture = (event) => {
        const state = gesture.current;
        if (state === null) return;
        const point = localPoint(event);
        state.moved = state.moved || Math.hypot(event.clientX - state.x, event.clientY - state.y) > 5;
        if (state.group !== null && point.x < 46) state.group = null;
        if (state.group === null) {
          const index = Math.max(0, Math.min(MAIN.length - 1, Math.round((point.y - spotOf(0)) / KEY_H)));
          state.mode = MAIN[index];
          if (point.x > 48 && GROUPS[state.mode] !== undefined) state.group = state.mode;
        }
        if (state.group !== null) {
          const group = state.group;
          const base = branchTopOf(group);
          const subs = GROUPS[group];
          const index = Math.max(0, Math.min(subs.length - 1, Math.floor((point.y - base) / SUB_H)));
          state.sub = subs[index];
          state.mode = group;
          setPreview({ group, sub: subs[index], mode: group });
        } else {
          state.sub = null;
          setPreview({ group: state.mode, sub: null, mode: state.mode });
        }
      };

      const onPointerDown = (event) => {
        if (event.button !== 0) return;
        if (event.target.closest('[data-brake="true"]')) return;
        if (gesture.current !== null) return;
        reveal();
        const subButton = event.target.closest('[data-choice]');
        const mainButton = event.target.closest('[data-mode]');
        gesture.current = {
          x: event.clientX,
          y: event.clientY,
          mode: subButton !== null ? subButton.dataset.group : mainButton !== null ? mainButton.dataset.mode : activeMain,
          pressed: subButton !== null ? subButton.dataset.choice : mainButton !== null ? mainButton.dataset.mode : null,
          group: subButton !== null ? subButton.dataset.group : null,
          sub: subButton !== null ? subButton.dataset.choice : null,
          moved: false,
        };
        setDragging(true);
        hideTip();
        try {
          controlRef.current?.setPointerCapture(event.pointerId);
        } catch {
          // 某些环境不支持指针捕获，拖拽仍可继续。
        }
        previewGesture(event);
      };

      const onPointerMove = (event) => {
        if (gesture.current === null) return;
        previewGesture(event);
      };

      const onPointerUp = () => {
        const state = gesture.current;
        gesture.current = null;
        setDragging(false);
        setPreview(null);
        if (state === null) return;
        // 指针捕获后浏览器可能不再把 click 派发到按钮上，这里统一提交一次。
        suppress.current = Date.now() + 350;
        if (state.moved) {
          const target = state.group !== null ? state.sub : state.mode;
          if (target !== null && target !== undefined) request(target);
          return;
        }
        if (state.pressed !== null && state.pressed !== undefined) request(state.pressed);
      };

      const onPointerCancel = () => {
        gesture.current = null;
        setDragging(false);
        setPreview(null);
      };

      /** 打开子档列：拖拽预览所在的组、悬停的组或其子档、或当前档位所在组。 */
      const openFlyout = (group) => {
        if (preview !== null) return preview.group === group;
        if (tip !== null) return tip === group || GROUPS[group].includes(tip);
        return (PARENT[active] ?? active) === group;
      };

      const subSpot = (group) => {
        const subs = GROUPS[group];
        const index = preview !== null && preview.group === group
          ? Math.max(0, subs.indexOf(preview.sub))
          : Math.max(0, subs.indexOf(PARENT[active] !== undefined && PARENT[active] === group ? active : subs[0]));
        return 26 + index * SUB_H;
      };

      if (mainId === undefined) return null;

      const railChildren = [
        h('div', { key: 'dots', className: 'dshgear-dots', 'aria-hidden': 'true' }),
        h('div', {
          key: 'thumb',
          className: 'dshgear-thumb',
          'aria-hidden': 'true',
          style: {
            transform: `translateY(${thumbOf(shownIndex)}px)`,
            opacity: braked ? 0 : 1,
          },
        }),
      ];
      for (const code of MAIN) {
        const isActive = activeMain === code && preview === null;
        const isPreview = preview !== null && preview.group === code;
        railChildren.push(
          h(
            'button',
            {
              key: code,
              type: 'button',
              className: 'dshgear-key',
              'data-mode': code,
              'data-active': isActive ? 'true' : 'false',
              'data-preview': isPreview ? 'true' : 'false',
              'aria-pressed': isActive,
              'aria-label': `${code} ${label(t, code)}`,
              onClick: () => clickRequest(code),
              onMouseEnter: () => {
                if (isActive) reveal();
                showTip(code);
              },
              onMouseLeave: hideTip,
              onFocus: () => {
                reveal();
                showTip(code);
              },
              onBlur: hideTip,
            },
            code,
            h('small', { className: 'dshgear-cn' }, label(t, code)),
          ),
        );
      }

      const flyouts = [];
      for (const group of Object.keys(GROUPS)) {
        const open = openFlyout(group);
        const current = (PARENT[active] ?? active) === group && !braked;
        flyouts.push(
          h(
            'div',
            {
              key: `flyout-${group}`,
              className: 'dshgear-flyout',
              'data-open': open ? 'true' : 'false',
              'data-current': current ? 'true' : 'false',
              'data-tracking': preview !== null && preview.group === group ? 'true' : 'false',
              'data-frozen': braked ? 'true' : 'false',
              style: { top: `${branchTopOf(group)}px`, '--dshgear-sub-spot': `${subSpot(group)}px` },
              'aria-label': `${group} ${t('flyout.label')}`,
              onMouseEnter: () => showTip(group),
              onMouseLeave: hideTip,
            },
            h('div', { key: 'bd', className: 'dshgear-branch-dots', 'aria-hidden': 'true' }),
            h('div', { key: 'st', className: 'dshgear-sub-thumb', 'aria-hidden': 'true' }),
            ...GROUPS[group].map((sub) =>
              h(
                'button',
                {
                  key: sub,
                  type: 'button',
                  className: 'dshgear-sub',
                  'data-choice': sub,
                  'data-group': group,
                  'data-active': active === sub && preview === null ? 'true' : 'false',
                  'data-preview': preview !== null && preview.sub === sub ? 'true' : 'false',
                  'aria-pressed': active === sub,
                  'aria-label': `${sub} ${label(t, sub)}`,
                  onClick: () => clickRequest(sub),
                  onMouseEnter: () => showTip(sub),
                  onFocus: () => showTip(sub),
                },
                sub,
              ),
            ),
          ),
        );
      }

      const validTip = (code) => typeof code === 'string' && (code === 'H' || ALL.includes(code));
      const tipLive = validTip(tip);
      const tipCode = tipLive ? tip : validTip(tipHeld) ? tipHeld : null;
      /** 说明栏贴在滑轨/子档列的右缘，空 6px；有子档列时让开它的宽度。 */
      const tipGroupOpen = tipCode !== null && GROUPS[tipCode] !== undefined && openFlyout(tipCode);
      const tipLeft = tipCode === null
        ? 52
        : tipCode === 'H' || PARENT[tipCode] !== undefined || tipGroupOpen
          ? 96
          : 52;
      const tipTop = tipCode === null
        ? 0
        : tipCode === 'H'
          ? RAIL_H + 13 + 22 - 18
          : PARENT[tipCode] !== undefined
            ? branchTopOf(PARENT[tipCode]) + GROUPS[PARENT[tipCode]].indexOf(tipCode) * SUB_H + 19 - 18
            : spotOf(MAIN.indexOf(tipCode)) - 18;

      /** 只有对话界面显示滑轨：主面板（插件 / 自动化任务 / 更多）占住主区时整体隐藏。 */
      const hidden = panelOpen;
      React.useEffect(() => {
        if (!hidden) reveal();
      }, [hidden, reveal]);

      return h(
        'div',
        {
          className: 'dshgear-root',
          ref: rootRef,
          style: hidden ? HIDDEN_STYLE : anchorLeft === null ? undefined : { left: `${anchorLeft}px` },
          'data-hidden': hidden ? 'true' : 'false',
          'data-settled': settled ? 'true' : 'false',
          'data-braked': braked ? 'true' : 'false',
          'data-dragging': dragging ? 'true' : 'false',
          'data-resting': resting ? 'true' : 'false',
        },
        h('style', { key: 'css' }, CSS),
        h(
          'div',
          {
            key: 'control',
            ref: controlRef,
            className: 'dshgear-control',
            role: 'group',
            'aria-label': t('rail.label'),
            onPointerEnter: () => setInside(true),
            onPointerLeave: () => setInside(false),
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel,
            onLostPointerCapture: onPointerCancel,
          },
          h(
            'div',
            { key: 'rail', ref: railRef, className: 'dshgear-rail', 'data-braked': braked ? 'true' : 'false' },
            railChildren,
          ),
          flyouts,
          h(
            'button',
            {
              key: 'brake',
              type: 'button',
              className: 'dshgear-brake',
              'data-brake': 'true',
              'data-braked': braked ? 'true' : 'false',
              'data-locked': braked ? 'true' : 'false',
              'data-holding': holding ? 'true' : 'false',
              'data-armed': armed ? 'true' : 'false',
              'aria-pressed': braked,
              'aria-label': braked ? t('brake.release') : armed ? t('brake.armed') : t('brake.engage'),
              title: braked ? t('brake.release') : armed ? t('brake.armed') : t('brake.engage'),
              onPointerDown: (event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                  // 没有指针捕获时 onPointerUp 仍会在按钮上触发。
                }
                pressBrake();
              },
              onPointerUp: (event) => {
                event.stopPropagation();
                stopHold();
              },
              onPointerCancel: stopHold,
              onLostPointerCapture: stopHold,
              onKeyDown: (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                if (event.repeat) return;
                pressBrake();
              },
              onKeyUp: (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                stopHold();
              },
              onBlur: stopHold,
              onMouseEnter: () => {
                reveal();
                showTip('H');
              },
              onMouseLeave: hideTip,
            },
            h('i', { key: 'bd', className: 'dshgear-brake-dots', 'aria-hidden': 'true' }),
            h(
              'svg',
              { key: 'ic', className: 'dshgear-brake-icon', viewBox: '0 0 44 44', 'aria-hidden': 'true' },
              h('circle', { cx: 22, cy: 22, r: 14 }),
              h('circle', { className: 'dshgear-brake-progress', cx: 22, cy: 22, r: 14, pathLength: 1 }),
              h('path', { d: 'M 4.679492 12 A 20 20 0 0 0 4.679492 32 M 39.320508 12 A 20 20 0 0 1 39.320508 32' }),
            ),
            h('span', { key: 'lbl', className: 'dshgear-brake-glyph', 'aria-hidden': 'true' }, 'H'),
            h('small', { key: 'cn', className: 'dshgear-brake-cn' }, label(t, 'H')),
          ),
          tipCode === null ? null : h(
            'div',
            {
              key: 'tip',
              className: 'dshgear-tip',
              'data-show': tipLive ? 'true' : 'false',
              style: { top: `${Math.max(0, tipTop)}px`, left: `${tipLeft}px` },
              'aria-live': 'polite',
            },
            h(
              'div',
              { key: 'm', className: 'dshgear-tip-mode' },
              tipCode,
              h('small', null, tipCode === 'H' ? (braked ? t('brake.on') : t('brake.label')) : `${modeName(t, tipCode)} · ${label(t, tipCode)}`),
            ),
            h('div', { key: 'd', className: 'dshgear-tip-desc' }, tipCode === 'H' ? (braked ? t('brake.tip') : armed ? t('brake.armed') : t('brake.engage')) : describe(t, tipCode)),
          ),
          notice === null ? null : h('div', { key: 'toast', className: 'dshgear-toast', role: 'status' }, notice),
        ),
      );
    }

    return {
      inject: ['slots', 'sessions', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'gear-mode: rail dictionaries');
        const t = ctx.locale.bind(NS);
        const sessions = ctx.sessions;
        /** 外壳的主面板选择源（插件 / 自动化任务 / 更多）；取不到就当一直在对话里。 */
        const panelInfo = () => {
          try {
            return ctx.get('layout')?.panelInfo;
          } catch {
            return undefined;
          }
        };
        /** 槽位标准属性之外的依赖通过闭包注入，避免滑轨自己去解析服务。 */
        const Bound = (props) => h(GearRail, { ...props, __gearT: t, __gearSessions: sessions, __gearPanel: panelInfo });
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'gear-mode', order: 20, locale: NS, label: () => t('rail.label') },
            Bound,
          ),
        );
      },
    };
  },
});
