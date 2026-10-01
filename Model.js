.pragma library
.import "Priority.js" as Priority

// The item model and the vocabulary every other library shares: the glyphs,
// the settings and their coercion, text and time formatting, the item
// normaliser, the focus link and the two predicates. Everything here is
// total: a malformed or missing value becomes an empty string, an empty
// list or a null rather than an exception, so a torn or hand-edited save
// file, or a surprising todocli reply, can never blank the widget. No I/O,
// no QML: the file runs under node --test as well (PLAN §9.4).
//
// Item model (both backends): { id: string, uid, name, description, status,
//   plan: [{text, done}], notes: [{at, text}], due, author,
//   stream, labels: [string], horizon, priority, size }.
//
// The other libraries: Store.js (document shapes, cli mapping, the reducer),
// Errors.js (the UX §7 error kinds and copy), View.js (view decisions and
// copy), Pomodoro.js (the hand-off), Keys.js (keys and the view machine),
// Argv.js (argv builders).

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

// Catalogue order is producer-owned; malformed entries never throw.
function normalizeStreams(list) {
  if (!Array.isArray(list)) return []
  var out = []
  for (var i = 0; i < list.length; i++) {
    var entry = list[i]
    if (!entry || typeof entry !== "object") continue
    var uid = squish(entry.uid)
    var key = squish(entry.key)
    if (uid === "" || key === "") continue
    out.push({
      uid: uid, key: key, group: strOrNull(entry.group), name: str(entry.name),
      position: typeof entry.position === "number" && isFinite(entry.position) ? entry.position : 0,
      system: entry.system === true, createdAt: str(entry.createdAt),
      archivedAt: typeof entry.archivedAt === "string" && entry.archivedAt !== "" ? entry.archivedAt : null,
      open: Number.isInteger(entry.open) && entry.open >= 0 ? entry.open : 0
    })
  }
  return out
}

// Reusable lookup for rows, dump and move targets. A caller visiting many
// items can index the catalogue once; homeOf/isOrphan also accept its array.
function indexStreams(streams) {
  var homes = Object.create(null)
  var list = Array.isArray(streams) ? streams : []
  for (var i = 0; i < list.length; i++) homes[list[i].key] = list[i]
  return homes
}

function homeOf(streams, key) {
  var homes = Array.isArray(streams) ? indexStreams(streams) : streams
  return homes && Object.prototype.hasOwnProperty.call(homes, key) ? homes[key] : null
}

function isOrphan(streams, item) {
  var home = homeOf(streams, item.stream)
  return item.status !== "done" && (home === null || home.archivedAt !== null)
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
    completedAt: strOrNull(item.completedAt),
    author: strOrNull(item.author),
    stream: strOrNull(squish(item.stream)),
    labels: Array.isArray(item.labels) ? item.labels.filter(function(v) { return typeof v === "string" }) : [],
    horizon: Priority.HORIZONS.indexOf(item.horizon) !== -1 ? item.horizon : "short",
    priority: Priority.normalize(item.priority),
    size: Priority.normalizeSize(item.size)
  }
}

function copyItem(item) {
  return {
    id: item.id, uid: item.uid, name: item.name, description: item.description, status: item.status,
    plan: item.plan.map(function(s) { return { text: s.text, done: s.done } }),
    notes: item.notes.map(function(n) { return { at: n.at, text: n.text } }),
    due: item.due, author: item.author, completedAt: strOrNull(item.completedAt),
    stream: item.stream, labels: item.labels.slice(), horizon: item.horizon,
    priority: item.priority, size: item.size
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

// The explicit link only (UX §10.4): the linked task if it exists and is
// not done, else none. Titles are never matched.
function focusTask(items, focus) {
  if (!focus || focus.taskId === null || focus.taskId === undefined) return null
  var it = findItem(items, focus.taskId)
  return it && it.status !== "done" ? it : null
}

// ---------------------------------------------------------------- predicates

// The reader's view of the pomodoro when nothing runs (UX §6.5);
// Pomodoro.pomodoroView fills the other phases from the state file.
function idleView() { return { phase: "idle", running: false, remaining: 0, taskId: "", label: "", attached: false } }

// The two predicates every view, key and copy line shares.
function isAttached(pomodoro, id) {
  return !!pomodoro && pomodoro.phase !== "idle" && pomodoro.taskId === String(id)
}

function isFocused(focus, id) {
  return !!focus && focus.taskId === String(id)
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

// m:ss, h:mm:ss from an hour up (abobreshov.pomodoro Phase.formatTime: the
// same text on both sides of the hand-off).
function formatTime(seconds) {
  var s = Math.max(0, Math.floor(Number(seconds) || 0))
  var h = Math.floor(s / 3600)
  var m = Math.floor((s % 3600) / 60)
  if (h > 0) return h + ":" + pad2(m) + ":" + pad2(s % 60)
  return m + ":" + pad2(s % 60)
}

// ---------------------------------------------------------------- labels

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

function statusGlyph(status) {
  return status === "doing" ? G.doing : (status === "done" ? G.done : G.todo)
}

function planProgress(item) {
  if (!item || !item.plan || item.plan.length === 0) return ""
  var done = item.plan.filter(function(s) { return s.done }).length
  return done + "/" + item.plan.length
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
