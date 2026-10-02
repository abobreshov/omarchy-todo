// NorthStar.js under node --test (ADDENDUM-S11 §4.7, §5; CONTRACT-S9 r10
// §10.1): the strings, normalize as the identity on what the crate wrote,
// the tooltip's wrapping, the star's and the popup's states, the caption
// and the four dump keys. AC-ST.70, 72, 74, 75, 81, 82, 85, 86 and 88 (node).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { lib, here } from "./helpers.mjs";

// The captions' HH:MM are London's; the pin lives here, not in how the
// suite is run.
process.env.TZ = "Europe/London";
const NorthStar = lib("NorthStar.js");
const Store = lib("Store.js");
const fixture = (name) => fs.readFileSync(path.join(here, "fixtures", name), "utf8");
const NS_T = "Почему вы здесь?";
const NS_D = "Строить то, что важно.\n\nКаждый день — шаг.";
const NS1 = { title: NS_T, description: NS_D, updatedAt: "2026-10-01T19:40:00.000Z", via: "cli" };
const CLOCK = Date.parse("2026-10-01T21:00:00.000Z");
const E7 = { kind: "failed", message: "database error: the North Star row is not a North Star (the title is not UTF-8); todocli northstar clear removes it" };
const E4 = { kind: "missing", message: "todocli not found" };
// The store as a read leaves it (CliStore.finishRead), from a board document.
const read = (doc) => { const d = Store.fromCli(doc); return { backend: "cli", loaded: true, hasNorthStar: d.hasNorthStar, northStar: d.northStar, error: null }; };
const withKey = (value) => read({ version: 1, tasks: [], northStar: value });
const s = (over) => Object.assign({ backend: "cli", loaded: true, hasNorthStar: true, northStar: NorthStar.normalize(NS1), error: null }, over || {});

test("the glyph, the key and every string of §4.7.3, byte for byte", () => {
  assert.equal(NorthStar.BOARD_KEY, "northStar");
  assert.equal(NorthStar.GLYPH, "\u{F0AE2}");
  assert.equal([...NorthStar.GLYPH].length, 1);
  assert.deepEqual([NorthStar.NAME, NorthStar.TIP_OPEN, NorthStar.TIP_UNSET], ["North Star", "North Star · click to open", "North Star · not set\nSet it with todocli northstar set, or ask Claude."]);
  assert.equal(NorthStar.NO_DESCRIPTION, "No description yet.");
  assert.equal(NorthStar.EDIT_HINT, "Edit with todocli northstar set … or ask Claude.");
  assert.equal(NorthStar.HISTORY_HINT, "Earlier versions: todocli northstar history");
  assert.equal(NorthStar.UNSET_BODY, "No North Star yet.");
  assert.equal(NorthStar.UNSET_CAPTION, "Set it with todocli northstar set --title '…' --description '…', or ask Claude to set it.");
  assert.equal(NorthStar.E40, "North Star needs backend = cli.");
  assert.equal(NorthStar.E41, "North Star needs a newer todocli.");
  assert.equal(NorthStar.LOADING, "Loading…");
  assert.equal(NorthStar.ERROR_CAPTION, "The todo list shows what went wrong.");
  assert.equal(NorthStar.STALE_SUFFIX, " · showing the last good read");
  assert.equal(NorthStar.HELP_ITEM, " · * north star");
  assert.equal(NorthStar.POPUP_HELP, "j k scroll · * todo list · r reload · Esc close · Tab next panel");
});

test("AC-ST.86: normalize is total; anything but an object with text is null", () => {
  for (const raw of [undefined, null, 42, "text", [], true, {}, { title: "", description: "" }, { title: " \t\n", description: "  \r\n " }, { title: 7, description: ["x"] }])
    assert.equal(NorthStar.normalize(raw), null, JSON.stringify(raw));
  assert.deepEqual(NorthStar.normalize({ title: "T" }), { title: "T", description: "", updatedAt: null, via: null });
  assert.deepEqual(NorthStar.normalize({ description: "D", updatedAt: 5, via: "" }), { title: "", description: "D", updatedAt: null, via: null });
  assert.deepEqual(NorthStar.normalize(NS1), NS1);
});

