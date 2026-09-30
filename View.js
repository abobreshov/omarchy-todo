.pragma library
.import "Model.js" as Model

// The view decisions and the copy (UX §3.1, §4.2, §4.4, §4.5, §4.7, §10.3):
// the list's order and the session's done rows, the focus line, the detail
// view's status line and tooltips, the transients and
// the IPC `dump()` view. Pure and total, as Model.js: the QML views bind to
// what these return and add nothing of their own.

var MSG_DONE_ATTACHED = "Done. p on the next task moves the pomodoro."

// The delete copy (UX §4.2, §4.4): the tooltip of the row's {del} ghost and
// of the detail view's button, and what both say once the row is armed.
var TIP_DELETE = "Delete (x x or Del)"
var TIP_DELETE_ARMED = "Click or x again to delete"
var CAPTION_ARMED = "click or x again to delete"

// ---------------------------------------------------------------- session

// `d` on an open row (UX §4.2 done handling): remember its pre-tick status
// so it keeps its place until the panel closes (UI-14), and say so when the
// pomodoro is attached to it (UX §6.4). null for any other action.
function tickDone(state, action) {
  var a = action || {}
  if (a.type !== "setStatus" || a.status !== "done") return null
  var it = Model.findItem(state.items, a.id)
  if (!it || it.status === "done") return null
  var next = {}
  var map = state.sessionDone || {}
  for (var k in map) next[k] = map[k]
  next[it.id] = it.status
  return { sessionDone: next, message: Model.isAttached(state.pomodoro, it.id) ? MSG_DONE_ATTACHED : "" }
}

// The session's done rows minus the ones that are no longer done: a
// reverted write, an external reopen or a delete. Everything that reads
// `sessionDone` reads this, so the status stays the one source of truth.
function pruneSessionDone(sessionDone, items) {
  var map = sessionDone || {}
  var out = {}
  for (var id in map) {
    var it = Model.findItem(items, id)
    if (it && it.status === "done") out[id] = map[id]
  }
  return out
}

// ---------------------------------------------------------------- list

function groupOf(status) { return status === "doing" ? 0 : (status === "done" ? 2 : 1) }

// UX §4.2 ordering: doing, todo, done; within a group by numeric id (cli)
// or insertion order (json). A row ticked done during this panel session
// keeps its pre-tick group (`sessionDone[id]` = that status; PRODUCT UI-14).
function sortForList(items, sessionDone) {
  var list = items || []
  var done = sessionDone || {}
  var decorated = []
  for (var i = 0; i < list.length; i++) {
    if (!list[i]) continue
    var status = done[list[i].id] ? done[list[i].id] : list[i].status
    decorated.push({ item: list[i], group: groupOf(status), index: i })
  }
  decorated.sort(function(a, b) {
    if (a.group !== b.group) return a.group - b.group
    if (Model.isNumericId(a.item.id) && Model.isNumericId(b.item.id)) return Number(a.item.id) - Number(b.item.id)
    return a.index - b.index
  })
  return decorated.map(function(d) { return d.item })
}

function visibleItems(items, sessionDone) {
  var done = sessionDone || {}
  return (items || []).filter(function(it) { return it && (it.status !== "done" || done[it.id]) })
}

function openCount(items) {
  return (items || []).filter(function(it) { return it && it.status !== "done" }).length
}

function countLabel(items) { return openCount(items) + " open" }

// A-D6: the focused task if it is doing, else the doing task with the lowest
// id (json ids: the first in insertion order).
function doingTask(items, focus) {
  var f = Model.focusTask(items, focus)
  if (f && f.status === "doing") return f
  var best = null
  var list = items || []
  for (var i = 0; i < list.length; i++) {
    var it = list[i]
    if (!it || it.status !== "doing") continue
    if (!best) best = it
    else if (Model.isNumericId(it.id) && Model.isNumericId(best.id) && Number(it.id) < Number(best.id)) best = it
  }
  return best
}

// The cursor rows of the list view: the focus line (row 0) when shown, then
// the sorted items (UX §4.2).
function listRows(focusLine, listItems) {
  var out = []
  if (focusLine) out.push({ kind: "focus", item: focusLine.item, selectable: focusLine.selectable })
  var list = listItems || []
  for (var i = 0; i < list.length; i++) out.push({ kind: "item", item: list[i], selectable: true })
  return out
}

