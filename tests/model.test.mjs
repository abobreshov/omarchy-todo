// Model.js under node --test (PLAN §9.4, A28; fixtures from UX §3.1, §4.2,
// §4.7, §7, §10.3, §10.4 and PLAN A17–A19, A34).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadQmlJs } from "./qml-js-loader.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const Model = loadQmlJs(path.join(here, "..", "Model.js"));
const boardJson = fs.readFileSync(path.join(here, "fixtures", "board.json"), "utf8");
const upstreamV1 = fs.readFileSync(path.join(here, "fixtures", "upstream-v1.json"), "utf8");

const G = {
  icon: String.fromCodePoint(0xf0132),
  todo: String.fromCodePoint(0xf0131),
  doing: String.fromCodePoint(0xf0856),
  done: String.fromCodePoint(0xf0c52),
  focus: String.fromCodePoint(0xf04fe),
  pomodoro: "",
  brk: String.fromCodePoint(0xf0176),
  sync: String.fromCodePoint(0xf04e6),
  syncAlert: String.fromCodePoint(0xf04e7),
  syncOff: String.fromCodePoint(0xf04e8),
  alert: String.fromCodePoint(0xf05d6),
  lock: String.fromCodePoint(0xf0341),
};

const NOW = Date.parse("2026-09-29T09:15:00.000Z");
const item = (id, name, status, extra) => Object.assign({ id: String(id), uid: null, name, description: "", status, plan: [], notes: [], due: null, author: null }, extra || {});

// ---------------------------------------------------------------- squish/ids
test("squish and makeId keep the upstream behaviour", () => {
  assert.equal(Model.squish("  a \t b\n c "), "a b c");
  assert.equal(Model.squish(null), "");
  assert.equal(Model.squish(undefined), "");
  assert.equal(Model.squish(42), "42");
  const a = Model.makeId(), b = Model.makeId();
  assert.match(a, /^t[0-9a-z]+$/);
  assert.notEqual(a, b);
});

test("plainAngle maps < and > to the single guillemets (A10 escaping)", () => {
  assert.equal(Model.plainAngle("<img src=x>"), "‹img src=x›");
  assert.equal(Model.plainAngle("<b>x</b>"), "‹b›x‹/b›");
  assert.equal(Model.plainAngle(null), "");
});

// ------------------------------------------------------------- store shapes
test("normalize keeps status, plan and notes and drops junk (A17)", () => {
  assert.equal(Model.normalize(null), null);
  assert.equal(Model.normalize("x"), null);
  assert.equal(Model.normalize({ name: "   " }), null);
  const n = Model.normalize({ id: " 7 ", name: " Buy  milk ", description: " x  y ", status: "DOING", plan: [{ text: "a", done: 1 }, { text: "" }, "junk"], notes: [{ at: "t", text: "n" }, { text: "" }], due: "2026-10-01", author: "Ann", uid: "u1" });
  assert.deepEqual(n, { id: "7", uid: "u1", name: "Buy milk", description: "x y", status: "doing", plan: [{ text: "a", done: true }], notes: [{ at: "t", text: "n" }], due: "2026-10-01", author: "Ann" });
  assert.equal(Model.normalize({ name: "x", status: "weird" }).status, "todo");
  assert.match(Model.normalize({ name: "x" }).id, /^t/);
  assert.equal(Model.normalize({ name: "x", plan: "no", notes: 3 }).plan.length, 0);
});

test("parseDocument reads v1 (upstream and bare array) as all todo with an empty focus", () => {
  const doc = Model.parseDocument(upstreamV1);
  assert.equal(doc.ok, true);
  assert.deepEqual(doc.focus, { text: "", taskId: null });
  assert.deepEqual(doc.todos.map((t) => [t.id, t.name, t.status]), [["t1", "Old A", "todo"], ["t2", "Old B", "todo"]]);
  const bare = Model.parseDocument('[{"id":"a","name":"A"},{"id":"a","name":"B"}]');
  assert.equal(bare.todos.length, 2);
  assert.notEqual(bare.todos[0].id, bare.todos[1].id, "duplicate ids are re-issued");
  assert.equal(bare.todos[1].name, "B");
});

test("parseDocument reads v2 with status, focus, plan and notes", () => {
  const raw = JSON.stringify({ version: 2, focus: { text: "Ship it", taskId: "t9" }, todos: [{ id: "t9", name: "Nine", status: "doing", plan: [{ text: "s", done: false }], notes: [{ at: "2026-09-29T09:00:00.000Z", text: "n" }] }] });
  const doc = Model.parseDocument(raw);
  assert.deepEqual(doc.focus, { text: "Ship it", taskId: "t9" });
  assert.equal(doc.todos[0].status, "doing");
  assert.equal(doc.todos[0].plan[0].text, "s");
  assert.equal(doc.todos[0].notes[0].text, "n");
  const legacyFocus = Model.parseDocument(JSON.stringify({ version: 2, focus: "just text", todos: [] }));
  assert.deepEqual(legacyFocus.focus, { text: "just text", taskId: null });
  const missingTask = Model.parseDocument(JSON.stringify({ version: 2, focus: { text: "", taskId: "gone" }, todos: [{ id: "a", name: "A" }] }));
  assert.equal(missingTask.focus.taskId, null, "a focus link to a missing item is dropped");
});

test("parseDocument: empty is an empty document; unparsable non-empty is E14", () => {
  assert.deepEqual(Model.parseDocument(""), { ok: true, focus: { text: "", taskId: null }, todos: [] });
  assert.deepEqual(Model.parseDocument("   \n"), { ok: true, focus: { text: "", taskId: null }, todos: [] });
  assert.deepEqual(Model.parseDocument(null), { ok: true, focus: { text: "", taskId: null }, todos: [] });
  const bad = Model.parseDocument("{ not json");
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "unparsable");
  assert.equal(Model.parseDocument("42").ok, true, "valid JSON that is not a document reads as empty, as upstream");
  assert.equal(Model.parseDocument('{"todos": "nope"}').todos.length, 0);
});

