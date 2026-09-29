.pragma library

// Pure helpers for the todo panel. Everything here is total: a malformed or
// missing value becomes an empty string, an empty list or a null rather than
// an exception, so a torn or hand-edited save file, or a surprising todocli
// reply, can never blank the widget. No I/O, no QML: the file runs under
// node --test as well (PLAN §9.4).
//
// Storage shape (version 2; version 1 files read as all-todo, PLAN A17):
//   { "version": 2, "focus": { "text": "", "taskId": null },
//     "todos": [ { "id", "name", "description", "status", "plan", "notes" } ] }
//
// Item model (both backends): { id: string, uid, name, description, status,
//   plan: [{text, done}], notes: [{at, text}], due, author }.

var STATUSES = ["todo", "doing", "done"]

// Glyphs from UX §2 (JetBrainsMono Nerd Font). Token names in the comments.
function cp(n) { return String.fromCodePoint(n) }
var G = {
  icon: cp(0xF0132),      // [#]  md-checkbox_marked (plugin icon)
  todo: cp(0xF0131),      // [ ]  md-checkbox_blank_outline
  doing: cp(0xF0856),     // [-]  md-checkbox_intermediate
  done: cp(0xF0C52),      // [x]  md-checkbox_outline
  focus: cp(0xF04FE),     // (o)  md-target
  pomodoro: cp(0xF2F2),   // (t)  fa-stopwatch
  brk: cp(0xF0176),       // (c)  md-coffee
  sync: cp(0xF04E6),      // (~)  md-sync
  syncAlert: cp(0xF04E7), // (!~) md-sync_alert
  syncOff: cp(0xF04E8),   // (/~) md-sync_off
  alert: cp(0xF05D6),     // (!)  md-alert_circle_outline
  lock: cp(0xF0341),      // (L)  md-lock_outline
  plus: cp(0xF0415),      // (+)  md-plus
  back: cp(0xF004D),      // <-   md-arrow_left
  del: cp(0xF09E7),       // {del} md-delete_outline
  close: cp(0xF0156),     // {x}  md-close
  refresh: cp(0xF0450)    // {r}  md-refresh
}

var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

var MODULE = "abobreshov.todo"
// The four settings and their defaults (PLAN §6.5, A18; DECISIONS A-D5).
var DEFAULTS = { backend: "json", cliPath: "todocli", pomodoroTarget: "abobreshov.pomodoro", maxChars: 24 }

var NO_FOCUS = "no focus"
var MSG_SYNC_NEEDS_CLI = "Sync needs backend = cli."
var MSG_SYNC_RUNNING = "Sync already running."
var MSG_DONE_ATTACHED = "Done. p on the next task moves the pomodoro."
var MSG_UNREADABLE = "Couldn't read todos.json. Fix or delete it — changes won't be saved until then."

// ---------------------------------------------------------------- text

function makeId() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

function str(value) { return value === undefined || value === null ? "" : String(value) }

function strOrNull(value) {
  var s = str(value)
  return s === "" ? null : s
}

function squish(value) {
  return str(value).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "")
}

// Kit-owned Text (pill, tooltip) is not under this plugin's textFormat rule,
// so user text handed to it loses its angle brackets (PLAN A10).
function plainAngle(value) {
  return squish(value).replace(/</g, "‹").replace(/>/g, "›")
}

function firstLine(text) {
  var s = str(text)
  var i = s.indexOf("\n")
  return (i === -1 ? s : s.slice(0, i)).replace(/^\s+|\s+$/g, "")
}

function lines(text, n) {
  var out = []
  var parts = str(text).split("\n")
  for (var i = 0; i < parts.length && out.length < n; i++) {
    var l = parts[i].replace(/^\s+|\s+$/g, "")
    if (l !== "") out.push(l)
  }
  return out
}

function isNumericId(id) { return /^[0-9]+$/.test(String(id)) }

function todosWord(n) { return n + " todo" + (n === 1 ? "" : "s") }

// ---------------------------------------------------------------- items

function normalizeStatus(v) {
  var s = squish(v).toLowerCase()
  return STATUSES.indexOf(s) === -1 ? "todo" : s
}

function normalizePlan(plan) {
  var out = []
  if (!Array.isArray(plan)) return out
  for (var i = 0; i < plan.length; i++) {
    var step = plan[i]
    if (!step || typeof step !== "object") continue
    var text = squish(step.text)
    if (text === "") continue
    out.push({ text: text, done: step.done === true || step.done === 1 || step.done === "true" })
  }
  return out
}