test("AC-ST.82: the title squished by the crate's class, the description's ends and tail; U+FEFF and markup kept", () => {
  const ns = NorthStar.normalize({ title: "  <b>Почему</b>\n вы   здесь? 🌟 ", description: "Первая строка\r\nвторая\r\n\r\n\r\n**третья**  \r\n" });
  assert.equal(ns.title, "<b>Почему</b> вы здесь? 🌟");
  assert.equal(ns.description, "Первая строка\nвторая\n\n\n**третья**");
  assert.equal(NorthStar.normalize({ title: "a﻿b" }).title, "a﻿b", "U+FEFF is not White_Space (C1-L4)");
  assert.equal(NorthStar.normalize({ title: "\u0000a\u0085  b    c  　d\u007f\u009fe\u000b\u000c\r" }).title, "a b c d e");
  assert.equal(NorthStar.normalize({ title: "a᠎b​c" }).title, "a᠎b​c", "U+180E and U+200B are neither White_Space nor Cc");
  assert.equal(NorthStar.normalize({ description: "  lead\r\rtail\t　 \n" }).description, "  lead\n\ntail");
  assert.equal(NorthStar.normalize({ description: "x﻿" }).description, "x﻿");
  const ac44 = "Почему вы здесь? «»—";
  assert.equal(NorthStar.normalize({ title: ac44 }).title, ac44, "AC-40.44's characters byte-exact");
  const golden = JSON.parse(fixture("contract/board-northstar.json")).northStar;
  assert.deepEqual(NorthStar.normalize(golden), golden, "the identity on what the crate wrote");
});

test("AC-ST.72: the tooltip wraps at 60 code points at spaces, never inside a pair or before a mark", () => {
  assert.equal(NorthStar.tooltip(NorthStar.normalize(NS1)), "Почему вы здесь?\nNorth Star · click to open");
  assert.equal(NorthStar.tooltip(NorthStar.normalize({ description: NS_D })), "North Star · click to open");
  const emoji = NorthStar.tooltip({ title: "я".repeat(59) + "\u{1F31F}x", description: "" }).split("\n");
  assert.deepEqual(emoji, ["я".repeat(59) + "\u{1F31F}", "x", NorthStar.TIP_OPEN]);
  assert.equal([...emoji[0]].length, 60);
  for (const line of emoji) assert.ok(line.isWellFormed(), "no lone surrogate");
  const marks = NorthStar.tooltip({ title: "е".repeat(59) + "́ж", description: "" }).split("\n");
  assert.deepEqual(marks, ["е".repeat(59) + "́", "ж", NorthStar.TIP_OPEN]);
  assert.ok(marks.every((line) => !line.startsWith("́")));
  const sixty = NorthStar.tooltip({ title: "е".repeat(60) + "́", description: "" }).split("\n");
  assert.deepEqual(sixty.slice(0, 2), ["е".repeat(59), "е́"], "the mark keeps its letter: the break moves before both");
  const words = NorthStar.wrap(["a".repeat(30), "b".repeat(29), "c".repeat(10), "d".repeat(70)].join(" "), 60);
  assert.deepEqual(words, ["a".repeat(30) + " " + "b".repeat(29), "c".repeat(10), "d".repeat(60), "d".repeat(10)]);
  assert.deepEqual(NorthStar.wrap("x".repeat(59) + " ́y", 60), ["x".repeat(59) + " ́y"], "a word that starts with a mark stays on its line");
  assert.deepEqual(NorthStar.wrap("a" + "́".repeat(61), 60), ["a" + "́".repeat(61)], "one letter and its marks are never split");
  assert.deepEqual(NorthStar.clusters("\uD83C"), [{ text: "\uD83C", size: 1, mark: false }], "a lone high surrogate is its own code unit");
});

