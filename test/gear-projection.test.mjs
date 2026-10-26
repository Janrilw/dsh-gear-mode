/**
 * `gear` 会话投影的单元测试（node:test，不引第三方依赖）。
 *
 * 重点覆盖子会话的新行为：
 * - 起始 D 档，不继承父会话档位；
 * - 折叠时跳过继承前缀事件；
 * - 子会话永远不落手刹；
 * - 主会话 / 普通 fork 的行为保持不变。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { gearProjection } from '../index.js';

const MAIN_HEADER = { origin: 'user' };
const SUBAGENT_HEADER = { origin: 'subagent' };

test('projection identity: key/stateVersion stay wire-compatible', () => {
  assert.equal(gearProjection.key, 'gear');
  assert.equal(gearProjection.stateVersion, 2);
});

test('main session starts at P with the handbrake up', () => {
  const state = gearProjection.init(MAIN_HEADER, 0);
  assert.equal(state.gear, 'P');
  assert.equal(state.brake, false);
  assert.equal(state.subagent, false);
  assert.equal(state.inherited, 0);
});

test('subagent session starts at D, not at the parent gear', () => {
  const state = gearProjection.init(SUBAGENT_HEADER, 7);
  assert.equal(state.gear, 'D');
  assert.equal(state.brake, false);
  assert.equal(state.subagent, true);
  assert.equal(state.inherited, 7);
});

test('subagent skips inherited parent events', () => {
  let state = gearProjection.init(SUBAGENT_HEADER, 5);
  // 父会话在 seq 2 拉过手刹：子会话不能继承它。
  state = gearProjection.apply(state, toolResult(2, { gear: 'P', brake: true }));
  assert.equal(state.gear, 'D');
  assert.equal(state.brake, false);
  // 父会话在 seq 4 把档位切到 A：同样不能继承。
  state = gearProjection.apply(state, toolResult(4, { gear: 'A', brake: false }));
  assert.equal(state.gear, 'D');
});

test('subagent applies its own events after the inherited prefix', () => {
  let state = gearProjection.init(SUBAGENT_HEADER, 3);
  state = gearProjection.apply(state, toolResult(3, { gear: 'M-', brake: false }));
  assert.equal(state.gear, 'M-');
  assert.equal(state.subagent, true);
  assert.equal(state.inherited, 3);
});

test('subagent can never engage the handbrake', () => {
  let state = gearProjection.init(SUBAGENT_HEADER, 0);
  state = gearProjection.apply(state, toolResult(0, { gear: 'D', brake: true }));
  assert.equal(state.brake, false);
  assert.equal(state.gear, 'D');
});

test('normal fork still inherits the parent gear and brake', () => {
  let state = gearProjection.init({ origin: 'user' }, 4);
  state = gearProjection.apply(state, toolResult(1, { gear: 'A', brake: false }));
  assert.equal(state.gear, 'A');
  state = gearProjection.apply(state, toolResult(3, { gear: 'A', brake: true }));
  assert.equal(state.brake, true);
});

test('command lifecycle is atomic and keeps the extra state fields', () => {
  let state = gearProjection.init(MAIN_HEADER, 0);
  state = gearProjection.apply(state, commandRun(0, 'c1', 'm-'));
  assert.equal(state.gear, 'P', 'run alone must not commit');
  assert.equal(state.running.commandId, 'c1');
  state = gearProjection.apply(state, commandDone(1, 'c1', 'success'));
  assert.equal(state.gear, 'M-');
  assert.equal(state.running, null);
  assert.equal(state.subagent, false);

  state = gearProjection.apply(state, commandRun(2, 'c2', 'd'));
  state = gearProjection.apply(state, commandDone(3, 'c2', 'error'));
  assert.equal(state.gear, 'M-', 'failed command keeps the old gear');
  assert.equal(state.running, null);
});

test('a subagent command cannot smuggle the handbrake in', () => {
  let state = gearProjection.init(SUBAGENT_HEADER, 0);
  state = gearProjection.apply(state, commandRun(0, 'c1', 'h'));
  state = gearProjection.apply(state, commandDone(1, 'c1', 'success'));
  assert.equal(state.gear, 'D');
  assert.equal(state.brake, false);
});

test('invalid tool metadata is ignored', () => {
  const state = gearProjection.init(MAIN_HEADER, 0);
  assert.equal(gearProjection.apply(state, toolResult(0, { gear: 'Z', brake: false })), state);
  assert.equal(gearProjection.apply(state, toolResult(1, { gear: 'D', brake: 'yes' })), state);
  assert.equal(gearProjection.apply(state, { seq: 2, type: 'message/added', data: {} }), state);
});

test('wire view exposes only gear and brake, with reference stability', () => {
  const state = gearProjection.init(SUBAGENT_HEADER, 0);
  const view = gearProjection.wire.view(state);
  assert.deepEqual(view, { gear: 'D', brake: false });
  assert.equal(gearProjection.wire.view(state), view, 'same state must reuse the same view object');
  assert.doesNotThrow(() => gearProjection.wire.viewSchema.parse(view));
});

test('state schema accepts new fields and still rejects broken states', () => {
  const state = gearProjection.init(SUBAGENT_HEADER, 0);
  assert.doesNotThrow(() => gearProjection.stateSchema.parse(state));
  assert.doesNotThrow(() => gearProjection.stateSchema.parse({ gear: 'P', brake: false, running: null }));
  assert.throws(() => gearProjection.stateSchema.parse({ gear: 'P', brake: false, subagent: 'yes' }));
  assert.throws(() => gearProjection.stateSchema.parse({ gear: 'P', brake: false, inherited: 1.5 }));
  assert.throws(() => gearProjection.stateSchema.parse({ gear: 'Z', brake: false }));
});

function commandRun(seq, commandId, args) {
  return { seq, type: 'command/run', data: { name: 'gear', args, commandId } };
}

function commandDone(seq, commandId, kind) {
  return { seq, type: 'command/done', data: { commandId, kind } };
}

function toolResult(seq, gearMode) {
  return { seq, type: 'tool/result', data: { meta: { gearMode } } };
}
