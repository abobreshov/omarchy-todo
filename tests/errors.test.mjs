// Errors.js under node --test (PLAN §9.4, A34): the exit mapping and the
// UX §7 copy per error kind (E4, E5, E7, E8), the `unavailable: <reason>`
// reply (AC-17.4) and the reverted-write transient.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lib, G } from "./helpers.mjs";

const Errors = lib("Errors.js");

test("classifyExit maps exit codes to the UX §7 error kinds (A34)", () => {
  assert.equal(Errors.classifyExit(0, "", false), null);
  assert.deepEqual(Errors.classifyExit(0, "", true), { kind: "missing", message: "todocli not found" });
  assert.deepEqual(Errors.classifyExit(127, "env: ‘todocli’: No such file or directory\n", false), { kind: "missing", message: "todocli not found" });
  assert.deepEqual(Errors.classifyExit(75, "database is busy\n", false), { kind: "busy", message: "database busy" });
  assert.deepEqual(Errors.classifyExit(1, "database is locked\nline2\nline3\nline4\n", false), { kind: "failed", message: "database is locked\nline2\nline3" });
  assert.deepEqual(Errors.classifyExit(74, "", false), { kind: "failed", message: "todocli exited 74" });
  assert.equal(Errors.classifyExit(-1, "", false).kind, "failed");
});

test("errorShort and unavailable replies", () => {
  assert.equal(Errors.errorShort({ kind: "missing" }), "todocli not found");
  assert.equal(Errors.errorShort({ kind: "busy" }), "Database busy or locked");
  assert.equal(Errors.errorShort({ kind: "failed" }), "todocli error");
  assert.equal(Errors.errorShort({ kind: "protocol" }), "Can't read todocli output");
  assert.equal(Errors.errorShort({ kind: "weird" }), "todocli error", "an unknown kind reads as E7");
  assert.equal(Errors.errorShort(null), "");
  assert.equal(Errors.unavailable({ kind: "missing" }), "unavailable: todocli not found");
  assert.equal(Errors.unavailable({ kind: "busy" }), "unavailable: database busy");
  assert.equal(Errors.unavailable({ kind: "failed" }), "unavailable: todocli error");
  assert.equal(Errors.unavailable({ kind: "protocol" }), "unavailable: can't read todocli output");
  assert.equal(Errors.unavailable(null), "unavailable");
  assert.deepEqual(Object.keys(Errors.ERRORS), ["missing", "busy", "protocol", "failed"], "one table, four kinds");
});

test("errorView carries the UX §7 copy for E4, E5, E7, E8", () => {
  const e4 = Errors.errorView({ kind: "missing", message: "todocli not found" }, { cliPath: "todocli", moduleName: "abobreshov.todo" });
  assert.equal(e4.title, "todocli not found");
  assert.equal(e4.glyph, G.alert);
  assert.equal(e4.body, 'This panel is set to backend = cli, but it can\'t run "todocli". Nothing was changed.');
  assert.equal(e4.hint, "Point the panel at todocli:\n  omarchy bar set abobreshov.todo cliPath /path/to/todocli\nor go back to the panel's own list:\n  omarchy bar set abobreshov.todo backend json");
  assert.equal(e4.banner, null);
  assert.equal(Errors.errorView({ kind: "missing" }, {}).hint, e4.hint, "the defaults name the module and the command");
  const e5 = Errors.errorView({ kind: "busy", message: "database busy" }, { lastGoodAt: Date.UTC(2026, 8, 29, 14, 2, 0), utc: true });
  assert.equal(e5.banner, "Database busy or locked. Showing the list from 14:02. r retry");
  assert.equal(e5.glyph, G.lock);
  assert.equal(e5.title, null);
  assert.equal(Errors.errorView({ kind: "busy" }, {}).banner, "Database busy or locked. r retry");
  const e7 = Errors.errorView({ kind: "failed", message: "line1\nline2\nline3" }, {});
  assert.equal(e7.title, "todocli error");
  assert.equal(e7.body, "line1\nline2\nline3\nRun todocli board in a terminal to see the full error.");
  const e8 = Errors.errorView({ kind: "protocol", message: "x" }, {});
  assert.equal(e8.title, "Can't read todocli output");
  assert.equal(e8.body, "todocli answered, but not in the format this panel expects (JSON schema v1). Update the plugin or todocli so their versions match.");
  assert.equal(Errors.errorView(null, {}), null);
  assert.equal(Errors.errorView({ kind: "weird" }, {}).title, "todocli error");
  assert.equal(Errors.errorView({ kind: "failed", message: "" }, {}).body, "Run todocli board in a terminal to see the full error.");
});

