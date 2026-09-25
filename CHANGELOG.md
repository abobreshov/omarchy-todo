# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/tathagat11/omarchy-checklist-todo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/tathagat11/omarchy-checklist-todo/releases/tag/v1.0.0