function normalizeNotes(notes) {
  var out = []
  if (!Array.isArray(notes)) return out
  for (var i = 0; i < notes.length; i++) {
    var note = notes[i]
    if (!note || typeof note !== "object") continue
    var text = squish(note.text)
    if (text === "") continue
    out.push({ at: str(note.at), text: text })
  }
  return out
}

function normalize(item) {
  if (!item || typeof item !== "object") return null
  var name = squish(item.name)
  if (name === "") return null
  var id = squish(item.id)
  if (id === "") id = makeId()
  return {
    id: id,
    uid: strOrNull(item.uid),
    name: name,
    description: squish(item.description),
    status: normalizeStatus(item.status),
    plan: normalizePlan(item.plan),
    notes: normalizeNotes(item.notes),
    due: strOrNull(item.due),
    author: strOrNull(item.author)
  }
}

function copyItem(item) {
  return {
    id: item.id, uid: item.uid, name: item.name, description: item.description, status: item.status,
    plan: item.plan.map(function(s) { return { text: s.text, done: s.done } }),
    notes: item.notes.map(function(n) { return { at: n.at, text: n.text } }),
    due: item.due, author: item.author
  }
}

function findItem(items, id) {
  if (!items) return null
  var key = String(id)
  for (var i = 0; i < items.length; i++)
    if (items[i] && items[i].id === key) return items[i]
  return null
}

function normalizeFocus(focus, items) {
  var text = ""
  var taskId = null
  if (typeof focus === "string") text = squish(focus)
  else if (focus && typeof focus === "object") {
    text = squish(focus.text)
    if (focus.taskId !== undefined && focus.taskId !== null && squish(focus.taskId) !== "") taskId = squish(focus.taskId)
  }
  if (taskId !== null && items && !findItem(items, taskId)) taskId = null
  return { text: text, taskId: taskId }
}

function emptyDocument() { return { ok: true, focus: { text: "", taskId: null }, todos: [] } }

// The json store's reader. v1 (upstream `{version: 1, todos}` or a bare
// array) reads as all-todo with an empty focus; v2 carries status, plan,
// notes and the focus link. A non-empty file that does not parse is E14: the
// caller shows the banner and blocks saves, never overwriting the file.
function parseDocument(raw) {
  var text = raw === undefined || raw === null ? "" : String(raw)
  if (squish(text) === "") return emptyDocument()
  var data
  try {
    data = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: "unparsable" }
  }
  var list = null
  var focus = null
  if (Array.isArray(data)) list = data
  else if (data && typeof data === "object") {
    if (Array.isArray(data.todos)) list = data.todos
    if (data.version === 2) focus = data.focus
  }
  var out = []
  var seen = {}
  if (list) {
    for (var i = 0; i < list.length; i++) {
      var item = normalize(list[i])
      if (!item) continue
      if (seen[item.id]) item.id = makeId()
      seen[item.id] = true
      out.push(item)
    }
  }
  return { ok: true, focus: normalizeFocus(focus, out), todos: out }
}

function serializeDocument(doc) {
  var list = []
  var source = doc && Array.isArray(doc.todos) ? doc.todos : (doc && Array.isArray(doc.items) ? doc.items : [])
  for (var i = 0; i < source.length; i++) {
    var item = normalize(source[i])
    if (item) list.push({ id: item.id, name: item.name, description: item.description, status: item.status, plan: item.plan, notes: item.notes })
  }
  var focus = normalizeFocus(doc ? doc.focus : null, list)
  return JSON.stringify({ version: 2, focus: focus, todos: list }, null, 2) + "\n"
}

// ---------------------------------------------------------------- cli

function protocolError(message) {
  return { ok: false, error: { kind: "protocol", message: message } }
}

function normalizeSync(sync) {
  var out = []
  if (!Array.isArray(sync)) return out
  for (var i = 0; i < sync.length; i++) {
    var t = sync[i]
    if (!t || typeof t !== "object") continue
    var err = t.error && typeof t.error === "object" ? { kind: squish(t.error.kind) || "error", message: str(t.error.message) } : null
    out.push({
      name: squish(t.name),
      enabled: t.enabled === true || t.enabled === "true",
      lastOkAt: t.lastOkAt === undefined || t.lastOkAt === null ? null : t.lastOkAt,
      lastAttemptAt: t.lastAttemptAt === undefined || t.lastAttemptAt === null ? null : t.lastAttemptAt,
      intervalSec: Number(t.intervalSec) || 0,
      error: err
    })
  }
  return out
}

