// View.js under node --test (PLAN §9.4, A28; fixtures from UX §3.1, §4.2,
// §4.4, §4.5, §4.7, §10.3 and PLAN A19, A34b): the list's order and the
// session's done rows (UI-14), the focus line (F0–F6), the detail view's
// status line and tooltips, the
// transients and the IPC `dump()` view.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { lib, G, NOW, item, idle, onTask, here } from "./helpers.mjs";

const View = lib("View.js");
const Store = lib("Store.js");
const boardFixture = (name) => Store.fromCli(fs.readFileSync(path.join(here, "fixtures", name), "utf8"));
const expected = JSON.parse(fs.readFileSync(path.join(here, "fixtures/consumer/expected.json"), "utf8"));

test("dump.open carries eight metadata keys, zero and copied labels in unchanged list order", () => {
  const doc = boardFixture("contract/board-streams.json");
  const dump = View.dumpView({ backend: "cli", ...doc, sessionDone: { 8: true } });
  assert.deepEqual(dump.open.map((it) => it.id), ["3", "1", "2", "4", "5", "6", "7"]);
  for (const entry of dump.open) {
    assert.deepEqual(Object.keys(entry), ["id", "title", "status", "stream", "horizon", "labels", "priority", "size"]);
    const source = doc.items.find((it) => it.id === entry.id);
    assert.deepEqual(entry, { id: source.id, title: source.name, status: source.status, stream: source.stream, horizon: source.horizon, labels: source.labels, priority: source.priority, size: source.size });
    assert.notEqual(entry.labels, source.labels);
  }
  assert.equal(dump.open.find((it) => it.id === "2").priority, 0);
  assert.deepEqual(dump.done, [{ id: "8", title: "Shipped the invoice export" }]);
  dump.open[0].labels.push("new");
  assert.deepEqual(doc.items[2].labels, ["waiting"]);
});

test("dump.open flags only missing or archived homes and retains the task's own stream", () => {
  const doc = boardFixture("consumer/board-archived-home.json");
  const dump = View.dumpView({ backend: "cli", ...doc });
  const orphans = dump.open.filter((it) => it.orphan === true);
  const oracle = expected["board-archived-home.json"];
  assert.deepEqual(orphans.map((it) => Number(it.id)), oracle.orphanIds);
  assert.deepEqual(Object.fromEntries(orphans.map((it) => [it.id, it.stream])), oracle.streams);
  assert.equal(dump.open.filter((it) => Object.hasOwn(it, "orphan")).length, oracle.orphanIds.length);
  assert.equal(View.dumpView({ backend: "cli", ...doc, streams: null }).open.every((it) => it.orphan === true), true);
});

test("older cli and json dump.open retain today's three keys; done is unchanged", () => {
  const doc = boardFixture("consumer/board-old-cli.json");
  for (const hasStreams of [false, undefined]) {
    const dump = View.dumpView({ backend: "cli", ...doc, hasStreams, sessionDone: { 5: true } });
    assert.deepEqual(dump.open, [{ id: "3", title: "Wire the webhook", status: "doing" }]);
    dump.open.forEach((it) => assert.deepEqual(Object.keys(it), expected["board-old-cli.json"].dump.openKeys));
    assert.deepEqual(dump.done, [{ id: "5", title: "Closed one" }]);
  }
});

