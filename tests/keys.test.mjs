// Keys.js under node --test: the UX §4.5 key map and the PRODUCT UI-1..UI-10
// fixtures (PLAN §6.8, A20).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadQmlJs } from "./qml-js-loader.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const Model = loadQmlJs(path.join(here, "..", "Model.js"));
const Keys = loadQmlJs(path.join(here, "..", "Keys.js"), { Model });

const item = (id, name, status, extra) => Object.assign({ id: String(id), uid: null, name, description: "", status, plan: [], notes: [], due: null, author: null }, extra || {});
const idle = { phase: "idle", running: false, remaining: 0, taskId: "", label: "", attached: false };
const onTask = (id, running) => ({ phase: "work", running: running !== false, remaining: 1122, taskId: String(id), label: "x", attached: true });

function ctxFor(over) {
  return Object.assign({ backend: "cli", focus: { text: "", taskId: null }, sessionDone: {}, pomodoro: idle, item: null, onFocusLine: false }, over || {});
}

// ---------------------------------------------------------------- keyAction
test("UI-4: d / s / f / p on a todo row", () => {
  const ctx = ctxFor({ item: item("3", "Wire", "todo") });
  assert.deepEqual(Keys.keyAction("list", "d", ctx), { type: "setStatus", id: "3", status: "done" });
  assert.deepEqual(Keys.keyAction("list", "s", ctx), { type: "setStatus", id: "3", status: "doing" });
  assert.deepEqual(Keys.keyAction("list", "f", ctx), { type: "focus", id: "3" });
  assert.deepEqual(Keys.keyAction("list", "p", ctx), { type: "startPomodoro", id: "3" });
  assert.deepEqual(Keys.keyAction("detail", "d", ctx), { type: "setStatus", id: "3", status: "done" });
});

test("AC-7.2b: d toggles done; a done row reopens to todo", () => {
  assert.deepEqual(Keys.keyAction("list", "d", ctxFor({ item: item("3", "Wire", "todo") })), { type: "setStatus", id: "3", status: "done" });
  assert.deepEqual(Keys.keyAction("list", "d", ctxFor({ item: item("3", "Wire", "done"), sessionDone: { 3: "todo" } })), { type: "setStatus", id: "3", status: "todo" });
});

test("UI-5: f and s on the focus task", () => {
  const ctx = ctxFor({ item: item("3", "Wire", "doing"), focus: { text: "t", taskId: "3" } });
  assert.deepEqual(Keys.keyAction("list", "f", ctx), { type: "focus", id: "clear" });
  assert.deepEqual(Keys.keyAction("list", "s", ctx), { type: "setStatus", id: "3", status: "todo" });
});

test("AC-5.3b: f emits focus id, and clear when already focused", () => {
  assert.deepEqual(Keys.keyAction("list", "f", ctxFor({ item: item("3", "Wire", "todo") })), { type: "focus", id: "3" });
  assert.deepEqual(Keys.keyAction("list", "f", ctxFor({ item: item("3", "Wire", "doing"), focus: { text: "", taskId: "3" } })), { type: "focus", id: "clear" });
});

test("UI-4b: s / f / p are inert on a done row with the transient; d reopens; p keeps pausing an attached timer", () => {
  const done = item("12", "Write UX spec for the panels", "done");
  const ctx = ctxFor({ item: done, sessionDone: { 12: "doing" } });
  for (const k of ["s", "f", "p"]) assert.deepEqual(Keys.keyAction("list", k, ctx), { type: "message", text: "#12 is done · d reopens it" }, k);
  for (const k of ["s", "f", "p"]) assert.deepEqual(Keys.keyAction("detail", k, ctx), { type: "message", text: "#12 is done · d reopens it" }, k);
  assert.deepEqual(Keys.keyAction("list", "d", ctx), { type: "setStatus", id: "12", status: "todo" });
  assert.deepEqual(Keys.keyAction("list", "s", ctxFor({ backend: "json", item: done, sessionDone: { 12: "doing" } })), { type: "message", text: "Write UX spec for the… is done · d reopens it" });
  assert.deepEqual(Keys.keyAction("list", "p", ctxFor({ item: done, sessionDone: { 12: "doing" }, pomodoro: onTask("12") })), { type: "pausePomodoro" });
});

