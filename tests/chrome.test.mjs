// Chrome.js: the pill (UI-11) and sync footer (UI-12), UX §3.1 and §4.7.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lib, G, NOW, item, target } from "./helpers.mjs";

const Chrome = lib("Chrome.js");

// ------------------------------------------------------------- pill
function pillInput(over) {
  return Object.assign({ backend: "json", loaded: true, error: null, items: [], focus: { text: "", taskId: null }, sync: [], vertical: false, maxChars: 24, now: NOW }, over);
}

test("UI-11 pillState: the UX §3.1 table, rows 1–6", () => {
  // 1 loading
  assert.deepEqual(Chrome.pillState(pillInput({ backend: "cli", loaded: false })), { glyph: G.icon, label: "", tooltip: "Checklist Todo\nLoading…", urgent: false, dimmed: true });
  // 2 backend error, every kind
  for (const [kind, short] of [["missing", "todocli not found"], ["busy", "Database busy or locked"], ["failed", "todocli error"], ["protocol", "Can't read todocli output"]]) {
    assert.deepEqual(Chrome.pillState(pillInput({ backend: "cli", error: { kind, message: "m" }, items: [item("1", "x", "doing")] })), { glyph: G.icon, label: "", tooltip: "Checklist Todo\n" + short + ". Click for details.", urgent: true, dimmed: false });
  }
  // 3 doing: focused doing task wins; +N more; focus text differs; count
  const items = [item("5", "Review PR", "doing"), item("8", "Write UX spec for the panels", "doing"), item("1", "Book dentist", "todo")];
  assert.deepEqual(Chrome.pillState(pillInput({ items, focus: { text: "Ship the invoice-export slice", taskId: "8" } })), { glyph: G.doing, label: "Write UX spec for the…", tooltip: "Doing: Write UX spec for the panels (+1 more)\nFocus: Ship the invoice-export slice\n3 todos", urgent: false, dimmed: false });
  // AC-5.9: lowest doing id when none is focused
  const s9 = Chrome.pillState(pillInput({ items, focus: { text: "Invoice slice", taskId: null } }));
  assert.equal(s9.label, "Review PR");
  assert.ok(s9.tooltip.includes("Focus: Invoice slice"));
  // focus text equal to the title is not repeated
  assert.equal(Chrome.pillState(pillInput({ items: [item("5", "Review PR", "doing")], focus: { text: "Review PR", taskId: "5" } })).tooltip, "Doing: Review PR\n1 todo");
  // 4 focus text, no doing
  assert.deepEqual(Chrome.pillState(pillInput({ items: [item("1", "Book dentist", "todo"), item("2", "Old", "done")], focus: { text: "Ship the invoice-export slice", taskId: null } })), { glyph: G.focus, label: "Ship the invoice-export…", tooltip: "Focus: Ship the invoice-export slice\n1 todo", urgent: false, dimmed: false });
  // AC-5.5: focused task done -> focus text shows
  assert.equal(Chrome.pillState(pillInput({ items: [item("3", "Wire", "done")], focus: { text: "Invoice slice", taskId: "3" } })).label, "Invoice slice");
  // 5 open count
  assert.deepEqual(Chrome.pillState(pillInput({ items: [item("1", "a", "todo"), item("2", "b", "todo"), item("3", "c", "todo")] })), { glyph: G.icon, label: "3", tooltip: "3 todos\nNo focus set", urgent: false, dimmed: false });
  assert.equal(Chrome.pillState(pillInput({ items: [item("1", "a", "todo")] })).tooltip, "1 todo\nNo focus set");
  // 6 empty
  assert.deepEqual(Chrome.pillState(pillInput({ items: [item("2", "b", "done")] })), { glyph: G.icon, label: "", tooltip: "Checklist Todo\nNothing open. Click to add one.", urgent: false, dimmed: true });
  // json mode never shows loading or a backend error
  assert.equal(Chrome.pillState(pillInput({ backend: "json", loaded: false })).dimmed, true);
  assert.equal(Chrome.pillState(pillInput({ backend: "json", error: { kind: "missing" } })).urgent, false);
  // BarWidget's fallback before the panel loads: no items, no focus
  assert.equal(Chrome.pillState({ vertical: false, maxChars: 24 }).glyph, G.icon);
});