// ------------------------------------------------------------- session
test("tickDone remembers an open row's pre-tick status and warns when the pomodoro sits on it (UI-14, UX §6.4)", () => {
  const items = [item("1", "A", "doing"), item("2", "B", "todo"), item("3", "C", "done")];
  const onOne = onTask("1", { remaining: 9, label: "A" });
  assert.deepEqual(View.tickDone({ items, sessionDone: { 7: "todo" }, pomodoro: idle }, { type: "setStatus", id: 2, status: "done" }), { sessionDone: { 7: "todo", 2: "todo" }, message: "" });
  assert.deepEqual(View.tickDone({ items, sessionDone: {}, pomodoro: onOne }, { type: "setStatus", id: "1", status: "done" }), { sessionDone: { 1: "doing" }, message: View.MSG_DONE_ATTACHED });
  assert.equal(View.tickDone({ items, sessionDone: {}, pomodoro: idle }, { type: "setStatus", id: "3", status: "done" }), null, "already done");
  assert.equal(View.tickDone({ items, sessionDone: {}, pomodoro: idle }, { type: "setStatus", id: "9", status: "done" }), null, "unknown id");
  assert.equal(View.tickDone({ items, sessionDone: {}, pomodoro: idle }, { type: "setStatus", id: "1", status: "todo" }), null, "not a tick");
  assert.equal(View.tickDone({ items }, { type: "remove", id: "1" }), null);
  assert.equal(View.tickDone({ items }, null), null);
  assert.equal(View.MSG_DONE_ATTACHED, "Done. p on the next task moves the pomodoro.");
});

test("pruneSessionDone drops rows that are no longer done: reverted, reopened or removed", () => {
  const items = [item("3", "three", "todo"), item("4", "four", "done"), item("5", "five", "done")];
  assert.deepEqual(View.pruneSessionDone({ 3: "todo", 4: "doing", 9: "todo" }, items), { 4: "doing" });
  assert.deepEqual(View.pruneSessionDone({ 5: "todo" }, items), { 5: "todo" });
  assert.deepEqual(View.pruneSessionDone(null, items), {});
  assert.deepEqual(View.pruneSessionDone({ 4: "doing" }, null), {});
});

// ------------------------------------------------------------- ordering
test("sortForList: doing, todo, done; ids numeric in cli mode, insertion order in json mode", () => {
  const items = [item("10", "ten", "todo"), item("2", "two", "doing"), item("3", "three", "done"), item("1", "one", "todo"), item("7", "seven", "doing")];
  assert.deepEqual(View.sortForList(items, {}).map((i) => i.id), ["2", "7", "1", "10", "3"]);
  const json = [item("tb", "b", "todo"), item("ta", "a", "doing"), item("tc", "c", "todo")];
  assert.deepEqual(View.sortForList(json, {}).map((i) => i.id), ["ta", "tb", "tc"]);
  assert.deepEqual(View.sortForList(null, {}), []);
  assert.deepEqual(View.sortForList([null, item("1", "one", "todo")], null).map((i) => i.id), ["1"], "holes are skipped");
});

test("UI-14: a row ticked done this session keeps its pre-tick group position", () => {
  const items = [item("1", "one", "doing"), item("2", "two", "done"), item("3", "three", "todo"), item("4", "four", "todo")];
  // #2 was doing before the tick, #4 was todo before the tick.
  const sessionDone = { 2: "doing", 4: "todo" };
  assert.deepEqual(View.sortForList(items, sessionDone).map((i) => i.id), ["1", "2", "3", "4"]);
  assert.deepEqual(View.visibleItems(items, sessionDone).map((i) => i.id), ["1", "2", "3", "4"]);
  assert.deepEqual(View.visibleItems(items, {}).map((i) => i.id), ["1", "3", "4"], "done rows hide when the panel reopens");
  assert.deepEqual(View.visibleItems(null, null), []);
});

test("doingTask, openCount and countLabel", () => {
  const items = [item("5", "five", "doing"), item("8", "eight", "doing"), item("9", "nine", "done"), item("1", "one", "todo")];
  assert.equal(View.doingTask(items, { text: "", taskId: "8" }).id, "8", "the focused task wins when it is doing");
  assert.equal(View.doingTask(items, { text: "", taskId: null }).id, "5", "else the lowest doing id (AC-5.9)");
  assert.equal(View.doingTask([item("b", "b", "doing"), item("a", "a", "doing")], null).id, "b", "json ids: first in insertion order");
  assert.equal(View.doingTask([item("1", "x", "todo")], null), null);
  assert.equal(View.openCount(items), 3);
  assert.equal(View.countLabel(items), "3 open");
  assert.equal(View.countLabel([]), "0 open");
});

