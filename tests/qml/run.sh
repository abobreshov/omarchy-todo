#!/usr/bin/env bash
# The headless QML probe (tests/qml/tst_*.qml) under qmltestrunner on the
# offscreen platform: TaskRow.qml against the installed Omarchy shell's
# Ui/Commons (`qs` import root, as tools/qmllint.sh builds it) with the
# Quickshell types stubbed under tests/qml/imports. Opens no window, reads
# no user config, spawns nothing. Exit 0 when every TestCase passes.
#
#   tests/qml/run.sh            # gate
#   PROBE=1 tests/qml/run.sh    # also print the PROBE measurement lines
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
shell_dir="${OMARCHY_PATH:-/usr/share/omarchy}/shell"
runner="${QMLTESTRUNNER:-/usr/lib/qt6/bin/qmltestrunner}"

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$scratch/qsroot"
ln -sfn "$shell_dir" "$scratch/qsroot/qs"

set +e
QT_QPA_PLATFORM=offscreen "$runner" \
  -import "$scratch/qsroot" -import "$here/tests/qml/imports" \
  -input "$here/tests/qml" >"$scratch/out.txt" 2>&1
status=$?
set -e

if [ -n "${PROBE:-}" ]; then grep 'PROBE' "$scratch/out.txt" || true; fi
if [ "$status" -ne 0 ] || ! grep -q '^Totals: .* 0 failed' "$scratch/out.txt"; then
  cat "$scratch/out.txt"
  echo "qml probe: failed (exit $status)" >&2
  exit 1
fi
echo "qml probe: $(grep '^Totals:' "$scratch/out.txt")"