test("serializeDocument writes the v2 shape and round-trips", () => {
  const doc = { focus: { text: " a  b ", taskId: "x1" }, todos: [item("x1", "One", "doing", { plan: [{ text: "p", done: true }], notes: [{ at: "t", text: "n" }] }), { name: "" }, item("x2", "Two", "todo")] };
  const text = Model.serializeDocument(doc);
  assert.ok(text.endsWith("\n"));
  const parsed = JSON.parse(text);
  assert.equal(parsed.version, 2);
  assert.deepEqual(parsed.focus, { text: "a b", taskId: "x1" });
  assert.deepEqual(Object.keys(parsed.todos[0]), ["id", "name", "description", "status", "plan", "notes"]);
  assert.equal(parsed.todos.length, 2);
  assert.equal(Model.serializeDocument(Model.parseDocument(text)), text);
  assert.equal(JSON.parse(Model.serializeDocument({})).focus.taskId, null);
  assert.equal(JSON.parse(Model.serializeDocument({ focus: { text: "t", taskId: "missing" }, todos: [] })).focus.taskId, null);
});

// ------------------------------------------------------------- cli mapping
test("fromCli maps the §3.7 document to the item model (A17)", () => {
  const r = Model.fromCli(boardJson);
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 1);
  const t = r.items[0];
  assert.equal(t.id, "3");
  assert.equal(t.uid, "01a0e9f9-1c84-70b7-9fa9-61617eeb93ac");
  assert.equal(t.name, "Wire the webhook");
  assert.equal(t.status, "doing");
  assert.deepEqual(t.plan, [{ text: "map payload", done: true }]);
  assert.deepEqual(t.notes, [{ at: "2026-09-29T09:10:11.561Z", text: "sandbox account acct_4471" }]);
  assert.equal(t.due, "2026-10-03");
  assert.equal(t.author, null);
  assert.deepEqual(r.focus, { text: "Ship the invoice-export slice", taskId: "3" });
  assert.equal(r.sync.length, 1);
  assert.equal(r.sync[0].name, "basecamp");
  assert.equal(r.sync[0].error.kind, "offline");
  assert.equal(r.sync[0].intervalSec, 60);
});

test("fromCli: free-text focus only, neither, and an object input", () => {
  const onlyText = Model.fromCli({ version: 1, focus: "Just text", focus_task: null, tasks: [], sync: [] });
  assert.deepEqual(onlyText.focus, { text: "Just text", taskId: null });
  const neither = Model.fromCli({ version: 1, focus: null, focus_task: null, tasks: [{ id: 5, title: "  T  ", status: "todo" }] });
  assert.deepEqual(neither.focus, { text: "", taskId: null });
  assert.equal(neither.items[0].name, "T");
  assert.deepEqual(neither.items[0].plan, []);
  assert.deepEqual(neither.sync, []);
  assert.equal(Model.fromCli({ version: 1, tasks: [{ id: 1, title: "" }] }).items.length, 0, "empty titles are skipped");
});

test("fromCli: a bad document or an unknown version is the protocol error (E8)", () => {
  assert.deepEqual(Model.fromCli("not json").error.kind, "protocol");
  assert.equal(Model.fromCli("").ok, false);
  assert.equal(Model.fromCli({ version: 2, tasks: [] }).error.kind, "protocol");
  assert.equal(Model.fromCli({ tasks: [] }).error.kind, "protocol");
  assert.equal(Model.fromCli("[]").error.kind, "protocol");
  assert.equal(Model.fromCli({ version: 1, tasks: "no" }).error.kind, "protocol");
});

test("toCli maps items and focus back to the canonical shape", () => {
  const r = Model.fromCli(boardJson);
  const doc = Model.toCli(r.items, r.focus);
  assert.equal(doc.version, 1);
  assert.equal(doc.focus, "Ship the invoice-export slice");
  assert.equal(doc.focus_task, 3);
  assert.equal(doc.tasks[0].id, 3);
  assert.equal(doc.tasks[0].title, "Wire the webhook");
  assert.equal(doc.tasks[0].uid, "01a0e9f9-1c84-70b7-9fa9-61617eeb93ac");
  assert.deepEqual(doc.tasks[0].plan, [{ text: "map payload", done: true }]);
  const json = Model.toCli([item("t1", "A", "todo")], { text: "", taskId: null });
  assert.equal(json.focus, null);
  assert.equal(json.focus_task, null);
  assert.equal(json.tasks[0].id, "t1", "opaque json ids stay strings");
});

test("classifyExit maps exit codes to the UX §7 error kinds (A34)", () => {
  assert.equal(Model.classifyExit(0, "", false), null);
  assert.deepEqual(Model.classifyExit(0, "", true), { kind: "missing", message: "todocli not found" });
  assert.deepEqual(Model.classifyExit(127, "env: ‘todocli’: No such file or directory\n", false), { kind: "missing", message: "todocli not found" });
  assert.deepEqual(Model.classifyExit(75, "database is busy\n", false), { kind: "busy", message: "database busy" });
  assert.deepEqual(Model.classifyExit(1, "database is locked\nline2\nline3\nline4\n", false), { kind: "failed", message: "database is locked\nline2\nline3" });
  assert.deepEqual(Model.classifyExit(74, "", false), { kind: "failed", message: "todocli exited 74" });
  assert.equal(Model.classifyExit(-1, "", false).kind, "failed");
});

test("errorShort and unavailable replies", () => {
  assert.equal(Model.errorShort({ kind: "missing" }), "todocli not found");
  assert.equal(Model.errorShort({ kind: "busy" }), "Database busy or locked");
  assert.equal(Model.errorShort({ kind: "failed" }), "todocli error");
  assert.equal(Model.errorShort({ kind: "protocol" }), "Can't read todocli output");
  assert.equal(Model.errorShort(null), "");
  assert.equal(Model.unavailable({ kind: "missing" }), "unavailable: todocli not found");
  assert.equal(Model.unavailable({ kind: "busy" }), "unavailable: database busy");
  assert.equal(Model.unavailable({ kind: "failed" }), "unavailable: todocli error");
  assert.equal(Model.unavailable({ kind: "protocol" }), "unavailable: can't read todocli output");
  assert.equal(Model.unavailable(null), "unavailable");
});

// ------------------------------------------------------------- mutations
test("addItem squishes, refuses an empty name and returns the clean name", () => {
  const r = Model.addItem([], "  Buy   milk ", " semi ");
  assert.equal(r.reply, "Buy milk");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].status, "todo");
  assert.equal(r.items[0].description, "semi");
  assert.equal(r.item.id, r.items[0].id);
  const empty = Model.addItem(r.items, "   ", "x");
  assert.equal(empty.reply, "empty");
  assert.equal(empty.items, r.items);
});

