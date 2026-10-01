.pragma library
.import "Model.js" as Model
.import "Order.js" as Order
.import "Tabs.js" as Tabs

var FILTERS = Tabs.FILTERS
var COPY = [
  { name: "short-term", span: "", badge: "", header: "" },
  { name: "mid-term", span: "~3 months", badge: "3m", header: "Mid-term · ~3 months" },
  { name: "yearly", span: "~1 year", badge: "1y", header: "Yearly · ~1 year" },
  { name: "long-term", span: "over a year", badge: "1y+", header: "Long-term · over a year" }
]
function horizonCopy(h) { return COPY[Math.max(0, Order.HORIZONS.indexOf(h))] }
function cycleFilter(f) { return Tabs.cycleFilter(f) }
function matches(it, filter) { return !filter || filter === "all" || it.horizon === filter }
function active(streams) { return streams.filter(function(s) { return s.archivedAt === null }) }
function prioritySlot(items) { return items.some(function(it) { return it.priority !== null && it.priority !== undefined }) }
function badgeSlot(streams, items) { return active(streams).length > 1 || items.some(function(it) { return it.horizon !== "short" || (it.size !== null && it.size !== undefined) }) }
function effectiveHome(it, streams, latch) {
  if (latch && latch.streamUid !== undefined) {
    var held = streams.filter(function(s) { return s.uid === latch.streamUid })[0]
    if (held) return held.key
  }
  return Model.isOrphan(streams, it) ? "inbox" : it.stream
}
function itemRow(it, badge, streams, doneTab) {
  var home = Model.homeOf(streams, it.stream)
  return { kind: "item", item: it, selectable: true, badge: badge,
    streamCaption: doneTab ? (home ? (home.system ? "Inbox" : home.archivedAt !== null ? Model.pillLabel(home.name, 10) : Tabs.labelOf(home, active(streams))) : Model.pillLabel(it.stream, 10)) : "" }
}
function heldFor(it, opts) {
  return it.status === "done" && opts.latches && opts.latches[it.id] ? opts.latches[it.id] : null
}
function shown(it, opts) { return it.status !== "done" || heldFor(it, opts) !== null || (opts.sessionDone && opts.sessionDone[it.id]) || Order.inTail(it, opts.dayStart) }
function blockRows(items, streams, opts, section, overview) {
  var cmp = section ? Order.compareSection : Order.compareOpen
  var open = [], held = [], tail = []
  items.forEach(function(it) {
    var latch = heldFor(it, opts)
    if (latch) held.push({ item: it, latch: latch })
    else if (it.status !== "done") open.push(it)
    else if (opts.sessionDone && opts.sessionDone[it.id]) held.push({ item: it, latch: Order.latchOf(Order.recorded(it, {status: opts.sessionDone[it.id], priority: it.priority, horizon: it.horizon}), [], undefined, 0) })
    else tail.push(it)
  })
  return Order.placeLatched(open.sort(cmp), held, cmp).concat(tail.sort(Order.compareDone)).map(function(it) {
    var l = heldFor(it, opts), status = l ? l.status : it.status
    return itemRow(it, overview || (status === "doing" && !section) ? horizonCopy(l ? l.horizon : it.horizon).badge : "", streams, false)
  })
}
function overviewRows(items, streams, options) {
  var opts = options || {}, out = []
  streams.forEach(function(s) {
    var group = items.filter(function(it) { return matches(it, opts.horizonFilter) && shown(it, opts) && effectiveHome(it, streams, heldFor(it, opts)) === s.key })
    if (s.archivedAt !== null) group = group.filter(function(it) { return heldFor(it, opts) !== null })
    if (group.length === 0) return
    out.push({ kind: "header", stream: s.key, open: group.filter(function(it) { return it.status !== "done" }).length, caption: s.system ? "Inbox" : s.key, selectable: false })
    out = out.concat(blockRows(group, streams, opts, false, true))
  })
  return out
}
function tabRows(items, streamKey, options) {
  var opts = options || {}, streams = opts.streams || [], out = []
  var scoped = items.filter(function(it) { return matches(it, opts.horizonFilter) && shown(it, opts) && (streams.length ? effectiveHome(it, streams, heldFor(it, opts)) : it.stream) === streamKey })
  Order.HORIZONS.forEach(function(h) {
    var block = scoped.filter(function(it) { return blockOf(it, heldFor(it, opts), false) === h })
    if (!block.length) return
    if (h !== "short") out.push({ kind: "section", horizon: h, count: block.filter(function(it) { return it.status !== "done" }).length, caption: horizonCopy(h).header, selectable: false })
    out = out.concat(blockRows(block, streams, opts, h !== "short", false))
  })
  return out
}
function dayCaption(ms, dayStart) {
  if (ms === dayStart) return "Today"
  if (ms === Order.daysBefore(dayStart, 1)) return "Yesterday"
  var d = new Date(ms)
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] + " " + d.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]
}
function doneRows(items, streams, options) {
  var opts = options || {}, reopened = opts.reopened || {}, out = [], last = ""
  var sorted = Order.placeReopened(items.filter(function(it) { return Order.inWindow(it, opts.dayStart) || Object.prototype.hasOwnProperty.call(reopened, it.id) }), reopened)
  sorted.forEach(function(it) {
    var ms = Object.prototype.hasOwnProperty.call(reopened, it.id) ? Date.parse(reopened[it.id]) : Order.completedMs(it)
    var date = Order.dayKey(ms)
    if (date !== last) { out.push({ kind: "day", date: date, count: 0, caption: dayCaption(Order.dayStartOf(ms), opts.dayStart), selectable: false }); last = date }
    for (var i = out.length - 1; i >= 0; i--) if (out[i].kind === "day") { out[i].count++; break }
    out.push(itemRow(it, horizonCopy(it.horizon).badge, streams, true))
  })
  return out
}
function scopeItems(items, streams, tab, filter) {
  return items.filter(function(it) { return it.status !== "done" && matches(it, filter) && (tab === "overview" || effectiveHome(it, streams, null) === tab) })
}
function countCaption(items, streams, tab, filter, rows) {
  if (tab === "done") return rows.filter(function(r) { return r.kind === "item" && r.item.status === "done" }).length + " done"
  return scopeItems(items, streams, tab, filter).length + " open" + (filter && filter !== "all" ? " · " + horizonCopy(filter).name : "")
}
function emptyCopy(items, tab, filter, rows) {
  if (rows.length) return ""
  if (tab === "done") return "Nothing done in the last " + Order.DONE_DAYS + " days. todocli list done lists older ones."
  if (filter && filter !== "all") return "No " + horizonCopy(filter).name + " task here. v changes the filter · Esc clears it."
  var scoped = items.filter(function(it) { return tab === "overview" || it.stream === tab })
  var ever = scoped.length > 0
  return (ever ? "All clear" : "Nothing") + (tab === "overview" ? (ever ? "." : " here yet.") : (ever ? " in " + tab + "." : " in " + tab + " yet.")) + " Press + to add a todo."
}
function composeTarget(tab, filter) {
  var out = {}
  if (tab !== "overview" && tab !== "inbox" && tab !== "done") out.stream = tab
  if (filter && filter !== "all" && filter !== "short") out.horizon = filter
  return out
}

function blockOf(it, latch, overview) {
  var h = latch ? latch.horizon : it.horizon, status = latch ? latch.status : it.status
  return overview ? "all" : status === "doing" || h === "short" ? "short" : h
}
function latchBlock(items, item, streams, latches, overview) {
  var home = effectiveHome(item, streams, null), block = blockOf(item, null, overview)
  return items.filter(function(it) {
    var l = it.status === "done" && latches ? latches[it.id] : null
    return effectiveHome(it, streams, l) === home && blockOf(it, l, overview) === block
  })
}

function composeCaption(tab, filter, stripShown) {
  var text = "New todo"
  if (stripShown) text += " · " + (tab === "overview" || tab === "inbox" ? "Inbox" : tab)
  if (filter && filter !== "all" && filter !== "short") text += " · " + horizonCopy(filter).name
  return text
}
