// The cli store's logic (Argv.js builds the argv, Model.js maps the reply)
// exercised against the fake `todocli` of PLAN A5 through real child
// processes, so the exit-code and stdout contract is tested end to end
// without the shell: AC-2.1b, AC-17.1, AC-17.2 (node halves), PLAN A34.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadQmlJs } from "./qml-js-loader.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const Model = loadQmlJs(path.join(here, "..", "Model.js"));
const Argv = loadQmlJs(path.join(here, "..", "Argv.js"), { Model });
const fake = path.join(here, "fakebin", "todocli");

function runArgv(argv, env) {
  const r = spawnSync(argv[0], argv.slice(1), { env: Object.assign({}, process.env, env || {}), encoding: "utf8" });
  return { code: r.status === null ? -1 : r.status, stdout: r.stdout || "", stderr: r.stderr || "", spawnFailed: !!r.error };
}

test("board through the fake replays the §3.7 fixture and maps to items", () => {
  const argv = Argv.forAction(fake, { type: "read" });
  const r = runArgv(argv);
  assert.equal(r.code, 0);
  assert.equal(Model.classifyExit(r.code, r.stderr, r.spawnFailed), null);
  const doc = Model.fromCli(r.stdout);
  assert.equal(doc.ok, true);
  assert.equal(doc.items[0].name, "Wire the webhook");
  assert.equal(doc.focus.taskId, "3");
});

test("the fake logs the exact argv: --json before the command, the name after --", () => {
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "todo-argv-")), "argv.log");
  const argv = Argv.forAction(fake, { type: "add", name: "Buy milk --json", description: "" });
  const r = runArgv(argv, { FAKE_LOG: log });
  assert.equal(r.code, 0);
  const logged = JSON.parse(fs.readFileSync(log, "utf8").trim());
  assert.deepEqual(logged.argv, ["--source", "omarchy", "--json", "add", "--", "Buy milk --json"]);
  assert.deepEqual(logged.env, {}, "no TODOCLI_* environment is set by the plugin; --source carries the attribution");
});

test("exit 75 is busy (E5), exit 1 with stderr is failed with the first lines (E7, AC-17.2)", () => {
  const argv = Argv.forAction(fake, { type: "read" });
  const busy = runArgv(argv, { FAKE_EXIT: "75", FAKE_STDERR: "database is busy\n" });
  assert.deepEqual(Model.classifyExit(busy.code, busy.stderr, busy.spawnFailed), { kind: "busy", message: "database busy" });
  const failed = runArgv(argv, { FAKE_EXIT: "1", FAKE_STDERR: "database is locked\n" });
  const err = Model.classifyExit(failed.code, failed.stderr, failed.spawnFailed);
  assert.equal(err.kind, "failed");
  assert.ok(err.message.includes("database is locked"));
  assert.equal(Model.msgNotSaved(err), "Not saved — database is locked.");
});

test("a nonexistent cliPath fails to spawn, which reads as missing; so does a wrapper's exit 127 (E4, AC-17.1)", () => {
  const argv = Argv.forAction("/nonexistent/dir/todocli", { type: "read" });
  assert.equal(argv[0], "/nonexistent/dir/todocli", "no wrapper and no shell: the binary is argv[0]");
  const r = runArgv(argv);
  assert.equal(r.spawnFailed, true);
  assert.deepEqual(Model.classifyExit(r.code, r.stderr, r.spawnFailed), { kind: "missing", message: "todocli not found" });
  assert.equal(Model.unavailable(Model.classifyExit(r.code, r.stderr, r.spawnFailed)), "unavailable: todocli not found");
  const withEquals = Argv.forAction("/tmp/a=b/todocli", { type: "read" });
  assert.equal(withEquals[0], "/tmp/a=b/todocli", "a path with = is a path, not an env assignment");
  assert.equal(Model.classifyExit(127, "wrapper: todocli: not found\n", false).kind, "missing");
});

test("a fake that answers with a version 2 document or non-JSON is the protocol error (E8)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "todo-proto-"));
  const v2 = path.join(dir, "v2.json");
  fs.writeFileSync(v2, JSON.stringify({ version: 2, tasks: [] }));
  const argv = Argv.forAction(fake, { type: "read" });
  const r = runArgv(argv, { FAKE_BOARD: v2 });
  assert.equal(r.code, 0);
  assert.equal(Model.fromCli(r.stdout).error.kind, "protocol");
  const text = runArgv(argv, { FAKE_EXIT: "0" });
  assert.equal(Model.fromCli(text.stdout).ok, true);
  const junk = runArgv(argv, { FAKE_EXIT: "0", FAKE_STDOUT: "" });
  assert.equal(junk.code, 0);
  assert.equal(Model.fromCli("plain text").error.kind, "protocol");
});

test("sync all through the fake: exit 0 re-reads, 75 is 'Sync already running.'", () => {
  const argv = Argv.forAction(fake, { type: "syncNow" });
  assert.deepEqual(argv.slice(1), ["--source", "omarchy", "--json", "sync", "all"]);
  assert.equal(runArgv(argv).code, 0);
  const held = runArgv(argv, { FAKE_EXIT: "75" });
  assert.equal(Model.classifyExit(held.code, held.stderr, false).kind, "busy");
  assert.equal(Model.MSG_SYNC_RUNNING, "Sync already running.");
});