// ---------------------------------------------------------------- copy

function taskRef(item, backend) {
  return backend === "cli" ? "#" + item.id : Model.pillLabel(item.name, 24)
}

function msgDoneRow(item, backend) { return taskRef(item, backend) + " is done · d reopens it" }

function msgTaskNotFound(id) { return "Task " + id + " not found." }

function emptyCopy(items) {
  var list = items || []
  if (list.length === 0) return "Nothing here yet. Press + to add a todo."
  if (openCount(list) === 0) return "All clear. Press + to add a todo."
  return null
}

function helpLine(view, backend) {
  if (view === "detail") return "Enter step · d done · s doing · f focus · p pomodoro · x x or Del delete · Esc back"
  return "n new · d done · s doing · f focus · p pomodoro · x x or Del delete · r reload" + (backend === "cli" ? " · R sync" : "") + " · Tab next panel"
}

// ---------------------------------------------------------------- row cluster

// UX §4.2 row anatomy, the right cluster: the plan progress, then three
// fixed slots: the focus mark or its ghost, the pomodoro mark or its ghost,
// and the {del} ghost. Each slot is always laid out and a ghost only fades
// in (opacity) while the row is hovered: a control made visible under the
// pointer takes the hover from the row, which hides it again, and the icons
// flicker (the hover glitch); a hidden control that keeps its space cannot.
// The armed delete (x, Delete, BackSpace or the ghost, once) replaces the
// progress and the first two slots with its caption; the {del} slot stays,
// `held` (shown and live without hover), so the second click lands where
// the first did. A done row keeps it: done rows can be deleted too.
function rowActions(item, ctx) {
  var c = ctx || {}
  var it = item || { id: "", status: "todo" }
  var armed = c.armed === true
  var isDone = it.status === "done"
  var isFocus = Model.isFocused(c.focus, it.id)
  var attached = Model.isAttached(c.pomodoro, it.id)
  return {
    armed: armed,
    caption: armed ? CAPTION_ARMED : "",
    progress: armed ? "" : Model.planProgress(it),
    focus: { mark: !armed && isFocus, ghost: !armed && !isFocus && !isDone, held: false, tooltip: "Set focus (f)" },
    pomodoro: {
      mark: !armed && attached,
      running: attached && c.pomodoro.running === true,
      ghost: !armed && !attached && !isDone,
      held: false,
      tooltip: "Start pomodoro (p)"
    },
    del: { mark: false, ghost: true, held: armed, tooltip: armed ? TIP_DELETE_ARMED : TIP_DELETE }
  }
}

// ---------------------------------------------------------------- focus line

// UX §4.2 focus line variants F0–F6. `actions` says which ghost buttons the
// line lays out (they fade in on hover, as the row ghosts): `pomodoro` = the
// (t) of F1 and F5, `clear` = the {x} of every line with a focus.
function focusLine(items, focus, pomodoro) {
  var pom = pomodoro || Model.idleView()
  var f = focus || { text: "", taskId: null }
  var task = Model.focusTask(items, f)
  var base = { variant: null, text: "", selectable: true, item: null, timer: "", timerGlyph: "", timerDim: false, hint: "", tooltip: "", actions: { pomodoro: false, clear: false } }
  if (task) {
    base.item = task
    base.text = task.name
    base.actions.clear = true
    var attached = Model.isAttached(pom, task.id)
    if (attached && pom.phase === "work" && pom.running) { base.variant = "F2"; base.timer = Model.formatTime(pom.remaining); base.timerGlyph = Model.G.pomodoro }
    else if (attached && pom.phase === "work") { base.variant = "F3"; base.timer = Model.formatTime(pom.remaining) + " paused"; base.timerGlyph = Model.G.pomodoro; base.timerDim = true }
    else if (attached) { base.variant = "F4"; base.timer = Model.formatTime(pom.remaining); base.timerGlyph = Model.G.brk; base.timerDim = true }
    else if (pom.phase === "work" && pom.taskId !== "") {
      base.variant = "F5"
      base.actions.pomodoro = true
      var other = Model.findItem(items, pom.taskId)
      base.hint = Model.G.pomodoro + " " + Model.formatTime(pom.remaining) + " on " + (other ? other.name : pom.label) + " · p moves it here"
    } else { base.variant = "F1"; base.actions.pomodoro = true }
    return base
  }
  if (f.text) {
    base.variant = "F6"
    base.text = f.text
    base.actions.clear = true
    base.tooltip = "Focus set outside the list. Enter makes it a task."
    return base
  }
  if ((items || []).length === 0) return null
  base.variant = "F0"
  base.text = "No focus · f on a task sets it"
  base.selectable = false
  return base
}

