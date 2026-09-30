// Argv.js under node --test (PLAN §6.4, A34, A43; UX §4.7 item 5; AC-2.1b
// read with PLAN A34's shape: global flags first, free text after `--`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lib } from "./helpers.mjs";

const Argv = lib("Argv.js");

test("CONTRACT-S9 §10: attached add flags in stream, horizon, description order", () => {
  const cases = [
    [{}, ["todocli", "--source", "omarchy", "--json", "add", "--description=d", "--", "Name"]],
    [{ horizon: "yearly" }, ["todocli", "--source", "omarchy", "--json", "add", "--horizon=yearly", "--description=d", "--", "Name"]],
    [{ stream: "work: tellkin" }, ["todocli", "--source", "omarchy", "--json", "add", "--stream=work: tellkin", "--description=d", "--", "Name"]],
    [{ stream: "work: tellkin", horizon: "mid" }, ["todocli", "--source", "omarchy", "--json", "add", "--stream=work: tellkin", "--horizon=mid", "--description=d", "--", "Name"]],
  ];
  for (const [fields, expected] of cases) assert.deepEqual(Argv.forAction("todocli", { type: "add", name: "Name", description: "d", ...fields }), expected);
  for (const value of [undefined, null, ""]) {
    assert.deepEqual(Argv.forAction("todocli", { type: "add", name: "Name", stream: value, horizon: value }), ["todocli", "--source", "omarchy", "--json", "add", "--", "Name"]);
  }
});

test("CONTRACT-S9 §10: move and numeric priority/size writes keep global flags first", () => {
  const cases = [
    [{ type: "move", id: 12, stream: "work: tellkin" }, ["todocli", "--source", "omarchy", "--json", "move", "12", "work: tellkin"]],
    [{ type: "move", id: 12, stream: "inbox" }, ["todocli", "--source", "omarchy", "--json", "move", "12", "inbox"]],
    [{ type: "setPriority", id: 4, value: 75 }, ["todocli", "--source", "omarchy", "--json", "priority", "4", "75"]],
    [{ type: "setPriority", id: 4, value: 0 }, ["todocli", "--source", "omarchy", "--json", "priority", "4", "0"]],
    [{ type: "setPriority", id: 4, value: null }, ["todocli", "--source", "omarchy", "--json", "priority", "4", "none"]],
    [{ type: "setSize", id: 3, value: "S" }, ["todocli", "--source", "omarchy", "--json", "size", "3", "S"]],
    [{ type: "setSize", id: 3, value: null }, ["todocli", "--source", "omarchy", "--json", "size", "3", "none"]],
  ];
  for (const [action, expected] of cases) assert.deepEqual(Argv.forAction("todocli", action), expected);
});

test("todocli: cliPath first, global flags, then the command, then -- and the free text", () => {
  assert.deepEqual(Argv.todocli("todocli", ["add", "--description=Semi-skimmed"], ["--help"]), ["todocli", "--source", "omarchy", "--json", "add", "--description=Semi-skimmed", "--", "--help"]);
  assert.deepEqual(Argv.todocli("/home/abobreshov/.cargo/bin/todocli", ["add", "--description=Semi-skimmed"], ["--help"]), ["/home/abobreshov/.cargo/bin/todocli", "--source", "omarchy", "--json", "add", "--description=Semi-skimmed", "--", "--help"]);
  assert.deepEqual(Argv.todocli("todocli", ["board"], []), ["todocli", "--source", "omarchy", "--json", "board"], "no -- without free text");
  assert.deepEqual(Argv.todocli("todocli", ["done", "3"], null), ["todocli", "--source", "omarchy", "--json", "done", "3"]);
  assert.deepEqual(Argv.todocli("todocli", ["add"], ["Buy milk --json"]), ["todocli", "--source", "omarchy", "--json", "add", "--", "Buy milk --json"], "the fixture name stays one positional after --");
  assert.deepEqual(Argv.todocli("todocli", ["add"], "as a string"), ["todocli", "--source", "omarchy", "--json", "add", "--", "as a string"]);
  assert.deepEqual(Argv.todocli("", ["board"], [])[0], "todocli", "an empty cliPath falls back to the default");
});

test("every argv element is one argument: user text is never concatenated", () => {
  const hostile = ["-x marks the spot", "--json", "a b\tc", "; rm -rf ~", "$(id)", "`id`"];
  for (const t of hostile) {
    const argv = Argv.todocli("todocli", ["add", "--description=" + t], [t]);
    assert.equal(argv[argv.length - 1], t, t);
    assert.equal(argv[argv.length - 2], "--");
    assert.equal(argv.indexOf("--json"), 3, "--json is a global flag before the command, never after --");
    assert.ok(argv.every((a) => typeof a === "string"));
  }
});

