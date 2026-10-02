# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.2.0] - 2026-10-02

The North Star (todocli S11). It needs the S11 `todocli`, whose
`board --json` carries `northStar`; with an older `todocli` or in json mode
the panel is 2.1.2's, and the star stays hidden.

### Added

- A star after the pill, one icon slot wide (below it on a vertical bar):
  accent while a North Star is set, dimmed while none is, and hidden in json
  mode, before the first read and with an older `todocli`. Its tooltip is the
  title, wrapped at 60 characters, then `North Star · click to open`.
- A click on the star opens the North Star popup, centred on the bar: the
  title as a heading, `North Star · updated <when> · via <who>`, the
  description as typed, an edit hint and a history hint. It is read-only; Esc,
  a click outside or a second click on the star closes it. Past 520 px it
  scrolls, with `j`/`k` or the wheel; `r` reloads, `?` shows its keys and Tab
  moves to the neighbouring bar panel. It opens at the top, and a read keeps
  the scroll unless the text changed.
- `*` in the todo list (any tab, Done included) switches to the popup, and
  `*` in the popup switches back to the list. The two are never open together:
  each is its own popout owner, so the bar's coordinator closes one as the
  other opens. In json mode `*` says `North Star needs backend = cli.`, and
  with an older `todocli` `North Star needs a newer todocli.`.
- IPC `northStar` toggles the popup. With nothing to show it still opens, and
  the popup says why. `close` and `hide` close whichever of the two is open.
  `dump` appends `panelOpen`, `northStar`, `northStarIcon` and
  `northStarPopup`; every key before them is unchanged.
- The list's and the Done tab's `?` lines gain `* north star` while the
  feature is available (cli mode and the key present, set or unset).
- After a good read, a failing read changes neither the star nor the popup's
  text: the popup adds one line, `<error> · showing the last good read`.

### Changed

- The vendored contract goldens are `todocli` S11's: `board.json` and
  `board-streams.json` carry `"northStar": null`, and `board-northstar.json`
  is new (pins re-taken). `tests/fixtures-schema.test.mjs` checks the boards'
  key list by directory: `contract/` boards carry `northStar`, the frozen
  `consumer/` boards do not.
- The headless QML seams carry the kit's popout coordination
  (`tests/qml/imports/KeyboardPanelBase.qml`, `PanelBase.qml`), pinned to
  the installed shell by `tests/coordination-pin.test.mjs`; `tests/smoke.sh`
  builds its scratch `Ui` with `KeyboardPanel.qml` stubbed the same way.

### Not in this release

- The todo panel's Tab "next panel" fix. It ships on its own as 2.2.1.

## [2.1.2] - 2026-10-01

### Fixed

- The list card left a spare gap under its rows while the key-help line was
  hidden: it counted the gap above that line whether or not the line was
  shown. It now counts one gap above the rows and a second only above a shown
  help line, and the rows area takes the rest, so every row still fits.
- Each move of the tab strip's window (a tab chosen past its edge) logged a
  QML binding loop on the strip's layout. The window's first tab now goes
  back to the panel on the next turn; the window itself moves as before.

### Changed

- QML tests no longer depend on the time zone: the row-mark case's done task
  is done at the panel clock's time (a fixed instant fell on the previous day
  in Pacific/Auckland), and the view-day case crosses local midnight in any
  zone. The overflow-indicator case returns to the Overview, and the picker
  and tab-strip cases fail on a binding-loop warning.
- `tests/fixtures-schema.test.mjs` records that `tests/fixtures/consumer/`
  holds frozen historical inputs (CONTRACT-S9 §12.3, DECISIONS D18): their
  boards keep the pre-D18 Basecamp entry as `sync[1]`, and stay as written.

## [2.1.1] - 2026-10-01

### Fixed

- The done tail drew an empty row. The list's rows area was shorter than its
  rows by the height of the hidden key-help line, so the last row (on a board
  with a task done today, that task) was clipped out of view and left a blank
  slot above the footer, in every list view. The rows area now leaves room
  for the help line only while it is shown.

## [2.1.0] - 2026-10-01

### Added

- Streams in a tab strip with Overview and Inbox, grouped tasks in Overview,
  and a move mode for sending a task to another stream.
- Side-scroll and Shift+wheel switch one tab per gesture; `[`, `]` and `0`-`9`
  choose tabs from the keyboard.
- A Done tab for the last seven local calendar days. Stream views keep tasks
  completed today in their block's tail; the day is sampled when the panel opens.
  A task reopened from the Done tab keeps its place until the panel closes.
- Horizon sections and filtering, with a badge for a task's horizon or size.
- Priority marks and size chips, with keyboard and mouse pickers. Zero is a
  set priority, and done marks stay dim.
- Script controls `addTo`, `tab`, `move`, `setPriority` and `setSize`.
  `dump` adds `tab`, `streams`, `strip`, `horizonFilter`, `moving` and `rows`;
  open tasks carry stream, labels, horizon, priority and size.
- Canonical CLI fixtures replace the provisional copies, while older-CLI
  and adversarial consumer fixtures remain as regression inputs.
- `tools/reads-board.mjs` checks that a plugin reads every task before cutover.

### Changed

- The sync footer follows the one Obsidian target after Basecamp sync cleanup.
- The cursor stays on its task through reads and optimistic writes.
- Stream controls need the S9 CLI's `streams` catalogue; an older CLI keeps
  today's list.
- The real-binary contract case in `tests/contract.test.mjs` runs only when
  `TODOCLI_BIN` names an absolute path, and no longer looks for `todocli` on
  `PATH`; `TODOCLI_REQUIRE_BIN=1` makes a missing `TODOCLI_BIN` a failure.