test("a row is done only by its status: a reverted or externally reopened row keeps its keys", () => {
  // The write behind `d` failed and was reverted (or todocli reopened the
  // task): the status is todo again although sessionDone still lists it.
  const ctx = ctxFor({ item: item("3", "Wire", "todo"), sessionDone: { 3: "todo" } });
  assert.deepEqual(Keys.keyAction("list", "s", ctx), { type: "setStatus", id: "3", status: "doing" });
  assert.deepEqual(Keys.keyAction("list", "d", ctx), { type: "setStatus", id: "3", status: "done" });
  assert.deepEqual(Keys.keyAction("list", "f", ctx), { type: "focus", id: "3" });
  assert.deepEqual(Keys.keyAction("list", "p", ctx), { type: "startPomodoro", id: "3" });
});

test("p on the task the pomodoro is attached to pauses/resumes instead of starting", () => {
  assert.deepEqual(Keys.keyAction("list", "p", ctxFor({ item: item("3", "Wire", "doing"), pomodoro: onTask("3") })), { type: "pausePomodoro" });
  assert.deepEqual(Keys.keyAction("list", "p", ctxFor({ item: item("3", "Wire", "doing"), pomodoro: onTask("3", false) })), { type: "pausePomodoro" });
  assert.deepEqual(Keys.keyAction("list", "p", ctxFor({ item: item("3", "Wire", "doing"), pomodoro: onTask("9") })), { type: "startPomodoro", id: "3" });
});

test("keys on the focus line act on the focus task or the free-text focus", () => {
  const focusTask = ctxFor({ onFocusLine: true, item: item("3", "Wire", "doing"), focus: { text: "", taskId: "3" } });
  assert.deepEqual(Keys.keyAction("list", "f", focusTask), { type: "focus", id: "clear" });
  assert.deepEqual(Keys.keyAction("list", "p", focusTask), { type: "startPomodoro", id: "3" });
  assert.deepEqual(Keys.keyAction("list", "d", focusTask), { type: "setStatus", id: "3", status: "done" });
  const freeText = ctxFor({ onFocusLine: true, item: null, focus: { text: "Ship it", taskId: null } });
  assert.deepEqual(Keys.keyAction("list", "p", freeText), { type: "startPomodoro", id: "focus" });
  assert.deepEqual(Keys.keyAction("list", "f", freeText), { type: "focus", id: "clear" });
  assert.equal(Keys.keyAction("list", "d", freeText), null);
  assert.equal(Keys.keyAction("list", "s", freeText), null);
  const f0 = ctxFor({ onFocusLine: true, item: null, focus: { text: "", taskId: null } });
  assert.equal(Keys.keyAction("list", "p", f0), null);
  assert.equal(Keys.keyAction("list", "f", f0), null);
});

test("UI-9: +, n, a do nothing in the detail view; n/N/+ open compose in the list", () => {
  const ctx = ctxFor({ item: item("3", "Wire", "todo") });
  for (const k of ["+", "n", "a", "N"]) assert.equal(Keys.keyAction("detail", k, ctx), null, k);
  for (const k of ["n", "N", "+"]) assert.deepEqual(Keys.keyAction("list", k, ctx), { type: "compose" }, k);
  assert.equal(Keys.keyAction("list", "a", ctx), null);
  assert.equal(Keys.keyAction("list", "z", ctx), null);
  assert.equal(Keys.keyAction("list", "d", ctxFor({ item: null })), null);
});

test("UI-10: r refreshes and R asks the store to sync whatever the backend; error view keeps r/R", () => {
  assert.deepEqual(Keys.keyAction("list", "r", ctxFor()), { type: "refresh" });
  assert.deepEqual(Keys.keyAction("error", "r", ctxFor()), { type: "refresh" });
  assert.deepEqual(Keys.keyAction("detail", "r", ctxFor()), { type: "refresh" });
  assert.deepEqual(Keys.keyAction("list", "R", ctxFor({ backend: "cli" })), { type: "syncNow" });
  assert.deepEqual(Keys.keyAction("error", "R", ctxFor({ backend: "cli" })), { type: "syncNow" });
  // The json store answers syncNow with the "Sync needs backend = cli." transient itself.
  assert.deepEqual(Keys.keyAction("list", "R", ctxFor({ backend: "json" })), { type: "syncNow" });
  assert.equal(Keys.keyAction("error", "d", ctxFor({ item: item("1", "x", "todo") })), null);
  assert.deepEqual(Keys.keyAction("list", "?", ctxFor()), { type: "toggleHelp" });
  assert.deepEqual(Keys.keyAction("detail", "?", ctxFor()), { type: "toggleHelp" });
  assert.equal(Keys.keyAction("compose", "d", ctxFor({ item: item("1", "x", "todo") })), null, "compose keys belong to the fields");
});