test("setStatus: done and todo clear the focus link, doing keeps it, unknown ids and bad statuses are refused", () => {
  const items = [item("1", "A", "doing"), item("2", "B", "todo")];
  const focus = { text: "T", taskId: "1" };
  let r = Model.setStatus({ items, focus }, "1", "done");
  assert.equal(r.reply, "ok");
  assert.equal(r.items[0].status, "done");
  assert.deepEqual(r.focus, { text: "T", taskId: null });
  r = Model.setStatus({ items, focus }, "1", "todo");
  assert.equal(r.focus.taskId, null);
  r = Model.setStatus({ items, focus }, "2", "doing");
  assert.equal(r.items[1].status, "doing");
  assert.equal(r.focus.taskId, "1");
  assert.equal(Model.setStatus({ items, focus }, "9", "done").reply, "unknown id");
  assert.equal(Model.setStatus({ items, focus }, "1", "nope").reply, "bad status");
  assert.equal(items[0].status, "doing", "inputs are not mutated");
});

test("setFocus links a task (making it doing), refuses done, clears", () => {
  const items = [item("1", "A", "todo"), item("2", "B", "done")];
  const focus = { text: "T", taskId: null };
  let r = Model.setFocus({ items, focus }, "1");
  assert.equal(r.reply, "ok");
  assert.equal(r.items[0].status, "doing");
  assert.deepEqual(r.focus, { text: "T", taskId: "1" });
  assert.equal(Model.setFocus({ items, focus }, "2").reply, "refused: done");
  assert.equal(Model.setFocus({ items, focus }, "7").reply, "unknown id");
  r = Model.setFocus({ items: r.items, focus: r.focus }, "clear");
  assert.equal(r.reply, "ok");
  assert.deepEqual(r.focus, { text: "T", taskId: null });
  assert.equal(r.items[0].status, "doing", "clearing the focus keeps the task doing (§3.6)");
});

test("toggleStep flips one step, 1-based, and refuses bad input", () => {
  const items = [item("1", "A", "todo", { plan: [{ text: "a", done: false }, { text: "b", done: true }] })];
  let r = Model.toggleStep(items, "1", 2);
  assert.equal(r.reply, "ok");
  assert.deepEqual(r.items[0].plan, [{ text: "a", done: false }, { text: "b", done: false }]);
  r = Model.toggleStep(items, "1", "1");
  assert.equal(r.items[0].plan[0].done, true);
  assert.equal(Model.toggleStep(items, "1", 3).reply, "bad step");
  assert.equal(Model.toggleStep(items, "1", 0).reply, "bad step");
  assert.equal(Model.toggleStep(items, "1", "x").reply, "bad step");
  assert.equal(Model.toggleStep(items, "9", 1).reply, "unknown id");
  assert.equal(items[0].plan[1].done, true, "input untouched");
});

test("removeItem drops the item and a focus link to it", () => {
  const items = [item("1", "A", "doing"), item("2", "B", "todo")];
  let r = Model.removeItem({ items, focus: { text: "T", taskId: "1" } }, "1");
  assert.equal(r.reply, "ok");
  assert.deepEqual(r.items.map((i) => i.id), ["2"]);
  assert.equal(r.focus.taskId, null);
  r = Model.removeItem({ items, focus: { text: "T", taskId: "1" } }, "2");
  assert.equal(r.focus.taskId, "1");
  assert.equal(Model.removeItem({ items, focus: { text: "", taskId: null } }, "9").reply, "unknown id");
  assert.equal(Model.findItem(items, "2").name, "B");
  assert.equal(Model.findItem(items, "x"), null);
  assert.equal(Model.findItem(null, "x"), null);
});

// ------------------------------------------------------------- ordering
test("sortForList: doing, todo, done; ids numeric in cli mode, insertion order in json mode", () => {
  const items = [item("10", "ten", "todo"), item("2", "two", "doing"), item("3", "three", "done"), item("1", "one", "todo"), item("7", "seven", "doing")];
  assert.deepEqual(Model.sortForList(items, {}).map((i) => i.id), ["2", "7", "1", "10", "3"]);
  const json = [item("tb", "b", "todo"), item("ta", "a", "doing"), item("tc", "c", "todo")];
  assert.deepEqual(Model.sortForList(json, {}).map((i) => i.id), ["ta", "tb", "tc"]);
  assert.deepEqual(Model.sortForList(null, {}), []);
});

test("UI-14: a row ticked done this session keeps its pre-tick group position", () => {
  const items = [item("1", "one", "doing"), item("2", "two", "done"), item("3", "three", "todo"), item("4", "four", "todo")];
  // #2 was doing before the tick, #4 was todo before the tick.
  const sessionDone = { 2: "doing", 4: "todo" };
  assert.deepEqual(Model.sortForList(items, sessionDone).map((i) => i.id), ["1", "2", "3", "4"]);
  assert.deepEqual(Model.visibleItems(items, sessionDone).map((i) => i.id), ["1", "2", "3", "4"]);
  assert.deepEqual(Model.visibleItems(items, {}).map((i) => i.id), ["1", "3", "4"], "done rows hide when the panel reopens");
});

test("pruneSessionDone drops rows that are no longer done: reverted, reopened or removed", () => {
  const items = [item("3", "three", "todo"), item("4", "four", "done"), item("5", "five", "done")];
  assert.deepEqual(Model.pruneSessionDone({ 3: "todo", 4: "doing", 9: "todo" }, items), { 4: "doing" });
  assert.deepEqual(Model.pruneSessionDone({ 5: "todo" }, items), { 5: "todo" });
  assert.deepEqual(Model.pruneSessionDone(null, items), {});
  assert.deepEqual(Model.pruneSessionDone({ 4: "doing" }, null), {});
});