// `board --json` (PLAN §3.7, A39) -> { ok, items, focus, sync } or the
// protocol error (E8) for a document this panel does not understand.
function fromCli(raw) {
  var data = raw
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw)
    } catch (e) {
      return protocolError("todocli answered, but not with JSON")
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return protocolError("todocli answered, but not with a JSON document")
  if (data.version !== 1) return protocolError("unknown JSON schema version " + JSON.stringify(data.version === undefined ? null : data.version))
  if (!Array.isArray(data.tasks)) return protocolError("the document has no tasks list")
  var items = []
  for (var i = 0; i < data.tasks.length; i++) {
    var t = data.tasks[i]
    if (!t || typeof t !== "object") continue
    var item = normalize({
      id: t.id, uid: t.uid, name: t.title, description: t.description, status: t.status,
      plan: t.plan, notes: t.notes, due: t.due, author: t.author
    })
    if (item) items.push(item)
  }
  var focus = { text: squish(data.focus), taskId: strOrNull(data.focus_task) }
  return { ok: true, items: items, focus: focus, sync: normalizeSync(data.sync) }
}

// The reply of a write is the affected task as one JSON object (§3.6): an
// optimistic add's temporary id maps to its `id`, so a key pressed on the
// new row before the re-read still names the right task (A34).
function rememberId(idMap, tempId, out) {
  var map = idMap || {}
  var data
  try {
    data = JSON.parse(String(out))
  } catch (e) {
    return map
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || data.id === undefined || data.id === null) return map
  var next = {}
  for (var k in map) next[k] = map[k]
  next[String(tempId)] = String(data.id)
  return next
}

function withRealId(action, idMap) {
  var map = idMap || {}
  if (!action || action.id === undefined || map[action.id] === undefined) return action
  var out = {}
  for (var k in action) out[k] = action[k]
  out.id = map[action.id]
  return out
}

// Exit mapping of UX §7 / PLAN A34. A binary that cannot be spawned reaches
// here as `spawnFailed` (ArgvProcess); a wrapper script that cannot find the
// real binary exits 127, which reads the same.
function classifyExit(code, stderr, spawnFailed) {
  if (spawnFailed || code === 127) return { kind: "missing", message: ERRORS.missing.reason }
  if (code === 0) return null
  if (code === 75) return { kind: "busy", message: ERRORS.busy.reason }
  var head = lines(stderr, 3)
  return { kind: "failed", message: head.length ? head.join("\n") : "todocli exited " + code }
}

function errorCopy(error) { return ERRORS[error && error.kind] || ERRORS.failed }

function errorShort(error) { return error ? errorCopy(error).short : "" }

function unavailable(error) { return error ? "unavailable: " + errorCopy(error).reason : "unavailable" }

// ---------------------------------------------------------------- mutations
// One action vocabulary, shared by the keys (Keys.js emits it), the argv
// (Argv.forAction maps it to a todocli command) and both stores (they apply
// it through `reduce`):
//   {type: "add", name, description}   {type: "setStatus", id, status}
//   {type: "focus", id | "clear"}      {type: "toggleStep", id, n}
//   {type: "remove", id}
// Every mutator returns the same shape, {ok, doc: {items, focus}, reply,
// action, item}: new arrays and the inputs untouched, so a failed cli write
// is reverted by keeping the previous doc; `reply` is the IPC reply of UX
// §10.3 (the clean name for add, "ok", or the refusal); `action` is the
// normalised action to persist (squished text, string ids, numeric step).

function docOf(doc) {
  var d = doc || {}
  return { items: d.items || [], focus: normalizeFocus(d.focus, null) }
}

function refused(doc, reply) { return { ok: false, doc: doc, reply: reply, action: null, item: null } }

function accepted(doc, reply, action, item) { return { ok: true, doc: doc, reply: reply, action: action, item: item || null } }

function replaceItem(items, id, updater) {
  return items.map(function(it) {
    if (!it || it.id !== String(id)) return it
    var copy = copyItem(it)
    updater(copy)
    return copy
  })
}

function clearFocusIf(focus, id) {
  return { text: focus.text, taskId: focus.taskId === String(id) ? null : focus.taskId }
}

function addItem(doc, name, description) {
  var d = docOf(doc)
  var cleanName = squish(name)
  if (cleanName === "") return refused(d, "empty")
  var item = normalize({ id: makeId(), name: cleanName, description: description, status: "todo" })
  return accepted({ items: d.items.concat([item]), focus: d.focus }, cleanName, { type: "add", name: cleanName, description: item.description }, item)
}

function setStatus(doc, id, status) {
  var d = docOf(doc)
  var s = normalizeStatus(status)
  if (s !== String(status)) return refused(d, "bad status")
  if (!findItem(d.items, id)) return refused(d, "unknown id")
  var items = replaceItem(d.items, id, function(it) { it.status = s })
  // A focused task is always doing: leaving doing clears the link, the
  // free text stays (PRODUCT UC-5 A2b).
  var focus = s === "doing" ? d.focus : clearFocusIf(d.focus, id)
  return accepted({ items: items, focus: focus }, "ok", { type: "setStatus", id: String(id), status: s })
}