test("pillState: vertical bars show the icon only; the sync overlay replaces the glyph", () => {
  const items = [item("5", "Review PR", "doing")];
  const v = Chrome.pillState(pillInput({ items, vertical: true }));
  assert.equal(v.glyph, G.doing);
  assert.equal(v.label, "");
  assert.equal(Chrome.pillState(pillInput({ items, maxChars: 0 })).label, "");
  const failing = [{ name: "basecamp", enabled: true, lastOkAt: null, lastAttemptAt: new Date(NOW - 12 * 60000).toISOString(), intervalSec: 60, error: { kind: "offline", message: "m" } }];
  const one = Chrome.pillState(pillInput({ backend: "cli", items, sync: failing }));
  assert.equal(one.glyph, G.syncAlert);
  assert.equal(one.label, "Review PR");
  assert.equal(one.urgent, false);
  assert.ok(one.tooltip.endsWith("\nBasecamp sync failed 12m ago"));
  const two = Chrome.pillState(pillInput({ backend: "cli", items, sync: failing.concat([{ name: "obsidian", enabled: true, lastOkAt: null, lastAttemptAt: null, intervalSec: 5, error: { kind: "error", message: "m" } }]) }));
  assert.ok(two.tooltip.endsWith("\n2 syncs failed"));
  assert.equal(Chrome.pillState(pillInput({ backend: "json", items, sync: failing })).glyph, G.doing, "json mode has no overlay");
  const disabled = [{ name: "basecamp", enabled: false, lastOkAt: null, lastAttemptAt: null, intervalSec: 60, error: { kind: "auth", message: "m" } }];
  assert.equal(Chrome.pillState(pillInput({ backend: "cli", items, sync: disabled })).glyph, G.doing, "a disabled target does not fail");
  assert.equal(Chrome.pillState(pillInput({ backend: "cli", loaded: false, sync: failing })).glyph, G.icon, "no overlay on the loading state");
});

// ------------------------------------------------------------- footer
test("UI-12 footer: the UX §4.7 table", () => {
  assert.deepEqual(Chrome.footer([], NOW, {}), { glyph: G.sync, text: "todocli · local only", urgent: false, tooltip: "", action: null });
  assert.deepEqual(Chrome.footer([target("basecamp", { enabled: false })], NOW, {}).text, "todocli · local only");
  const ok = Chrome.footer([target("basecamp"), target("obsidian", { lastOkAt: new Date(NOW - 5 * 60000).toISOString(), intervalSec: 5, lastAttemptAt: new Date(NOW - 5000).toISOString() })], NOW, {});
  assert.deepEqual(ok, { glyph: G.sync, text: "todocli · synced 5m ago", urgent: false, tooltip: "Basecamp: ok 2m ago\nObsidian: ok 5m ago", action: null });
  const never = Chrome.footer([target("basecamp", { lastOkAt: null, lastAttemptAt: null })], NOW, {});
  assert.equal(never.text, "todocli · not synced yet · R sync now");
  assert.equal(never.action, "syncNow");
  assert.equal(never.urgent, false);
  assert.deepEqual(Chrome.footer([target("basecamp")], NOW, { syncing: true }), { glyph: G.sync, text: "Syncing…", urgent: false, tooltip: "Basecamp: ok 2m ago", action: null });
  const one = Chrome.footer([target("basecamp", { lastAttemptAt: new Date(NOW - 12 * 60000).toISOString(), error: { kind: "auth", message: "x" } })], NOW, {});
  assert.deepEqual(one, { glyph: G.syncAlert, text: "Basecamp sync failed 12m ago · R retry", urgent: true, tooltip: "Basecamp: failed 12m ago — signed out. Run: basecamp auth login", action: "syncNow" });
  const two = Chrome.footer([target("basecamp", { error: { kind: "offline", message: "x" } }), target("obsidian", { error: { kind: "vault_missing", message: "x" } })], NOW, {});
  assert.equal(two.text, "2 syncs failed · R retry");
  assert.equal(two.urgent, true);
  assert.equal(two.glyph, G.syncAlert);
  const stale = Chrome.footer([target("basecamp", { lastAttemptAt: new Date(NOW - 2 * 3600000).toISOString() })], NOW, {});
  assert.deepEqual(stale, { glyph: G.syncOff, text: "Sync daemon idle since 2h ago · R sync now", urgent: false, tooltip: "Basecamp: ok 2m ago", action: "syncNow" });
  const off = Chrome.footer([target("basecamp"), target("obsidian", { enabled: false })], NOW, {});
  assert.equal(off.tooltip, "Basecamp: ok 2m ago\nObsidian: off");
  assert.equal(Chrome.footer(null, NOW, {}).text, "todocli · local only");
  assert.equal(Chrome.footer([null, target("basecamp")], NOW, {}).tooltip, "Basecamp: ok 2m ago", "holes are skipped");
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
  for (const [kind, copy] of Object.entries(cases)) assert.equal(Chrome.reason({ kind, message: "ignored" }), copy, kind);
  assert.equal(Chrome.reason({ kind: "removals_held", message: "3 removals held" }), "3 removals held; review, then todocli sync basecamp --accept-remote-removals");
  assert.equal(Chrome.reason({ kind: "removals_held", message: "" }), "removals held; review, then todocli sync basecamp --accept-remote-removals");
  assert.equal(Chrome.reason({ kind: "error", message: "first line of it\nsecond" }), "first line of it");
  assert.equal(Chrome.reason({ kind: "error", message: "x".repeat(80) }).length, 60);
  assert.equal(Chrome.reason({ kind: "error" }), "error");
  assert.equal(Chrome.reason(null), "");
});

// ------------------------------------------------------------- copy