// ---------------------------------------------------------------- detail

// UX §4.4 status line.
function statusLine(item, ctx) {
  if (!item) return ""
  var c = ctx || {}
  var parts = [Model.statusGlyph(item.status) + " " + item.status]
  if (c.backend === "cli") parts.push("#" + item.id)
  var progress = Model.planProgress(item)
  if (progress !== "") parts.push("plan " + progress)
  if (item.notes && item.notes.length > 0) parts.push(item.notes.length + " note" + (item.notes.length === 1 ? "" : "s"))
  if (Model.isFocused(c.focus, item.id)) parts.push("focus")
  if (Model.isAttached(c.pomodoro, item.id)) parts.push(Model.G.pomodoro + " " + Model.formatTime(c.pomodoro.remaining))
  if (c.backend === "cli" && item.due) parts.push("due " + Model.dueLabel(item.due))
  return parts.join(" · ")
}

// UX §4.4 action-button tooltips, incl. the done-row rule of §4.5.
function actionTooltips(item, ctx) {
  var c = ctx || {}
  var it = item || { id: "", status: "todo" }
  var attached = Model.isAttached(c.pomodoro, it.id)
  var isDone = it.status === "done"
  var doneTip = "Done · d reopens it"
  var pomTip = attached ? (c.pomodoro.running ? "Pause pomodoro (p)" : "Resume pomodoro (p)") : "Start pomodoro (p)"
  return {
    doing: isDone ? doneTip : (it.status === "doing" ? "Back to todo (s)" : "Mark doing (s)"),
    done: isDone ? "Reopen (d)" : "Mark done (d)",
    focus: isDone ? doneTip : (Model.isFocused(c.focus, it.id) ? "Clear focus (f)" : "Set focus (f)"),
    pomodoro: isDone && !attached ? doneTip : pomTip,
    del: c.armed ? TIP_DELETE_ARMED : TIP_DELETE,
    doingEnabled: !isDone,
    focusEnabled: !isDone,
    pomodoroEnabled: !isDone || attached
  }
}

// ---------------------------------------------------------------- dump

// IPC `dump()` (UX §10.3, PLAN A3).
function dumpView(state) {
  var s = state || {}
  var items = s.items || []
  var sessionDone = s.sessionDone || {}
  var sorted = sortForList(items, sessionDone)
  var homes = Model.indexStreams(s.streams)
  var open = []
  var done = []
  for (var i = 0; i < sorted.length; i++) {
    var it = sorted[i]
    if (it.status !== "done") {
      var entry = { id: it.id, title: it.name, status: it.status }
      if (s.hasStreams === true) {
        entry.stream = it.stream
        entry.horizon = it.horizon
        entry.labels = it.labels.slice()
        entry.priority = it.priority
        entry.size = it.size
        if (Model.isOrphan(homes, it)) entry.orphan = true
      }
      open.push(entry)
    }
    else if (sessionDone[it.id]) done.push({ id: it.id, title: it.name })
  }
  var focus = s.focus || { text: "", taskId: null }
  return {
    version: 1,
    backend: s.backend || Model.DEFAULTS.backend,
    cliPath: s.cliPath || Model.DEFAULTS.cliPath,
    view: s.view || "list",
    stale: s.stale === true,
    error: s.error ? { kind: s.error.kind, message: s.error.message || "" } : null,
    pill: s.pill || { glyph: Model.G.icon, label: "", tooltip: "", urgent: false, dimmed: false },
    focus: { text: focus.text || "", taskId: focus.taskId === undefined ? null : focus.taskId },
    open: open,
    done: done,
    banner: s.banner || null,
    footer: s.footer ? { text: s.footer.text, urgent: s.footer.urgent === true } : null,
    message: s.message || null
  }
}