function setFocus(doc, idOrClear) {
  var d = docOf(doc)
  var key = String(idOrClear)
  if (key === "clear") return accepted({ items: d.items, focus: { text: d.focus.text, taskId: null } }, "ok", { type: "focus", id: "clear" })
  var it = findItem(d.items, key)
  if (!it) return refused(d, "unknown id")
  if (it.status === "done") return refused(d, "refused: done")
  var items = replaceItem(d.items, key, function(c) { c.status = "doing" })
  return accepted({ items: items, focus: { text: d.focus.text, taskId: key } }, "ok", { type: "focus", id: key })
}

function toggleStep(doc, id, n) {
  var d = docOf(doc)
  var it = findItem(d.items, id)
  if (!it) return refused(d, "unknown id")
  var index = Number(n)
  if (!(index >= 1) || index > it.plan.length || Math.floor(index) !== index) return refused(d, "bad step")
  var items = replaceItem(d.items, id, function(c) { c.plan[index - 1].done = !c.plan[index - 1].done })
  return accepted({ items: items, focus: d.focus }, "ok", { type: "toggleStep", id: String(id), n: index })
}

function removeItem(doc, id) {
  var d = docOf(doc)
  if (!findItem(d.items, id)) return refused(d, "unknown id")
  var items = d.items.filter(function(it) { return it && it.id !== String(id) })
  return accepted({ items: items, focus: clearFocusIf(d.focus, id) }, "ok", { type: "remove", id: String(id) })
}

function reduce(doc, action) {
  var a = action || {}
  switch (a.type) {
    case "add": return addItem(doc, a.name, a.description)
    case "setStatus": return setStatus(doc, a.id, a.status)
    case "focus": return setFocus(doc, a.id)
    case "toggleStep": return toggleStep(doc, a.id, a.n)
    case "remove": return removeItem(doc, a.id)
    default: return refused(docOf(doc), "unknown action")
  }
}

// The IPC surface keeps upstream's replies (A-R2.1): `remove` answers "ok"
// whatever the id.
function ipcReply(action, reply) {
  return action.type === "remove" && reply === "unknown id" ? "ok" : reply
}

// The two predicates every view, key and copy line shares.
function isAttached(pomodoro, id) {
  return !!pomodoro && pomodoro.phase !== "idle" && pomodoro.taskId === String(id)
}

function isFocused(focus, id) {
  return !!focus && focus.taskId === String(id)
}

// `d` on an open row (UX §4.2 done handling): remember its pre-tick status
// so it keeps its place until the panel closes (UI-14), and say so when the
// pomodoro is attached to it (UX §6.4). null for any other action.
function tickDone(state, action) {
  var a = action || {}
  if (a.type !== "setStatus" || a.status !== "done") return null
  var it = findItem(state.items, a.id)
  if (!it || it.status === "done") return null
  var next = {}
  var map = state.sessionDone || {}
  for (var k in map) next[k] = map[k]
  next[it.id] = it.status
  return { sessionDone: next, message: isAttached(state.pomodoro, it.id) ? MSG_DONE_ATTACHED : "" }
}

// ---------------------------------------------------------------- views

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
    if (isNumericId(a.item.id) && isNumericId(b.item.id)) return Number(a.item.id) - Number(b.item.id)
    return a.index - b.index
  })
  return decorated.map(function(d) { return d.item })
}

function visibleItems(items, sessionDone) {
  var done = sessionDone || {}
  return (items || []).filter(function(it) { return it && (it.status !== "done" || done[it.id]) })
}

// The session's done rows minus the ones that are no longer done: a
// reverted write, an external reopen or a delete. Everything that reads
// `sessionDone` reads this, so the status stays the one source of truth.
function pruneSessionDone(sessionDone, items) {
  var map = sessionDone || {}
  var out = {}
  for (var id in map) {
    var it = findItem(items, id)
    if (it && it.status === "done") out[id] = map[id]
  }
  return out
}

function openCount(items) {
  return (items || []).filter(function(it) { return it && it.status !== "done" }).length
}

function countLabel(items) { return openCount(items) + " open" }

// The explicit link only (UX §10.4): the linked task if it exists and is
// not done, else none. Titles are never matched.
function focusTask(items, focus) {
  if (!focus || focus.taskId === null || focus.taskId === undefined) return null
  var it = findItem(items, focus.taskId)
  return it && it.status !== "done" ? it : null
}

