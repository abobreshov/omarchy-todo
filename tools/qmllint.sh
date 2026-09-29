#!/usr/bin/env bash
# qmllint gate for the fork (PLAN §9.4, A28; research/_verified.md L16).
#
# Runs /usr/lib/qt6/bin/qmllint with a `qs` import root that points at the
# installed Omarchy shell (so `import qs.Ui` / `qs.Commons` resolve), fails on
# any error, and fails when the normalised warnings are not a subset of
# tools/qmllint-baseline.txt (first-party kit types emit inherent
# `missing-property` warnings on the Style singleton's sub-objects and the
# `signal-handler-parameters` warning on Process.onExited).
#
#   tools/qmllint.sh            # gate
#   tools/qmllint.sh --update   # rewrite the baseline from the current output
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
shell_dir="${OMARCHY_PATH:-/usr/share/omarchy}/shell"
qmllint="${QMLLINT:-/usr/lib/qt6/bin/qmllint}"
baseline="$here/tools/qmllint-baseline.txt"

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$scratch/qsroot"
ln -sfn "$shell_dir" "$scratch/qsroot/qs"

cd "$here"
set +e
"$qmllint" -I "$scratch/qsroot" ./*.qml >"$scratch/out.txt" 2>&1
status=$?
set -e

if grep -q '^Error' "$scratch/out.txt" || [ "$status" -ne 0 ]; then
  cat "$scratch/out.txt"
  echo "qmllint: errors (exit $status)" >&2
  exit 1
fi

# One line per warning: "<file>:<line>:<col>: <message> [<category>]" with the
# line and column dropped, so a moved line does not change the baseline.
normalise() {
  grep '^Warning: ' "$1" | sed -E 's/^Warning: ([^:]+):[0-9]+:[0-9]+: /\1: /' | LC_ALL=C sort -u
}
normalise "$scratch/out.txt" >"$scratch/warnings.txt"

if [ "${1:-}" = "--update" ]; then
  cp "$scratch/warnings.txt" "$baseline"
  echo "qmllint: baseline updated ($(wc -l <"$baseline") warning kinds)"
  exit 0
fi

touch "$baseline"
if new="$(LC_ALL=C comm -23 "$scratch/warnings.txt" <(LC_ALL=C sort -u "$baseline"))" && [ -n "$new" ]; then
  echo "qmllint: warnings outside the baseline:" >&2
  echo "$new" >&2
  exit 1
fi
echo "qmllint: ok ($(wc -l <"$scratch/warnings.txt") warning kinds, all in the baseline)"