test("listRows puts the focus line first, then the sorted items (UX §4.2)", () => {
  const f1 = { variant: "F1", item: item("12", "W", "doing"), selectable: true };
  assert.deepEqual(View.listRows(f1, [item("3", "B", "todo")]), [{ kind: "focus", item: f1.item, selectable: true }, { kind: "item", item: item("3", "B", "todo"), selectable: true }]);
  assert.deepEqual(View.listRows({ variant: "F0", item: null, selectable: false }, []), [{ kind: "focus", item: null, selectable: false }]);
  assert.deepEqual(View.listRows(null, [item("3", "B", "todo")]), [{ kind: "item", item: item("3", "B", "todo"), selectable: true }]);
  assert.deepEqual(View.listRows(null, null), []);
});

test("transient message copy (UX §4.5, §7) and the empty-state and help lines", () => {
  assert.equal(View.msgDoneRow(item("12", "Write UX spec for the panels", "done"), "cli"), "#12 is done · d reopens it");
  assert.equal(View.msgDoneRow(item("t1", "Write UX spec for the panels", "done"), "json"), "Write UX spec for the… is done · d reopens it");
  assert.equal(View.taskRef(item("12", "Write", "doing"), "cli"), "#12");
  assert.equal(View.taskRef(item("t1", "Write", "doing"), "json"), "Write");
  assert.equal(View.msgTaskNotFound("99"), "Task 99 not found.");
  assert.equal(View.emptyCopy([]), "Nothing here yet. Press + to add a todo.");
  assert.equal(View.emptyCopy([item("1", "a", "done")]), "All clear. Press + to add a todo.");
  assert.equal(View.emptyCopy([item("1", "a", "todo")]), null);
  assert.equal(View.helpLine("list", "cli"), "n new · d done · s doing · f focus · p pomodoro · x x or Del delete · r reload · R sync · Tab next panel");
  assert.equal(View.helpLine("list", "json"), "n new · d done · s doing · f focus · p pomodoro · x x or Del delete · r reload · Tab next panel");
  assert.equal(View.helpLine("detail", "cli"), "Enter step · d done · s doing · f focus · p pomodoro · x x or Del delete · Esc back");
});

