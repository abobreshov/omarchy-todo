// Pomodoro.js under node --test (PLAN §6.9, A52; UX §3.4, §6.2, §6.5, §7
// E11/E12): the intent behind p / middle click / startPomodoro, the reading
// of omarchy-shell's result and of the state file, and the transients.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lib, NOW, item, idle, onTask } from "./helpers.mjs";

const Pomodoro = lib("Pomodoro.js");

test("pomodoroIntent decides p / middle click / startPomodoro (PLAN §6.9, A52; UX §3.4, §6.2)", () => {
  const items = [item("12", "Write UX spec", "doing"), item("7", "Old", "done"), item("3", "Book", "todo")];
  const on12 = onTask("12", { label: "Write UX spec" });
  const base = { items, focus: { text: "", taskId: "12" }, pomodoro: idle, error: null, backend: "cli" };
  const withOver = (over) => Object.assign({}, base, over);
  assert.deepEqual(Pomodoro.pomodoroIntent(base, 3), { kind: "focusThenStart", item: items[2] });
  assert.deepEqual(Pomodoro.pomodoroIntent(base, "focus"), { kind: "focusThenStart", item: items[0] }, "the focus line acts on the focus task");
  assert.deepEqual(Pomodoro.pomodoroIntent(withOver({ pomodoro: on12 }), "12"), { kind: "pause" }, "attached: p toggles pause/resume");
  assert.deepEqual(Pomodoro.pomodoroIntent(withOver({ pomodoro: on12 }), "focus"), { kind: "pause" });
  assert.deepEqual(Pomodoro.pomodoroIntent(withOver({ focus: { text: "Ship it", taskId: null } }), "focus"), { kind: "startLabel", label: "Ship it" }, "free-text focus: a label-only pomodoro");
  assert.deepEqual(Pomodoro.pomodoroIntent(withOver({ focus: { text: "", taskId: null } }), "focus"), { kind: "reply", reply: "no focus", message: "" });
  assert.equal(Pomodoro.NO_FOCUS, "no focus");
  assert.deepEqual(Pomodoro.pomodoroIntent(base, "99"), { kind: "reply", reply: "unknown id", message: "" });
  assert.deepEqual(Pomodoro.pomodoroIntent(base, "7"), { kind: "reply", reply: "refused: done", message: "#7 is done · d reopens it" });
  assert.equal(Pomodoro.pomodoroIntent(withOver({ backend: "json" }), "7").message, "Old is done · d reopens it");
  assert.deepEqual(Pomodoro.pomodoroIntent(withOver({ error: { kind: "busy", message: "m" } }), "3"), { kind: "reply", reply: "unavailable: database busy", message: "" });
  assert.deepEqual(Pomodoro.pomodoroIntent(withOver({ error: { kind: "busy" }, pomodoro: on12 }), "12"), { kind: "pause" }, "pausing needs no write");
  assert.deepEqual(Pomodoro.pomodoroIntent(withOver({ error: { kind: "busy" }, focus: { text: "Ship it", taskId: null } }), "focus"), { kind: "startLabel", label: "Ship it" }, "a label-only start needs no write");
  assert.deepEqual(Pomodoro.pomodoroIntent({}, "focus"), { kind: "reply", reply: "no focus", message: "" });
});

test("pomodoroMessage maps the startFor result to the UX §6.2 / §7 transients", () => {
  const ctx = { remaining: 1122, backend: "cli", target: "abobreshov.pomodoro" };
  assert.equal(Pomodoro.pomodoroMessage({ ok: true, word: "started" }, item("15", "Fifteen", "doing"), ctx), "");
  assert.equal(Pomodoro.pomodoroMessage({ ok: true, word: "retargeted" }, item("15", "Fifteen", "doing"), ctx), "Pomodoro moved to #15 · 18:42 left");
  assert.equal(Pomodoro.pomodoroMessage({ ok: true, word: "retargeted" }, null, ctx), "", "a label-only retarget names no task");
  assert.equal(Pomodoro.pomodoroMessage({ ok: false, kind: "missing" }, null, ctx), "Pomodoro plugin not found. Enable abobreshov.pomodoro.");
  assert.equal(Pomodoro.pomodoroMessage({ ok: false, kind: "old" }, null, ctx), "Pomodoro plugin is out of date. Update abobreshov.pomodoro.");
  assert.equal(Pomodoro.pomodoroMessage({ ok: false, kind: "transient", text: "omarchy-shell is not running" }, null, ctx), "Pomodoro not started — omarchy-shell is not running.");
});

