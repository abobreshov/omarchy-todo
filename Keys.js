.pragma library
.import "Model.js" as Model

// Key resolution and the panel's view-state reducer (UX §4.5, §7; PLAN
// §6.8, A20). Pure: `keyAction` turns a key into a store action (or a
// transient message) given the row under the cursor; `reduceUi` runs the
// view machine (list / compose / detail / error, cursor, armed delete,
// help line). Panel.qml forwards kit signals as events and applies the
// returned actions to the store. The tables in UX §4.5 and PRODUCT UI-1..10
// are the fixtures.

var ARM_MS = 3000

function initialUi() {
  return {
    view: "list",          // list | compose | detail | error
    cursor: 0,             // index into ctx.rows (the focus line is row 0 when shown)
    stepCursor: 0,         // detail view: index into the plan steps
    selectedId: "",        // detail view: the task shown
    composeField: "name",  // name | description
    name: "",
    description: "",
    armedId: "",           // pending delete (x once)
    armedAt: 0,
    help: false
  }
}

function copyUi(ui) {
  var out = {}
  for (var k in ui) out[k] = ui[k]
  return out
}

function clampCursor(index, count) {
  if (!(count > 0)) return 0
  if (index < 0) return 0
  if (index >= count) return count - 1
  return index
}

// The status is the one source of truth for "done"; `sessionDone` only
// drives ordering and visibility (Model.sortForList, Model.visibleItems).
function isDoneRow(item) {
  return !!item && item.status === "done"
}

function attachedTo(item, ctx) {
  var pom = ctx.pomodoro
  return !!item && !!pom && pom.phase !== "idle" && pom.taskId === item.id
}

function isFocused(item, ctx) {
  return !!item && !!ctx.focus && ctx.focus.taskId === item.id
}

// Resolve one text key. `ctx`: { item, onFocusLine, focus, backend,
// sessionDone, pomodoro }. Returns an action object or null.
function keyAction(view, key, ctx) {
  var c = ctx || {}
  if (view === "compose") return null
  if (key === "r") return { type: "refresh" }
  if (key === "R") return { type: "syncNow" }
  if (view === "error") return null
  if (key === "?") return { type: "toggleHelp" }
  if (view === "list" && (key === "n" || key === "N" || key === "+")) return { type: "compose" }
  var item = c.item || null
  if (c.onFocusLine && !item) {
    // F6 (free-text focus) or F0 (no focus): only the focus-wide keys apply.
    var hasText = !!(c.focus && c.focus.text)
    if (key === "p") return hasText ? { type: "startPomodoro", id: "focus" } : null
    if (key === "f") return hasText ? { type: "focus", id: "clear" } : null
    return null
  }
  if (!item) return null
  var done = isDoneRow(item)
  switch (key) {
    case "d":
      return { type: "setStatus", id: item.id, status: done ? "todo" : "done" }
    case "s":
      if (done) return { type: "message", text: Model.msgDoneRow(item, c.backend) }
      return { type: "setStatus", id: item.id, status: item.status === "doing" ? "todo" : "doing" }
    case "f":
      if (done) return { type: "message", text: Model.msgDoneRow(item, c.backend) }
      return { type: "focus", id: isFocused(item, c) ? "clear" : item.id }
    case "p":
      if (attachedTo(item, c)) return { type: "pausePomodoro" }
      if (done) return { type: "message", text: Model.msgDoneRow(item, c.backend) }
      return { type: "startPomodoro", id: item.id }
    default:
      return null
  }
}

function rowAt(ui, ctx) {
  var rows = ctx.rows || []
  if (rows.length === 0) return null
  return rows[clampCursor(ui.cursor, rows.length)] || null
}

// The item a key acts on: the detail task in the detail view, else the
// cursor row's item (the focus line's task when the cursor sits there).
function keyContext(ui, ctx) {
  var c = {
    backend: ctx.backend, focus: ctx.focus, sessionDone: ctx.sessionDone, pomodoro: ctx.pomodoro,
    item: null, onFocusLine: false
  }
  if (ui.view === "detail") {
    c.item = findInRows(ctx, ui.selectedId)
    return c
  }
  var row = rowAt(ui, ctx)
  if (!row) return c
  c.item = row.item || null
  c.onFocusLine = row.kind === "focus"
  return c
}

function findInRows(ctx, id) {
  var rows = ctx.rows || []
  for (var i = 0; i < rows.length; i++)
    if (rows[i] && rows[i].item && rows[i].item.id === id) return rows[i].item
  return null
}

function disarm(ui) {
  ui.armedId = ""
  ui.armedAt = 0
}

function leaveCompose(ui) {
  ui.view = "list"
  ui.composeField = "name"
  ui.name = ""
  ui.description = ""
}

function openDetail(ui, id) {
  ui.view = "detail"
  ui.selectedId = id
  ui.stepCursor = 0
  disarm(ui)
}

function backToList(ui) {
  ui.view = "list"
  ui.selectedId = ""
  ui.stepCursor = 0
  disarm(ui)
}

