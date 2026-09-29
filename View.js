.pragma library
.import "Model.js" as Model
.import "Errors.js" as Errors

// The view decisions and the copy (UX §3.1, §4.2, §4.4, §4.5, §4.7, §10.3):
// the list's order and the session's done rows, the pill, the footer, the
// focus line, the detail view's status line and tooltips, the transients and
// the IPC `dump()` view. Pure and total, as Model.js: the QML views bind to
// what these return and add nothing of their own.

var MSG_DONE_ATTACHED = "Done. p on the next task moves the pomodoro."

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

// ---------------------------------------------------------------- pill

function failingTargets(sync) {
  return (sync || []).filter(function(t) { return t && t.enabled && t.error })
}

// UX §3.1 / DECISIONS A-D6: loading -> backend error -> doing task -> focus
// text -> open count -> empty; the sync overlay on states 3-6 in cli mode;
// vertical bars carry the state in the glyph only.
function pillState(input) {
  var cli = input.backend === "cli"
  var items = input.items || []
  var focus = input.focus || { text: "", taskId: null }
  var max = input.vertical ? 0 : input.maxChars
  var out
  if (cli && !input.loaded && !input.error)
    return { glyph: Model.G.icon, label: "", tooltip: "Checklist Todo\nLoading…", urgent: false, dimmed: true }
  if (cli && input.error)
    return { glyph: Model.G.icon, label: "", tooltip: "Checklist Todo\n" + Errors.errorShort(input.error) + ". Click for details.", urgent: true, dimmed: false }
  var open = openCount(items)
  var doing = doingTask(items, focus)
  if (doing) {
    var more = items.filter(function(it) { return it && it.status === "doing" }).length - 1
    var tip = "Doing: " + Model.tooltip(doing.name) + (more > 0 ? " (+" + more + " more)" : "")
    if (focus.text && focus.text !== doing.name) tip += "\nFocus: " + Model.tooltip(focus.text)
    tip += "\n" + Model.todosWord(open)
    out = { glyph: Model.G.doing, label: Model.pillLabel(doing.name, max), tooltip: tip, urgent: false, dimmed: false }
  } else if (focus.text) {
    out = { glyph: Model.G.focus, label: Model.pillLabel(focus.text, max), tooltip: "Focus: " + Model.tooltip(focus.text) + "\n" + Model.todosWord(open), urgent: false, dimmed: false }
  } else if (open > 0) {
    out = { glyph: Model.G.icon, label: input.vertical ? "" : String(open), tooltip: Model.todosWord(open) + "\nNo focus set", urgent: false, dimmed: false }
  } else {
    out = { glyph: Model.G.icon, label: "", tooltip: "Checklist Todo\nNothing open. Click to add one.", urgent: false, dimmed: true }
  }
  if (cli) {
    var failing = failingTargets(input.sync)
    if (failing.length === 1) {
      out.glyph = Model.G.syncAlert
      out.tooltip += "\n" + Model.targetName(failing[0].name) + " sync failed " + Model.ago(failing[0].lastAttemptAt, input.now)
    } else if (failing.length > 1) {
      out.glyph = Model.G.syncAlert
      out.tooltip += "\n" + failing.length + " syncs failed"
    }
  }
  return out
}

// ---------------------------------------------------------------- footer

// The UX §4.7 reason per sync-target error kind.
function reason(error) {
  if (!error) return ""
  switch (error.kind) {
    case "auth": return "signed out. Run: basecamp auth login"
    case "auth_unreachable": return "credentials not reachable from todocli.service; terminal sync still works"
    case "list_gone": return "synced list trashed or archived in Basecamp; nothing changed here"
    case "removals_held": {
      var m = /(\d+)/.exec(error.message || "")
      return (m ? m[1] + " " : "") + "removals held; review, then todocli sync basecamp --accept-remote-removals"
    }
    case "offline": return "offline or Basecamp unreachable; retrying"
    case "rate_limited": return "rate limited by Basecamp; retrying"
    case "cli_missing": return "basecamp CLI not found"
    case "vault_missing": return "vault folder not found"
    case "write_failed": return "could not write the note"
    default: {
      var line = Model.firstLine(error.message)
      return (line === "" ? String(error.kind || "error") : line).slice(0, 60)
    }
  }
}