test("focusTask, doingTask and openCount", () => {
  const items = [item("5", "five", "doing"), item("8", "eight", "doing"), item("9", "nine", "done"), item("1", "one", "todo")];
  assert.equal(Model.focusTask(items, { text: "", taskId: "8" }).id, "8");
  assert.equal(Model.focusTask(items, { text: "", taskId: "9" }), null, "a done task is never the focus task");
  assert.equal(Model.focusTask(items, { text: "", taskId: "77" }), null);
  assert.equal(Model.focusTask(items, { text: "", taskId: null }), null);
  assert.equal(Model.focusTask(items, null), null);
  assert.equal(Model.doingTask(items, { text: "", taskId: "8" }).id, "8", "the focused task wins when it is doing");
  assert.equal(Model.doingTask(items, { text: "", taskId: null }).id, "5", "else the lowest doing id (AC-5.9)");
  assert.equal(Model.doingTask([item("b", "b", "doing"), item("a", "a", "doing")], null).id, "b", "json ids: first in insertion order");
  assert.equal(Model.doingTask([item("1", "x", "todo")], null), null);
  assert.equal(Model.openCount(items), 3);
  assert.equal(Model.countLabel(items), "3 open");
  assert.equal(Model.countLabel([]), "0 open");
});

// ------------------------------------------------------------- pill
test("pillLabel follows the UX §3.1 rules and both examples", () => {
  assert.equal(Model.pillLabel("Write UX spec for the panels", 24), "Write UX spec for the…");
  assert.equal(Model.pillLabel("Ship the invoice-export slice", 24), "Ship the invoice-export…");
  assert.equal(Model.pillLabel("exactly twenty-four chars", 25), "exactly twenty-four chars");
  assert.equal(Model.pillLabel("abcdefghijklmnopqrstuvwxyz1234", 10), "abcdefghi…", "no space to cut back to");
  assert.equal(Model.pillLabel("a bcdefghijklmnopqrstuvwxyz", 12), "a bcdefghij…", "a space further back than 8 chars is ignored");
  assert.equal(Model.pillLabel("anything", 0), "");
  assert.equal(Model.pillLabel("anything", -3), "");
  assert.equal(Model.pillLabel("  spaced   out  ", 24), "spaced out");
  assert.equal(Model.pillLabel("<img src=x>", 24), "‹img src=x›");
  assert.equal(Model.pillLabel("<b>x</b>", 24), "‹b›x‹/b›");
  assert.equal(Model.pillLabel(null, 24), "");
  assert.equal(Model.tooltip("<b>x</b>"), "‹b›x‹/b›");
  assert.equal(Model.tooltip("x".repeat(70)).length, 60);
});

function pillInput(over) {
  return Object.assign({ backend: "json", loaded: true, error: null, items: [], focus: { text: "", taskId: null }, sync: [], vertical: false, maxChars: 24, now: NOW }, over);
}

test("UI-11 pillState: the UX §3.1 table, rows 1–6", () => {
  // 1 loading
  assert.deepEqual(Model.pillState(pillInput({ backend: "cli", loaded: false })), { glyph: G.icon, label: "", tooltip: "Checklist Todo\nLoading…", urgent: false, dimmed: true });
  // 2 backend error, every kind
  for (const [kind, short] of [["missing", "todocli not found"], ["busy", "Database busy or locked"], ["failed", "todocli error"], ["protocol", "Can't read todocli output"]]) {
    assert.deepEqual(Model.pillState(pillInput({ backend: "cli", error: { kind, message: "m" }, items: [item("1", "x", "doing")] })), { glyph: G.icon, label: "", tooltip: "Checklist Todo\n" + short + ". Click for details.", urgent: true, dimmed: false });
  }
  // 3 doing: focused doing task wins; +N more; focus text differs; count
  const items = [item("5", "Review PR", "doing"), item("8", "Write UX spec for the panels", "doing"), item("1", "Book dentist", "todo")];
  assert.deepEqual(Model.pillState(pillInput({ items, focus: { text: "Ship the invoice-export slice", taskId: "8" } })), { glyph: G.doing, label: "Write UX spec for the…", tooltip: "Doing: Write UX spec for the panels (+1 more)\nFocus: Ship the invoice-export slice\n3 todos", urgent: false, dimmed: false });
  // AC-5.9: lowest doing id when none is focused
  const s9 = Model.pillState(pillInput({ items, focus: { text: "Invoice slice", taskId: null } }));
  assert.equal(s9.label, "Review PR");
  assert.ok(s9.tooltip.includes("Focus: Invoice slice"));
  // focus text equal to the title is not repeated
  assert.equal(Model.pillState(pillInput({ items: [item("5", "Review PR", "doing")], focus: { text: "Review PR", taskId: "5" } })).tooltip, "Doing: Review PR\n1 todo");
  // 4 focus text, no doing
  assert.deepEqual(Model.pillState(pillInput({ items: [item("1", "Book dentist", "todo"), item("2", "Old", "done")], focus: { text: "Ship the invoice-export slice", taskId: null } })), { glyph: G.focus, label: "Ship the invoice-export…", tooltip: "Focus: Ship the invoice-export slice\n1 todo", urgent: false, dimmed: false });
  // AC-5.5: focused task done -> focus text shows
  assert.equal(Model.pillState(pillInput({ items: [item("3", "Wire", "done")], focus: { text: "Invoice slice", taskId: "3" } })).label, "Invoice slice");
  // 5 open count
  assert.deepEqual(Model.pillState(pillInput({ items: [item("1", "a", "todo"), item("2", "b", "todo"), item("3", "c", "todo")] })), { glyph: G.icon, label: "3", tooltip: "3 todos\nNo focus set", urgent: false, dimmed: false });
  assert.equal(Model.pillState(pillInput({ items: [item("1", "a", "todo")] })).tooltip, "1 todo\nNo focus set");
  // 6 empty
  assert.deepEqual(Model.pillState(pillInput({ items: [item("2", "b", "done")] })), { glyph: G.icon, label: "", tooltip: "Checklist Todo\nNothing open. Click to add one.", urgent: false, dimmed: true });
  // json mode never shows loading or a backend error
  assert.equal(Model.pillState(pillInput({ backend: "json", loaded: false })).dimmed, true);
  assert.equal(Model.pillState(pillInput({ backend: "json", error: { kind: "missing" } })).urgent, false);
});