### Fixed

- Focus-line ghosts and the tab strip ignore clicks while a picker is open,
  and the strip then shows no hover fill on its tabs and no tooltip on them or
  on its overflow indicators; detail priority marks use the row's colours, and
  the detail footer keeps a fixed height.

## [2.0.0]

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

- `tests/fixtures/contract/`: what the real todocli prints for every reply
  the panel consumes, generated by todocli's `tests/contract.rs`, vendored
  byte for byte and pinned by SHA-256; the fake `todocli` replays it by verb
  and prints the real envelope on `FAKE_EXIT`. `tests/contract.test.mjs`
  also drives the real binary under an isolated environment when one is at
  hand.
- `tests/qml-js-loader.mjs` is the one loader both plugins' unit tests use
  (the pomodoro vendors a pinned copy): it hides Node's globals from the
  library under test, as a QML context does, and drops a module import
  (`.import QtQuick as Q`) that names no file.
- `tests/fixtures/pomodoro-state-file.json`: the pomodoro plugin's state-file
  golden, vendored byte for byte and pinned by SHA-256 in
  `tests/pomodoro.test.mjs`, where every shape (running, paused, break,
  idle) is read through `pomodoroView`; the two plugins agree on the file
  by its bytes.
- `tests/qml/run.sh`: a headless `qmltestrunner` probe of `TaskRow.qml`
  (offscreen platform, the shell's `Ui`/`Commons`, Quickshell stubbed under
  `tests/qml/imports`) that fails when the row's height or its icon
  cluster's geometry changes on hover — the fixed-slot rule as a gate.

- Focus line, `doing`/`done` states, a keyboard cursor (`j`/`k`, Enter),
  `d` done, `s` doing, `f` focus, `p` pomodoro, `r` reload, `R` sync,
  `?` shortcut line, Tab to the neighbouring bar panel.
- Read-only detail view with the plan (steps can be ticked) and notes.
- Delete from the list with the mouse: a third fixed 24 px slot in every
  row's right cluster holds a `{del}` ghost (urgent on hover) that fades in
  with `(o)` and `(t)`; the first click arms the row (caption `click or x
  again to delete`; the button stays put and lit), a second click within
  3 s deletes, as `x x` does. The detail view's delete button follows the
  same two-click rule (`Delete (x x or Del)`, then `Click or x again to
  delete`).
- Delete and Backspace arm and confirm a delete like `x`, in the list and
  the detail view (`Keys.keyAction` names them); the help line reads
  `x x or Del delete`.
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
- `node --test` suite for the `.js` libraries (`Model`, `Store`, `Errors`,
  `View`, `Pomodoro`, `Keys`, `Argv`; ≥ 95 % lines), `tools/qmllint.sh` with
  a warning baseline, a fake `todocli` and `tests/smoke.sh`, a headless IPC
  smoke test in a scratch Quickshell instance.

### Fixed

- In cli mode a read that began before a write committed can no longer
  paint the pre-write board over the optimistic list for one cycle: the
  store keeps a write generation and paints a read only when no write
  finished since the read was spawned (`Store.readApplies`); the read after
  the last write supersedes it.
- A failed optimistic write no longer erases the optimistic writes queued
  after it: instead of restoring a whole snapshot, the store rebases the
  still-queued writes onto the doc from before the failed one
  (`Store.rebase`), so only the failed change disappears and a later
  failure reverts only its own.
- A failed `R` sync no longer puts the panel into an error state for up to
  30 s: the store reads the `kind` of todocli's `--json` envelope and shows
  a footer transient (`Sync already running.`, `Sync held — …`, `Sync
  failed — …`) while the list stays writable; only a binary that cannot run
  is E4.
- The change-signal watch follows the stamp path the board document names
  (`stamp`) instead of a hardcoded `~/.local/state/todocli/`, so a
  configured state directory is watched too.
- The pomodoro state file is read only at its version 1; another version
  reads as idle, as the pomodoro's own parser treats it. The label rule
  before the hand-off strips C1 controls as the pomodoro does, and
  `formatTime` prints `h:mm:ss` from an hour up, as the pomodoro shows it.
- The pomodoro's state directory follows `pomodoroTarget` (the plugin id
  names both the IPC target and `~/.local/state/<id>/`).

- Hovering a row's `(o)` / `(t)` icons made them flicker: the icons were
  made visible on the row's `MouseArea` hover, and a `MouseArea` of their
  own takes that hover away (Qt 6), so each icon hid itself under the
  pointer and reappeared a frame later; the row also grew by the icon's
  height, which resized the popup. A `HoverHandler` now owns the row's hover
  (it stays hovered over the icons and the checkbox), the cluster keeps two
  fixed slots that the icons only fade into (`View.rowActions`), the focus
  line's `(t)` / `{x}` do the same (`focusLine().actions`), and a row that
  already holds the cursor dispatches no further hover.

### Notes

- Size: about 3,500 lines of QML and JS against the 1,800 the plan
  budgeted. The overrun is the UX surface (focus line variants, detail view,
  sync footer, error view, keyboard reducer), not extra features; recorded as
  a deviation. No file exceeds 500 lines (one library or component per
  concern).
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

[Unreleased]: https://github.com/abobreshov/omarchy-todo/compare/v2.1.1...HEAD
[2.1.1]: https://github.com/abobreshov/omarchy-todo/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/abobreshov/omarchy-todo/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/abobreshov/omarchy-todo/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/tathagat11/omarchy-checklist-todo/releases/tag/v1.0.0