test("forAction maps the A34 command table", () => {
  const p = "todocli";
  assert.deepEqual(Argv.forAction(p, { type: "read" }), ["todocli", "--source", "omarchy", "--json", "board"]);
  assert.deepEqual(Argv.forAction(p, { type: "add", name: "Buy milk", description: "Semi-skimmed" }), ["todocli", "--source", "omarchy", "--json", "add", "--description=Semi-skimmed", "--", "Buy milk"]);
  assert.deepEqual(Argv.forAction(p, { type: "add", name: "Buy milk", description: "" }), ["todocli", "--source", "omarchy", "--json", "add", "--", "Buy milk"], "the flag is omitted when empty");
  assert.deepEqual(Argv.forAction(p, { type: "add", name: "Buy milk", description: "-x" }), ["todocli", "--source", "omarchy", "--json", "add", "--description=-x", "--", "Buy milk"], "hyphen values travel attached (A43)");
  assert.deepEqual(Argv.forAction(p, { type: "add", name: "Buy milk", description: "--json" }), ["todocli", "--source", "omarchy", "--json", "add", "--description=--json", "--", "Buy milk"]);
  assert.deepEqual(Argv.forAction(p, { type: "setStatus", id: "3", status: "done" }), ["todocli", "--source", "omarchy", "--json", "done", "3"]);
  assert.deepEqual(Argv.forAction(p, { type: "setStatus", id: "3", status: "doing" }), ["todocli", "--source", "omarchy", "--json", "start", "3"]);
  assert.deepEqual(Argv.forAction(p, { type: "setStatus", id: "3", status: "todo" }), ["todocli", "--source", "omarchy", "--json", "reopen", "3"]);
  assert.deepEqual(Argv.forAction(p, { type: "focus", id: "3" }), ["todocli", "--source", "omarchy", "--json", "focus", "--task", "3"]);
  assert.deepEqual(Argv.forAction(p, { type: "focus", id: "clear" }), ["todocli", "--source", "omarchy", "--json", "focus", "--clear"]);
  assert.deepEqual(Argv.forAction(p, { type: "toggleStep", id: "3", n: 2 }), ["todocli", "--source", "omarchy", "--json", "step", "3", "2"]);
  assert.deepEqual(Argv.forAction(p, { type: "remove", id: "3" }), ["todocli", "--source", "omarchy", "--json", "rm", "3"]);
  assert.deepEqual(Argv.forAction(p, { type: "syncNow" }), ["todocli", "--source", "omarchy", "--json", "sync", "all"]);
  assert.deepEqual(Argv.forAction(p, { type: "setStatus", id: "3", status: "weird" }), null);
  assert.deepEqual(Argv.forAction(p, { type: "nonsense" }), null);
  assert.deepEqual(Argv.forAction(p, null), null);
  assert.equal(Argv.forAction(p, { type: "remove", id: 7 })[5], "7", "ids are stringified");
});

test("pomodoro: omarchy-shell argv for startFor and pause", () => {
  assert.deepEqual(Argv.pomodoro("abobreshov.pomodoro", "startFor", ["12", "Write UX spec"]), ["omarchy-shell", "abobreshov.pomodoro", "startFor", "12", "Write UX spec"]);
  assert.deepEqual(Argv.pomodoro("abobreshov.pomodoro", "startFor", ["", "-u critical; rm -rf ~"]), ["omarchy-shell", "abobreshov.pomodoro", "startFor", "", "-u critical; rm -rf ~"]);
  assert.deepEqual(Argv.pomodoro("abobreshov.pomodoro", "pause", []), ["omarchy-shell", "abobreshov.pomodoro", "pause"]);
  assert.deepEqual(Argv.pomodoro("", "pause", null), ["omarchy-shell", "abobreshov.pomodoro", "pause"]);
});

test("stateDir: install -d -m 0700, never mkdir -p (A34, AC-2.10)", () => {
  assert.deepEqual(Argv.stateDir("/home/x/.local/state/abobreshov.todo/"), ["install", "-d", "-m", "0700", "/home/x/.local/state/abobreshov.todo/"]);
});

test("sanitizeLabel maps controls (C0, DEL, C1) to a space, trims and caps at 120 (A53; the pomodoro's rule)", () => {
  assert.equal(Argv.sanitizeLabel("a\tb\nc\x00d"), "a b c d");
  assert.equal(Argv.sanitizeLabel("  a\tb\nc\x00d\x7fe\x85f  "), "a b c d e f", "the same input as Phase.sanitizeLabel's test");
  assert.equal(Argv.sanitizeLabel("  x  "), "x");
  assert.equal(Argv.sanitizeLabel("y".repeat(200)).length, 120);
  assert.equal(Argv.sanitizeLabel(null), "");
});
