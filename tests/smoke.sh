#!/usr/bin/env bash
# Headless smoke test of the plugin's IPC surface in json and cli mode
# (PLAN §9.7's bar-test.sh drives the live bar; this one drives a scratch
# Quickshell instance with a fake bar and a scratch HOME, so nothing of the
# real shell or the real state directories is touched). Needs `qs` and a
# Wayland session. Covers the IPC halves of AC-2.2, 2.3, 2.4, 2.6, 2.10, 7.7,
# 13.1, 13.4, 17.1, 17.2, 17.4.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
shell_dir="${OMARCHY_PATH:-/usr/share/omarchy}/shell"
command -v qs >/dev/null || { echo "smoke: qs not found" >&2; exit 2; }

scratch="$(mktemp -d)"
root="$scratch/root"
home="$scratch/home"
mkdir -p "$root" "$home/.local/state/tathagat11.checklist-todo"
cp "$here/tests/smoke/shell.qml" "$root/shell.qml"
ln -sfn "$shell_dir/Ui" "$root/Ui"
ln -sfn "$shell_dir/Commons" "$root/Commons"
cp "$here/tests/fixtures/upstream-v1.json" "$home/.local/state/tathagat11.checklist-todo/todos.json"
fake="$here/tests/fakebin/todocli"
export FAKE_LOG="$scratch/argv.log"

pid=""
stop() {
  if [ -n "$pid" ]; then
    qs ipc -p "$root" call smoke quit >/dev/null 2>&1 || kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    pid=""
  fi
}
cleanup() { stop; rm -rf "$scratch"; }
trap cleanup EXIT

start() {
  stop
  rm -f "$FAKE_LOG"
  HOME="$home" SMOKE_SETTINGS="$1" SMOKE_VERTICAL="${2:-0}" SMOKE_PLUGIN="$here" qs -p "$root" >"$scratch/qs.log" 2>&1 &
  pid=$!
  for _ in $(seq 1 100); do
    out="$(qs ipc -p "$root" call abobreshov.todo status 2>/dev/null || true)"
    case "$out" in *todo*) return 0;; esac
    sleep 0.1
  done
  echo "smoke: the scratch shell did not answer" >&2
  cat "$scratch/qs.log" >&2
  exit 1
}

call() { qs ipc -p "$root" call abobreshov.todo "$@"; }
dump() { call dump; }
field() { python3 -c 'import sys, json; d = json.load(sys.stdin); print(eval(sys.argv[1], {}, {"d": d}))' "$1"; }
fails=0
check() {
  local name="$1" got="$2" want="$3"
  if [ "$got" == "$want" ]; then echo "ok   $name"
  else echo "FAIL $name: got '$got', want '$want'"; fails=$((fails + 1)); fi
}

# ---- json mode -------------------------------------------------------------
start '{}'
sleep 0.5
check "AC-2.6 upstream items read once" "$(dump | field 'sorted(t["title"] for t in d["open"])')" "['Old A', 'Old B']"
check "AC-2.6 own v2 file written" "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$home/.local/state/abobreshov.todo/todos.json")" "2"
check "AC-2.6 upstream file untouched" "$(cmp -s "$home/.local/state/tathagat11.checklist-todo/todos.json" "$here/tests/fixtures/upstream-v1.json" && echo same)" "same"
check "AC-2.10 state dir 0700" "$(stat -c %a "$home/.local/state/abobreshov.todo")" "700"
check "add returns the clean name" "$(call add '  Buy   milk ' 'Semi-skimmed')" "Buy milk"
check "AC-2.4 empty add" "$(call add '' '')" "empty"
check "status counts open items" "$(call status)" "3 todos"
check "setStatus done" "$(call setStatus t1 done)" "ok"
check "AC-7.7 done row kept in the file" "$(sleep 0.5; python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print([t["status"] for t in d["todos"] if t["id"]=="t1"][0])' "$home/.local/state/abobreshov.todo/todos.json")" "done"
check "status after done" "$(call status)" "2 todos"
check "setStatus bad status" "$(call setStatus t2 weird)" "bad status"
check "setStatus unknown id" "$(call setStatus zz done)" "unknown id"
check "focus refused on done" "$(call focus t1)" "refused: done"
check "focus ok" "$(call focus t2)" "ok"
check "pill shows the doing task" "$(dump | field 'd["pill"]["label"]')" "Old B"
check "dump.focus.taskId" "$(dump | field 'd["focus"]["taskId"]')" "t2"
check "toggleStep bad step" "$(call toggleStep t2 1)" "bad step"
check "refresh" "$(call refresh)" "ok"
check "syncNow in json mode" "$(call syncNow)" "Sync needs backend = cli."
check "remove" "$(call remove t2)" "ok"
check "remove unknown is ok (upstream)" "$(call remove zz)" "ok"
check "startPomodoro unknown" "$(call startPomodoro zz)" "unknown id"
check "startPomodoro without a focus" "$(call startPomodoro focus)" "no focus"
check "dump.backend json" "$(dump | field 'd["backend"]')" "json"