// A-D6: the focused task if it is doing, else the doing task with the lowest
// id (json ids: the first in insertion order).
function doingTask(items, focus) {
  var f = focusTask(items, focus)
  if (f && f.status === "doing") return f
  var best = null
  var list = items || []
  for (var i = 0; i < list.length; i++) {
    var it = list[i]
    if (!it || it.status !== "doing") continue
    if (!best) best = it
    else if (isNumericId(it.id) && isNumericId(best.id) && Number(it.id) < Number(best.id)) best = it
  }
  return best
}

function pillLabel(text, maxChars) {
  var clean = plainAngle(text)
  var max = Number(maxChars)
  if (!(max > 0)) return ""
  if (clean.length <= max) return clean
  var cut = clean.slice(0, max - 1)
  var next = clean.charAt(max - 1)
  if (next !== " " && cut.charAt(cut.length - 1) !== " ") {
    var sp = cut.lastIndexOf(" ")
    if (sp >= 0 && cut.length - sp <= 8) cut = cut.slice(0, sp)
  }
  return cut.replace(/\s+$/, "") + "…"
}

function tooltip(text) { return pillLabel(text, 60) }

function targetName(name) {
  var s = squish(name)
  return s === "" ? "" : s.charAt(0).toUpperCase() + s.slice(1)
}

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
    return { glyph: G.icon, label: "", tooltip: "Checklist Todo\nLoading…", urgent: false, dimmed: true }
  if (cli && input.error)
    return { glyph: G.icon, label: "", tooltip: "Checklist Todo\n" + errorShort(input.error) + ". Click for details.", urgent: true, dimmed: false }
  var open = openCount(items)
  var doing = doingTask(items, focus)
  if (doing) {
    var more = items.filter(function(it) { return it && it.status === "doing" }).length - 1
    var tip = "Doing: " + tooltip(doing.name) + (more > 0 ? " (+" + more + " more)" : "")
    if (focus.text && focus.text !== doing.name) tip += "\nFocus: " + tooltip(focus.text)
    tip += "\n" + todosWord(open)
    out = { glyph: G.doing, label: pillLabel(doing.name, max), tooltip: tip, urgent: false, dimmed: false }
  } else if (focus.text) {
    out = { glyph: G.focus, label: pillLabel(focus.text, max), tooltip: "Focus: " + tooltip(focus.text) + "\n" + todosWord(open), urgent: false, dimmed: false }
  } else if (open > 0) {
    out = { glyph: G.icon, label: input.vertical ? "" : String(open), tooltip: todosWord(open) + "\nNo focus set", urgent: false, dimmed: false }
  } else {
    out = { glyph: G.icon, label: "", tooltip: "Checklist Todo\nNothing open. Click to add one.", urgent: false, dimmed: true }
  }
  if (cli) {
    var failing = failingTargets(input.sync)
    if (failing.length === 1) {
      out.glyph = G.syncAlert
      out.tooltip += "\n" + targetName(failing[0].name) + " sync failed " + ago(failing[0].lastAttemptAt, input.now)
    } else if (failing.length > 1) {
      out.glyph = G.syncAlert
      out.tooltip += "\n" + failing.length + " syncs failed"
    }
  }
  return out
}

// ---------------------------------------------------------------- time

function toMillis(ts) {
  if (ts === undefined || ts === null || ts === "") return NaN
  if (typeof ts === "number") return ts
  return Date.parse(String(ts))
}

function ago(ts, now) {
  var ms = toMillis(ts)
  if (isNaN(ms)) return ""
  var delta = Math.max(0, now - ms)
  if (delta < 60000) return "just now"
  if (delta < 3600000) return Math.floor(delta / 60000) + "m ago"
  if (delta < 86400000) return Math.floor(delta / 3600000) + "h ago"
  var d = new Date(ms)
  return MONTHS[d.getMonth()] + " " + d.getDate()
}

function pad2(n) { return (n < 10 ? "0" : "") + n }

// Note timestamps in the detail view: today = HH:mm, else "Sep 27". `utc`
// keeps the tests independent of the machine's zone.
function noteTime(ts, now, utc) {
  var ms = toMillis(ts)
  if (isNaN(ms)) return ""
  var d = new Date(ms)
  var n = new Date(now)
  var sameDay = utc
    ? (d.getUTCFullYear() === n.getUTCFullYear() && d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() === n.getUTCDate())
    : (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate())
  if (sameDay) return utc ? pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) : pad2(d.getHours()) + ":" + pad2(d.getMinutes())
  return utc ? MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() : MONTHS[d.getMonth()] + " " + d.getDate()
}

