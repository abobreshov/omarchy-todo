// Model.js under node --test (PLAN §9.4, A28): the item normaliser (A17),
// the focus link (UX §10.4), the predicates, text and time formatting, the
// pill label rules (UX §3.1, A10, A19) and the settings coercion (A18).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { lib, G, NOW, item, idle, here } from "./helpers.mjs";

const Model = lib("Model.js");

test("metadata defaults, document coercion and copies keep one task shape (UI-30)", () => {
  const defaults = { stream: null, labels: [], horizon: "short", priority: null, size: null };
  const fields = (it) => Object.fromEntries(Object.keys(defaults).map((k) => [k, it[k]]));
  assert.deepEqual(fields(Model.normalize({ name: "x" })), defaults);
  const input = { name: "x", stream: "  work:  tellkin  ", labels: ["q4", 7, null, "lease"], horizon: "mid", priority: 0, size: "M" };
  const full = Model.normalize(input);
  assert.deepEqual(fields(full), { stream: "work: tellkin", labels: ["q4", "lease"], horizon: "mid", priority: 0, size: "M" });
  assert.notEqual(full.labels, input.labels);
  assert.deepEqual(fields(Model.normalize({ name: "x", stream: " ", labels: "q4", horizon: "unknown" })), defaults);
  for (const horizon of ["short", "mid", "yearly", "long"]) assert.equal(Model.normalize({ name: "x", horizon }).horizon, horizon);
  const copy = Model.copyItem(full);
  assert.deepEqual(copy, full);
  assert.notEqual(copy.labels, full.labels);
  copy.labels.push("new");
  assert.deepEqual(full.labels, ["q4", "lease"]);
  assert.equal(copy.priority, 0);
});

test("normalizeStreams keeps all nine keys, archived homes and document order; junk is total", () => {
  const board = JSON.parse(fs.readFileSync(path.join(here, "fixtures/provisional/board-streams.json"), "utf8"));
  assert.deepEqual(Model.normalizeStreams(board.streams), board.streams);
  assert.deepEqual(Model.normalizeStreams(null), []);
  assert.deepEqual(Model.normalizeStreams([null, 1, "x", {}, { uid: "a" }, { key: "a" }]), []);
  const normalized = Model.normalizeStreams([{ uid: " u ", key: " k ", group: "g", name: 3, position: 2.5, system: true, createdAt: "at", archivedAt: "later", open: 2 }]);
  assert.deepEqual(normalized, [{ uid: "u", key: "k", group: "g", name: "3", position: 2.5, system: true, createdAt: "at", archivedAt: "later", open: 2 }]);
  for (const v of [undefined, null, "1", Infinity, NaN, -1, 1.5]) {
    const n = Model.normalizeStreams([{ uid: "u", key: "k", position: v, archivedAt: v, open: v }])[0];
    assert.equal(n.position, typeof v === "number" && Number.isFinite(v) ? v : 0);
    assert.equal(n.open, 0);
    assert.equal(n.archivedAt, typeof v === "string" ? v : null);
    assert.equal(n.system, false);
  }
  assert.equal(Model.normalizeStreams([{ uid: "u", key: "k", archivedAt: "" }])[0].archivedAt, null);
});

test("homeOf and isOrphan share active-home semantics for arrays and indexed catalogues", () => {
  const board = JSON.parse(fs.readFileSync(path.join(here, "fixtures/consumer/board-archived-home.json"), "utf8"));
  const streams = Model.normalizeStreams(board.streams);
  const oracle = JSON.parse(fs.readFileSync(path.join(here, "fixtures/consumer/expected.json"), "utf8"))["board-archived-home.json"];
  const homes = Model.indexStreams(streams);
  for (const catalogue of [streams, homes]) {
    for (const entry of streams) assert.equal(Model.homeOf(catalogue, entry.key), entry);
    assert.equal(Model.homeOf(catalogue, "missing"), null);
    assert.equal(Model.homeOf(catalogue, "toString"), null);
    for (const task of board.tasks) {
      assert.equal(Model.isOrphan(catalogue, task), oracle.orphanIds.includes(task.id));
    }
    for (const stream of ["work: old", "missing", null]) {
      assert.equal(Model.isOrphan(catalogue, { stream, status: "done" }), false);
      assert.equal(Model.isOrphan(catalogue, { stream, status: "doing" }), true);
    }
  }
  assert.deepEqual(Object.keys(Model.indexStreams(null)), []);
  assert.equal(Model.homeOf(null, "inbox"), null);
  assert.equal(Model.isOrphan(undefined, { stream: null, status: "todo" }), true);
});