# ---- cli mode against the fake todocli ------------------------------------
qs ipc -p "$root" call smoke settings "{\"backend\":\"cli\",\"cliPath\":\"$fake\"}" >/dev/null
sleep 0.8
check "AC-13.1 cli read shows the store" "$(dump | field 'd["open"]')" "[{'id': '3', 'title': 'Wire the webhook', 'status': 'doing'}]"
check "dump.cliPath is the wrapper" "$(dump | field 'd["cliPath"]')" "$fake"
# The fixture's lastAttemptAt is fixed, so the relative time is not.
check "footer from the sync block" "$(dump | field 'd["footer"]["text"].startswith("Basecamp sync failed ") and d["footer"]["text"].endswith(" · R retry")')" "True"
check "pill sync overlay" "$(dump | field 'd["pill"]["glyph"]')" "$(python3 -c 'print(chr(0xF04E7))')"
check "add accepted" "$(call add 'Buy milk --json' 'Semi-skimmed')" "Buy milk --json"
sleep 0.6
check "AC-2.1b argv: --json before the command, name after --" "$(grep -m1 '"add"' "$FAKE_LOG" | field 'd["argv"]')" "['--source', 'omarchy', '--json', 'add', '--description=Semi-skimmed', '--', 'Buy milk --json']"
check "AC-2.2 json file not modified in cli mode" "$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(len(d["todos"]))' "$home/.local/state/abobreshov.todo/todos.json")" "2"
check "setStatus in cli mode" "$(call setStatus 3 done)" "ok"
check "focus clear in cli mode" "$(call focus clear)" "ok"
check "syncNow in cli mode" "$(call syncNow)" "ok"
sleep 0.8
check "write FIFO order with a read after each" "$(grep -o '"argv":\[[^]]*\]' "$FAKE_LOG" | sed -E 's/.*"--json",//; s/\]$//' | tr -d '"' | tr '\n' ';')" "board;board;add,--description=Semi-skimmed,--,Buy milk --json;board;done,3;board;focus,--clear;board;sync,all;board;"

# ---- E4 / E7 ---------------------------------------------------------------
qs ipc -p "$root" call smoke settings '{"backend":"cli","cliPath":"/nonexistent/todocli"}' >/dev/null
sleep 0.8
check "AC-17.1 missing binary -> error.kind missing" "$(dump | field 'd["error"]["kind"]')" "missing"
check "AC-17.1 view error" "$(dump | field 'd["view"]')" "error"
check "AC-17.1 pill urgent" "$(dump | field 'd["pill"]["urgent"]')" "True"
check "AC-17.1 add refused" "$(call add x '')" "unavailable: todocli not found"
check "AC-17.4 last list stays, stale" "$(dump | field 'str(d["stale"]) + " " + str(len(d["open"]))')" "True 1"
check "AC-17.4 mutators unavailable" "$(call setStatus 3 done)" "unavailable: todocli not found"
check "footer hidden in the error view" "$(dump | field 'd["footer"]')" "None"
qs ipc -p "$root" call smoke settings "{\"backend\":\"cli\",\"cliPath\":\"$fake\"}" >/dev/null
sleep 0.8
check "AC-17.3 recovers when the binary is back" "$(dump | field 'd["error"]')" "None"
stop

# The fake reads its env at spawn time, so the shell restarts with it set.
export FAKE_EXIT=1 FAKE_STDERR="database is locked"
start "{\"backend\":\"cli\",\"cliPath\":\"$fake\"}"
sleep 0.8
check "AC-17.2 stderr surfaced" "$(dump | field 'd["error"]["message"]')" "database is locked"
check "AC-17.2 kind failed" "$(dump | field 'd["error"]["kind"]')" "failed"
unset FAKE_EXIT FAKE_STDERR
stop

# ---- AC-13.4 back to json, vertical pill ------------------------------------
start '{"backend":"json"}'
sleep 0.4
# Old A was ticked done above, so it is hidden; Old B was removed.
check "AC-13.4 json items back" "$(dump | field 'sorted(t["title"] for t in d["open"])')" "['Buy milk']"
stop
start "{\"backend\":\"cli\",\"cliPath\":\"$fake\"}" 1
sleep 0.8
check "vertical pill is icon-only" "$(qs ipc -p "$root" call smoke pill | field 'd["label"]')" ""
check "vertical widget width is the bar size" "$(qs ipc -p "$root" call smoke width)" "28"
stop

# ---- E14: an unreadable file blocks saves until it is fixed or deleted -----
own="$home/.local/state/abobreshov.todo/todos.json"
printf '{broken' >"$own"
start '{"backend":"json"}'
sleep 0.5
check "E14 banner on an unreadable file" "$(dump | field 'd["banner"]')" "Couldn't read todos.json. Fix or delete it — changes won't be saved until then."
check "E14 add is accepted" "$(call add 'Lost' '')" "Lost"
sleep 0.5
check "E14 file never overwritten" "$(cat "$own")" "{broken"
rm "$own"
sleep 0.6
check "E14 block lifts when the file is deleted" "$(dump | field 'd["banner"]')" "None"
check "E14 add after the delete" "$(call add 'Found' '')" "Found"
sleep 0.6
check "E14 the new file holds the item" "$(python3 -c 'import json,sys; print([t["name"] for t in json.load(open(sys.argv[1]))["todos"]])' "$own")" "['Found']"
stop

# Any warning that names one of the plugin's files fails the run (a QML
# error in a view shows up here, since the panel's content is built eagerly).
if grep -q "WARN.*$here/\|Binding loop\|SMOKE load error" "$scratch/qs.log"; then
  echo "FAIL qs log has plugin warnings:"; grep "WARN\|SMOKE" "$scratch/qs.log"; fails=$((fails + 1))
fi

if [ "$fails" -ne 0 ]; then echo "smoke: $fails failure(s)" >&2; exit 1; fi
echo "smoke: all checks passed"