test("pillState: vertical bars show the icon only; the sync overlay replaces the glyph", () => {
  const items = [item("5", "Review PR", "doing")];
  const v = Model.pillState(pillInput({ items, vertical: true }));
  assert.equal(v.glyph, G.doing);
  assert.equal(v.label, "");
  assert.equal(Model.pillState(pillInput({ items, maxChars: 0 })).label, "");
  const failing = [{ name: "basecamp", enabled: true, lastOkAt: null, lastAttemptAt: new Date(NOW - 12 * 60000).toISOString(), intervalSec: 60, error: { kind: "offline", message: "m" } }];
  const one = Model.pillState(pillInput({ backend: "cli", items, sync: failing }));
  assert.equal(one.glyph, G.syncAlert);
  assert.equal(one.label, "Review PR");
  assert.equal(one.urgent, false);
  assert.ok(one.tooltip.endsWith("\nBasecamp sync failed 12m ago"));
  const two = Model.pillState(pillInput({ backend: "cli", items, sync: failing.concat([{ name: "obsidian", enabled: true, lastOkAt: null, lastAttemptAt: null, intervalSec: 5, error: { kind: "error", message: "m" } }]) }));
  assert.ok(two.tooltip.endsWith("\n2 syncs failed"));
  assert.equal(Model.pillState(pillInput({ backend: "json", items, sync: failing })).glyph, G.doing, "json mode has no overlay");
  const disabled = [{ name: "basecamp", enabled: false, lastOkAt: null, lastAttemptAt: null, intervalSec: 60, error: { kind: "auth", message: "m" } }];
  assert.equal(Model.pillState(pillInput({ backend: "cli", items, sync: disabled })).glyph, G.doing, "a disabled target does not fail");
  assert.equal(Model.pillState(pillInput({ backend: "cli", loaded: false, sync: failing })).glyph, G.icon, "no overlay on the loading state");
});

// ------------------------------------------------------------- footer / ago
test("ago: just now, minutes, hours, then a date", () => {
  assert.equal(Model.ago(new Date(NOW - 10000).toISOString(), NOW), "just now");
  assert.equal(Model.ago(NOW - 59999, NOW), "just now");
  assert.equal(Model.ago(NOW - 2 * 60000, NOW), "2m ago");
  assert.equal(Model.ago(NOW - 2 * 3600000 - 5000, NOW), "2h ago");
  assert.equal(Model.ago(Date.UTC(2026, 8, 27, 12, 0, 0), NOW), "Sep 27");
  assert.equal(Model.ago(null, NOW), "");
  assert.equal(Model.ago("garbage", NOW), "");
  assert.equal(Model.ago(NOW + 5000, NOW), "just now", "a future timestamp is clamped");
});

const target = (name, over) => Object.assign({ name, enabled: true, lastOkAt: new Date(NOW - 2 * 60000).toISOString(), lastAttemptAt: new Date(NOW - 60000).toISOString(), intervalSec: 60, error: null }, over || {});

test("UI-12 footer: the UX §4.7 table", () => {
  assert.deepEqual(Model.footer([], NOW, {}), { glyph: G.sync, text: "todocli · local only", urgent: false, tooltip: "", action: null });
  assert.deepEqual(Model.footer([target("basecamp", { enabled: false })], NOW, {}).text, "todocli · local only");
  const ok = Model.footer([target("basecamp"), target("obsidian", { lastOkAt: new Date(NOW - 5 * 60000).toISOString(), intervalSec: 5, lastAttemptAt: new Date(NOW - 5000).toISOString() })], NOW, {});
  assert.deepEqual(ok, { glyph: G.sync, text: "todocli · synced 5m ago", urgent: false, tooltip: "Basecamp: ok 2m ago\nObsidian: ok 5m ago", action: null });
  const never = Model.footer([target("basecamp", { lastOkAt: null, lastAttemptAt: null })], NOW, {});
  assert.equal(never.text, "todocli · not synced yet · R sync now");
  assert.equal(never.action, "syncNow");
  assert.equal(never.urgent, false);
  assert.deepEqual(Model.footer([target("basecamp")], NOW, { syncing: true }), { glyph: G.sync, text: "Syncing…", urgent: false, tooltip: "Basecamp: ok 2m ago", action: null });
  const one = Model.footer([target("basecamp", { lastAttemptAt: new Date(NOW - 12 * 60000).toISOString(), error: { kind: "auth", message: "x" } })], NOW, {});
  assert.deepEqual(one, { glyph: G.syncAlert, text: "Basecamp sync failed 12m ago · R retry", urgent: true, tooltip: "Basecamp: failed 12m ago — signed out. Run: basecamp auth login", action: "syncNow" });
  const two = Model.footer([target("basecamp", { error: { kind: "offline", message: "x" } }), target("obsidian", { error: { kind: "vault_missing", message: "x" } })], NOW, {});
  assert.equal(two.text, "2 syncs failed · R retry");
  assert.equal(two.urgent, true);
  assert.equal(two.glyph, G.syncAlert);
  const stale = Model.footer([target("basecamp", { lastAttemptAt: new Date(NOW - 2 * 3600000).toISOString() })], NOW, {});
  assert.deepEqual(stale, { glyph: G.syncOff, text: "Sync daemon idle since 2h ago · R sync now", urgent: false, tooltip: "Basecamp: ok 2m ago", action: "syncNow" });
  const off = Model.footer([target("basecamp"), target("obsidian", { enabled: false })], NOW, {});
  assert.equal(off.tooltip, "Basecamp: ok 2m ago\nObsidian: off");
  assert.equal(Model.footer(null, NOW, {}).text, "todocli · local only");
});

test("footer reasons follow the UX §4.7 kind table", () => {
  const cases = {
    auth: "signed out. Run: basecamp auth login",
    auth_unreachable: "credentials not reachable from todocli.service; terminal sync still works",
    list_gone: "synced list trashed or archived in Basecamp; nothing changed here",
    offline: "offline or Basecamp unreachable; retrying",
    rate_limited: "rate limited by Basecamp; retrying",
    cli_missing: "basecamp CLI not found",
    vault_missing: "vault folder not found",
    write_failed: "could not write the note",
  };
  for (const [kind, copy] of Object.entries(cases)) assert.equal(Model.reason({ kind, message: "ignored" }), copy, kind);
  assert.equal(Model.reason({ kind: "removals_held", message: "3 removals held" }), "3 removals held; review, then todocli sync basecamp --accept-remote-removals");
  assert.equal(Model.reason({ kind: "removals_held", message: "" }), "removals held; review, then todocli sync basecamp --accept-remote-removals");
  assert.equal(Model.reason({ kind: "error", message: "first line of it\nsecond" }), "first line of it");
  assert.equal(Model.reason({ kind: "error", message: "x".repeat(80) }).length, 60);
  assert.equal(Model.reason({ kind: "error" }), "error");
  assert.equal(Model.reason(null), "");
});

