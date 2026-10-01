# Checklist Todo (`abobreshov.todo`)

**The todo list that stays out of your way — now with a focus, doing/done and
an optional `todocli` backend.**

A tiny checklist for the [Omarchy](https://omarchy.org/) bar. Add an item,
read it, tick it done, pick the one you are working on and start a pomodoro
for it. By default your data is a plain JSON file; with `backend = cli` every
read and write goes through [`todocli`](https://github.com/abobreshov/productivity),
so the same list shows up in Claude Code, Obsidian and Basecamp.

Forked from https://github.com/tathagat11/omarchy-checklist-todo (MIT) by
Tathagata Talukdar. Plugin id `abobreshov.todo`; the bar icon, the three
views, the keys and the JSON-file pattern are upstream's.

## Features

- **Add in a keystroke** — `n`, a name, an optional description, Enter.
- **Focus, doing, done** — `f` sets the focus (the pill shows it), `s` marks
  doing, `d` ticks done. A done row stays visible, struck through, until the
  panel closes; `d` again reopens it.
- **Explicit delete** — `x x`, Delete or Backspace on the row (the first
  press arms it, the second deletes), the row's trash button on hover or the
  detail view's, with the same two clicks, or IPC `remove`. Ticking never
  deletes.
- **Details on demand** — Enter on a row shows the description, the plan
  (steps tick with Enter or Space) and the notes.
- **Pomodoro hand-off** — `p` (or a middle click on the pill) focuses the task
  and asks the `abobreshov.pomodoro` plugin to start on it; the focus line
  shows the timer.
- **Keyboard first** — `j`/`k` move, `?` shows the shortcut line, Tab jumps to
  the neighbouring bar panel; every key has an IPC twin and `dump` reads the
  panel's state.
- **Two backends, one look** — `json` keeps a file in
  `~/.local/state/abobreshov.todo/todos.json`; `cli` runs `todocli`. Views,
  keys and copy are identical; cli mode adds a sync footer and `#id`s.
- **Zero dependencies in json mode** — no scripts, no services, no network.

## Installation

```bash
omarchy plugin add https://github.com/abobreshov/omarchy-todo --enable
```

The focus label needs width; the `right` section is usually crowded:

```bash
omarchy bar move abobreshov.todo --section left
```

If you used the upstream Checklist Todo, the first json-mode start reads
`~/.local/state/tathagat11.checklist-todo/todos.json` once (item ids kept) and
saves a copy in the plugin's own path; the upstream file is never written. The
same by hand:

```bash
mkdir -p ~/.local/state/abobreshov.todo
cp ~/.local/state/tathagat11.checklist-todo/todos.json ~/.local/state/abobreshov.todo/
```

## Usage

Click the checkbox icon in the bar (or `omarchy-shell abobreshov.todo toggle`).

| Key | List | Detail |
| --- | --- | --- |
| `n` `N` `+` | New todo | — |
| `j` `k` / Down Up | Move the cursor | Move over the plan steps |
| Enter, Space, `l`, Right | Open the row (the focus line: its task, or compose pre-filled for a free-text focus) | Toggle the step |
| `d` | Toggle done | Toggle done |
| `s` | Toggle doing (on the focus task, doing → todo also clears the focus) | Same |
| `f` | Set as focus (marks it doing); on the focus task: clear | Same |
| `p` | Focus it and start its pomodoro; on the attached task: pause/resume | Same |
| `x` `x`, Delete, Backspace | Delete (the first press arms the row for 3 s, the second, any of the three, deletes) | Delete and go back |
| `r` | Reload (json: re-read the file; cli: `todocli board --json`) | Same |
| `R` | Sync now (cli only) | Same |
| `?` | Shortcut line | Same |
| Esc | Close | Back to the list |
| Tab / Shift+Tab | Neighbouring bar panel | Same |

On a done row `s`, `f` and `p` are inert (`#12 is done · d reopens it`); the
one exception is `p` on the task the running pomodoro is attached to, which
pauses or resumes it. Mouse: the row checkbox toggles done, the title opens
the detail, the ghost `(o)`/`(t)`/`{del}` buttons on hover set the focus /
start the pomodoro / arm the delete (the row's caption reads `click or x
again to delete`; a second click on `{del}` within 3 s deletes, a click
elsewhere or moving to another row disarms), the footer's failure text runs
a sync.

The pill shows, in this order: a backend error, the doing task (the focus task
if it is doing, else the lowest id), the focus text, the open count, nothing.
Vertical bars show the icon only.

## Settings

```bash
omarchy bar set abobreshov.todo <key> <value>     # numbers need --json
```

| Key | Default | Meaning |
| --- | --- | --- |
| `backend` | `json` | `cli` routes every read (`todocli --source omarchy --json board`) and write through `todocli`. Any other value means `json`. |
| `cliPath` | `todocli` | Command name or absolute path, run as a plain argv `Process` (no shell). The default resolves on the shell's own PATH, which on Omarchy contains `~/.cargo/bin`; set an absolute path such as `/home/you/.cargo/bin/todocli` where it does not (QML does not expand `~`). Shown in `dump.cliPath`. |
| `pomodoroTarget` | `abobreshov.pomodoro` | IPC target used by `p` and the middle click. |
| `maxChars` | `24` | Pill label length on horizontal bars; `0` shows the icon only. |

### Switching from json to cli

1. Install `todocli` and bring the panel's list over:
   `todocli import --omarchy ~/.local/state/abobreshov.todo/todos.json`.
   The path is the bar file to read (the plugin's own v2 file above, or the
   upstream v1 `~/.local/state/tathagat11.checklist-todo/todos.json`; there
   is no default), and todocli reads it the way the panel does: names and
   statuses squished and lowercased, plan `done` as true, 1 or `"true"`, a
   blank step dropped. The import is additive by item id — an id already
   imported is skipped, so a second run adds nothing (`imported 0 bar items
   (N already present)`); a repeated id in the file is its own item,
   `<id>#<n>`, with a warning. The file's focus text fills an empty todocli focus, and its
   focus task is linked when that task is `doing`. The file is only read.

2. `omarchy bar set abobreshov.todo backend cli`

The switch is one-way in practice: after `cli`, a return to `json` shows the
plugin's file as it was last written, and edits or deletions made there later
never reach the `todocli` database (an id missing from the file cannot be told
from an old copy). `todocli daemon --preflight` flags a json store newer than
the database.

### cli mode

- Reads happen on load, on todocli's change signal (the stamp file replaced
  after every committed write — its path is the `stamp` the board document
  names, `~/.local/state/todocli/changed` by default, and the panel watches
  that directory from the first successful read on — and the push
  `omarchy-shell -q abobreshov.todo refresh`), on `r`, on panel open, every
  30 s in an error state and every sync interval while the panel is open.
  The panel never watches the SQLite file.
- Writes are optimistic and reverted with `Not saved — <reason>.` on failure;
  they are never retried automatically.
- Errors: `todocli not found` (E4, fix `cliPath` or go back to `backend
  json`), `Database busy or locked` (E5, the last list stays read-only),
  `todocli error` (E7, the first stderr lines), `Can't read todocli output`
  (E8, version mismatch). The panel never falls back to the JSON file on its
  own.
- A failed `R` sync is a footer transient, never one of those errors: the
  panel reads the `kind` of todocli's `--json` envelope (`sync_held` → `Sync
  already running.`, `removals_held` → `Sync held — <n> removals held; …`,
  `busy` → `Sync not started — database busy.`, any other kind → `Sync
  failed — <reason>.` with the footer's own reason copy). The list stays
  writable; only a binary that cannot run at all is E4.
- The footer shows the sync state from `todocli board --json`'s `sync`
  block: `todocli · synced 2m ago`, `Basecamp sync failed 12m ago · R retry`,
  `Sync daemon idle since 2h ago · R sync now`.

## IPC

```bash
# Upstream surface, unchanged
omarchy-shell abobreshov.todo add "Buy milk" "Semi-skimmed"   # -> "Buy milk" | "empty" | "unavailable: …"
omarchy-shell abobreshov.todo remove <id>                     # -> "ok"
omarchy-shell abobreshov.todo status                          # -> "3 todos" (open items)
omarchy-shell abobreshov.todo open|close|show|hide|toggle

# Fork additions
omarchy-shell abobreshov.todo setStatus <id> todo|doing|done  # -> ok | unknown id | bad status
omarchy-shell abobreshov.todo focus <id>|clear                # -> ok | unknown id | refused: done
omarchy-shell abobreshov.todo startPomodoro <id>|focus        # -> ok | unknown id | no focus | refused: done
omarchy-shell abobreshov.todo toggleStep <id> <n>             # -> ok | unknown id | bad step
omarchy-shell abobreshov.todo openTask <id>                   # -> ok | "Task <id> not found."
omarchy-shell abobreshov.todo refresh                         # -> ok (re-reads on every monitor)
omarchy-shell abobreshov.todo syncNow                         # -> ok | "Sync needs backend = cli."
omarchy-shell abobreshov.todo tab <name>                      # -> ok | unknown stream | ambiguous stream | E21/E22/E23
omarchy-shell abobreshov.todo dump                            # -> one JSON line
```

In cli mode a mutator's reply means *accepted*, not committed: `todocli` runs
asynchronously and the store reflects the change within a couple of seconds.
From a known error state every mutator replies `unavailable: <reason>`.
`dump` returns `{version, backend, cliPath, view, stale, error, pill, focus,
open, done, banner, footer, message, tab, streams, strip, horizonFilter, moving, rows}`.

## Data

- json mode: `~/.local/state/abobreshov.todo/todos.json` (version 2:
  `focus`, `todos[{id, name, description, status, plan, notes}]`; version 1
  files load as all-todo). The directory is created `0700`. An unparsable
  non-empty file shows a banner and blocks saves instead of being overwritten.
- cli mode: the `todocli` database; the plugin writes nothing of its own.

## Uninstall

```bash
omarchy plugin disable abobreshov.todo
omarchy plugin remove abobreshov.todo
rm -rf ~/.local/state/abobreshov.todo      # optional, json data
```

## Development

All logic lives in fourteen `.pragma library` files, one concern each; the QML
files bind and forward.

| Library | Holds |
| --- | --- |
| `Model.js` | The fifteen-field item model (including stream, labels, horizon, priority, size and completedAt), the catalogue normaliser, glyphs, settings, text/time formatting and the focus link. |
| `Priority.js` | Strict document priority/size normalisers and the contract's level, size and horizon constants. |
| `Store.js` | The json document (version 2, reads version 1), `board --json` metadata/catalogue mapping and capability detection, sync block and `reduce(doc, action)`, including move, priority and size writes. |
| `Queue.js` | The cli store's ordering rules, rollback rebase and optimistic id map and write-reply codec. |
| `Errors.js` | The cli error kinds (E4, E5, E7, E8) in one table: `classifyExit`, `unavailable`, `errorView`, `msgNotSaved`. |
| `View.js` | View decisions and copy: list order and the session's done rows, `focusLine`, `statusLine`/`actionTooltips`, the transients, `dumpView`. |
| `Chrome.js` | The pill and the sync footer. |
| `Pomodoro.js` | The hand-off: `pomodoroIntent`, `pomodoroMessage`, `classifyShell`, `pomodoroView`. |
| `Keys.js` | `keyAction` (the key map) and `reduceUi` (the view machine: list, compose, detail, error, cursor, armed delete). |
| `Order.js` | Status/priority/horizon/id comparators (doing first), tick-time peer snapshots, session-map translation/pruning, completion order and local calendar-day windows (`DONE_DAYS = 7`). |
| `Tabs.js` | Active tabs, labels and resolution, clamped navigation and move targets by uid, whole-tab windows, angle/pixel wheel accumulators. |
| `Streams.js` | Grouped Overview, stream blocks and sections, done tails, Done-tab day rows, filter/count/empty copy and document-wide slots. |
| `Cursor.js` | Selectable rows, identity anchoring and temporary-id translation, minimal scroll adjustment. |
| `Argv.js` | The argv builders for `todocli`, `omarchy-shell` and `install`. |

Libraries import each other with `.import "X.js" as X` (Model ← Store ←
Errors ← View ← Pomodoro; Queue uses Store; Chrome uses Model, Errors and View;
Keys uses Model and View; Argv uses Model), and
`tests/qml-js-loader.mjs` resolves the same lines under Node.
`Store.reduce(doc, action)` is the one mutation API: the keys emit an action
(`add`, `setStatus`, `focus`, `toggleStep`, `remove`), `Argv.forAction` maps
it to a `todocli` command and both stores apply it through
`perform(action, done)`.

QML: `BarWidget.qml` (the pill and the IPC handler), `Panel.qml` (the
composition root: settings, the store switch, the reducer wiring and the
operations the IPC functions, keys and buttons call), `PanelBody.qml` (the
keyboard surface and view composition), the views
`TaskList.qml` (header, banner, focus line, rows, help line and the error
body), `ComposeView.qml`, `DetailView.qml`, `FocusLine.qml`, `TaskRow.qml`,
`ErrorView.qml`, `StatusFooter.qml`, the stores `TodoStore.qml` (the
interface), `JsonStore.qml` and `CliStore.qml`, which extend it and answer
alike so `Panel.qml` never asks which backend it is, `PomodoroLink.qml` and
`ArgvProcess.qml`, which runs every external command as an argv list (never
a shell string) and reports a binary that cannot be spawned. Every `Text`
that shows user text sets `textFormat: Text.PlainText`; the pill and tooltip
text (kit-owned) goes through `Model.pillLabel`/`Model.tooltip`, which turn
`<`/`>` into `‹`/`›`.

Size: the plugin is about 3,500 lines of QML and JS against the 1,800 the
plan budgeted (upstream is ~690). The difference is the UX surface, not extra
features: the focus line with its seven variants, the detail view, the sync
footer, the error view and the keyboard reducer each carry their own states
and copy. Recorded as a deviation. No file exceeds 500 lines: a file that
grows past that is split by responsibility, never waived.

One `IpcHandler` per widget instance is the shell's own pattern. Quickshell
0.3.1 logs `WARN … Handler was registered but will not be used because
another handler is registered for target abobreshov.todo` for the second
instance (a warning, not an error); the later registration answers and
relays `refresh()` to its peers with `broadcast`, so a second monitor needs
nothing more.

```bash
# Unit tests with the 95 % line-coverage gate (Node ≥ 22)
node --test --experimental-test-coverage --test-coverage-lines=95 \
  --test-coverage-include="**/*.js" tests/

# qmllint with the Omarchy shell as the `qs` import root, gated on a baseline
tools/qmllint.sh            # tools/qmllint.sh --update rewrites the baseline

# Headless QML probe: TaskRow's geometry is one value before, during and after a hover (offscreen; no window)
tests/qml/run.sh            # PROBE=1 prints the measurements

# Manifest and file checks
omarchy plugin validate .

# Headless smoke test of the IPC surface in both modes (needs qs and a Wayland session)
tests/smoke.sh
```

The cli-mode tests run against `tests/fakebin/todocli`, which replays what
the real binary prints: `tests/fixtures/contract/` is generated by todocli's
`tests/contract.rs` and vendored here byte for byte, pinned by SHA-256 in
`tests/contract.test.mjs` (re-vendor: copy the goldens over and paste the
pins the test prints). The same test drives the real binary, when one is at
hand (`TODOCLI_BIN`, else `todocli` on PATH; `TODOCLI_REQUIRE_BIN=1` makes
its absence a failure), under an environment that names every path todocli
reads, so the live store is never touched. `tests/fixtures/pomodoro-state-file.json`
is the pomodoro plugin's own state-file golden (its `test/fixtures/state-file.json`),
vendored and pinned the same way in `tests/pomodoro.test.mjs`, which reads every
shape through `pomodoroView`; and `tests/qml-js-loader.mjs` is the one loader
both plugins' unit tests use (the pomodoro vendors a pinned copy).

`tests/fixtures/provisional/` holds the S9 documents copied byte for byte from
`docs/streams/CONTRACT-S9.md` (the board with streams, `show`, the five new
writes); the panel codes against them until the crate regenerates the contract
goldens, and package P5 deletes the directory. `tests/fixtures/consumer/` is
permanent: adversarial inputs (an older CLI document, an archived home, ordering
ties, an empty stream, a refused write) with their pinned expected orders in
`expected.json`; `tests/fixtures-schema.test.mjs` asserts both directories'
shapes and key order against the contract.

`tests/qml/run.sh` runs `tests/qml/tst_hover.qml` under `qmltestrunner` on the
offscreen platform: the real `TaskRow.qml` against the installed shell's
`Ui`/`Commons`, with the Quickshell types stubbed under `tests/qml/imports`
(no window, no user config, nothing spawned). It is the fixed-slot rule of
UX §4.2 as a gate: the row's height and its icon cluster's geometry are one
value before, during and after a hover, including with the pointer resting
on a ghost button (`docs/reports/HOVER-GLITCH-VIDEO.md` in the root repository).

The lint recipe by hand: `/usr/lib/qt6/bin/qmllint -I <dir-with-a-qs-symlink>
*.qml`, where `<dir>/qs -> /usr/share/omarchy/shell`. The baseline holds the
kit's inherent `missing-property` warnings on the `Style` singleton's
sub-objects and the `signal-handler-parameters` warning on `Process.onExited`
in `ArgvProcess.qml`.

Edits under `~/.config/omarchy/plugins/` hot-reload on save.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) — Copyright (c) 2026 tathagat11; modifications Copyright (c)
2026 Alexander Bobreshov.

Manual touchpad gate MAN-S1 also checks reversing a vertical scroll at a bound
immediately after an event with sideways drift: the reverse must scroll without
switching tabs. MAN-S3 checks Shift+wheel on either axis and Alt+horizontal wheel.