test("AC-ST.70: the star's state; a failing read after a good one leaves it", () => {
  assert.equal(NorthStar.barState(s({ backend: "json" })), "hidden");
  assert.equal(NorthStar.barState(s({ loaded: false, hasNorthStar: false, northStar: null })), "hidden");
  assert.equal(NorthStar.barState(s({ loaded: false, hasNorthStar: false, northStar: null, error: E4 })), "hidden");
  assert.equal(NorthStar.barState(read(fixture("consumer/board-empty-stream.json"))), "hidden", "the older-todocli board");
  assert.equal(NorthStar.barState(read(fixture("contract/board.json"))), "unset");
  assert.equal(NorthStar.barState(read(fixture("contract/board-northstar.json"))), "set");
  for (const bad of [42, "text", [], { title: "", description: "" }]) assert.equal(NorthStar.barState(withKey(bad)), "unset", JSON.stringify(bad));
  assert.equal(NorthStar.barState(s({ error: E7 })), "set", "NS1 then E7");
  assert.equal(NorthStar.barState(null), "hidden");
  assert.equal(NorthStar.iconTooltip(s()), "Почему вы здесь?\nNorth Star · click to open");
  assert.equal(NorthStar.iconTooltip(withKey(null)), NorthStar.TIP_UNSET);
  assert.equal(NorthStar.iconTooltip(s({ backend: "json" })), "");
});

test("the popup's body state and staleness", () => {
  assert.equal(NorthStar.bodyState(s({ backend: "json", hasNorthStar: false, northStar: null })), "json");
  assert.equal(NorthStar.bodyState(s({ loaded: false })), "loading");
  assert.equal(NorthStar.bodyState(s({ loaded: false, error: E4 })), "error");
  assert.equal(NorthStar.bodyState(s({ hasNorthStar: false, northStar: null })), "older");
  assert.equal(NorthStar.bodyState(withKey(null)), "unset");
  assert.equal(NorthStar.bodyState(s()), "set");
  assert.deepEqual([s(), s({ error: E7 }), s({ loaded: false, error: E4 }), s({ backend: "json", error: E7 })].map(NorthStar.isStale), [false, true, false, false]);
});

test("AC-ST.81: the caption, local time under TZ=Europe/London", () => {
  assert.equal(NorthStar.caption(NorthStar.normalize(NS1), CLOCK), "North Star · updated 20:40 · via cli");
  assert.equal(NorthStar.caption(NorthStar.normalize({ title: "T", updatedAt: "2026-09-27T08:00:00.000Z", via: "claude" }), CLOCK), "North Star · updated Sep 27 · via claude");
  assert.equal(NorthStar.caption(NorthStar.normalize({ title: "T" }), CLOCK), "North Star");
  assert.equal(NorthStar.caption(NorthStar.normalize({ title: "T", updatedAt: "not a time" }), CLOCK), "North Star");
  assert.equal(NorthStar.caption(null, CLOCK), "North Star");
  assert.equal(NorthStar.heading(NorthStar.normalize(NS1)), NS_T);
  assert.equal(NorthStar.heading(NorthStar.normalize({ description: "only" })), "North Star");
  assert.equal(NorthStar.heading(null), "North Star");
});