// ------------------------------------------------------------- error view
test("errorView carries the UX §7 copy for E4, E5, E7, E8", () => {
  const e4 = Model.errorView({ kind: "missing", message: "todocli not found" }, { cliPath: "todocli", moduleName: "abobreshov.todo" });
  assert.equal(e4.title, "todocli not found");
  assert.equal(e4.glyph, G.alert);
  assert.equal(e4.body, 'This panel is set to backend = cli, but it can\'t run "todocli". Nothing was changed.');
  assert.equal(e4.hint, "Point the panel at todocli:\n  omarchy bar set abobreshov.todo cliPath /path/to/todocli\nor go back to the panel's own list:\n  omarchy bar set abobreshov.todo backend json");
  assert.equal(e4.banner, null);
  const e5 = Model.errorView({ kind: "busy", message: "database busy" }, { lastGoodAt: Date.UTC(2026, 8, 29, 14, 2, 0), utc: true });
  assert.equal(e5.banner, "Database busy or locked. Showing the list from 14:02. r retry");
  assert.equal(e5.glyph, G.lock);
  assert.equal(e5.title, null);
  assert.equal(Model.errorView({ kind: "busy" }, {}).banner, "Database busy or locked. r retry");
  const e7 = Model.errorView({ kind: "failed", message: "line1\nline2\nline3" }, {});
  assert.equal(e7.title, "todocli error");
  assert.equal(e7.body, "line1\nline2\nline3\nRun todocli board in a terminal to see the full error.");
  const e8 = Model.errorView({ kind: "protocol", message: "x" }, {});
  assert.equal(e8.title, "Can't read todocli output");
  assert.equal(e8.body, "todocli answered, but not in the format this panel expects (JSON schema v1). Update the plugin or todocli so their versions match.");
  assert.equal(Model.errorView(null, {}), null);
  assert.equal(Model.errorView({ kind: "weird" }, {}).title, "todocli error");
  assert.equal(Model.errorView({ kind: "failed", message: "" }, {}).body, "Run todocli board in a terminal to see the full error.");
});

// ------------------------------------------------------------- dump
test("dumpView produces the UX §10.3 shape", () => {
  const items = [item("12", "Write UX spec for the panels", "doing"), item("7", "Reply to Basecamp thread", "done"), item("3", "Book", "todo")];
  const state = {
    backend: "cli", cliPath: "todocli", view: "list", stale: false, error: null,
    pill: { glyph: G.doing, label: "Write UX spec for the…", tooltip: "Doing: …", urgent: false, dimmed: false },
    items, focus: { text: "Ship the invoice-export slice", taskId: "12" }, sessionDone: { 7: "todo" },
    banner: null, footer: { glyph: G.sync, text: "todocli · synced 2m ago", urgent: false, tooltip: "", action: null }, message: null,
  };
  const d = Model.dumpView(state);
  assert.deepEqual(d, {
    version: 1, backend: "cli", cliPath: "todocli", view: "list", stale: false, error: null,
    pill: state.pill,
    focus: { text: "Ship the invoice-export slice", taskId: "12" },
    open: [{ id: "12", title: "Write UX spec for the panels", status: "doing" }, { id: "3", title: "Book", status: "todo" }],
    done: [{ id: "7", title: "Reply to Basecamp thread" }],
    banner: null, footer: { text: "todocli · synced 2m ago", urgent: false }, message: null,
  });
  assert.equal(JSON.parse(JSON.stringify(d)).open.length, 2);
  for (const kind of ["missing", "busy", "failed", "protocol"]) {
    const e = Model.dumpView(Object.assign({}, state, { error: { kind, message: "m" }, stale: true, view: "error", footer: null, message: "Not saved — x." }));
    assert.deepEqual(e.error, { kind, message: "m" });
    assert.equal(e.stale, true);
    assert.equal(e.footer, null);
    assert.equal(e.message, "Not saved — x.");
  }
  const bare = Model.dumpView({});
  assert.equal(bare.backend, "json");
  assert.deepEqual(bare.open, []);
  assert.deepEqual(bare.done, []);
  assert.equal(bare.footer, null);
  assert.equal(bare.pill.glyph, G.icon);
});

// ------------------------------------------------------------- settings
test("coerce follows A18", () => {
  assert.deepEqual(Model.coerce({}), { backend: "json", cliPath: "todocli", pomodoroTarget: "abobreshov.pomodoro", maxChars: 24 });
  assert.deepEqual(Model.coerce(null), { backend: "json", cliPath: "todocli", pomodoroTarget: "abobreshov.pomodoro", maxChars: 24 });
  assert.equal(Model.coerce({ backend: "cli" }).backend, "cli");
  assert.equal(Model.coerce({ backend: "standalone" }).backend, "json");
  assert.equal(Model.coerce({ backend: true }).backend, "json");
  assert.equal(Model.coerce({ cliPath: "/home/abobreshov/.cargo/bin/todocli" }).cliPath, "/home/abobreshov/.cargo/bin/todocli");
  assert.equal(Model.coerce({ cliPath: "" }).cliPath, "todocli");
  assert.equal(Model.coerce({ pomodoroTarget: "" }).pomodoroTarget, "abobreshov.pomodoro");
  assert.equal(Model.coerce({ pomodoroTarget: "x.y" }).pomodoroTarget, "x.y");
  assert.equal(Model.coerce({ maxChars: "30" }).maxChars, 30);
  assert.equal(Model.coerce({ maxChars: "abc" }).maxChars, 24);
  assert.equal(Model.coerce({ maxChars: -5 }).maxChars, 0);
  assert.equal(Model.coerce({ maxChars: 0 }).maxChars, 0);
});

