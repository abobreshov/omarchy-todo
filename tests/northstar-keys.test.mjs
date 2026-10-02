// NorthStarKeys.js under node --test (ADDENDUM-S11 §5.4, §4.7.1): `*` in
// the todo panel, the popup's keys, the scroll step and IPC `northStar()`.
// AC-ST.76, 77, 79 and 83 (node).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lib } from "./helpers.mjs";

const NorthStarKeys = lib("NorthStarKeys.js");
const NorthStar = lib("NorthStar.js");
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
