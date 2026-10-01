.pragma library
.import "Model.js" as Model
.import "Priority.js" as Priority

// The two document shapes and the one mutation API (PLAN §6.3, §6.4, A17,
// A34). Pure and total, as Model.js; both stores apply every change through
// `reduce`, so they answer alike.
//
// The json store's file (version 2; version 1 files read as all-todo):
//   { "version": 2, "focus": { "text": "", "taskId": null },
//     "todos": [ { "id", "name", "description", "status", "plan", "notes" } ] }
// The cli store reads todocli's `board --json` document (PLAN §3.7) through
// `fromCli`; the write FIFO's ordering rules and optimistic id map
// (`rememberId`, `withRealId`, `readApplies`, `rebase`) live in Queue.js.

// The stores' own transients (UX §4.5, §7 E14); the cli store's sync
// transients are Errors.classifySync's.
var MSG_SYNC_NEEDS_CLI = "Sync needs backend = cli."
var MSG_UNREADABLE = "Couldn't read todos.json. Fix or delete it — changes won't be saved until then."

// ---------------------------------------------------------------- json

function emptyDocument() { return { ok: true, focus: { text: "", taskId: null }, todos: [] } }

// The json store's reader. v1 (upstream `{version: 1, todos}` or a bare
// array) reads as all-todo with an empty focus; v2 carries status, plan,
// notes and the focus link. A non-empty file that does not parse is E14: the
// caller shows the banner and blocks saves, never overwriting the file.
function parseDocument(raw) {
  var text = raw === undefined || raw === null ? "" : String(raw)
  if (Model.squish(text) === "") return emptyDocument()
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
      var item = Model.normalize(list[i])
      if (!item) continue
      if (seen[item.id]) item.id = Model.makeId()
      seen[item.id] = true
      out.push(item)
    }
  }
  return { ok: true, focus: Model.normalizeFocus(focus, out), todos: out }
}

function serializeDocument(doc) {
  var list = []
  var source = doc && Array.isArray(doc.todos) ? doc.todos : (doc && Array.isArray(doc.items) ? doc.items : [])
  for (var i = 0; i < source.length; i++) {
    var item = Model.normalize(source[i])
    if (item) list.push({ id: item.id, name: item.name, description: item.description, status: item.status, plan: item.plan, notes: item.notes })
  }
  var focus = Model.normalizeFocus(doc ? doc.focus : null, list)
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
    var err = t.error && typeof t.error === "object" ? { kind: Model.squish(t.error.kind) || "error", message: Model.str(t.error.message) } : null
    out.push({
      name: Model.squish(t.name),
      enabled: t.enabled === true || t.enabled === "true",
      lastOkAt: t.lastOkAt === undefined || t.lastOkAt === null ? null : t.lastOkAt,
      lastAttemptAt: t.lastAttemptAt === undefined || t.lastAttemptAt === null ? null : t.lastAttemptAt,
      intervalSec: Number(t.intervalSec) || 0,
      error: err
    })
  }
  return out
}

// The cli store re-reads every smallest enabled intervalSec while the panel
// is open (PLAN A34b); 0 when no target is enabled.
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

// `board --json` -> { ok, items, focus, streams, hasStreams, sync, stamp } or
// the protocol error (E8) for a document this panel does not understand.
// `stamp` is the change stamp's path (§3.10) as todocli publishes it, or
// null from a build that does not; the store watches its directory.
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
    var item = Model.normalize({
      id: t.id, uid: t.uid, name: t.title, description: t.description, status: t.status,
      plan: t.plan, notes: t.notes, due: t.due, author: t.author, completedAt: t.completedAt,
      stream: t.stream, labels: t.labels, horizon: t.horizon, priority: t.priority, size: t.size
    })
    if (item) items.push(item)
  }
  var focus = { text: Model.squish(data.focus), taskId: Model.strOrNull(data.focus_task) }
  return {
    ok: true, items: items, focus: focus,
    streams: Model.normalizeStreams(data.streams), hasStreams: Array.isArray(data.streams),
    sync: normalizeSync(data.sync), stamp: Model.strOrNull(data.stamp)
  }
}

// The directory the change stamp lives in, with its trailing slash (the
// FileView watches the directory, never the stamp: it is replaced by a new
// inode on every write); "" for no stamp.
function stampDir(stamp) {
  var s = Model.str(stamp)
  var cut = s.lastIndexOf("/")
  return cut <= 0 ? "" : s.slice(0, cut + 1)
}

// ---------------------------------------------------------------- mutations
// One action vocabulary, shared by the keys (Keys.js emits it), the argv
// (Argv.forAction maps it to a todocli command) and both stores (they apply
// it through `reduce`):
//   {type: "add", name, description} (optional stream and horizon)
//   {type: "setStatus", id, status}    {type: "move", id, stream}
//   {type: "setPriority", id, value}   {type: "setSize", id, value}
//   {type: "focus", id | "clear"}      {type: "toggleStep", id, n}
//   {type: "remove", id}
// Every mutator returns the same shape, {ok, doc: {items, focus}, reply,
// action, item}: new arrays and the inputs untouched, so a failed cli write
// is reverted by keeping the previous doc; `reply` is the IPC reply of UX
// §10.3 (the clean name for add, "ok", or the refusal); `action` is the
// normalised action to persist (squished text, string ids, numeric step).
// Accepted no-op: reply "ok", action null; the cli store queues nothing.

function docOf(doc) {
  var d = doc || {}
  return { items: d.items || [], focus: Model.normalizeFocus(d.focus, null) }
}

function refused(doc, reply) { return { ok: false, doc: doc, reply: reply, action: null, item: null } }

function accepted(doc, reply, action, item) { return { ok: true, doc: doc, reply: reply, action: action, item: item || null } }