// ---------------------------------------------------------------- reduceUi
function rows(items, focusRow) {
  const out = [];
  if (focusRow) out.push(focusRow);
  for (const it of items) out.push({ kind: "item", item: it, selectable: true });
  return out;
}
function uiCtx(over) {
  return Object.assign({ backend: "cli", focus: { text: "", taskId: null }, sessionDone: {}, pomodoro: idle, rows: rows([item("3", "Wire", "todo"), item("6", "Six", "todo")]), steps: 0, prefill: "" }, over || {});
}
function run(ui, events, ctx) {
  const actions = [];
  let state = ui;
  for (const ev of events) {
    const r = Keys.reduceUi(state, ev, ctx);
    state = r.ui;
    actions.push(...r.actions);
  }
  return { ui: state, actions };
}

test("initialUi is the closed list with the cursor on the first row", () => {
  const ui = Keys.initialUi();
  assert.equal(ui.view, "list");
  assert.equal(ui.cursor, 0);
  assert.equal(ui.armedId, "");
  assert.equal(ui.help, false);
  assert.equal(ui.composeField, "name");
});

test("UI-1 / AC-2.1: n, text, Enter, text, Enter yields one add action and returns to the list", () => {
  const ctx = uiCtx();
  const events = [{ type: "key", key: "n", now: 0 }];
  let r = run(Keys.initialUi(), events, ctx);
  assert.equal(r.ui.view, "compose");
  assert.equal(r.ui.composeField, "name");
  assert.deepEqual(r.actions, [{ type: "composeOpened", prefill: "" }]);
  r = run(r.ui, [{ type: "text", text: "Buy milk" }], ctx);
  assert.equal(r.ui.name, "Buy milk");
  r = run(r.ui, [{ type: "enter", now: 1 }], ctx);
  assert.equal(r.ui.view, "compose");
  assert.equal(r.ui.composeField, "description");
  assert.deepEqual(r.actions, []);
  r = run(r.ui, [{ type: "text", text: "Semi-skimmed" }, { type: "enter", now: 2 }], ctx);
  assert.equal(r.ui.view, "list");
  assert.deepEqual(r.actions, [{ type: "add", name: "Buy milk", description: "Semi-skimmed" }]);
  assert.equal(r.ui.name, "");
  assert.equal(r.ui.description, "");
});

test("UI-2 / AC-2.4: Enter on an empty name stays in compose(name) with no action", () => {
  const ctx = uiCtx();
  let r = run(Keys.initialUi(), [{ type: "key", key: "+", now: 0 }, { type: "text", text: "   " }, { type: "enter", now: 1 }], ctx);
  assert.equal(r.ui.view, "compose");
  assert.equal(r.ui.composeField, "name");
  assert.deepEqual(r.actions.filter((a) => a.type !== "composeOpened"), []);
});

test("UI-3: Esc in compose drops the draft; Tab moves between the fields", () => {
  const ctx = uiCtx();
  let r = run(Keys.initialUi(), [{ type: "key", key: "N", now: 0 }, { type: "text", text: "draft" }, { type: "tab", direction: 1 }], ctx);
  assert.equal(r.ui.composeField, "description");
  r = run(r.ui, [{ type: "tab", direction: -1 }], ctx);
  assert.equal(r.ui.composeField, "name");
  r = run(r.ui, [{ type: "text", text: "d2" }, { type: "esc", now: 3 }], ctx);
  assert.equal(r.ui.view, "list");
  assert.equal(r.ui.name, "");
  assert.equal(r.ui.description, "");
  assert.deepEqual(r.actions.filter((a) => a.type !== "composeOpened"), []);
  const t = run(Keys.initialUi(), [{ type: "tab", direction: 1 }], ctx);
  assert.deepEqual(t.actions, [{ type: "switchPanel", direction: 1 }]);
  const td = run(Object.assign(Keys.initialUi(), { view: "detail" }), [{ type: "tab", direction: -1 }], ctx);
  assert.deepEqual(td.actions, [{ type: "switchPanel", direction: -1 }]);
});

