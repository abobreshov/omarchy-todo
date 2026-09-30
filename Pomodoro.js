.pragma library
.import "Model.js" as Model
.import "Errors.js" as Errors
.import "View.js" as View

// The pomodoro hand-off (PLAN §6.9, A52; UX §3.4, §6): what `p`, the middle
// click and IPC startPomodoro should do, the reading of `omarchy-shell`'s
// result and of the pomodoro's state file, and the transients. Pure and
// total, as Model.js; PomodoroLink.qml runs the processes and the watch.

var NO_FOCUS = "no focus"

// ---------------------------------------------------------------- copy

function msgPomodoroMoved(item, remaining, backend) {
  return "Pomodoro moved to " + View.taskRef(item, backend) + " · " + Model.formatTime(remaining) + " left"
}

function msgPomodoroMissing(target) { return "Pomodoro plugin not found. Enable " + target + "." }
function msgPomodoroOld(target) { return "Pomodoro plugin is out of date. Update " + target + "." }
function msgPomodoroNotStarted(text) { return "Pomodoro not started — " + text + "." }

// ---------------------------------------------------------------- intent

// `p` / middle click / IPC startPomodoro (PLAN §6.9, A52; UX §3.4, §6.2):
// what the panel should do for `id` ("focus" = the focus line). The task
// the pomodoro is attached to toggles pause/resume; a free-text focus starts
// a label-only pomodoro; anything else focuses the task first and starts
// only after that write succeeds. `state`: {items, focus, pomodoro, error,
// backend}. Returns {kind: "pause"} | {kind: "startLabel", label} |
// {kind: "focusThenStart", item} | {kind: "reply", reply, message}.
function pomodoroIntent(state, id) {
  var s = state || {}
  var reply = function(text, message) { return { kind: "reply", reply: text, message: message || "" } }
  var it
  if (String(id) === "focus") {
    it = Model.focusTask(s.items, s.focus)
    if (!it) return s.focus && s.focus.text ? { kind: "startLabel", label: s.focus.text } : reply(NO_FOCUS)
  } else {
    it = Model.findItem(s.items, id)
    if (!it) return reply("unknown id")
  }
  if (Model.isAttached(s.pomodoro, it.id)) return { kind: "pause" }
  if (s.error) return reply(Errors.unavailable(s.error))
  if (it.status === "done") return reply("refused: done", View.msgDoneRow(it, s.backend))
  return { kind: "focusThenStart", item: it }
}

// The transient for a `startFor` result (UX §6.2, §7 E11/E12); "" for none.
// `item` is the task the call was for, null for a label-only start.
function pomodoroMessage(result, item, ctx) {
  var c = ctx || {}
  if (result.ok) return result.word === "retargeted" && item ? msgPomodoroMoved(item, c.remaining, c.backend) : ""
  if (result.kind === "missing") return msgPomodoroMissing(c.target)
  if (result.kind === "old") return msgPomodoroOld(c.target)
  return msgPomodoroNotStarted(result.text)
}

// ---------------------------------------------------------------- results

// `omarchy-shell <target> startFor …` result (PLAN A52, _verified L61).
function classifyShell(code, stdout, stderr, spawnFailed) {
  if (spawnFailed) return { ok: false, kind: "transient", text: "omarchy-shell not found" }
  if (code === 0) return { ok: true, word: Model.squish(stdout) }
  var err = Model.firstLine(stderr)
  if (err.indexOf("Target not found.") !== -1) return { ok: false, kind: "missing" }
  if (err.indexOf("Function not found.") !== -1) return { ok: false, kind: "old" }
  return { ok: false, kind: "transient", text: err === "" ? "omarchy-shell exited " + code : err }
}

// ---------------------------------------------------------------- state file

// The state file's version this reader understands (abobreshov.pomodoro
// StateFile.STATE_VERSION); any other reads as idle, as the writer's own
// parser treats it.
var STATE_VERSION = 1

// The reader's view of the pomodoro state file (UX §6.5): remaining from
// `endsAt` while running; `running && now > endsAt + 10 s` reads as idle;
// a file of another version reads as idle.
function pomodoroView(state, now) {
  if (!state || typeof state !== "object") return Model.idleView()
  if (Number(state.version) !== STATE_VERSION) return Model.idleView()
  var phase = Model.squish(state.phase) || "idle"
  var running = state.running === true
  var endsAt = Number(state.endsAt) || 0
  if (phase === "idle") return Model.idleView()
  if (running && now > endsAt + 10000) return Model.idleView()
  var remaining = running ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : Math.max(0, Math.floor(Number(state.remaining) || 0))
  var taskId = Model.str(state.taskId)
  var label = Model.squish(state.taskLabel)
  return { phase: phase, running: running, remaining: remaining, taskId: taskId, label: label, attached: taskId !== "" || label !== "" }
}

function parsePomodoroState(raw) {
  try {
    var data = JSON.parse(String(raw))
    return data && typeof data === "object" ? data : { phase: "idle" }
  } catch (e) {
    return { phase: "idle" }
  }
}