// Enter / Space / Right / l on the list: open the cursor row.
function activateRow(ui, ctx, actions) {
  var row = rowAt(ui, ctx)
  if (!row || row.selectable === false) return
  if (row.kind === "focus" && !row.item) {
    // F6: compose pre-filled with the focus text.
    ui.view = "compose"
    ui.composeField = "name"
    ui.name = ctx.prefill || ""
    ui.description = ""
    disarm(ui)
    actions.push({ type: "composeOpened", prefill: ui.name })
    return
  }
  if (row.item) openDetail(ui, row.item.id)
}

function handleDelete(ui, ctx, now, actions) {
  var id = ""
  if (ui.view === "detail") id = ui.selectedId
  else {
    var row = rowAt(ui, ctx)
    if (row && row.kind === "item" && row.item) id = row.item.id
  }
  if (id === "") { disarm(ui); return }
  if (ui.armedId === id && now - ui.armedAt <= ARM_MS) {
    disarm(ui)
    actions.push({ type: "remove", id: id })
    if (ui.view === "detail") backToList(ui)
    return
  }
  ui.armedId = id
  ui.armedAt = now
}

// Events: open, close, storeError{error}, selectTask{id}, key{key,now},
// text{text}, enter, space, esc, tab{direction}, move{dx,dy}, hover{index},
// delete{now}, tick{now}. `ctx`: { rows, steps, backend, focus,
// sessionDone, pomodoro, prefill }.
function reduceUi(ui, event, ctx) {
  var next = copyUi(ui)
  var actions = []
  var c = ctx || {}
  var ev = event || {}
  var now = ev.now || 0
  switch (ev.type) {
    case "open":
      backToList(next)
      next.cursor = 0
      next.help = false
      leaveCompose(next)
      break
    case "close":
      backToList(next)
      next.cursor = 0
      next.help = false
      leaveCompose(next)
      break
    case "storeError":
      // E4/E7/E8 replace the list body; E5 (busy) is a banner above it.
      if (ev.error && ev.error.kind !== "busy") {
        next.view = "error"
        disarm(next)
      } else if (next.view === "error") next.view = "list"
      break
    case "selectTask":
      openDetail(next, String(ev.id))
      break
    case "text":
      if (next.view === "compose") {
        if (next.composeField === "name") next.name = String(ev.text)
        else next.description = String(ev.text)
      }
      break
    case "tab":
      if (next.view === "compose") next.composeField = next.composeField === "name" ? "description" : "name"
      else actions.push({ type: "switchPanel", direction: ev.direction })
      break
    case "esc":
      if (next.view === "compose") leaveCompose(next)
      else if (next.view === "detail") backToList(next)
      else if (next.armedId !== "") disarm(next)
      else actions.push({ type: "close" })
      break
    case "enter":
    case "space":
      if (next.view === "compose") {
        if (ev.type === "space") break
        if (next.composeField === "name") {
          if (Model.squish(next.name) !== "") next.composeField = "description"
        } else {
          if (Model.squish(next.name) !== "") {
            actions.push({ type: "add", name: Model.squish(next.name), description: Model.squish(next.description) })
            leaveCompose(next)
          } else next.composeField = "name"
        }
      } else if (next.view === "detail") {
        if (c.steps > 0) actions.push({ type: "toggleStep", id: next.selectedId, n: clampCursor(next.stepCursor, c.steps) + 1 })
      } else if (next.view === "list") {
        disarm(next)
        activateRow(next, c, actions)
      }
      break
    case "move":
      disarm(next)
      if (next.view === "list") {
        if (ev.dx > 0) activateRow(next, c, actions)
        else if (ev.dy) next.cursor = clampCursor(next.cursor + ev.dy, (c.rows || []).length)
      } else if (next.view === "detail") {
        if (ev.dx < 0) backToList(next)
        else if (ev.dy) next.stepCursor = clampCursor(next.stepCursor + ev.dy, c.steps || 0)
      }
      break
    case "hover":
      if (next.view === "list" && ev.index >= 0 && ev.index < (c.rows || []).length) {
        if (next.cursor !== ev.index) disarm(next)
        next.cursor = ev.index
      }
      break
    case "delete":
      if (next.view === "list" || next.view === "detail") handleDelete(next, c, now, actions)
      break
    case "tick":
      if (next.armedId !== "" && now - next.armedAt > ARM_MS) disarm(next)
      break
    case "key": {
      if (next.view === "compose") break
      disarm(next)
      var action = keyAction(next.view, ev.key, keyContext(next, c))
      if (!action) break
      if (action.type === "toggleHelp") next.help = !next.help
      else if (action.type === "compose") {
        next.view = "compose"
        next.composeField = "name"
        next.name = ""
        next.description = ""
        actions.push({ type: "composeOpened", prefill: "" })
      } else actions.push(action)
      break
    }
    default:
      break
  }
  return { ui: next, actions: actions }
}
