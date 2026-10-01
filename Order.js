.pragma library
.import "Model.js" as Model
.import "Priority.js" as Priority
.import "Queue.js" as Queue

var DONE_DAYS = 7
var PRIORITY_FIRST = true
var HORIZONS = Priority.HORIZONS
function compareId(a, b) {
  var an = Model.isNumericId(a.id), bn = Model.isNumericId(b.id)
  if (an && bn) return Number(a.id) - Number(b.id)
  if (an !== bn) return an ? -1 : 1
  return 0
}
function comparePriority(a, b) {
  var ap = a.priority === undefined ? null : a.priority
  var bp = b.priority === undefined ? null : b.priority
  if (ap === bp) return 0
  if (ap === null) return 1
  if (bp === null) return -1
  return bp - ap
}
function statusRank(it) { return it.status === "doing" ? 0 : it.status === "done" ? 2 : 1 }
function compareOpen(a, b) {
  var p = comparePriority(a, b), s = statusRank(a) - statusRank(b)
  return (PRIORITY_FIRST ? p || s : s || p) || HORIZONS.indexOf(a.horizon) - HORIZONS.indexOf(b.horizon) || compareId(a, b)
}
function compareSection(a, b) { return comparePriority(a, b) || compareId(a, b) }
function dayStartOf(ms) {
  var d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
function daysBefore(ms, n) {
  var d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n).getTime()
}
function dayKey(ms) {
  var d = new Date(ms)
  function pad(v) { return v < 10 ? "0" + v : String(v) }
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
}
function completedMs(it) { return typeof it.completedAt === "string" ? Date.parse(it.completedAt) : NaN }
function inTail(it, dayStart) { return it.status === "done" && completedMs(it) >= dayStart }
function inWindow(it, dayStart) { return it.status === "done" && completedMs(it) >= daysBefore(dayStart, DONE_DAYS - 1) }
function compareDone(a, b) { return completedMs(b) - completedMs(a) || compareId(a, b) }
function latchOf(item, block, streamUid, tickOrder) {
  var peers = {}
  for (var i = 0; i < block.length; i++) if (block[i].id !== item.id && block[i].status !== "done") peers[block[i].id] = block[i].priority
  return { id: item.id, status: item.status, priority: item.priority, horizon: item.horizon,
    streamUid: streamUid, peers: peers, tickOrder: tickOrder || 0 }
}
function recorded(item, latch) {
  var copy = {}
  for (var k in item) copy[k] = item[k]
  if (latch) { copy.status = latch.status; copy.priority = latch.priority; copy.horizon = latch.horizon }
  return copy
}
// Count preceding peers under tick-time priorities. Sort the live rows first;
// inserting by k (rather than scanning that new order) handles crossing peers.
// `latches` entries pair current display data with the recorded comparator data.
function placeLatched(sorted, latches, comparator) {
  var cmp = comparator || compareOpen
  var held = latches || []
  var places = held.map(function(entry) {
    var l = entry.latch, target = recorded(entry.item, l), k = 0
    sorted.forEach(function(it) {
      var peer = recorded(it, null)
      if (Object.prototype.hasOwnProperty.call(l.peers, it.id)) peer.priority = l.peers[it.id]
      if (cmp(peer, target) < 0) k++
    })
    held.forEach(function(other) {
      if (other !== entry && cmp(recorded(other.item, other.latch), target) < 0) k++
    })
    return { item: entry.item, k: k, order: l.tickOrder }
  }).sort(function(a, b) { return a.k - b.k || a.order - b.order })
  var out = sorted.slice(), last = -1
  places.forEach(function(p) { var at = Math.max(p.k, last + 1); out.splice(at, 0, p.item); last = at })
  return out
}
function placeReopened(items, reopened) {
  var map = reopened || {}
  return items.slice().sort(function(a, b) {
    var am = Object.prototype.hasOwnProperty.call(map, a.id) ? Date.parse(map[a.id]) : completedMs(a)
    var bm = Object.prototype.hasOwnProperty.call(map, b.id) ? Date.parse(map[b.id]) : completedMs(b)
    return bm - am || compareId(a, b)
  })
}

// Grouping for tick snapshots uses the same home and block as displayed rows.
function homeKeyOf(it, catalogue, latch) {
  if (latch && latch.streamUid !== undefined) {
    var held = catalogue.filter(function(s) { return s.uid === latch.streamUid })[0]
    if (held) return held.key
  }
  var home = Model.homeStreamOf(catalogue, it)
  return home ? home.key : it.stream
}
function blockOf(it, latch, overview) {
  var h = latch ? latch.horizon : it.horizon, status = latch ? latch.status : it.status
  return overview ? "all" : status === "doing" || h === "short" ? "short" : h
}
function latchBlock(items, item, catalogue, latches, overview) {
  var home = homeKeyOf(item, catalogue, null), block = blockOf(item, null, overview)
  return items.filter(function(it) {
    var l = it.status === "done" && latches ? latches[it.id] : null
    return homeKeyOf(it, catalogue, l) === home && blockOf(it, l, overview) === block
  })
}
function recordTick(state, action, ctx) {
  var out = { latches: Object.assign({}, state.latches), tickSequence: state.tickSequence }
  var it = Model.findItem(ctx.items, action.id)
  if (!ctx.metadata || ctx.currentTab === "done" || !it || it.status === "done" || action.type !== "setStatus" || action.status !== "done") return out
  var home = Model.homeStreamOf(ctx.catalogue, it)
  var overview = ctx.currentTab === "overview" && Model.activeStreams(ctx.catalogue).length > 1
  var peers = latchBlock(ctx.items, it, ctx.catalogue, out.latches, overview)
  out.latches[it.id] = latchOf(it, peers, home ? home.uid : undefined, out.tickSequence++)
  return out
}
function recordReopen(state, action, ctx) {
  var out = Object.assign({}, state.reopened)
  var it = Model.findItem(ctx.items, action.id)
  if (ctx.currentTab === "done" && it && it.status === "done" && action.type === "setStatus" && action.status === "todo" && !Object.prototype.hasOwnProperty.call(out, it.id)) out[it.id] = it.completedAt
  return out
}

// Translate every task identity in the session, including peer snapshots.
// Reopen latches survive status changes; tick latches survive only done.
function sessionMaps(state, items, idMap) {
  var out = { latches: {}, reopened: {}, sessionDone: {} }, map = idMap || {}
  function real(id) { return Queue.realId(id, map) }
  function find(id) { return items.filter(function(it) { return it.id === id })[0] || null }
  var latches = state.latches || {}, reopened = state.reopened || {}, done = state.sessionDone || {}
  for (var id in latches) {
    var rid = real(id), it = find(rid)
    if (!it || it.status !== "done") continue
    var latch = {}, peers = {}
    for (var k in latches[id]) latch[k] = latches[id][k]
    for (var peer in latch.peers) peers[real(peer)] = latch.peers[peer]
    latch.id = rid; latch.peers = peers
    out.latches[rid] = latch
  }
  for (var r in reopened) if (find(real(r))) out.reopened[real(r)] = reopened[r]
  for (var d in done) {
    var task = find(real(d))
    if (task && task.status === "done") out.sessionDone[real(d)] = done[d]
  }
  return out
}