// ------------------------------------------------------------- focus line
test("focusLine renders the UX §4.2 variants F0–F6", () => {
  const items = [item("12", "Write UX spec for the panels", "doing"), item("15", "Review PR !412", "doing"), item("2", "Book", "todo")];
  assert.deepEqual(View.focusLine(items, { text: "", taskId: null }, idle), { variant: "F0", text: "No focus · f on a task sets it", selectable: false, item: null, timer: "", timerGlyph: "", timerDim: false, hint: "", tooltip: "", actions: { pomodoro: false, clear: false } });
  assert.equal(View.focusLine([], { text: "", taskId: null }, idle), null);
  assert.equal(View.focusLine([item("1", "a", "done")], { text: "", taskId: null }, idle).variant, "F0");
  const f1 = View.focusLine(items, { text: "", taskId: "12" }, idle);
  assert.equal(f1.variant, "F1");
  assert.equal(f1.text, "Write UX spec for the panels");
  assert.equal(f1.item.id, "12");
  assert.equal(f1.selectable, true);
  assert.equal(View.focusLine(items, { text: "", taskId: "12" }, null).variant, "F1", "no pomodoro view reads as idle");
  const f2 = View.focusLine(items, { text: "", taskId: "12" }, onTask("12"));
  assert.equal(f2.variant, "F2");
  assert.equal(f2.timer, "18:42");
  assert.equal(f2.timerGlyph, G.pomodoro);
  assert.equal(f2.timerDim, false);
  const f3 = View.focusLine(items, { text: "", taskId: "12" }, onTask("12", { running: false }));
  assert.equal(f3.variant, "F3");
  assert.equal(f3.timer, "18:42 paused");
  assert.equal(f3.timerDim, true);
  const f4 = View.focusLine(items, { text: "", taskId: "12" }, onTask("12", { phase: "shortBreak", remaining: 190 }));
  assert.equal(f4.variant, "F4");
  assert.equal(f4.timer, "3:10");
  assert.equal(f4.timerGlyph, G.brk);
  const f5 = View.focusLine(items, { text: "", taskId: "12" }, onTask("15", { label: "Review PR !412" }));
  assert.equal(f5.variant, "F5");
  assert.equal(f5.hint, G.pomodoro + " 18:42 on Review PR !412 · p moves it here");
  const gone = View.focusLine(items, { text: "", taskId: "12" }, onTask("99", { label: "Elsewhere" }));
  assert.equal(gone.hint, G.pomodoro + " 18:42 on Elsewhere · p moves it here", "a task the list no longer has shows the pomodoro's label");
  const f6 = View.focusLine(items, { text: "Ship the invoice-export slice", taskId: null }, idle);
  assert.equal(f6.variant, "F6");
  assert.equal(f6.text, "Ship the invoice-export slice");
  assert.equal(f6.tooltip, "Focus set outside the list. Enter makes it a task.");
  assert.equal(f6.item, null);
  assert.equal(View.focusLine(items, { text: "Ship", taskId: "99" }, idle).variant, "F6", "a dangling link with text is a free-text focus");
  assert.equal(View.focusLine(items, { text: "", taskId: "99" }, idle).variant, "F0");
  assert.equal(View.focusLine(items, null, idle).variant, "F0", "no focus object reads as no focus");
  // The ghost buttons each variant lays out: (t) on F1 and F5 only, {x} on every line with a focus.
  assert.deepEqual(f1.actions, { pomodoro: true, clear: true });
  assert.deepEqual(f2.actions, { pomodoro: false, clear: true });
  assert.deepEqual(f3.actions, { pomodoro: false, clear: true });
  assert.deepEqual(f4.actions, { pomodoro: false, clear: true });
  assert.deepEqual(f5.actions, { pomodoro: true, clear: true });
  assert.deepEqual(f6.actions, { pomodoro: false, clear: true }, "a free-text focus has no task to start on");
});

