.pragma library

// Document and input vocabulary (CONTRACT-S9 §1, §10).
var LEVELS = { low: 25, medium: 50, high: 75, critical: 100 }
var SIZES = ["XS", "S", "M", "L", "XL"]
var HORIZONS = ["short", "mid", "yearly", "long"]

// A stored number only: zero is set, strings and out-of-range values aren't.
function normalize(v) {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100 ? v : null
}

function normalizeSize(v) {
  return typeof v === "string" && SIZES.indexOf(v) !== -1 ? v : null
}

// Q-S24's bands and the marks are shared by every row; zero is set.
var BANDS = [37, 62, 87, 100]
var NAMES = ["low", "medium", "high", "critical"]
var MARKS = ["\udb82\udcbc", "\udb82\udcbd", "\udb82\udcbe", "\udb81\udebd"]
function levelOf(value) {
  var n = normalize(value)
  if (n === null) return ""
  var i = 0
  while (n > BANDS[i]) i++
  return NAMES[i]
}
function markOf(value) {
  var i = NAMES.indexOf(levelOf(value))
  return i < 0 ? "" : MARKS[i]
}

// IPC/compose tokens have a separate domain from stored numeric values.
function parse(input) {
  var token = String(input).toLowerCase()
  if (token === "none") return { value: null }
  if (Object.prototype.hasOwnProperty.call(LEVELS, token)) return { value: LEVELS[token] }
  if (/^[0-9]+$/.test(token) && Number(token) <= 100) return { value: Number(token) }
  return { error: "bad priority" }
}
function parseSize(input) {
  var token = String(input).toUpperCase()
  if (token === "NONE") return { value: null }
  return SIZES.indexOf(token) !== -1 ? { value: token } : { error: "bad size" }
}
function unavailable(ctx) {
  if (ctx.backend !== "cli") return "Priority and size need backend = cli."
  if (ctx.hasStreams !== true) return "Priority and size need a newer todocli."
  return ""
}
function priorityText(value) { return "priority: " + (value === null ? "(none)" : levelOf(value) + " (" + value + ")") }
function sizeText(value) { return "size: " + (value === null ? "(none)" : value) }
function fieldsLine(item, metadata) {
  if (!metadata || !item) return ""
  var parts = []
  if (item.priority !== null) parts.push(priorityText(item.priority))
  if (item.size !== null) parts.push(sizeText(item.size))
  return parts.join(" · ")
}
function resultMessage(action) {
  if (action.type === "setPriority") return "#" + action.id + " " + priorityText(action.value)
  if (action.type === "setSize") return "#" + action.id + " " + sizeText(action.value)
  return ""
}
