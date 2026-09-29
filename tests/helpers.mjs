// Shared fixtures for the library tests: the .pragma library loader rooted
// at the plugin directory, the glyph table of UX §2, a fixed clock and the
// item / sync-target / pomodoro-view builders every file uses.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadQmlJs } from "./qml-js-loader.mjs";

export const here = path.dirname(fileURLToPath(import.meta.url));

// `lib("View.js")` loads the library with its `.import`s resolved the way
// the QML engine resolves them (one shared instance per library).
export function lib(name) {
  return loadQmlJs(path.join(here, "..", name));
}

export const G = {
  icon: String.fromCodePoint(0xf0132),
  todo: String.fromCodePoint(0xf0131),
  doing: String.fromCodePoint(0xf0856),
  done: String.fromCodePoint(0xf0c52),
  focus: String.fromCodePoint(0xf04fe),
  pomodoro: String.fromCodePoint(0xf2f2),
  brk: String.fromCodePoint(0xf0176),
  sync: String.fromCodePoint(0xf04e6),
  syncAlert: String.fromCodePoint(0xf04e7),
  syncOff: String.fromCodePoint(0xf04e8),
  alert: String.fromCodePoint(0xf05d6),
  lock: String.fromCodePoint(0xf0341),
};

export const NOW = Date.parse("2026-09-29T09:15:00.000Z");

export const item = (id, name, status, extra) => Object.assign({ id: String(id), uid: null, name, description: "", status, plan: [], notes: [], due: null, author: null }, extra || {});

// The reader's view of an idle pomodoro (Model.idleView) and of one running
// on a task, as PomodoroLink.view hands them to the views.
export const idle = { phase: "idle", running: false, remaining: 0, taskId: "", label: "", attached: false };
export const onTask = (id, over) => Object.assign({ phase: "work", running: true, remaining: 1122, taskId: String(id), label: "x", attached: true }, over || {});

// One enabled, healthy sync target of the §3.7 `sync` block.
export const target = (name, over) => Object.assign({ name, enabled: true, lastOkAt: new Date(NOW - 2 * 60000).toISOString(), lastAttemptAt: new Date(NOW - 60000).toISOString(), intervalSec: 60, error: null }, over || {});