test("the pomodoro transients (UX §6.2, §7 E11, E12)", () => {
  assert.equal(Pomodoro.msgPomodoroMoved(item("15", "Fifteen", "doing"), 1122, "cli"), "Pomodoro moved to #15 · 18:42 left");
  assert.equal(Pomodoro.msgPomodoroMoved(item("tx", "Fifteen", "doing"), 190, "json"), "Pomodoro moved to Fifteen · 3:10 left");
  assert.equal(Pomodoro.msgPomodoroMissing("abobreshov.pomodoro"), "Pomodoro plugin not found. Enable abobreshov.pomodoro.");
  assert.equal(Pomodoro.msgPomodoroOld("abobreshov.pomodoro"), "Pomodoro plugin is out of date. Update abobreshov.pomodoro.");
  assert.equal(Pomodoro.msgPomodoroNotStarted("omarchy-shell is not running"), "Pomodoro not started — omarchy-shell is not running.");
});

test("classifyShell maps omarchy-shell results to E11, E12 and transients", () => {
  assert.deepEqual(Pomodoro.classifyShell(0, "started\n", "", false), { ok: true, word: "started" });
  assert.deepEqual(Pomodoro.classifyShell(1, "", "Target not found.\n", false), { ok: false, kind: "missing" });
  assert.deepEqual(Pomodoro.classifyShell(1, "", "Function not found.\n", false), { ok: false, kind: "old" });
  assert.deepEqual(Pomodoro.classifyShell(1, "", "omarchy-shell is not running\n", false), { ok: false, kind: "transient", text: "omarchy-shell is not running" });
  assert.deepEqual(Pomodoro.classifyShell(124, "", "", false), { ok: false, kind: "transient", text: "omarchy-shell exited 124" });
  assert.deepEqual(Pomodoro.classifyShell(0, "", "", true), { ok: false, kind: "transient", text: "omarchy-shell not found" });
});

test("pomodoroView reads the state file the way UX §6.5 tells readers to; another version reads as idle", () => {
  const v1 = (over) => Object.assign({ version: 1 }, over);
  assert.deepEqual(Pomodoro.pomodoroView(null, NOW), idle);
  const running = Pomodoro.pomodoroView(v1({ phase: "work", running: true, endsAt: NOW + 1122 * 1000 + 400, remaining: 1500, taskId: "12", taskLabel: "Write", completed: 2 }), NOW);
  assert.deepEqual(running, { phase: "work", running: true, remaining: 1123, taskId: "12", label: "Write", attached: true });
  const paused = Pomodoro.pomodoroView(v1({ phase: "work", running: false, endsAt: 0, remaining: 1122, taskId: "", taskLabel: "" }), NOW);
  assert.equal(paused.remaining, 1122);
  assert.equal(paused.attached, false);
  const stale = Pomodoro.pomodoroView(v1({ phase: "work", running: true, endsAt: NOW - 11000, remaining: 5, taskId: "12" }), NOW);
  assert.equal(stale.phase, "idle");
  const grace = Pomodoro.pomodoroView(v1({ phase: "work", running: true, endsAt: NOW - 9000, remaining: 5, taskId: "12" }), NOW);
  assert.equal(grace.phase, "work");
  assert.equal(grace.remaining, 0);
  assert.equal(Pomodoro.pomodoroView("not an object", NOW).phase, "idle");
  assert.equal(Pomodoro.pomodoroView(v1({ phase: "idle", running: true, endsAt: NOW + 5000 }), NOW).phase, "idle", "an idle file reads as idle whatever else it says");
  assert.equal(Pomodoro.pomodoroView(v1({ phase: "shortBreak", running: true, endsAt: NOW + 190000, taskId: "3", taskLabel: "T" }), NOW).phase, "shortBreak");
  assert.equal(Pomodoro.STATE_VERSION, 1);
  assert.deepEqual(Pomodoro.pomodoroView({ phase: "work", running: true, endsAt: NOW + 5000, taskId: "3" }, NOW), idle, "no version: idle");
  assert.deepEqual(Pomodoro.pomodoroView(v1({ version: 2, phase: "work", running: true, endsAt: NOW + 5000, taskId: "3" }), NOW), idle, "version 2: idle, as the writer's own parser reads it");
  assert.equal(Pomodoro.pomodoroView({ version: "1", phase: "work", running: false, remaining: 7 }, NOW).remaining, 7, "a numeric string is the number");
  assert.equal(Pomodoro.parsePomodoroState("{bad").phase, "idle");
  assert.equal(Pomodoro.parsePomodoroState("42").phase, "idle", "valid JSON that is not an object reads as idle");
  assert.equal(Pomodoro.parsePomodoroState('{"version":1,"phase":"work","running":false,"remaining":7}').remaining, 7);
});