// ------------------------------------------------------------- copy
test("transient message copy (UX §4.5, §6.2, §7)", () => {
  assert.equal(Model.msgDoneRow(item("12", "Write UX spec for the panels", "done"), "cli"), "#12 is done · d reopens it");
  assert.equal(Model.msgDoneRow(item("t1", "Write UX spec for the panels", "done"), "json"), "Write UX spec for the… is done · d reopens it");
  assert.equal(Model.msgNotSaved("database is locked\nmore"), "Not saved — database is locked.");
  assert.equal(Model.msgNotSaved(""), "Not saved — todocli error.");
  assert.equal(Model.msgNotSaved({ kind: "busy" }), "Not saved — database busy. Press r to retry.");
  assert.equal(Model.msgNotSaved({ kind: "failed", message: "boom\nx" }), "Not saved — boom.");
  assert.equal(Model.msgNotSaved({ kind: "missing", message: "todocli not found" }), "Not saved — todocli not found.");
  assert.equal(Model.MSG_SYNC_NEEDS_CLI, "Sync needs backend = cli.");
  assert.equal(Model.MSG_SYNC_RUNNING, "Sync already running.");
  assert.equal(Model.msgPomodoroMoved(item("15", "Fifteen", "doing"), 1122, "cli"), "Pomodoro moved to #15 · 18:42 left");
  assert.equal(Model.msgPomodoroMoved(item("tx", "Fifteen", "doing"), 190, "json"), "Pomodoro moved to Fifteen · 3:10 left");
  assert.equal(Model.msgPomodoroMissing("abobreshov.pomodoro"), "Pomodoro plugin not found. Enable abobreshov.pomodoro.");
  assert.equal(Model.msgPomodoroOld("abobreshov.pomodoro"), "Pomodoro plugin is out of date. Update abobreshov.pomodoro.");
  assert.equal(Model.msgPomodoroNotStarted("omarchy-shell is not running"), "Pomodoro not started — omarchy-shell is not running.");
  assert.equal(Model.msgTaskNotFound("99"), "Task 99 not found.");
  assert.equal(Model.MSG_DONE_ATTACHED, "Done. p on the next task moves the pomodoro.");
  assert.equal(Model.MSG_UNREADABLE, "Couldn't read todos.json. Fix or delete it — changes won't be saved until then.");
  assert.equal(Model.emptyCopy([]), "Nothing here yet. Press + to add a todo.");
  assert.equal(Model.emptyCopy([item("1", "a", "done")]), "All clear. Press + to add a todo.");
  assert.equal(Model.emptyCopy([item("1", "a", "todo")]), null);
  assert.equal(Model.helpLine("list", "cli"), "n new · d done · s doing · f focus · p pomodoro · x x delete · r reload · R sync · Tab next panel");
  assert.equal(Model.helpLine("list", "json"), "n new · d done · s doing · f focus · p pomodoro · x x delete · r reload · Tab next panel");
  assert.equal(Model.helpLine("detail", "cli"), "Enter step · d done · s doing · f focus · p pomodoro · x x delete · Esc back");
});

// ------------------------------------------------------------- pomodoro
test("classifyShell maps omarchy-shell results to E11, E12 and transients", () => {
  assert.deepEqual(Model.classifyShell(0, "started\n", "", false), { ok: true, word: "started" });
  assert.deepEqual(Model.classifyShell(1, "", "Target not found.\n", false), { ok: false, kind: "missing" });
  assert.deepEqual(Model.classifyShell(1, "", "Function not found.\n", false), { ok: false, kind: "old" });
  assert.deepEqual(Model.classifyShell(1, "", "omarchy-shell is not running\n", false), { ok: false, kind: "transient", text: "omarchy-shell is not running" });
  assert.deepEqual(Model.classifyShell(124, "", "", false), { ok: false, kind: "transient", text: "omarchy-shell exited 124" });
  assert.deepEqual(Model.classifyShell(0, "", "", true), { ok: false, kind: "transient", text: "omarchy-shell not found" });
});

test("pomodoroView reads the state file the way UX §6.5 tells readers to", () => {
  const idle = Model.pomodoroView(null, NOW);
  assert.deepEqual(idle, { phase: "idle", running: false, remaining: 0, taskId: "", label: "", attached: false });
  const running = Model.pomodoroView({ version: 1, phase: "work", running: true, endsAt: NOW + 1122 * 1000 + 400, remaining: 1500, taskId: "12", taskLabel: "Write", completed: 2 }, NOW);
  assert.deepEqual(running, { phase: "work", running: true, remaining: 1123, taskId: "12", label: "Write", attached: true });
  const paused = Model.pomodoroView({ phase: "work", running: false, endsAt: 0, remaining: 1122, taskId: "", taskLabel: "" }, NOW);
  assert.equal(paused.remaining, 1122);
  assert.equal(paused.attached, false);
  const stale = Model.pomodoroView({ phase: "work", running: true, endsAt: NOW - 11000, remaining: 5, taskId: "12" }, NOW);
  assert.equal(stale.phase, "idle");
  const grace = Model.pomodoroView({ phase: "work", running: true, endsAt: NOW - 9000, remaining: 5, taskId: "12" }, NOW);
  assert.equal(grace.phase, "work");
  assert.equal(grace.remaining, 0);
  assert.equal(Model.pomodoroView("not an object", NOW).phase, "idle");
  assert.equal(Model.pomodoroView({ phase: "shortBreak", running: true, endsAt: NOW + 190000, taskId: "3", taskLabel: "T" }, NOW).phase, "shortBreak");
  assert.equal(Model.parsePomodoroState("{bad").phase, "idle");
  assert.equal(Model.parsePomodoroState('{"phase":"work","running":false,"remaining":7}').remaining, 7);
  assert.equal(Model.formatTime(1122), "18:42");
  assert.equal(Model.formatTime(190), "3:10");
  assert.equal(Model.formatTime(1500), "25:00");
  assert.equal(Model.formatTime(0), "0:00");
  assert.equal(Model.formatTime(-4), "0:00");
});

