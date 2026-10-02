// NorthStarKeys.js under node --test (ADDENDUM-S11 §5.4, §4.7.1): `*` in
// the todo panel, the popup's keys, the scroll step and IPC `northStar()`.
// AC-ST.76, 77, 79, 83 and 87 (node); the Keys half drives Keys.reduceUi
// with a production-shaped context (Keys.panelContext's keys).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lib } from "./helpers.mjs";
import { streams, task } from "./p2-helpers.mjs";

const NorthStarKeys = lib("NorthStarKeys.js");
const NorthStar = lib("NorthStar.js");
const Keys = lib("Keys.js");
const View = lib("View.js");
const cli = (over) => Object.assign({ backend: "cli", loaded: true, hasNorthStar: true }, over || {});
const flick = (over) => Object.assign({ contentY: 0, contentHeight: 1000, height: 300, step: 48 }, over || {});

test("AC-ST.77 (node): `*` in the list view switches, or says why it cannot", () => {
  assert.deepEqual(NorthStarKeys.keyIntent(cli()), { type: "northStar" });
  assert.deepEqual(NorthStarKeys.keyIntent(cli({ backend: "json" })), { type: "message", text: NorthStar.E40 });
  assert.deepEqual(NorthStarKeys.keyIntent(cli({ hasNorthStar: false })), { type: "message", text: NorthStar.E41 });
  assert.equal(NorthStarKeys.keyIntent(cli({ loaded: false, hasNorthStar: false })), null, "before the first read: nothing");
  assert.equal(NorthStarKeys.keyIntent(undefined), null, "a capability-free context");
});

test("AC-ST.83 (node): the scroll step is Style.space(48), clamped to the content", () => {
  assert.equal(NorthStarKeys.SCROLL_STEP, 48);
  assert.equal(NorthStarKeys.scrollTo(0, 48, 1000, 300), 48);
  assert.equal(NorthStarKeys.scrollTo(690, 48, 1000, 300), 700, "clamped at the end");
  assert.equal(NorthStarKeys.scrollTo(20, -48, 1000, 300), 0, "clamped at the top");
  assert.equal(NorthStarKeys.scrollTo(0, 48, 200, 300), 0, "content shorter than the viewport");
  let y = 0;
  for (let i = 0; i < 3; i++) y = NorthStarKeys.popupKey({ type: "move", dx: 0, dy: 1 }, flick({ contentY: y })).contentY;
  assert.equal(y, 3 * 48, "j × 3");
  assert.deepEqual(NorthStarKeys.popupKey({ type: "move", dx: 0, dy: -1 }, flick({ contentY: y })), { type: "scroll", contentY: 96 });
});

test("AC-ST.76 (node): the popup's keys; everything else does nothing", () => {
  assert.deepEqual(NorthStarKeys.popupKey({ type: "esc" }, flick()), { type: "close" });
  assert.deepEqual(NorthStarKeys.popupKey({ type: "key", key: "*" }, flick()), { type: "flip" });
  assert.deepEqual(NorthStarKeys.popupKey({ type: "key", key: "r" }, flick()), { type: "reload" });
  assert.deepEqual(NorthStarKeys.popupKey({ type: "key", key: "?" }, flick()), { type: "help" });
  assert.deepEqual(NorthStarKeys.popupKey({ type: "tab", direction: 1 }, flick()), { type: "switchPanel", direction: 1 });
  assert.deepEqual(NorthStarKeys.popupKey({ type: "tab", direction: -1 }, flick()), { type: "switchPanel", direction: -1 });
  const quiet = "d s f p n N + m v ! z [ ] 3 0 9 R x X".split(" ").map((key) => ({ type: "key", key }))
    .concat(["\u007f", "\b", "о", "л", "к"].map((key) => ({ type: "key", key })))
    .concat([{ type: "enter" }, { type: "space" }, { type: "delete" }, { type: "move", dx: -1, dy: 0 }, { type: "move", dx: 1, dy: 0 }, {}]);
  for (const ev of quiet) assert.equal(NorthStarKeys.popupKey(ev, flick()), null, JSON.stringify(ev));
  assert.equal(NorthStarKeys.popupKey(undefined, flick()), null);
});

test("AC-ST.79 (node): IPC northStar(), checked in §4.7.1's order", () => {
  const ipc = (over) => NorthStarKeys.ipcIntent(Object.assign({ panelLoaded: true, popupOpen: false, error: null }, cli(), over || {}));
  assert.deepEqual(ipc({ panelLoaded: false }), { action: "none", reply: "unavailable" });
  assert.deepEqual(ipc({ popupOpen: true }), { action: "close", reply: "ok" });
  assert.deepEqual(ipc({ popupOpen: true, backend: "json" }), { action: "close", reply: "ok" });
  assert.deepEqual(ipc(), { action: "open", reply: "ok" });
  assert.deepEqual(ipc({ error: { kind: "failed", message: "x" } }), { action: "open", reply: "ok" }, "stale: still ok");
  assert.deepEqual(ipc({ backend: "json" }), { action: "open", reply: "North Star needs backend = cli." });
  assert.deepEqual(ipc({ hasNorthStar: false }), { action: "open", reply: "North Star needs a newer todocli." });
  assert.deepEqual(ipc({ loaded: false, hasNorthStar: false }), { action: "open", reply: "unavailable" });
  assert.deepEqual(ipc({ loaded: false, hasNorthStar: false, error: { kind: "missing", message: "todocli not found" } }), { action: "open", reply: "unavailable: todocli not found" });
});