test("Enter on a free-text focus opens compose pre-filled (F6)", () => {
  const ctx = uiCtx({ focus: { text: "Ship it", taskId: null }, rows: rows([item("3", "Wire", "todo")], { kind: "focus", item: null, selectable: true }), prefill: "Ship it" });
  const r = run(Keys.initialUi(), [{ type: "enter", now: 0 }], ctx);
  assert.equal(r.ui.view, "compose");
  assert.equal(r.ui.name, "Ship it");
  assert.deepEqual(r.actions, [{ type: "composeOpened", prefill: "Ship it" }]);
  const nonSelectable = uiCtx({ rows: rows([item("3", "Wire", "todo")], { kind: "focus", item: null, selectable: false }) });
  const r0 = run(Keys.initialUi(), [{ type: "enter", now: 0 }], nonSelectable);
  assert.equal(r0.ui.view, "list", "F0 is not selectable");
  const focusTask = uiCtx({ rows: rows([item("3", "Wire", "doing")], { kind: "focus", item: item("3", "Wire", "doing"), selectable: true }) });
  const r1 = run(Keys.initialUi(), [{ type: "enter", now: 0 }], focusTask);
  assert.equal(r1.ui.view, "detail");
  assert.equal(r1.ui.selectedId, "3");
});

test("UI-6 / AC-9.4b: delete is armed, never immediate", () => {
  const ctx = uiCtx({ rows: rows([item("6", "Six", "todo")]) });
  let r = run(Keys.initialUi(), [{ type: "delete", now: 1000 }], ctx);
  assert.deepEqual(r.actions, []);
  assert.equal(r.ui.armedId, "6");
  assert.equal(r.ui.armedAt, 1000);
  r = run(r.ui, [{ type: "delete", now: 3900 }], ctx);
  assert.deepEqual(r.actions, [{ type: "remove", id: "6" }]);
  assert.equal(r.ui.armedId, "");
  // x then another key
  r = run(Keys.initialUi(), [{ type: "delete", now: 0 }, { type: "key", key: "z", now: 100 }], ctx);
  assert.equal(r.ui.armedId, "");
  assert.deepEqual(r.actions, []);
  // x then 3 s
  r = run(Keys.initialUi(), [{ type: "delete", now: 0 }, { type: "tick", now: 3001 }], ctx);
  assert.equal(r.ui.armedId, "");
  r = run(Keys.initialUi(), [{ type: "delete", now: 0 }, { type: "tick", now: 2999 }], ctx);
  assert.equal(r.ui.armedId, "6", "still armed inside 3 s");
  // late second x re-arms rather than deleting
  r = run(Keys.initialUi(), [{ type: "delete", now: 0 }, { type: "delete", now: 3001 }], ctx);
  assert.deepEqual(r.actions, []);
  assert.equal(r.ui.armedId, "6");
  assert.equal(r.ui.armedAt, 3001);
  // Esc disarms without closing
  r = run(Keys.initialUi(), [{ type: "delete", now: 0 }, { type: "esc", now: 1 }], ctx);
  assert.equal(r.ui.armedId, "");
  assert.deepEqual(r.actions, []);
  // a cursor move disarms
  const two = uiCtx({ rows: rows([item("6", "Six", "todo"), item("7", "Seven", "todo")]) });
  r = run(Keys.initialUi(), [{ type: "delete", now: 0 }, { type: "move", dx: 0, dy: 1, now: 1 }], two);
  assert.equal(r.ui.armedId, "");
  assert.equal(r.ui.cursor, 1);
  // delete on the focus line or an empty list does nothing
  const f0 = uiCtx({ rows: rows([item("6", "Six", "todo")], { kind: "focus", item: null, selectable: false }) });
  r = run(Keys.initialUi(), [{ type: "delete", now: 0 }], f0);
  assert.equal(r.ui.armedId, "");
  r = run(Keys.initialUi(), [{ type: "delete", now: 0 }], uiCtx({ rows: [] }));
  assert.equal(r.ui.armedId, "");
});

test("delete in the detail view removes and returns to the list", () => {
  const ctx = uiCtx({ rows: rows([item("6", "Six", "todo")]) });
  const detail = Object.assign(Keys.initialUi(), { view: "detail", selectedId: "6" });
  let r = run(detail, [{ type: "delete", now: 0 }], ctx);
  assert.equal(r.ui.armedId, "6");
  assert.equal(r.ui.view, "detail");
  r = run(r.ui, [{ type: "delete", now: 1000 }], ctx);
  assert.deepEqual(r.actions, [{ type: "remove", id: "6" }]);
  assert.equal(r.ui.view, "list");
  assert.equal(r.ui.selectedId, "");
  const armedElsewhere = Object.assign(Keys.initialUi(), { view: "detail", selectedId: "6", armedId: "9", armedAt: 0 });
  r = run(armedElsewhere, [{ type: "delete", now: 10 }], ctx);
  assert.deepEqual(r.actions, [], "an arm for another id re-arms this one");
  assert.equal(r.ui.armedId, "6");
});