// ------------------------------------------------------------- row cluster
test("rowActions: one slot each for the focus, pomodoro and delete mark or ghost; the armed caption replaces the first two (UX §4.2)", () => {
  const plain = item("1", "one", "todo");
  const planned = item("2", "two", "doing", { plan: [{ text: "a", done: true }, { text: "b", done: false }] });
  const done = item("3", "three", "done");
  const focus = { text: "one", taskId: "1" };
  const shape = (a) => ({ f: a.focus.mark + "/" + a.focus.ghost, p: a.pomodoro.mark + "/" + a.pomodoro.ghost });
  const delGhost = { mark: false, ghost: true, held: false, tooltip: "Delete (x x or Del)" };
  assert.deepEqual(View.rowActions(plain, { focus: null, pomodoro: idle }), {
    armed: false, caption: "", progress: "",
    focus: { mark: false, ghost: true, held: false, tooltip: "Set focus (f)" },
    pomodoro: { mark: false, running: false, ghost: true, held: false, tooltip: "Start pomodoro (p)" },
    del: delGhost
  });
  assert.deepEqual(View.rowActions(done, { focus: null, pomodoro: idle }).del, delGhost, "a done row keeps the delete ghost: done rows can be deleted too");
  assert.deepEqual(View.rowActions(plain, { focus, pomodoro: onTask("1") }).del, delGhost, "the focus / attached task keeps it as well");
  assert.equal(View.TIP_DELETE, "Delete (x x or Del)");
  assert.equal(View.TIP_DELETE_ARMED, "Click or x again to delete");
  assert.equal(View.CAPTION_ARMED, "click or x again to delete");
  assert.deepEqual(shape(View.rowActions(plain, { focus, pomodoro: idle })), { f: "true/false", p: "false/true" }, "the focus task carries the mark, not the ghost");
  const onOne = View.rowActions(plain, { focus, pomodoro: onTask("1") });
  assert.deepEqual(shape(onOne), { f: "true/false", p: "true/false" }, "the attached task carries the pomodoro mark");
  assert.equal(onOne.pomodoro.running, true);
  assert.equal(View.rowActions(plain, { focus, pomodoro: onTask("1", { running: false }) }).pomodoro.running, false, "dim while paused");
  assert.deepEqual(shape(View.rowActions(planned, { focus, pomodoro: onTask("1") })), { f: "false/true", p: "false/true" }, "another row keeps both ghosts");
  assert.equal(View.rowActions(planned, { focus, pomodoro: idle }).progress, "1/2");
  assert.deepEqual(shape(View.rowActions(done, { focus: null, pomodoro: idle })), { f: "false/false", p: "false/false" }, "a done row has no ghosts (s, f, p are inert)");
  assert.deepEqual(shape(View.rowActions(done, { focus: null, pomodoro: onTask("3") })), { f: "false/false", p: "true/false" }, "but keeps the mark of the pomodoro still attached to it");
  const armed = View.rowActions(planned, { focus: { text: "two", taskId: "2" }, pomodoro: onTask("2"), armed: true });
  assert.deepEqual(armed, {
    armed: true, caption: "click or x again to delete", progress: "",
    focus: { mark: false, ghost: false, held: false, tooltip: "Set focus (f)" },
    pomodoro: { mark: false, running: true, ghost: false, held: false, tooltip: "Start pomodoro (p)" },
    del: { mark: false, ghost: true, held: true, tooltip: "Click or x again to delete" }
  }, "armed: the caption, and the delete ghost held (shown without hover) for the second click");
  assert.equal(View.rowActions(done, { focus: null, pomodoro: idle, armed: true }).del.held, true, "an armed done row holds it too");
  assert.equal(View.rowActions(plain, { focus: null, pomodoro: idle, armed: "yes" }).armed, false, "armed is strictly boolean");
  assert.deepEqual(shape(View.rowActions(null, null)), { f: "false/true", p: "false/true" }, "total on missing input");
  assert.deepEqual(View.rowActions(null, null).del, delGhost);
});