test("UX §18: root JS and QML have no metadata truthiness; each grep rule detects planted bad lines", () => {
  const rules = [
    [/\.(priority|size|stream|labels|horizon|completedAt)\s*(\|\||&&|\?[^.:?])/, ["it.priority || null", "it.size && x", "it.priority ? a : b"]],
    [/!\s*!?\s*[\w$.]*\.(priority|size|stream|labels|horizon|completedAt)\b/, ["!it.size", "!!it.priority"]],
    [/if\s*\(\s*[\w$.]*\.(priority|size|stream|labels|horizon|completedAt)\s*\)/, ["if (it.priority)", "if (it.completedAt)"]],
    [/\b(priority|size|stream|labels|horizon|completedAt)\s*(\|\||&&|\?[^.:?])/, ["priority || null", "size && x", "horizon ? a : b"]],
    [/!\s*(priority|size|stream|labels|horizon|completedAt)\b/, ["if (!priority)", "!size", "!!horizon"]],
    [/if\s*\(\s*!?\s*(priority|size|stream|labels|horizon|completedAt)\s*\)/, ["if (size)", "if (!priority)", "if (horizon)"]],
  ];
  for (const [regex, planted] of rules) {
    for (const bad of planted) assert.equal(regex.test(bad), true, bad);
    for (const good of ["it.priority !== null", "Priority.normalize(v)", 'typeof v === "number"']) assert.equal(regex.test(good), false, good);
    for (const file of fs.readdirSync(path.join(here, "..")).filter((f) => f.endsWith(".js") || f.endsWith(".qml"))) {
      fs.readFileSync(path.join(here, "..", file), "utf8").split("\n").forEach((line, i) => {
        assert.equal(regex.test(line), false, `${file}:${i + 1}: ${line}`);
      });
    }
  }
});

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
  const n = Model.normalize({ id: " 7 ", name: " Buy  milk ", description: " x  y ", status: "DOING", plan: [{ text: "a", done: 1 }, { text: "" }, "junk"], notes: [{ at: "t", text: "n" }, { text: "" }], due: "2026-10-01", author: "Ann", completedAt: null, uid: "u1" });
  assert.deepEqual(n, item("7", "Buy milk", "doing", { uid: "u1", description: "x y", plan: [{ text: "a", done: true }], notes: [{ at: "t", text: "n" }], due: "2026-10-01", author: "Ann" }));
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
  assert.equal(Model.formatTime(65), "1:05");
  assert.equal(Model.formatTime(3661), "1:01:01", "h:mm:ss from an hour up, as the pomodoro shows it");
  assert.equal(Model.formatTime(5400), "1:30:00");
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

test("completedAt is carried through normalization and copies (AC-ST.61)", () => {
  for (const value of [null, "2026-09-30T09:00:00.000Z"]) {
    const it = Model.normalize({ name: "done", completedAt: value });
    assert.equal(it.completedAt, value);
    assert.equal(Model.copyItem(it).completedAt, value);
  }
});

test("one home rule returns the Inbox for open orphans and keeps archived done homes", () => {
  const catalogue=[{uid:'I',key:'inbox',archivedAt:null},{uid:'A',key:'active',archivedAt:null},{uid:'X',key:'old',archivedAt:'instant'}];
  assert.deepEqual(Model.activeStreams(catalogue),catalogue.slice(0,2));
  assert.deepEqual(Model.activeStreams(null),[]);
  for (const stream of ['missing','old']) assert.equal(Model.homeStreamOf(catalogue,{stream,status:'todo'}).uid,'I');
  assert.equal(Model.homeStreamOf(catalogue,{stream:'active',status:'todo'}).uid,'A');
  assert.equal(Model.homeStreamOf(catalogue,{stream:'old',status:'done'}).uid,'X');
  assert.equal(Model.homeStreamOf(catalogue,{stream:'missing',status:'done'}),null);
});