test("UI-7: Enter or Space in the detail view toggles the step under the cursor", () => {
  const ctx = uiCtx({ steps: 3 });
  const detail = Object.assign(Keys.initialUi(), { view: "detail", selectedId: "3", stepCursor: 1 });
  assert.deepEqual(run(detail, [{ type: "enter", now: 0 }], ctx).actions, [{ type: "toggleStep", id: "3", n: 2 }]);
  assert.deepEqual(run(detail, [{ type: "space", now: 0 }], ctx).actions, [{ type: "toggleStep", id: "3", n: 2 }]);
  assert.deepEqual(run(detail, [{ type: "enter", now: 0 }], uiCtx({ steps: 0 })).actions, [], "no steps, nothing to toggle");
  const moved = run(detail, [{ type: "move", dx: 0, dy: 1, now: 0 }, { type: "move", dx: 0, dy: 1, now: 0 }, { type: "move", dx: 0, dy: 1, now: 0 }], ctx);
  assert.equal(moved.ui.stepCursor, 2, "clamped to the last step");
  const up = run(moved.ui, [{ type: "move", dx: 0, dy: -5, now: 0 }], ctx);
  assert.equal(up.ui.stepCursor, 0);
});

test("UI-8: Esc goes up exactly one level; h/Left in detail goes back; l/Right in list opens", () => {
  const ctx = uiCtx();
  const detail = Object.assign(Keys.initialUi(), { view: "detail", selectedId: "3", stepCursor: 2, help: true });
  let r = run(detail, [{ type: "esc", now: 0 }], ctx);
  assert.equal(r.ui.view, "list");
  assert.equal(r.ui.stepCursor, 0);
  assert.deepEqual(r.actions, []);
  r = run(Keys.initialUi(), [{ type: "esc", now: 0 }], ctx);
  assert.equal(r.ui.view, "list");
  assert.deepEqual(r.actions, [{ type: "close" }]);
  r = run(Object.assign(Keys.initialUi(), { view: "error" }), [{ type: "esc", now: 0 }], ctx);
  assert.deepEqual(r.actions, [{ type: "close" }]);
  r = run(detail, [{ type: "move", dx: -1, dy: 0, now: 0 }], ctx);
  assert.equal(r.ui.view, "list");
  r = run(Keys.initialUi(), [{ type: "move", dx: 1, dy: 0, now: 0 }], ctx);
  assert.equal(r.ui.view, "detail");
  assert.equal(r.ui.selectedId, "3");
  r = run(Keys.initialUi(), [{ type: "space", now: 0 }], ctx);
  assert.equal(r.ui.view, "detail", "Space opens the cursor row too");
  r = run(Object.assign(Keys.initialUi(), { view: "compose", name: "x" }), [{ type: "space", now: 0 }], ctx);
  assert.equal(r.ui.view, "compose", "space is text while composing");
  r = run(Keys.initialUi(), [{ type: "move", dx: 1, dy: 0, now: 0 }], uiCtx({ rows: [] }));
  assert.equal(r.ui.view, "list", "nothing to open");
});

test("cursor movement clamps to the rows and hover moves it", () => {
  const ctx = uiCtx({ rows: rows([item("1", "a", "todo"), item("2", "b", "todo"), item("3", "c", "todo")]) });
  let r = run(Keys.initialUi(), [{ type: "move", dx: 0, dy: -1, now: 0 }], ctx);
  assert.equal(r.ui.cursor, 0);
  r = run(r.ui, [{ type: "move", dx: 0, dy: 1, now: 0 }, { type: "move", dx: 0, dy: 1, now: 0 }, { type: "move", dx: 0, dy: 1, now: 0 }], ctx);
  assert.equal(r.ui.cursor, 2);
  r = run(r.ui, [{ type: "hover", index: 1, now: 0 }], ctx);
  assert.equal(r.ui.cursor, 1);
  r = run(r.ui, [{ type: "hover", index: 9, now: 0 }], ctx);
  assert.equal(r.ui.cursor, 1, "an out-of-range hover is ignored");
  assert.equal(Keys.clampCursor(5, 3), 2);
  assert.equal(Keys.clampCursor(-1, 3), 0);
  assert.equal(Keys.clampCursor(2, 0), 0);
});