function dueLabel(due) {
  if (due === undefined || due === null || due === "") return ""
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(due))
  if (!m) return String(due)
  return MONTHS[Number(m[2]) - 1] + " " + Number(m[3])
}

function clockLabel(ms, utc) {
  var d = new Date(ms)
  return utc ? pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) : pad2(d.getHours()) + ":" + pad2(d.getMinutes())
}

function formatTime(seconds) {
  var s = Math.max(0, Math.floor(Number(seconds) || 0))
  return Math.floor(s / 60) + ":" + pad2(s % 60)
}

// ---------------------------------------------------------------- footer

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
      var line = firstLine(error.message)
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
    var name = targetName(t.name)
    if (!t.enabled) out.push(name + ": off")
    else if (t.error) out.push(name + ": failed " + ago(t.lastAttemptAt, now) + " — " + reason(t.error))
    else out.push(name + ": ok " + ago(t.lastOkAt, now))
  }
  return out.join("\n")
}

// UX §4.7 footer (cli mode only). `text` excludes the glyph; dump.footer
// shows {text, urgent}.
function footer(sync, now, opts) {
  var tip = footerTooltip(sync, now)
  var enabled = (sync || []).filter(function(t) { return t && t.enabled })
  if (opts && opts.syncing) return { glyph: G.sync, text: "Syncing…", urgent: false, tooltip: tip, action: null }
  if (enabled.length === 0) return { glyph: G.sync, text: "todocli · local only", urgent: false, tooltip: tip, action: null }
  var failing = failingTargets(enabled)
  if (failing.length === 1)
    return { glyph: G.syncAlert, text: targetName(failing[0].name) + " sync failed " + ago(failing[0].lastAttemptAt, now) + " · R retry", urgent: true, tooltip: tip, action: "syncNow" }
  if (failing.length > 1)
    return { glyph: G.syncAlert, text: failing.length + " syncs failed · R retry", urgent: true, tooltip: tip, action: "syncNow" }
  var stalest = null
  var oldestOk = null
  var never = false
  for (var i = 0; i < enabled.length; i++) {
    var t = enabled[i]
    var attempt = toMillis(t.lastAttemptAt)
    if (!isNaN(attempt) && t.intervalSec > 0 && now - attempt > 3 * t.intervalSec * 1000 && (stalest === null || attempt < stalest)) stalest = attempt
    var ok = toMillis(t.lastOkAt)
    if (isNaN(ok)) never = true
    else if (oldestOk === null || ok < oldestOk) oldestOk = ok
  }
  if (stalest !== null)
    return { glyph: G.syncOff, text: "Sync daemon idle since " + ago(stalest, now) + " · R sync now", urgent: false, tooltip: tip, action: "syncNow" }
  if (never)
    return { glyph: G.sync, text: "todocli · not synced yet · R sync now", urgent: false, tooltip: tip, action: "syncNow" }
  return { glyph: G.sync, text: "todocli · synced " + ago(oldestOk, now), urgent: false, tooltip: tip, action: null }
}

function smallestInterval(sync) {
  var best = 0
  var list = sync || []
  for (var i = 0; i < list.length; i++) {
    var t = list[i]
    if (!t || !t.enabled || !(t.intervalSec > 0)) continue
    if (best === 0 || t.intervalSec < best) best = t.intervalSec
  }
  return best
}

// ---------------------------------------------------------------- errors

// The UX §7 copy per error kind, in one table: `short` names it on the pill
// and as the error-view title, `reason` is the `unavailable: <reason>` reply
// and the classifyExit message, `body`/`hint` fill the error view (E4, E7,
// E8), `banner` makes E5 a line above the last good list instead. An
// unknown kind reads as E7. Adding a kind is one entry here.
var ERRORS = {
  missing: {
    short: "todocli not found", reason: "todocli not found",
    body: function(e, o) { return "This panel is set to backend = cli, but it can't run \"" + o.cliPath + "\". Nothing was changed." },
    hint: function(e, o) { return "Point the panel at todocli:\n  omarchy bar set " + o.moduleName + " cliPath /path/to/todocli\nor go back to the panel's own list:\n  omarchy bar set " + o.moduleName + " backend json" }
  },
  busy: {
    short: "Database busy or locked", reason: "database busy", glyph: G.lock,
    banner: function(e, o) { return "Database busy or locked. " + (o.lastGoodAt ? "Showing the list from " + clockLabel(o.lastGoodAt, o.utc) + ". " : "") + "r retry" }
  },
  protocol: {
    short: "Can't read todocli output", reason: "can't read todocli output",
    body: function() { return "todocli answered, but not in the format this panel expects (JSON schema v1). Update the plugin or todocli so their versions match." }
  },
  failed: {
    short: "todocli error", reason: "todocli error",
    body: function(e) {
      var head = lines(e.message, 3)
      return (head.length ? head.join("\n") + "\n" : "") + "Run todocli board in a terminal to see the full error."
    }
  }
}