// ------------------------------------------------------------- detail
test("statusLine and action tooltips for the detail view (UX §4.4)", () => {
  const it = item("12", "Write", "doing", { plan: [{ text: "a", done: true }, { text: "b", done: false }, { text: "c", done: false }], notes: [{ at: "t", text: "n" }, { at: "t", text: "m" }], due: "2026-10-02" });
  const pom = onTask("12", { label: "Write" });
  assert.equal(View.statusLine(it, { backend: "cli", focus: { text: "", taskId: "12" }, pomodoro: pom }), G.doing + " doing · #12 · plan 1/3 · 2 notes · focus · " + G.pomodoro + " 18:42 · due Oct 2");
  assert.equal(View.statusLine(item("t1", "x", "todo", { notes: [{ at: "t", text: "n" }] }), { backend: "json", focus: { text: "", taskId: null }, pomodoro: null }), G.todo + " todo · 1 note");
  assert.equal(View.statusLine(item("t1", "x", "done", { due: "2026-10-02" }), { backend: "json", focus: { text: "", taskId: null }, pomodoro: null }), G.done + " done", "due is cli-only");
  assert.equal(View.statusLine(null, {}), "");
  const tips = View.actionTooltips(it, { focus: { text: "", taskId: "12" }, pomodoro: pom, armed: false });
  assert.deepEqual(tips, { doing: "Back to todo (s)", done: "Mark done (d)", focus: "Clear focus (f)", pomodoro: "Pause pomodoro (p)", del: "Delete (x x or Del)", doingEnabled: true, focusEnabled: true, pomodoroEnabled: true });
  const todoTips = View.actionTooltips(item("3", "x", "todo"), { focus: { text: "", taskId: "12" }, pomodoro: onTask("3", { running: false, remaining: 1, label: "" }), armed: true });
  assert.equal(todoTips.doing, "Mark doing (s)");
  assert.equal(todoTips.focus, "Set focus (f)");
  assert.equal(todoTips.pomodoro, "Resume pomodoro (p)");
  assert.equal(todoTips.del, "Click or x again to delete", "the detail button's armed tooltip matches the row caption");
  assert.equal(View.actionTooltips(item("3", "x", "done"), { armed: true }).del, "Click or x again to delete", "a done task can be deleted too");
  const doneTips = View.actionTooltips(item("3", "x", "done"), { focus: { text: "", taskId: null }, pomodoro: null, armed: false });
  assert.equal(doneTips.done, "Reopen (d)");
  assert.equal(doneTips.doing, "Done · d reopens it");
  assert.equal(doneTips.focus, "Done · d reopens it");
  assert.equal(doneTips.pomodoro, "Done · d reopens it");
  assert.equal(doneTips.doingEnabled, false);
  assert.equal(doneTips.pomodoroEnabled, false);
  const doneAttached = View.actionTooltips(item("3", "x", "done"), { focus: { text: "", taskId: null }, pomodoro: onTask("3", { remaining: 1, label: "" }), armed: false });
  assert.equal(doneAttached.pomodoro, "Pause pomodoro (p)");
  assert.equal(doneAttached.pomodoroEnabled, true);
  assert.equal(View.actionTooltips(item("3", "x", "todo"), {}).pomodoro, "Start pomodoro (p)");
  assert.equal(View.actionTooltips(null, {}).done, "Mark done (d)", "no item reads as an open row");
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
  const d = View.dumpView(state);
  assert.deepEqual(d, {
    tab: "overview", streams: [], strip: null, horizonFilter: "all", moving: null,
    rows: [items[0], items[2], items[1]].map(it => ({ kind: "item", id: it.id, status: it.status, stream: null, horizon: null, priority: null, size: null, badge: "" })),
    version: 1, backend: "cli", cliPath: "todocli", view: "list", stale: false, error: null,
    pill: state.pill,
    focus: { text: "Ship the invoice-export slice", taskId: "12" },
    open: [{ id: "12", title: "Write UX spec for the panels", status: "doing" }, { id: "3", title: "Book", status: "todo" }],
    done: [{ id: "7", title: "Reply to Basecamp thread" }],
    banner: null, footer: { text: "todocli · synced 2m ago", urgent: false }, message: null,
  });
  assert.equal(JSON.parse(JSON.stringify(d)).open.length, 2);
  for (const kind of ["missing", "busy", "failed", "protocol"]) {
    const e = View.dumpView(Object.assign({}, state, { error: { kind, message: "m" }, stale: true, view: "error", footer: null, message: "Not saved — x." }));
    assert.deepEqual(e.error, { kind, message: "m" });
    assert.equal(e.stale, true);
    assert.equal(e.footer, null);
    assert.equal(e.message, "Not saved — x.");
  }
  assert.deepEqual(View.dumpView(Object.assign({}, state, { sessionDone: {} })).done, [], "a done row outside the session is not listed");
  const bare = View.dumpView({});
  assert.equal(bare.backend, "json");
  assert.deepEqual(bare.open, []);
  assert.deepEqual(bare.done, []);
  assert.equal(bare.footer, null);
  assert.equal(bare.pill.glyph, G.icon);
});