function replaceItem(items, id, updater) {
  return items.map(function(it) {
    if (!it || it.id !== String(id)) return it
    var copy = Model.copyItem(it)
    updater(copy)
    return copy
  })
}

function clearFocusIf(focus, id) {
  return { text: focus.text, taskId: focus.taskId === String(id) ? null : focus.taskId }
}

// `id` is given only by `Queue.rebase`, replaying an optimistic add under its own
// temporary id; a fresh add mints one.
function addItem(doc, name, description, id, stream, horizon) {
  var d = docOf(doc)
  var cleanName = Model.squish(name)
  if (cleanName === "") return refused(d, "empty")
  var key = Model.strOrNull(Model.squish(stream))
  var item = Model.normalize({
    id: id, name: cleanName, description: description, status: "todo",
    stream: key === null ? "inbox" : key, horizon: horizon,
    labels: [], priority: null, size: null
  })
  var action = { type: "add", name: cleanName, description: item.description }
  if (key !== null && key !== "inbox") action.stream = key
  if (item.horizon !== "short") action.horizon = item.horizon
  return accepted({ items: d.items.concat([item]), focus: d.focus }, cleanName, action, item)
}

// Stream resolution belongs to P3; the catalogue is never optimistic state.
function move(doc, id, stream) {
  var d = docOf(doc)
  var it = Model.findItem(d.items, id)
  if (!it) return refused(d, "unknown id")
  var key = Model.squish(stream)
  if (key === "" || key.charAt(0) === "-") return refused(d, "unknown stream")
  if (it.stream === key) return accepted(d, "ok", null)
  var items = replaceItem(d.items, id, function(c) { c.stream = key })
  return accepted({ items: items, focus: d.focus }, "ok", { type: "move", id: String(id), stream: key })
}

function setPriority(doc, id, value) {
  var d = docOf(doc)
  var it = Model.findItem(d.items, id)
  if (!it) return refused(d, "unknown id")
  if (value !== null && Priority.normalize(value) !== value) return refused(d, "bad priority")
  if (it.priority === value) return accepted(d, "ok", null)
  var items = replaceItem(d.items, id, function(c) { c.priority = value })
  return accepted({ items: items, focus: d.focus }, "ok", { type: "setPriority", id: String(id), value: value })
}

function setSize(doc, id, value) {
  var d = docOf(doc)
  var it = Model.findItem(d.items, id)
  if (!it) return refused(d, "unknown id")
  if (value !== null && Priority.normalizeSize(value) !== value) return refused(d, "bad size")
  if (it.horizon !== "short") {
    if (value !== null) return refused(d, "size is for short-term tasks only")
    return accepted(d, "ok", null)
  }
  if (it.size === value) return accepted(d, "ok", null)
  var items = replaceItem(d.items, id, function(c) { c.size = value })
  return accepted({ items: items, focus: d.focus }, "ok", { type: "setSize", id: String(id), value: value })
}

function setStatus(doc, id, status, now) {
  var d = docOf(doc)
  var s = Model.normalizeStatus(status)
  if (s !== String(status)) return refused(d, "bad status")
  if (!Model.findItem(d.items, id)) return refused(d, "unknown id")
  if (now === undefined || now === null) return refused(d, "missing clock")
  var items = replaceItem(d.items, id, function(it) {
    it.completedAt = s === "done" ? (it.status === "done" ? it.completedAt : new Date(now).toISOString()) : null
    it.status = s
  })
  // A focused task is always doing: leaving doing clears the link, the
  // free text stays (PRODUCT UC-5 A2b).
  var focus = s === "doing" ? d.focus : clearFocusIf(d.focus, id)
  var action = { type: "setStatus", id: String(id), status: s }
  if (now !== undefined) action.at = now
  return accepted({ items: items, focus: focus }, "ok", action)
}

function setFocus(doc, idOrClear) {
  var d = docOf(doc)
  var key = String(idOrClear)
  if (key === "clear") return accepted({ items: d.items, focus: { text: d.focus.text, taskId: null } }, "ok", { type: "focus", id: "clear" })
  var it = Model.findItem(d.items, key)
  if (!it) return refused(d, "unknown id")
  if (it.status === "done") return refused(d, "refused: done")
  var items = replaceItem(d.items, key, function(c) { c.status = "doing" })
  return accepted({ items: items, focus: { text: d.focus.text, taskId: key } }, "ok", { type: "focus", id: key })
}

function toggleStep(doc, id, n) {
  var d = docOf(doc)
  var it = Model.findItem(d.items, id)
  if (!it) return refused(d, "unknown id")
  var index = Number(n)
  if (!(index >= 1) || index > it.plan.length || Math.floor(index) !== index) return refused(d, "bad step")
  var items = replaceItem(d.items, id, function(c) { c.plan[index - 1].done = !c.plan[index - 1].done })
  return accepted({ items: items, focus: d.focus }, "ok", { type: "toggleStep", id: String(id), n: index })
}

function removeItem(doc, id) {
  var d = docOf(doc)
  if (!Model.findItem(d.items, id)) return refused(d, "unknown id")
  var items = d.items.filter(function(it) { return it && it.id !== String(id) })
  return accepted({ items: items, focus: clearFocusIf(d.focus, id) }, "ok", { type: "remove", id: String(id) })
}

function reduce(doc, action, now) {
  var a = action || {}
  switch (a.type) {
    case "add": return addItem(doc, a.name, a.description, a.id, a.stream, a.horizon)
    case "move": return move(doc, a.id, a.stream)
    case "setPriority": return setPriority(doc, a.id, a.value)
    case "setSize": return setSize(doc, a.id, a.value)
    case "setStatus": return setStatus(doc, a.id, a.status, a.at === undefined ? now : a.at)
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