function errorView(error, opts) {
  if (!error) return null
  var o = opts || {}
  var c = errorCopy(error)
  var ctx = { cliPath: o.cliPath || DEFAULTS.cliPath, moduleName: o.moduleName || MODULE, lastGoodAt: o.lastGoodAt, utc: o.utc }
  return {
    glyph: c.glyph || G.alert,
    title: c.banner ? null : c.short,
    body: c.body ? c.body(error, ctx) : "",
    hint: c.hint ? c.hint(error, ctx) : "",
    banner: c.banner ? c.banner(error, ctx) : null
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
    backend: s.backend || DEFAULTS.backend,
    cliPath: s.cliPath || DEFAULTS.cliPath,
    view: s.view || "list",
    stale: s.stale === true,
    error: s.error ? { kind: s.error.kind, message: s.error.message || "" } : null,
    pill: s.pill || { glyph: G.icon, label: "", tooltip: "", urgent: false, dimmed: false },
    focus: { text: focus.text || "", taskId: focus.taskId === undefined ? null : focus.taskId },
    open: open,
    done: done,
    banner: s.banner || null,
    footer: s.footer ? { text: s.footer.text, urgent: s.footer.urgent === true } : null,
    message: s.message || null
  }
}

// ---------------------------------------------------------------- settings

// PLAN A18: every read through setting(key, fallback) lands here.
function coerce(settings) {
  var s = settings || {}
  var maxChars = Number(s.maxChars)
  if (s.maxChars === undefined || s.maxChars === null || isNaN(maxChars)) maxChars = DEFAULTS.maxChars
  return {
    backend: String(s.backend) === "cli" ? "cli" : DEFAULTS.backend,
    cliPath: str(s.cliPath) || DEFAULTS.cliPath,
    pomodoroTarget: str(s.pomodoroTarget) || DEFAULTS.pomodoroTarget,
    maxChars: maxChars < 0 ? 0 : maxChars
  }
}

// ---------------------------------------------------------------- copy

function taskRef(item, backend) {
  return backend === "cli" ? "#" + item.id : pillLabel(item.name, 24)
}

function msgDoneRow(item, backend) { return taskRef(item, backend) + " is done · d reopens it" }

function msgNotSaved(errorOrStderr) {
  if (errorOrStderr && typeof errorOrStderr === "object") {
    if (errorOrStderr.kind === "busy") return "Not saved — database busy. Press r to retry."
    return "Not saved — " + (firstLine(errorOrStderr.message) || "todocli error") + "."
  }
  return "Not saved — " + (firstLine(errorOrStderr) || "todocli error") + "."
}

function msgPomodoroMoved(item, remaining, backend) {
  return "Pomodoro moved to " + taskRef(item, backend) + " · " + formatTime(remaining) + " left"
}

function msgPomodoroMissing(target) { return "Pomodoro plugin not found. Enable " + target + "." }
function msgPomodoroOld(target) { return "Pomodoro plugin is out of date. Update " + target + "." }
function msgPomodoroNotStarted(text) { return "Pomodoro not started — " + text + "." }
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

// ---------------------------------------------------------------- pomodoro

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
    it = focusTask(s.items, s.focus)
    if (!it) return s.focus && s.focus.text ? { kind: "startLabel", label: s.focus.text } : reply(NO_FOCUS)
  } else {
    it = findItem(s.items, id)
    if (!it) return reply("unknown id")
  }
  if (isAttached(s.pomodoro, it.id)) return { kind: "pause" }
  if (s.error) return reply(unavailable(s.error))
  if (it.status === "done") return reply("refused: done", msgDoneRow(it, s.backend))
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

// `omarchy-shell <target> startFor …` result (PLAN A52, _verified L61).
function classifyShell(code, stdout, stderr, spawnFailed) {
  if (spawnFailed) return { ok: false, kind: "transient", text: "omarchy-shell not found" }
  if (code === 0) return { ok: true, word: squish(stdout) }
  var err = firstLine(stderr)
  if (err.indexOf("Target not found.") !== -1) return { ok: false, kind: "missing" }
  if (err.indexOf("Function not found.") !== -1) return { ok: false, kind: "old" }
  return { ok: false, kind: "transient", text: err === "" ? "omarchy-shell exited " + code : err }
}