function footerTooltip(sync, now) {
  var out = []
  var list = sync || []
  for (var i = 0; i < list.length; i++) {
    var t = list[i]
    if (!t) continue
    var name = Model.targetName(t.name)
    if (!t.enabled) out.push(name + ": off")
    else if (t.error) out.push(name + ": failed " + Model.ago(t.lastAttemptAt, now) + " — " + reason(t.error))
    else out.push(name + ": ok " + Model.ago(t.lastOkAt, now))
  }
  return out.join("\n")
}

// UX §4.7 footer (cli mode only). `text` excludes the glyph; dump.footer
// shows {text, urgent}.
function footer(sync, now, opts) {
  var tip = footerTooltip(sync, now)
  var enabled = (sync || []).filter(function(t) { return t && t.enabled })
  if (opts && opts.syncing) return { glyph: Model.G.sync, text: "Syncing…", urgent: false, tooltip: tip, action: null }
  if (enabled.length === 0) return { glyph: Model.G.sync, text: "todocli · local only", urgent: false, tooltip: tip, action: null }
  var failing = failingTargets(enabled)
  if (failing.length === 1)
    return { glyph: Model.G.syncAlert, text: Model.targetName(failing[0].name) + " sync failed " + Model.ago(failing[0].lastAttemptAt, now) + " · R retry", urgent: true, tooltip: tip, action: "syncNow" }
  if (failing.length > 1)
    return { glyph: Model.G.syncAlert, text: failing.length + " syncs failed · R retry", urgent: true, tooltip: tip, action: "syncNow" }
  var stalest = null
  var oldestOk = null
  var never = false
  for (var i = 0; i < enabled.length; i++) {
    var t = enabled[i]
    var attempt = Model.toMillis(t.lastAttemptAt)
    if (!isNaN(attempt) && t.intervalSec > 0 && now - attempt > 3 * t.intervalSec * 1000 && (stalest === null || attempt < stalest)) stalest = attempt
    var ok = Model.toMillis(t.lastOkAt)
    if (isNaN(ok)) never = true
    else if (oldestOk === null || ok < oldestOk) oldestOk = ok
  }
  if (stalest !== null)
    return { glyph: Model.G.syncOff, text: "Sync daemon idle since " + Model.ago(stalest, now) + " · R sync now", urgent: false, tooltip: tip, action: "syncNow" }
  if (never)
    return { glyph: Model.G.sync, text: "todocli · not synced yet · R sync now", urgent: false, tooltip: tip, action: "syncNow" }
  return { glyph: Model.G.sync, text: "todocli · synced " + Model.ago(oldestOk, now), urgent: false, tooltip: tip, action: null }
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
  if (view === "detail") return "Enter step · d done · s doing · f focus · p pomodoro · x x delete · Esc back"
  return "n new · d done · s doing · f focus · p pomodoro · x x delete · r reload" + (backend === "cli" ? " · R sync" : "") + " · Tab next panel"
}

// ---------------------------------------------------------------- focus line

// UX §4.2 focus line variants F0–F6.
function focusLine(items, focus, pomodoro) {
  var pom = pomodoro || Model.idleView()
  var f = focus || { text: "", taskId: null }
  var task = Model.focusTask(items, f)
  var base = { variant: null, text: "", selectable: true, item: null, timer: "", timerGlyph: "", timerDim: false, hint: "", tooltip: "" }
  if (task) {
    base.item = task
    base.text = task.name
    var attached = Model.isAttached(pom, task.id)
    if (attached && pom.phase === "work" && pom.running) { base.variant = "F2"; base.timer = Model.formatTime(pom.remaining); base.timerGlyph = Model.G.pomodoro }
    else if (attached && pom.phase === "work") { base.variant = "F3"; base.timer = Model.formatTime(pom.remaining) + " paused"; base.timerGlyph = Model.G.pomodoro; base.timerDim = true }
    else if (attached) { base.variant = "F4"; base.timer = Model.formatTime(pom.remaining); base.timerGlyph = Model.G.brk; base.timerDim = true }
    else if (pom.phase === "work" && pom.taskId !== "") {
      base.variant = "F5"
      var other = Model.findItem(items, pom.taskId)
      base.hint = Model.G.pomodoro + " " + Model.formatTime(pom.remaining) + " on " + (other ? other.name : pom.label) + " · p moves it here"
    } else base.variant = "F1"
    return base
  }
  if (f.text) {
    base.variant = "F6"
    base.text = f.text
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
    del: c.armed ? "Click again to delete" : "Delete (x x)",
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
  var open = []
  var done = []
  for (var i = 0; i < sorted.length; i++) {
    var it = sorted[i]
    if (it.status !== "done") open.push({ id: it.id, title: it.name, status: it.status })
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
