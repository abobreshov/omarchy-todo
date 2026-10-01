.pragma library
.import "Model.js" as Model
.import "Priority.js" as Priority
.import "Queue.js" as Queue

// Values, not indices, survive reads and optimistic id replacement (UX §24.3).
function options(kind) {
  return kind === "priority" ? [null].concat(Priority.NAMES.map(function(n) { return Priority.LEVELS[n] })) : [null].concat(Priority.SIZES)
}
function labels(kind) {
  return kind === "priority" ? ["None"].concat(Priority.NAMES.map(function(n) { return n.charAt(0).toUpperCase() + n.slice(1) })) : ["None"].concat(Priority.SIZES)
}
function current(kind, item) {
  if (!item) return null
  return kind === "priority" ? (item.priority === null ? null : Priority.LEVELS[Priority.levelOf(item.priority)]) : item.size
}
function sizeError(item) { return "#" + item.id + " is " + item.horizon + ": size is for short-term tasks only" }
function entryHelp() { return ["!", "priority", "·", "z", "size"].join(" ") }
function help(kind) { return "[ ] choose · 0-" + (kind === "priority" ? "4" : "5") + " pick · Enter set · Esc cancel" }

// null means the event belongs to Keys/Tabs; an open picker consumes every
// input except lifecycle changes. Reads validate the task in the whole store.
function reduce(ui, event, ctx) {
  var next = {}, actions = [], ev = event || {}, c = ctx || {}
  for (var k in ui) next[k] = ui[k]
  var mode = next.picker || null, key = ev.type === "key" ? ev.key : ""
  function result() { return { ui: next, actions: actions } }
  function message(text) { actions.push({ type: "message", text: text }) }
  if (next.view === "compose" || next.moving) return null
  if (!mode) {
    if (key !== "!" && key !== "z") return null
    next.armedId = ""; next.armedAt = 0
    if (c.busy || ["list", "detail"].indexOf(next.view) === -1 || (next.view === "list" && c.currentTab === "done")) return result()
    if (!c.item) return result()
    var error = Priority.unavailable(c)
    if (error !== "") { message(error); return result() }
    if (key === "z" && c.item.horizon !== "short") { message(sizeError(c.item)); return result() }
    var kind = key === "!" ? "priority" : "size"
    next.picker = { kind: kind, id: c.item.id, choice: current(kind, c.item) }
    return result()
  }
  if (["open", "close", "resetCursor", "selectTask"].indexOf(ev.type) !== -1 || (ev.type === "storeError" && ev.error && ev.error.kind !== "busy")) {
    next.picker = null
    return { ui: next, actions: actions, continueEvent: true }
  }
  if (ev.type === "rows" && Priority.unavailable(c) !== "") { next.picker = null; return result() }
  var id = Queue.realId(mode.id, c.idMap)
  var item = Model.findItem(c.items || [], id) || Model.findItem(c.items || [], mode.id)
  if (item) id = item.id // Before the read, the optimistic document still uses its temporary id.
  if (!item || (mode.kind === "size" && item.horizon !== "short")) {
    next.picker = null
    if (item) message(sizeError(item))
    return result()
  }
  mode = { kind: mode.kind, id: id, choice: mode.choice }
  next.picker = mode
  if (ev.type === "esc" || key === (mode.kind === "priority" ? "!" : "z")) { next.picker = null; return result() }
  if (key === "?") { next.help = !next.help; return result() }
  if (c.busy) return result()
  var values = options(mode.kind), at = values.indexOf(mode.choice)
  if (key === "[" || key === "]") mode.choice = values[Math.max(0, Math.min(values.length - 1, at + (key === "]" ? 1 : -1)))]
  var digit = /^[0-9]$/.test(key) ? Number(key) : -1
  var pick = ev.type === "enter" || ev.type === "space" || (digit >= 0 && digit < values.length) || (ev.type === "pickOption" && values.indexOf(ev.value) !== -1)
  if (pick) {
    var value = ev.type === "pickOption" ? ev.value : digit >= 0 ? values[digit] : mode.choice
    // Compare options: a tuned 80 remains 80 when High is confirmed.
    if (value !== current(mode.kind, item)) actions.push({ type: mode.kind === "priority" ? "setPriority" : "setSize", id: id, value: value })
    next.picker = null
  }
  return result()
}