function idleView() { return { phase: "idle", running: false, remaining: 0, taskId: "", label: "", attached: false } }

// The reader's view of the pomodoro state file (UX §6.5): remaining from
// `endsAt` while running; `running && now > endsAt + 10 s` reads as idle.
function pomodoroView(state, now) {
  if (!state || typeof state !== "object") return idleView()
  var phase = squish(state.phase) || "idle"
  var running = state.running === true
  var endsAt = Number(state.endsAt) || 0
  if (phase === "idle") return idleView()
  if (running && now > endsAt + 10000) return idleView()
  var remaining = running ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : Math.max(0, Math.floor(Number(state.remaining) || 0))
  var taskId = str(state.taskId)
  var label = squish(state.taskLabel)
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

// UX §4.2 focus line variants F0–F6.
function focusLine(items, focus, pomodoro) {
  var pom = pomodoro || idleView()
  var f = focus || { text: "", taskId: null }
  var task = focusTask(items, f)
  var base = { variant: null, text: "", selectable: true, item: null, timer: "", timerGlyph: "", timerDim: false, hint: "", tooltip: "" }
  if (task) {
    base.item = task
    base.text = task.name
    var attached = isAttached(pom, task.id)
    if (attached && pom.phase === "work" && pom.running) { base.variant = "F2"; base.timer = formatTime(pom.remaining); base.timerGlyph = G.pomodoro }
    else if (attached && pom.phase === "work") { base.variant = "F3"; base.timer = formatTime(pom.remaining) + " paused"; base.timerGlyph = G.pomodoro; base.timerDim = true }
    else if (attached) { base.variant = "F4"; base.timer = formatTime(pom.remaining); base.timerGlyph = G.brk; base.timerDim = true }
    else if (pom.phase === "work" && pom.taskId !== "") {
      base.variant = "F5"
      var other = findItem(items, pom.taskId)
      base.hint = G.pomodoro + " " + formatTime(pom.remaining) + " on " + (other ? other.name : pom.label) + " · p moves it here"
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

// The cursor rows of the list view: the focus line (row 0) when shown, then
// the sorted items (UX §4.2).
function listRows(focusLine, listItems) {
  var out = []
  if (focusLine) out.push({ kind: "focus", item: focusLine.item, selectable: focusLine.selectable })
  var list = listItems || []
  for (var i = 0; i < list.length; i++) out.push({ kind: "item", item: list[i], selectable: true })
  return out
}

function planProgress(item) {
  if (!item || !item.plan || item.plan.length === 0) return ""
  var done = item.plan.filter(function(s) { return s.done }).length
  return done + "/" + item.plan.length
}

function statusGlyph(status) {
  return status === "doing" ? G.doing : (status === "done" ? G.done : G.todo)
}

// UX §4.4 status line.
function statusLine(item, ctx) {
  if (!item) return ""
  var c = ctx || {}
  var parts = [statusGlyph(item.status) + " " + item.status]
  if (c.backend === "cli") parts.push("#" + item.id)
  var progress = planProgress(item)
  if (progress !== "") parts.push("plan " + progress)
  if (item.notes && item.notes.length > 0) parts.push(item.notes.length + " note" + (item.notes.length === 1 ? "" : "s"))
  if (isFocused(c.focus, item.id)) parts.push("focus")
  if (isAttached(c.pomodoro, item.id)) parts.push(G.pomodoro + " " + formatTime(c.pomodoro.remaining))
  if (c.backend === "cli" && item.due) parts.push("due " + dueLabel(item.due))
  return parts.join(" · ")
}

// UX §4.4 action-button tooltips, incl. the done-row rule of §4.5.
function actionTooltips(item, ctx) {
  var c = ctx || {}
  var it = item || { id: "", status: "todo" }
  var attached = isAttached(c.pomodoro, it.id)
  var isDone = it.status === "done"
  var doneTip = "Done · d reopens it"
  var pomTip = attached ? (c.pomodoro.running ? "Pause pomodoro (p)" : "Resume pomodoro (p)") : "Start pomodoro (p)"
  return {
    doing: isDone ? doneTip : (it.status === "doing" ? "Back to todo (s)" : "Mark doing (s)"),
    done: isDone ? "Reopen (d)" : "Mark done (d)",
    focus: isDone ? doneTip : (isFocused(c.focus, it.id) ? "Clear focus (f)" : "Set focus (f)"),
    pomodoro: isDone && !attached ? doneTip : pomTip,
    del: c.armed ? "Click again to delete" : "Delete (x x)",
    doingEnabled: !isDone,
    focusEnabled: !isDone,
    pomodoroEnabled: !isDone || attached
  }
}