test("AC-ST.74, ST.75, ST.85: every popup body with §4.7.3's copy", () => {
  const blank = { caption: "", description: "", noDescription: "", message: "", messageCaption: "", editHint: "", historyHint: "", staleLine: "" };
  const model = (over, now) => NorthStar.popupModel(s(over), now === undefined ? CLOCK : now);
  assert.deepEqual(model(), { ...blank, state: "set", set: true, stale: false, heading: NS_T, caption: "North Star · updated 20:40 · via cli", description: NS_D, editHint: NorthStar.EDIT_HINT, historyHint: NorthStar.HISTORY_HINT });
  assert.equal(model({ northStar: NorthStar.normalize({ title: NS_T }) }).noDescription, "No description yet.");
  assert.deepEqual(NorthStar.popupModel(withKey(null), CLOCK), { ...blank, state: "unset", set: false, stale: false, heading: "North Star", message: "No North Star yet.", messageCaption: NorthStar.UNSET_CAPTION, historyHint: NorthStar.HISTORY_HINT });
  assert.deepEqual(model({ backend: "json" }), { ...blank, state: "json", set: false, stale: false, heading: "North Star", message: "North Star needs backend = cli." });
  assert.deepEqual(model({ hasNorthStar: false, northStar: null }), { ...blank, state: "older", set: false, stale: false, heading: "North Star", message: "North Star needs a newer todocli." });
  assert.deepEqual(model({ loaded: false }), { ...blank, state: "loading", set: false, stale: false, heading: "North Star", message: "Loading…" });
  assert.deepEqual(model({ loaded: false, error: E4 }), { ...blank, state: "error", set: false, stale: false, heading: "North Star", message: "todocli not found.", messageCaption: "The todo list shows what went wrong." });
  const stale = model({ error: E7 });
  assert.equal(stale.staleLine, "todocli error · showing the last good read", "a corrupt row's 74 included");
  assert.equal(stale.description, NS_D, "the last good text stays");
  assert.equal(model({ error: { kind: "busy", message: "database busy" } }).staleLine, "Database busy or locked · showing the last good read");
});

test("sameText: a read keeps the scroll unless the title or the description changed", () => {
  const a = NorthStar.normalize(NS1);
  assert.equal(NorthStar.sameText(a, { ...a, updatedAt: "2026-10-02T00:00:00.000Z", via: "claude" }), true);
  assert.equal(NorthStar.sameText(a, { ...a, description: "new" }), false);
  assert.equal(NorthStar.sameText(a, { ...a, title: "new" }), false);
  assert.equal(NorthStar.sameText(a, null), false);
  assert.equal(NorthStar.sameText(null, null), true);
});

test("AC-ST.88 (node): dumpOf's four keys in §4.7.2's shapes; the description never travels", () => {
  assert.deepEqual(NorthStar.dumpOf(s(), true, false), {
    panelOpen: true, northStar: { title: NS_T, hasDescription: true },
    northStarIcon: { state: "set", tooltip: "Почему вы здесь?\nNorth Star · click to open" }, northStarPopup: null
  });
  assert.deepEqual(NorthStar.dumpOf(s({ error: E7 }), false, true).northStarPopup, { state: "set", stale: true });
  assert.deepEqual(NorthStar.dumpOf(withKey(null), false, true), { panelOpen: false, northStar: null, northStarIcon: { state: "unset", tooltip: NorthStar.TIP_UNSET }, northStarPopup: { state: "unset", stale: false } });
  for (const [over, popup] of [[{ backend: "json" }, "json"], [{ hasNorthStar: false, northStar: null }, "older"], [{ loaded: false }, "loading"]]) {
    assert.deepEqual(NorthStar.dumpOf(s(over), false, true), { panelOpen: false, northStar: null, northStarIcon: { state: "hidden", tooltip: "" }, northStarPopup: { state: popup, stale: false } });
  }
  assert.deepEqual(NorthStar.dumpOf(s({ northStar: NorthStar.normalize({ title: "T" }) })).northStar, { title: "T", hasDescription: false });
  const raw = NorthStar.dumpOf(read({ version: 1, tasks: [], northStar: { title: "  <b>Почему</b>\n вы   здесь? 🌟 " } }));
  assert.equal(raw.northStar.title, "<b>Почему</b> вы здесь? 🌟", "AC-ST.82: dump.northStar.title");
  assert.equal(JSON.stringify(raw).includes("description"), false);
});