test("text keys in the list route through keyAction with the cursor row as context", () => {
  const items = [item("3", "Wire", "doing"), item("6", "Six", "todo")];
  const ctx = uiCtx({ rows: rows(items, { kind: "focus", item: items[0], selectable: true }), focus: { text: "", taskId: "3" } });
  let r = run(Keys.initialUi(), [{ type: "key", key: "f", now: 0 }], ctx);
  assert.deepEqual(r.actions, [{ type: "focus", id: "clear" }], "cursor 0 is the focus line");
  r = run(Object.assign(Keys.initialUi(), { cursor: 2 }), [{ type: "key", key: "d", now: 0 }], ctx);
  assert.deepEqual(r.actions, [{ type: "setStatus", id: "6", status: "done" }]);
  r = run(Keys.initialUi(), [{ type: "key", key: "?", now: 0 }], ctx);
  assert.equal(r.ui.help, true);
  assert.deepEqual(r.actions, []);
  r = run(r.ui, [{ type: "key", key: "?", now: 0 }], ctx);
  assert.equal(r.ui.help, false);
  const detail = Object.assign(Keys.initialUi(), { view: "detail", selectedId: "6" });
  r = run(detail, [{ type: "key", key: "s", now: 0 }], ctx);
  assert.deepEqual(r.actions, [{ type: "setStatus", id: "6", status: "doing" }], "detail keys use the selected item");
  r = run(detail, [{ type: "key", key: "n", now: 0 }], ctx);
  assert.equal(r.ui.view, "detail");
  assert.deepEqual(r.actions, []);
  r = run(Object.assign(Keys.initialUi(), { view: "error" }), [{ type: "key", key: "r", now: 0 }], ctx);
  assert.deepEqual(r.actions, [{ type: "refresh" }]);
  r = run(Object.assign(Keys.initialUi(), { view: "error" }), [{ type: "key", key: "n", now: 0 }], ctx);
  assert.equal(r.ui.view, "error");
});

test("open / close reset the view, cursor, help and armed state", () => {
  const ctx = uiCtx();
  const messy = Object.assign(Keys.initialUi(), { view: "detail", selectedId: "3", cursor: 1, help: true, armedId: "3", armedAt: 5, name: "x" });
  let r = run(messy, [{ type: "close" }], ctx);
  assert.equal(r.ui.view, "list");
  assert.equal(r.ui.selectedId, "");
  assert.equal(r.ui.cursor, 0);
  assert.equal(r.ui.help, false);
  assert.equal(r.ui.armedId, "");
  assert.equal(r.ui.name, "");
  r = run(messy, [{ type: "open" }], ctx);
  assert.equal(r.ui.view, "list");
  assert.equal(r.ui.cursor, 0);
  assert.deepEqual(r.actions, []);
  r = run(Keys.initialUi(), [{ type: "storeError", error: { kind: "missing", message: "m" } }], ctx);
  assert.equal(r.ui.view, "error");
  r = run(r.ui, [{ type: "storeError", error: null }], ctx);
  assert.equal(r.ui.view, "list");
  r = run(Object.assign(Keys.initialUi(), { view: "error" }), [{ type: "storeError", error: { kind: "busy", message: "m" } }], ctx);
  assert.equal(r.ui.view, "list", "E5 is a banner above the list, so it leaves the error view");
  r = run(Object.assign(Keys.initialUi(), { view: "detail" }), [{ type: "storeError", error: null }], ctx);
  assert.equal(r.ui.view, "detail", "a cleared error only leaves the error view");
  r = run(Object.assign(Keys.initialUi(), { view: "detail", armedId: "3", armedAt: 1 }), [{ type: "storeError", error: { kind: "failed", message: "m" } }], ctx);
  assert.equal(r.ui.view, "error");
  assert.equal(r.ui.armedId, "", "the error view disarms a pending delete");
  r = run(Object.assign(Keys.initialUi(), { view: "detail", selectedId: "3" }), [{ type: "selectTask", id: "9" }], ctx);
  assert.equal(r.ui.selectedId, "9");
  assert.equal(r.ui.view, "detail");
  r = run(Keys.initialUi(), [{ type: "nonsense" }], ctx);
  assert.equal(r.ui.view, "list");
  assert.deepEqual(r.actions, []);
});