test("focusLine renders the UX §4.2 variants F0–F6", () => {
  const items = [item("12", "Write UX spec for the panels", "doing"), item("15", "Review PR !412", "doing"), item("2", "Book", "todo")];
  const pomIdle = { phase: "idle", running: false, remaining: 0, taskId: "", label: "", attached: false };
  assert.deepEqual(Model.focusLine(items, { text: "", taskId: null }, pomIdle), { variant: "F0", text: "No focus · f on a task sets it", selectable: false, item: null, timer: "", timerGlyph: "", timerDim: false, hint: "", tooltip: "" });
  assert.equal(Model.focusLine([], { text: "", taskId: null }, pomIdle), null);
  assert.equal(Model.focusLine([item("1", "a", "done")], { text: "", taskId: null }, pomIdle).variant, "F0");
  const f1 = Model.focusLine(items, { text: "", taskId: "12" }, pomIdle);
  assert.equal(f1.variant, "F1");
  assert.equal(f1.text, "Write UX spec for the panels");
  assert.equal(f1.item.id, "12");
  assert.equal(f1.selectable, true);
  const f2 = Model.focusLine(items, { text: "", taskId: "12" }, { phase: "work", running: true, remaining: 1122, taskId: "12", label: "x", attached: true });
  assert.equal(f2.variant, "F2");
  assert.equal(f2.timer, "18:42");
  assert.equal(f2.timerGlyph, G.pomodoro);
  assert.equal(f2.timerDim, false);
  const f3 = Model.focusLine(items, { text: "", taskId: "12" }, { phase: "work", running: false, remaining: 1122, taskId: "12", label: "x", attached: true });
  assert.equal(f3.variant, "F3");
  assert.equal(f3.timer, "18:42 paused");
  assert.equal(f3.timerDim, true);
  const f4 = Model.focusLine(items, { text: "", taskId: "12" }, { phase: "shortBreak", running: true, remaining: 190, taskId: "12", label: "x", attached: true });
  assert.equal(f4.variant, "F4");
  assert.equal(f4.timer, "3:10");
  assert.equal(f4.timerGlyph, G.brk);
  const f5 = Model.focusLine(items, { text: "", taskId: "12" }, { phase: "work", running: true, remaining: 1122, taskId: "15", label: "Review PR !412", attached: true });
  assert.equal(f5.variant, "F5");
  assert.equal(f5.hint, G.pomodoro + " 18:42 on Review PR !412 · p moves it here");
  const f6 = Model.focusLine(items, { text: "Ship the invoice-export slice", taskId: null }, pomIdle);
  assert.equal(f6.variant, "F6");
  assert.equal(f6.text, "Ship the invoice-export slice");
  assert.equal(f6.tooltip, "Focus set outside the list. Enter makes it a task.");
  assert.equal(f6.item, null);
  assert.equal(Model.focusLine(items, { text: "Ship", taskId: "99" }, pomIdle).variant, "F6", "a dangling link with text is a free-text focus");
  assert.equal(Model.focusLine(items, { text: "", taskId: "99" }, pomIdle).variant, "F0");
});

test("statusLine and action tooltips for the detail view (UX §4.4)", () => {
  const it = item("12", "Write", "doing", { plan: [{ text: "a", done: true }, { text: "b", done: false }, { text: "c", done: false }], notes: [{ at: "t", text: "n" }, { at: "t", text: "m" }], due: "2026-10-02" });
  const pom = { phase: "work", running: true, remaining: 1122, taskId: "12", label: "Write", attached: true };
  assert.equal(Model.statusLine(it, { backend: "cli", focus: { text: "", taskId: "12" }, pomodoro: pom }), G.doing + " doing · #12 · plan 1/3 · 2 notes · focus · " + G.pomodoro + " 18:42 · due Oct 2");
  assert.equal(Model.statusLine(item("t1", "x", "todo", { notes: [{ at: "t", text: "n" }] }), { backend: "json", focus: { text: "", taskId: null }, pomodoro: null }), G.todo + " todo · 1 note");
  assert.equal(Model.statusLine(item("t1", "x", "done", { due: "2026-10-02" }), { backend: "json", focus: { text: "", taskId: null }, pomodoro: null }), G.done + " done", "due is cli-only");
  assert.equal(Model.statusLine(null, {}), "");
  const tips = Model.actionTooltips(it, { focus: { text: "", taskId: "12" }, pomodoro: pom, armed: false });
  assert.deepEqual(tips, { doing: "Back to todo (s)", done: "Mark done (d)", focus: "Clear focus (f)", pomodoro: "Pause pomodoro (p)", del: "Delete (x x)", doingEnabled: true, focusEnabled: true, pomodoroEnabled: true });
  const todoTips = Model.actionTooltips(item("3", "x", "todo"), { focus: { text: "", taskId: "12" }, pomodoro: { phase: "work", running: false, remaining: 1, taskId: "3", label: "", attached: true }, armed: true });
  assert.equal(todoTips.doing, "Mark doing (s)");
  assert.equal(todoTips.focus, "Set focus (f)");
  assert.equal(todoTips.pomodoro, "Resume pomodoro (p)");
  assert.equal(todoTips.del, "Click again to delete");
  const doneTips = Model.actionTooltips(item("3", "x", "done"), { focus: { text: "", taskId: null }, pomodoro: null, armed: false });
  assert.equal(doneTips.done, "Reopen (d)");
  assert.equal(doneTips.doing, "Done · d reopens it");
  assert.equal(doneTips.focus, "Done · d reopens it");
  assert.equal(doneTips.pomodoro, "Done · d reopens it");
  assert.equal(doneTips.doingEnabled, false);
  assert.equal(doneTips.pomodoroEnabled, false);
  const doneAttached = Model.actionTooltips(item("3", "x", "done"), { focus: { text: "", taskId: null }, pomodoro: pom && { phase: "work", running: true, remaining: 1, taskId: "3", label: "", attached: true }, armed: false });
  assert.equal(doneAttached.pomodoro, "Pause pomodoro (p)");
  assert.equal(doneAttached.pomodoroEnabled, true);
  assert.equal(Model.actionTooltips(item("3", "x", "todo"), {}).pomodoro, "Start pomodoro (p)");
  assert.equal(Model.planProgress(it), "1/3");
  assert.equal(Model.planProgress(item("1", "x", "todo")), "");
  assert.equal(Model.noteTime("2026-09-29T22:50:00.000Z", NOW, true), "22:50");
  assert.equal(Model.noteTime("2026-09-27T22:50:00.000Z", NOW, true), "Sep 27");
  assert.equal(Model.noteTime("bad", NOW, true), "");
  assert.equal(Model.dueLabel("2026-10-02"), "Oct 2");
  assert.equal(Model.dueLabel("nope"), "nope");
  assert.equal(Model.dueLabel(null), "");
});

test("smallestInterval picks the smallest enabled intervalSec, 0 when none", () => {
  assert.equal(Model.smallestInterval([target("basecamp", { intervalSec: 60 }), target("obsidian", { intervalSec: 5 })]), 5);
  assert.equal(Model.smallestInterval([target("basecamp", { intervalSec: 60 }), target("obsidian", { intervalSec: 5, enabled: false })]), 60);
  assert.equal(Model.smallestInterval([]), 0);
  assert.equal(Model.smallestInterval([target("basecamp", { intervalSec: 0 })]), 0);
  assert.equal(Model.smallestInterval(null), 0);
});
