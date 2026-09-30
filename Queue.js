.pragma library
.import "Store.js" as Store

// The cli store's ordering rules and optimistic id map (A34); pure, tested
// under Node.

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

// A read's document may be painted only when nothing can have moved the
// store since the read began: no write finished between its start and its
// return (`startedGen` is the store's write generation when the read was
// spawned, `writeGen` the generation now), none is in flight and none is
// queued. Otherwise the read after the last write supersedes it, so a read
// that began before a commit never paints the pre-write board over the
// optimistic list, not even for one cycle.
function readApplies(startedGen, writeGen, pending, queued) {
  return startedGen === writeGen && !pending && queued === 0
}

// A failed optimistic write is undone without erasing the optimistic
// writes queued after it: the doc from before the failed write, with every
// still-queued action applied again in order, and each queued entry rebased
// onto the doc before it, so a later failure reverts only its own change.
// An add replays under its own temporary id (the row and the id map stay
// valid); an action the rebased doc refuses is skipped, as its own write is
// about to be refused too. Returns the doc to show and the rebased entries.
function rebase(before, entries) {
  var d = Store.docOf(before)
  var out = []
  var list = entries || []
  for (var i = 0; i < list.length; i++) {
    var e = list[i] || {}
    var next = {}
    for (var k in e) next[k] = e[k]
    next.before = d
    var action = e.action
    if (action && action.type === "add" && e.tempId) {
      var withId = {}
      for (var f in action) withId[f] = action[f]
      withId.id = String(e.tempId)
      action = withId
    }
    var r = Store.reduce(d, action)
    if (r.ok) d = r.doc
    out.push(next)
  }
  return { doc: d, entries: out }
}
