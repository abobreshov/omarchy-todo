.pragma library
.import "Model.js" as Model
.import "Order.js" as Order
.import "Priority.js" as Priority

var NOTCH = 120
var RATIO = 2
var QUIET_MS = 300
var PX_PER_STEP = 48
var ICON_TAB_WIDTH = 32
var INDICATOR_WIDTH = 24
var FILTERS = ["all"].concat(Priority.HORIZONS)
function cycleFilter(filter) { return FILTERS[(Math.max(0, FILTERS.indexOf(filter)) + 1) % FILTERS.length] }
var E21 = "No streams yet · todocli stream add adds one"
var E22 = "Streams need backend = cli."
var E23 = "Streams need a newer todocli."
function active(streams) { return Model.activeStreams(streams) }
function labelOf(stream, streams) {
  if (stream.system) return "Inbox"
  var shared = active(streams).filter(function(s) { return s.name.toLowerCase() === stream.name.toLowerCase() }).length > 1
  if (!shared) return Model.pillLabel(stream.name, 10)
  var group = stream.group || "", minimumGroup = group.length > 1 ? 2 : group.length
  var name = stream.name.length + minimumGroup + 1 > 10 ? Model.pillLabel(stream.name, 7) : stream.name
  var room = 10 - name.length - 1
  return (group.length <= room ? group : group.slice(0, Math.max(1, room - 1)) + "…") + ":" + name
}
function tabsOf(streams) {
  var list = active(streams), out = [{ uid: "overview", key: "overview", label: "Overview", digit: 0, boundary: false }]
  list.forEach(function(s, i) {
    out.push({ uid: s.uid, key: s.key, label: labelOf(s, list), digit: i < 9 ? i + 1 : null,
      boundary: i > 0 && list[i - 1].group !== s.group, stream: s })
  })
  if (list.length > 1) out.push({ uid: "done", key: "done", label: "Done", digit: null, boundary: false })
  return out
}
function tooltipOf(tab, items, dayStart, catalogue) {
  if (tab.key === "overview") return "Overview · every stream · key 0"
  if (tab.key === "done") return "Done\n" + items.filter(function(it) { return Order.inWindow(it, dayStart) }).length + " done in the last " + Order.DONE_DAYS + " days"
  var scope = items.filter(function(it) { return (tab.key === "inbox" ? Model.isOrphan(catalogue || [], it) || it.stream === "inbox" : it.stream === tab.key) && it.status !== "done" })
  return (tab.key === "inbox" ? "Inbox" : tab.key) + "\n" + scope.length + " open · " + scope.filter(function(it) { return it.status === "doing" }).length + " doing" + (tab.digit !== null ? "\nKey " + tab.digit : "")
}
function byDigit(tabs, digit) { return tabs.filter(function(t) { return t.digit !== null && t.digit === Number(digit) })[0] || null }
function resolve(tabs, query) {
  var q = Model.squish(query).toLowerCase()
  if (q === "overview" || q === "done") return tabs.filter(function(t) { return t.key === q })[0] || "unknown stream"
  if (/^[0-9]$/.test(q)) return byDigit(tabs, q) || "unknown stream"
  var streams = tabs.filter(function(t) { return t.stream })
  var exact = streams.filter(function(t) { return t.key.toLowerCase() === q || t.key.replace(/: /g, ":").toLowerCase() === q })
  if (exact.length) return exact[0]
  var names = streams.filter(function(t) { return t.stream.name.toLowerCase() === q })
  return names.length === 1 ? names[0] : names.length ? "ambiguous stream" : "unknown stream"
}
function step(tabs, uid, direction, moving) {
  var list = moving ? tabs.filter(function(t) { return t.stream }) : tabs
  var at = list.map(function(t) { return t.uid }).indexOf(uid)
  return list[Math.max(0, Math.min(list.length - 1, at + direction))] || null
}
// viewport is the whole-tab budget (AC-ST.23), after pinned/indicator boxes. Both
// indicators reserve their space together, so their geometry cannot jump.
function stripLayout(widths, pinned, highlighted, viewport, prevFirst) {
  var count = widths.length, total = 0
  for (var i = pinned; i < count; i++) total += widths[i]
  var reserve = total > viewport ? 2 * INDICATOR_WIDTH : 0
  var budget = Math.max(0, viewport)
  var first = reserve ? Math.max(pinned, Math.min(count - 1, prevFirst === undefined ? pinned : prevFirst)) : pinned
  function endAt(start) {
    var sum = 0, end = start - 1
    for (var j = start; j < count && sum + widths[j] <= budget; j++) { sum += widths[j]; end = j }
    return end
  }
  var last = endAt(first)
  if (highlighted >= pinned && highlighted < count) {
    if (highlighted < first) first = highlighted
    else while (highlighted > endAt(first) && first < highlighted) first++
    last = endAt(first)
  }
  return { first: first, last: last, hiddenLeft: first - pinned, hiddenRight: Math.max(0, count - last - 1), reserve: reserve }
}
function wheel(state, event) {
  var ev = event || {}, prev = state || {}, at = ev.at === undefined ? 0 : ev.at
  var fresh = ev.phase === 1 || ev.phase === "begin" || prev.at === undefined || at - prev.at >= QUIET_MS
  var s = { x: fresh ? 0 : prev.x || 0, y: fresh ? 0 : prev.y || 0, latched: fresh ? false : prev.latched === true, at: at }
  if (ev.phase === 3 || ev.phase === "end") return { state: {}, step: 0 }
  if (ev.phase === 4 || ev.phase === "momentum") return { state: s, step: 0 }
  var pixels = (ev.px || 0) !== 0 || (ev.py || 0) !== 0
  s.x += pixels ? (ev.px || 0) * NOTCH / PX_PER_STEP : (ev.ax === undefined ? ev.x || 0 : ev.ax)
  s.y += pixels ? (ev.py || 0) * NOTCH / PX_PER_STEP : (ev.ay === undefined ? ev.y || 0 : ev.ay)
  var axis = ev.shift ? s.y : s.x
  var fires = Math.abs(axis) >= NOTCH && (ev.shift || Math.abs(s.x) > RATIO * Math.abs(s.y))
  var direction = fires && !s.latched ? (axis < 0 ? 1 : -1) : 0
  if (direction) s.latched = true
  return { state: s, step: direction }
}
function shiftWheel(state, ev) {
  var copy = {}
  for (var k in ev) copy[k] = ev[k]
  copy.shift = true
  return wheel(state, copy)
}
function unavailable(ctx, needsStrip) {
  if (ctx.backend !== "cli") return E22
  if (ctx.hasStreams !== true) return E23
  if (needsStrip && active(ctx.catalogue).length < 2) return E21
  return ""
}
function ipcTab(tabs, name, ctx) {
  var error = unavailable(ctx, false)
  if (error !== "") return { reply: error, uid: null }
  var single = active(ctx.catalogue).length < 2
  if (single && Model.squish(name).toLowerCase() === "done") return { reply: E21, uid: null }
  var resolved = resolve(tabs, name)
  if (typeof resolved === "string") return { reply: resolved, uid: null }
  return { reply: "ok", uid: single ? "overview" : resolved.uid }
}
function wheelLatched(state, now) {
  return state.latched === true && now - state.at < QUIET_MS
}
function targetOf(ui, ctx) { return ui.moving ? active(ctx.catalogue).filter(function(s) { return s.uid === ui.moving.targetUid })[0] || null : null }
function movePrompt(ui, ctx) {
  var target = targetOf(ui, ctx)
  return target ? "Move #" + ui.moving.id + " to " + labelOf(target, ctx.catalogue) + " · [ ] 1-9 · Enter · Esc" : ""
}
function reduce(ui, event, ctx) {
  var next = {}, actions = [], ev = event || {}, c = ctx || {}, tabs = tabsOf(c.catalogue)
  for (var k in ui) next[k] = ui[k]
  function message(text) { actions.push({ type: "message", text: text }) }
  function choose(tab) {
    if (!tab) return
    if (next.moving) {
      if (c.busy || tab.stream === undefined) return
      var it = Model.findItem(c.items || [], next.moving.id)
      if (it && it.stream !== tab.key) actions.push({ type: "move", id: it.id, stream: tab.key })
      next.moving = null
    } else if (tab.uid !== (c.currentTab || "overview")) actions.push({ type: "selectTab", uid: tab.uid })
  }
  var key = ev.type === "key" ? ev.key : ""
  if (next.view !== "list" && ev.type !== "rows") return null
  if (ev.type === "rows") {
    if (next.moving) {
      if (!Model.findItem(c.items || [], next.moving.id)) next.moving = null
      else if (!targetOf(next, c)) {
        var old = (c.previousCatalogue || []).filter(function(s) { return s.uid === next.moving.targetUid })[0]
        message((old ? old.key : "Stream") + " was archived · move cancelled")
        next.moving = null
      }
    }
    return { ui: next, actions: actions }
  }
  if (["open", "close", "storeError", "selectTask", "resetCursor"].indexOf(ev.type) !== -1) return null
  if (next.moving) {
    if (ev.type === "highlightTab") {
      var aimed = tabs.filter(function(t) { return t.uid === ev.uid && t.stream !== undefined })[0]
      if (aimed) next.moving = { id: next.moving.id, targetUid: aimed.uid }
    }
    else if (ev.type === "esc" || key === "m") next.moving = null
    else if (ev.type === "enter" || ev.type === "space") choose(tabs.filter(function(t) { return t.uid === next.moving.targetUid })[0])
    else if (/^[1-9]$/.test(key)) choose(byDigit(tabs, key))
    else if (ev.type === "chooseTab") choose(tabs.filter(function(t) { return t.uid === ev.uid })[0])
    else if (key === "[" || key === "]" || ev.type === "stepTab") {
      var target = step(tabs, next.moving.targetUid, ev.type === "stepTab" ? ev.direction : key === "]" ? 1 : -1, true)
      if (target) next.moving = { id: next.moving.id, targetUid: target.uid }
    }
    return { ui: next, actions: actions }
  }
  var navigation = key === "[" || key === "]" || /^[0-9]$/.test(key) || ev.type === "chooseTab" || ev.type === "stepTab"
  if (!navigation && key !== "m" && key !== "v") return null
  if (key === "m" && !c.item) return { ui: next, actions: actions }
  if (c.currentTab === "done" && (key === "m" || key === "v")) return { ui: next, actions: actions }
  var error = unavailable(c, key !== "v")
  if (error !== "") { message(error); return { ui: next, actions: actions } }
  if (navigation) {
    var tab = ev.type === "chooseTab" ? tabs.filter(function(t) { return t.uid === ev.uid })[0] : /^[0-9]$/.test(key) ? byDigit(tabs, key) : step(tabs, c.currentTab || "overview", ev.type === "stepTab" ? ev.direction : key === "]" ? 1 : -1, false)
    choose(tab)
  } else if (key === "v") {
    next.horizonFilter = cycleFilter(next.horizonFilter || "all")
  } else if (!c.busy && c.item) {
    var home = Model.homeStreamOf(c.catalogue, c.item)
    if (home) { next.moving = { id: c.item.id, targetUid: home.uid }; next.armedId = "" }
  }
  return { ui: next, actions: actions }
}
