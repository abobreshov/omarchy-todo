# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Forked from [tathagat11/omarchy-checklist-todo](https://github.com/tathagat11/omarchy-checklist-todo)
1.0.0 as `abobreshov.todo`.

### Changed

- Plugin id `abobreshov.todo`; IPC target and state directory
  (`~/.local/state/abobreshov.todo/todos.json`) follow it. On the first
  json-mode start without a file of its own the plugin reads the upstream
  `~/.local/state/tathagat11.checklist-todo/todos.json` once and saves a copy;
  the upstream file is never written.
- Ticking a row marks it **done** instead of deleting it; a done row stays
  visible, struck through, until the panel closes. Deleting is explicit
  (`x x` in the list, the delete button in the detail view, IPC `remove`).
- The list header counts open items (`N open`); IPC `status` counts open items.
- The state directory is created with `install -d -m 0700`.
- JSON store version 2 (`status`, `plan`, `notes`, `focus`); version 1 files
  still load, as all-todo.
- An unparsable non-empty `todos.json` shows a banner and blocks saves instead
  of being overwritten.

### Added

- Focus line, `doing`/`done` states, a keyboard cursor (`j`/`k`, Enter),
  `d` done, `s` doing, `f` focus, `p` pomodoro, `r` reload, `R` sync,
  `?` shortcut line, Tab to the neighbouring bar panel.
- Read-only detail view with the plan (steps can be ticked) and notes.
- Bar pill shows the doing task, the focus text or the open count.
- `backend = cli`: every read and write goes through `todocli --source omarchy
  --json` as a plain argv `Process`; the panel re-reads on todocli's change
  stamp (`~/.local/state/todocli/`) and on the `refresh()` push; a sync
  footer; error states for a missing binary, a busy database, a failing
  command and a protocol mismatch.
- Pomodoro hand-off: `p` / middle click / IPC `startPomodoro` run
  `omarchy-shell <pomodoroTarget> startFor <id> <title>`; the focus line shows
  the timer from the pomodoro's state file.
- IPC: `setStatus`, `focus`, `startPomodoro`, `toggleStep`, `openTask`,
  `refresh`, `syncNow`, `dump`. Upstream `add`, `remove`, `status`,
  `open/close/show/hide/toggle` keep their arities and replies.
- Settings `backend`, `cliPath`, `pomodoroTarget`, `maxChars`.
- `node --test` suite for `Model.js`, `Keys.js`, `Argv.js` (≥ 95 % lines),
  `tools/qmllint.sh` with a warning baseline, a fake `todocli` and
  `tests/smoke.sh`, a headless IPC smoke test in a scratch Quickshell instance.

### Notes

- Size: about 3,000 lines of QML and JS against the 1,800 the plan
  budgeted. The overrun is the UX surface (focus line variants, detail view,
  sync footer, error view, keyboard reducer), not extra features; recorded as
  a deviation.
- `todocli import --omarchy` (the one-shot json → cli import) arrives with
  the next `todocli` release; the README says so.

## [1.0.0] - 2026-09-25

### Added

- Bar widget with a checklist popup: one row per item, a name and a checkbox.
- Add items with a name and an optional description.
- Click an item to read its description; a back arrow returns to the list.
- Click a checkbox to delete an item permanently.
- Keyboard support: `n` or `+` to add, `Enter` to save, `Esc` to go back or close.
- IPC API: `add`, `remove`, and `status` via
  `omarchy-shell tathagat11.checklist-todo ...`.
- Plain-JSON persistence at
  `~/.local/state/tathagat11.checklist-todo/todos.json`.
- Every monitor's bar stays in sync via a directory watch.
- Standard Omarchy bar-widget behaviour: move/reorder, enable/disable, hot reload.

[Unreleased]: https://github.com/abobreshov/omarchy-todo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/tathagat11/omarchy-checklist-todo/releases/tag/v1.0.0