test("msgNotSaved names the first stderr line or the error kind (UX §7)", () => {
  assert.equal(Errors.msgNotSaved("database is locked\nmore"), "Not saved — database is locked.");
  assert.equal(Errors.msgNotSaved(""), "Not saved — todocli error.");
  assert.equal(Errors.msgNotSaved({ kind: "busy" }), "Not saved — database busy. Press r to retry.");
  assert.equal(Errors.msgNotSaved({ kind: "failed", message: "boom\nx" }), "Not saved — boom.");
  assert.equal(Errors.msgNotSaved({ kind: "missing", message: "todocli not found" }), "Not saved — todocli not found.");
  assert.equal(Errors.msgNotSaved({ kind: "failed", message: "" }), "Not saved — todocli error.");
});

test("classifySync answers the footer transient from the envelope's kind; only an unrunnable binary is a store error", () => {
  const env = (kind, error, code) => JSON.stringify({ ok: false, kind, error, code }) + "\n";
  assert.equal(Errors.classifySync(0, "", "", false), null);
  assert.deepEqual(Errors.classifySync(75, env("sync_held", "basecamp: already running (daemon pid 4242)", 75), "", false), { kind: "sync_held", message: "Sync already running." });
  assert.deepEqual(Errors.classifySync(75, "", "basecamp: already running\n", false), { kind: "sync_held", message: "Sync already running." }, "an older binary without an envelope: 75 reads as held");
  assert.deepEqual(Errors.classifySync(75, env("removals_held", "basecamp removals_held: 2 of 2 removals held; review, then todocli sync basecamp --accept-remote-removals", 75), "", false), { kind: "removals_held", message: "Sync failed — basecamp removals_held: 2 of 2 removals held; review, then t." });
  assert.deepEqual(Errors.classifySync(75, env("busy", "database is busy", 75), "", false), { kind: "busy", message: "Sync not started — database busy. Press R to retry." });
  assert.deepEqual(Errors.classifySync(6, env("offline", "basecamp offline: offline or Basecamp unreachable; retrying", 6), "", false), { kind: "offline", message: "Sync failed — basecamp offline: offline or Basecamp unreachable; retrying." });
  assert.deepEqual(Errors.classifySync(3, env("auth", "basecamp auth: signed out. Run: basecamp auth login", 3), "", false), { kind: "auth", message: "Sync failed — basecamp auth: signed out. Run: basecamp auth login." });
  assert.deepEqual(Errors.classifySync(69, env("list_gone", "x", 69), "", false), { kind: "list_gone", message: "Sync failed — x." });
  assert.deepEqual(Errors.classifySync(7, env("error", "basecamp error: basecamp CLI not found", 7), "", false), { kind: "error", message: "Sync failed — basecamp error: basecamp CLI not found." });
  assert.deepEqual(Errors.classifySync(2, env("config", "config.toml:2: unknown field `typo`", 2), "", false), { kind: "config", message: "Sync failed — config.toml:2: unknown field `typo`." });
  assert.deepEqual(Errors.classifySync(7, "not json", "basecamp error: boom\nmore", false), { kind: "error", message: "Sync failed — basecamp error: boom." }, "no envelope: the first stderr line");
  assert.deepEqual(Errors.classifySync(7, "", "", false), { kind: "error", message: "Sync failed — todocli exited 7." });
  assert.deepEqual(Errors.classifySync(0, "", "", true), { kind: "missing", message: "todocli not found", store: true });
  assert.deepEqual(Errors.classifySync(127, "", "", false), { kind: "missing", message: "todocli not found", store: true });
  assert.equal(Errors.MSG_SYNC_RUNNING, "Sync already running.");
});

test("parseEnvelope reads the §3.5 envelope and nothing else", () => {
  assert.deepEqual(Errors.parseEnvelope('{"ok":false,"kind":"not_found","error":"No task #9.","code":1}'), { kind: "not_found", message: "No task #9." });
  assert.deepEqual(Errors.parseEnvelope('{"ok":false,"error":"old binary","code":1}'), { kind: "error", message: "old binary" }, "a kind-less envelope reads as error");
  assert.equal(Errors.parseEnvelope('{"ok":true}'), null);
  assert.equal(Errors.parseEnvelope('{"id":1}'), null);
  assert.equal(Errors.parseEnvelope("[]"), null);
  assert.equal(Errors.parseEnvelope("{"), null);
  assert.equal(Errors.parseEnvelope(null), null);
});

test("syncReason uses the first message line, then the kind (Chrome.reason delegates)", () => {
  assert.equal(Errors.syncReason({ kind: "auth" }), "auth");
  assert.equal(Errors.syncReason({ kind: "removals_held", message: "3 removals held" }), "3 removals held");
  assert.equal(Errors.syncReason({ kind: "weird", message: "line\nmore" }), "line");
  assert.equal(Errors.syncReason({ kind: "weird" }), "weird");
  assert.equal(Errors.syncReason(null), "");
});