// ---------------------------------------------------------------- the Keys half
const items = [task(1), task(2, { status: "done", completedAt: "2026-09-30T09:00Z" })];
const ctx = (over) => Object.assign({ backend: "cli", hasStreams: true, catalogue: streams, items, currentTab: "s1", tabKey: "work: tellkin", rows: [{ kind: "header" }, ...items.map((item) => ({ kind: "item", item }))], northStar: cli() }, over || {});
const ui = (over) => Object.assign(Keys.initialUi(), { cursor: 1, cursorKey: "item:1" }, over || {});
const star = (state, context) => Keys.reduceUi(state, { type: "key", key: "*" }, context);
const SWITCH = [{ type: "northStar" }];

test("AC-ST.77 (node): `*` in the list view on every tab and row, busy included; the reasons in json mode and with an older todocli", () => {
  for (const [currentTab, tabKey] of [["overview", "overview"], ["I", "inbox"], ["s1", "work: tellkin"], ["done", "done"]])
    assert.deepEqual(star(ui(), ctx({ currentTab, tabKey })).actions, SWITCH, tabKey);
  assert.deepEqual(star(ui({ cursor: 0 }), ctx()).actions, SWITCH, "on a header row");
  assert.deepEqual(star(ui({ cursor: 0 }), ctx({ rows: [], items: [] })).actions, SWITCH, "an empty list");
  assert.deepEqual(star(ui({ armedId: "1", armedAt: 5 }), ctx()).ui.armedId, "", "an armed delete ends");
  assert.deepEqual(star(ui(), ctx({ busy: true })).actions, SWITCH, "E5: it only reads");
  assert.deepEqual(star(ui(), ctx({ backend: "json", hasStreams: false, northStar: cli({ backend: "json" }) })).actions, [{ type: "message", text: NorthStar.E40 }]);
  assert.deepEqual(star(ui(), ctx({ northStar: cli({ hasNorthStar: false }) })).actions, [{ type: "message", text: NorthStar.E41 }]);
});

test("AC-ST.77 (node): `*` does nothing before the first read, in move mode, with a picker, in the detail and error views; compose types it", () => {
  assert.deepEqual(star(ui(), ctx({ northStar: cli({ loaded: false, hasNorthStar: false }) })).actions, []);
  const moving = star(ui({ moving: { id: "1", targetUid: "s8" } }), ctx());
  assert.deepEqual([moving.actions, moving.ui.moving], [[], { id: "1", targetUid: "s8" }]);
  const picking = star(ui({ picker: { kind: "priority", id: "1", choice: null } }), ctx());
  assert.deepEqual([picking.actions, picking.ui.picker.kind], [[], "priority"]);
  assert.deepEqual(star(ui({ view: "detail", selectedId: "1" }), ctx()).actions, []);
  assert.deepEqual(star(ui({ view: "error" }), ctx()).actions, []);
  assert.deepEqual(star(ui({ view: "compose" }), ctx()).actions, []);
  const typed = Keys.reduceUi(ui({ view: "compose" }), { type: "text", text: "Ship *it*" }, ctx());
  assert.equal(typed.ui.name, "Ship *it*");
  assert.equal(Keys.keyAction("list", "*", {}), null, "a capability-free context");
});

test("Keys.panelContext hands the reducer the store's North Star fields", () => {
  const p = { currentTab: "overview", tabKey: "overview", catalogue: [], previousCatalogue: [], items: [], errored: false, storeIdMap: {}, rows: [], detailItem: null, backend: "cli", focusModel: null, liveSessionDone: {}, pomodoro: null,
    store: { hasStreams: true, loaded: true, hasNorthStar: true, northStar: null } };
  assert.deepEqual(Keys.panelContext(p).northStar, { backend: "cli", loaded: true, hasNorthStar: true });
});

test("AC-ST.87: the `?` lines carry ` · * north star` before ` · r reload` only while the feature is available", () => {
  const two = "n new · d done · s doing · f focus · p pomodoro · ! priority · z size · m move · [ ] 0-9 tabs · v horizon · x x or Del delete · * north star · r reload · R sync · Tab next panel";
  const done = "d reopen · Enter open · x x or Del delete · [ ] 0-9 tabs · * north star · r reload · R sync · Tab next panel";
  assert.equal(View.helpLine("list", "cli", true, true, "overview", null, true), two);
  assert.equal(View.helpLine("list", "cli", true, true, "done", null, true), done);
  assert.equal(View.helpLine("list", "cli", true, false, "overview", null, true), "n new · d done · s doing · f focus · p pomodoro · ! priority · z size · v horizon · x x or Del delete · * north star · r reload · R sync · Tab next panel");
  assert.equal(View.helpLine("list", "cli", true, true, "overview"), two.replace(NorthStar.HELP_ITEM, ""), "six arguments: 2.1.2's line");
  assert.equal(View.helpLine("list", "cli", true, true, "done"), done.replace(NorthStar.HELP_ITEM, ""));
  for (const args of [["list", "cli", true, true, "overview", null, false], ["list", "json", false, false, "overview", null, true], ["detail", "cli", true, false, "overview", null, true], ["list", "cli", true, true, "overview", { kind: "size" }, true]])
    assert.equal(View.helpLine(...args), View.helpLine(...args.slice(0, 6)), JSON.stringify(args));
});