test("P2 help lines, metadata rows, empty scopes, move targets and degraded modes", () => {
  const doc=boardFixture("contract/board-streams.json");
  assert.equal(View.helpLine("list","cli",true,true,"overview"),"n new · d done · s doing · f focus · p pomodoro · ! priority · z size · m move · [ ] 0-9 tabs · v horizon · x x or Del delete · r reload · R sync · Tab next panel");
  assert.equal(View.helpLine("list","cli",true,false,"overview").includes("m move"),false);
  assert.equal(View.helpLine("list","cli",true,false,"overview").includes("v horizon"),true);
  assert.equal(View.helpLine("list","cli",true,true,"done"),"d reopen · Enter open · x x or Del delete · [ ] 0-9 tabs · r reload · R sync · Tab next panel");
  const target=doc.streams[1];
  const dump=View.dumpView({backend:"cli",...doc,catalogue:doc.streams,tab:target.key,moving:{id:"3",targetUid:target.uid}});
  assert.deepEqual(dump.moving,{id:"3",target:target.key});
  for(const tab of ["done","personal: goals"]) {
    const empty=View.dumpView({backend:"cli",hasStreams:true,catalogue:doc.streams,items:[],tab});
    assert.deepEqual(empty.rows,[]);
  }
  const filtered=View.dumpView({backend:"cli",...doc,tab:target.key,horizonFilter:"long"});
  assert.deepEqual(filtered.rows,[]);
  const json=View.dumpView({backend:"json",...doc,tab:"done",moving:{id:"3",targetUid:target.uid},horizonFilter:"mid"});
  assert.equal(json.tab,"overview"); assert.equal(json.horizonFilter,"all"); assert.equal(json.moving,null);
  assert.deepEqual(json.streams,[]); assert.deepEqual(Object.keys(json.open[0]),["id","title","status"]);
});


test("global focus caption on Overview and Done, hidden on its home and in today's modes",()=>{
  const doc=boardFixture("contract/board-streams.json");
  const line=View.focusLine(doc.items,doc.focus,idle);
  assert.equal(View.focusCaption(line,doc.streams,"overview",true),"tellkin");
  assert.equal(View.focusCaption(line,doc.streams,"done",true),"tellkin");
  assert.equal(View.focusCaption(line,doc.streams,"work: tellkin",true),"");
  assert.equal(View.focusCaption(line,doc.streams,"overview",false),"");
  assert.equal(View.focusCaption(line,doc.streams.slice(0,1),"overview",true),"");
  assert.equal(View.focusCaption(null,doc.streams,"overview",true),"");
  assert.equal(View.focusCaption({item:null},doc.streams,"overview",true),"");
});

test('detail status shows the stream key while the strip is available, the Inbox as "Inbox", and a non-short horizon (UX §12)', () => {
  const c={backend:'cli',hasStreams:true,strip:true};
  for (const [horizon,name] of [['mid','mid-term'],['yearly','yearly'],['long','long-term']]) {
    const it=item('9','Task','todo',{stream:'work: tellkin',horizon,plan:[{text:'Step',done:false}]});
    assert.equal(View.statusLine(it,c),G.todo+' todo · #9 · work: tellkin · '+name+' · plan 0/1');
    assert.equal(View.statusLine(it,{...c,strip:false}),G.todo+' todo · #9 · '+name+' · plan 0/1','no strip: the horizon alone');
    assert.equal(View.statusLine(it,{backend:'cli',hasStreams:false,strip:true}),G.todo+' todo · #9 · plan 0/1');
    assert.equal(View.statusLine(it,{backend:'json',hasStreams:true,strip:true}),G.todo+' todo · plan 0/1');
  }
  for (const stream of ['inbox',null]) {
    assert.equal(View.statusLine(item('9','Task','todo',{stream}),c),G.todo+' todo · #9 · Inbox');
    assert.equal(View.statusLine(item('9','Task','todo',{stream}),{...c,strip:false}),G.todo+' todo · #9');
  }
  assert.equal(View.statusLine(item('9','Task','todo',{stream:'work: old'}),c),G.todo+' todo · #9 · work: old');
  assert.equal(View.statusLine(item('9','Task','todo',{stream:'work: tellkin'}),{...c,strip:false}),G.todo+' todo · #9');
});
