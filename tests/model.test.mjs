// Model.js under node --test (PLAN §9.4, A28): the item normaliser (A17),
// the focus link (UX §10.4), the predicates, text and time formatting, the
// pill label rules (UX §3.1, A10, A19) and the settings coercion (A18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lib, G, NOW, item, idle } from "./helpers.mjs";

const Model = lib("Model.js");

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

test("firstLine, lines and todosWord", () => {
  assert.equal(Model.firstLine("  first \nsecond"), "first");
  assert.equal(Model.firstLine(null), "");
  assert.deepEqual(Model.lines("a\n\n b \nc\nd", 3), ["a", "b", "c"]);
  assert.deepEqual(Model.lines(undefined, 3), []);
  assert.equal(Model.todosWord(1), "1 todo");
  assert.equal(Model.todosWord(0), "0 todos");
});

// ------------------------------------------------------------- item model
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

test("copyItem is a deep copy of the plan and the notes", () => {
  const it = item("1", "A", "todo", { plan: [{ text: "s", done: false }], notes: [{ at: "t", text: "n" }] });
  const copy = Model.copyItem(it);
  assert.deepEqual(copy, it);
  assert.notEqual(copy.plan, it.plan);
  assert.notEqual(copy.notes, it.notes);
  assert.notEqual(copy.plan[0], it.plan[0]);
});

test("findItem compares ids as strings and tolerates a missing list", () => {
  const items = [item("1", "A", "doing"), item("2", "B", "todo")];
  assert.equal(Model.findItem(items, "2").name, "B");
  assert.equal(Model.findItem(items, 2).name, "B");
  assert.equal(Model.findItem(items, "x"), null);
  assert.equal(Model.findItem(null, "x"), null);
});

test("normalizeFocus reads a string or an object and drops a dangling link when items are given", () => {
  assert.deepEqual(Model.normalizeFocus("just text", null), { text: "just text", taskId: null });
  assert.deepEqual(Model.normalizeFocus({ text: " a  b ", taskId: 7 }, null), { text: "a b", taskId: "7" });
  assert.deepEqual(Model.normalizeFocus({ text: "", taskId: "gone" }, [item("a", "A", "todo")]), { text: "", taskId: null });
  assert.deepEqual(Model.normalizeFocus({ text: "", taskId: "" }, null), { text: "", taskId: null });
  assert.deepEqual(Model.normalizeFocus(null, null), { text: "", taskId: null });
});

test("focusTask is the explicit link only: the linked task if it exists and is not done (UX §10.4)", () => {
  const items = [item("5", "five", "doing"), item("8", "eight", "doing"), item("9", "nine", "done"), item("1", "one", "todo")];
  assert.equal(Model.focusTask(items, { text: "", taskId: "8" }).id, "8");
  assert.equal(Model.focusTask(items, { text: "", taskId: "9" }), null, "a done task is never the focus task");
  assert.equal(Model.focusTask(items, { text: "", taskId: "77" }), null);
  assert.equal(Model.focusTask(items, { text: "", taskId: null }), null);
  assert.equal(Model.focusTask(items, null), null);
});

test("isAttached and isFocused are the one predicate each for the views, the keys and the copy", () => {
  const on12 = { phase: "work", running: false, remaining: 1, taskId: "12", label: "", attached: true };
  assert.equal(Model.isAttached(on12, "12"), true);
  assert.equal(Model.isAttached(on12, 12), true, "ids compare as strings");
  assert.equal(Model.isAttached(on12, "3"), false);
  assert.equal(Model.isAttached({ phase: "idle", taskId: "12" }, "12"), false, "idle is attached to nothing");
  assert.equal(Model.isAttached(null, "12"), false);
  assert.equal(Model.isFocused({ text: "", taskId: "12" }, 12), true);
  assert.equal(Model.isFocused({ text: "t", taskId: null }, "12"), false);
  assert.equal(Model.isFocused(null, "12"), false);
  assert.deepEqual(Model.idleView(), idle, "the idle view every reader starts from");
});

// ------------------------------------------------------------- formatting
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
  assert.equal(Model.targetName("basecamp"), "Basecamp");
  assert.equal(Model.targetName("  "), "");
});

test("statusGlyph and planProgress", () => {
  assert.equal(Model.statusGlyph("doing"), G.doing);
  assert.equal(Model.statusGlyph("done"), G.done);
  assert.equal(Model.statusGlyph("todo"), G.todo);
  assert.equal(Model.planProgress(item("12", "Write", "doing", { plan: [{ text: "a", done: true }, { text: "b", done: false }, { text: "c", done: false }] })), "1/3");
  assert.equal(Model.planProgress(item("1", "x", "todo")), "");
  assert.equal(Model.planProgress(null), "");
});

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

test("noteTime, dueLabel, clockLabel and formatTime (UX §4.4, §6)", () => {
  assert.equal(Model.noteTime("2026-09-29T22:50:00.000Z", NOW, true), "22:50");
  assert.equal(Model.noteTime("2026-09-27T22:50:00.000Z", NOW, true), "Sep 27");
  assert.equal(Model.noteTime("bad", NOW, true), "");
  assert.equal(typeof Model.noteTime(NOW, NOW, false), "string", "local time is a machine-dependent string");
  assert.match(Model.noteTime(NOW - 3 * 86400000, NOW, false), /^[A-Z][a-z]{2} \d{1,2}$/);
  assert.equal(Model.dueLabel("2026-10-02"), "Oct 2");
  assert.equal(Model.dueLabel("nope"), "nope");
  assert.equal(Model.dueLabel(null), "");
  assert.equal(Model.clockLabel(Date.UTC(2026, 8, 29, 14, 2, 0), true), "14:02");
  assert.match(Model.clockLabel(NOW, false), /^\d{2}:\d{2}$/);
  assert.equal(Model.formatTime(1122), "18:42");
  assert.equal(Model.formatTime(190), "3:10");
  assert.equal(Model.formatTime(1500), "25:00");
  assert.equal(Model.formatTime(0), "0:00");
  assert.equal(Model.formatTime(-4), "0:00");
});

// ------------------------------------------------------------- settings
test("coerce follows A18, from the one DEFAULTS table", () => {
  assert.deepEqual(Model.DEFAULTS, { backend: "json", cliPath: "todocli", pomodoroTarget: "abobreshov.pomodoro", maxChars: 24 });
  assert.equal(Model.MODULE, "abobreshov.todo");
  assert.deepEqual(Model.coerce({}), Model.DEFAULTS);
  assert.deepEqual(Model.coerce(null), Model.DEFAULTS);
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
