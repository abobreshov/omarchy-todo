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
  const failing = [{ name: "obsidian", enabled: true, lastOkAt: null, lastAttemptAt: new Date(NOW - 12 * 60000).toISOString(), intervalSec: null, error: { kind: "offline", message: "m" } }];
  const one = Chrome.pillState(pillInput({ backend: "cli", items, sync: failing }));
  assert.equal(one.glyph, G.syncAlert);
  assert.equal(one.label, "Review PR");
  assert.equal(one.urgent, false);
  assert.ok(one.tooltip.endsWith("\nObsidian sync failed 12m ago"));
  const two = Chrome.pillState(pillInput({ backend: "cli", items, sync: failing.concat([{ name: "other", enabled: true, lastOkAt: null, lastAttemptAt: null, intervalSec: null, error: { kind: "error", message: "m" } }]) }));
  assert.ok(two.tooltip.endsWith("\n2 syncs failed"));
  assert.equal(Chrome.pillState(pillInput({ backend: "json", items, sync: failing })).glyph, G.doing, "json mode has no overlay");
  const disabled = [{ name: "obsidian", enabled: false, lastOkAt: null, lastAttemptAt: null, intervalSec: null, error: { kind: "auth", message: "m" } }];
  assert.equal(Chrome.pillState(pillInput({ backend: "cli", items, sync: disabled })).glyph, G.doing, "a disabled target does not fail");
  assert.equal(Chrome.pillState(pillInput({ backend: "cli", loaded: false, sync: failing })).glyph, G.icon, "no overlay on the loading state");
});

// ------------------------------------------------------------- footer
test("UI-12 footer: the UX §4.7 table", () => {
  assert.deepEqual(Chrome.footer([], NOW, {}), { glyph: G.sync, text: "todocli · local only", urgent: false, tooltip: "", action: null });
  assert.deepEqual(Chrome.footer([target("obsidian", { enabled: false })], NOW, {}).text, "todocli · local only");
  const ok = Chrome.footer([target("other"), target("obsidian", { lastOkAt: new Date(NOW - 5 * 60000).toISOString(), intervalSec: null, lastAttemptAt: new Date(NOW - 5000).toISOString() })], NOW, {});
  assert.deepEqual(ok, { glyph: G.sync, text: "todocli · synced 5m ago", urgent: false, tooltip: "Other: ok 2m ago\nObsidian: ok 5m ago", action: null });
  const never = Chrome.footer([target("obsidian", { lastOkAt: null, lastAttemptAt: null })], NOW, {});
  assert.equal(never.text, "todocli · not synced yet · R sync now");
  assert.equal(never.action, "syncNow");
  assert.equal(never.urgent, false);
  assert.deepEqual(Chrome.footer([target("obsidian")], NOW, { syncing: true }), { glyph: G.sync, text: "Syncing…", urgent: false, tooltip: "Obsidian: ok 2m ago", action: null });
  const one = Chrome.footer([target("obsidian", { lastAttemptAt: new Date(NOW - 12 * 60000).toISOString(), error: { kind: "error", message: "could not write the note" } })], NOW, {});
  assert.deepEqual(one, { glyph: G.syncAlert, text: "Obsidian sync failed 12m ago · R retry", urgent: true, tooltip: "Obsidian: failed 12m ago — could not write the note", action: "syncNow" });
  const two = Chrome.footer([target("other", { error: { kind: "offline", message: "x" } }), target("obsidian", { error: { kind: "vault_missing", message: "x" } })], NOW, {});
  assert.equal(two.text, "2 syncs failed · R retry");
  assert.equal(two.urgent, true);
  assert.equal(two.glyph, G.syncAlert);
  const off = Chrome.footer([target("other"), target("obsidian", { enabled: false })], NOW, {});
  assert.equal(off.tooltip, "Other: ok 2m ago\nObsidian: off");
  assert.equal(Chrome.footer(null, NOW, {}).text, "todocli · local only");
  assert.equal(Chrome.footer([null, target("obsidian")], NOW, {}).tooltip, "Obsidian: ok 2m ago", "holes are skipped");
});

test("footer reasons use the first message line, cut at 60 characters", () => {
  for (const message of ["vault folder not found", "could not write the note"])
    assert.equal(Chrome.reason({ kind: "error", message }), message);
  assert.equal(Chrome.reason({ kind: "removals_held", message: "3 removals held" }), "3 removals held");
  assert.equal(Chrome.reason({ kind: "removals_held", message: "" }), "removals_held");
  assert.equal(Chrome.reason({ kind: "error", message: "first line of it\nsecond" }), "first line of it");
  assert.equal(Chrome.reason({ kind: "error", message: "x".repeat(80) }).length, 60);
  assert.equal(Chrome.reason({ kind: "error" }), "error");
  assert.equal(Chrome.reason(null), "");
});

// ------------------------------------------------------------- copy


test("pill tooltip's second line names a user stream, Inbox has none (AC-28.5)", () => {
  const input = { backend: "cli", hasStreams: true, loaded: true, items: [item("3", "Task", "doing", { stream: "work: tellkin" })], focus: { text: "", taskId: null }, maxChars: 20, now: NOW };
  assert.equal(Chrome.pillState(input).tooltip.split("\n")[1], "Stream: work: tellkin");
  input.items[0].stream = "inbox";
  assert.equal(Chrome.pillState(input).tooltip.includes("Stream:"), false);
});
