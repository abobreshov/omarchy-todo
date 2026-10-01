.pragma library

// The 2.1.0 done-tail board (CHANGELOG 2.1.1): the shape of the live board
// the empty row was seen on, with the titles and notes replaced. Seven
// tasks, the Inbox the only stream (no tab strip): #12 doing, #7 #8 #9 #13
// todo, #11 done on 2026-10-01 (the tail), #10 done 2026-09-30 at 23:12 BST
// (in London, not in the tail). A free-text focus, so the focus line is row 0.

var INBOX = { uid: "00000000-0000-7000-8000-000000000001", key: "inbox", group: null, name: "inbox",
  position: 0, system: true, createdAt: "2026-09-30T00:00:00.000Z", archivedAt: null, open: 5 }

function steps(n, done) {
  var out = []
  for (var i = 0; i < n; i++) out.push({ text: "step " + (i + 1), done: i < done })
  return out
}

function task(id, title, status, completedAt, plan) {
  return { id: id, uid: "u" + id, title: title, status: status, notes: [], plan: plan,
    createdAt: "2026-09-30T10:53:16.826Z", updatedAt: "2026-10-01T13:45:10.597Z", description: "",
    due: null, completedAt: completedAt, startedAt: null, source: "claude", author: null,
    stream: "inbox", labels: [], horizon: "short", priority: null, size: null }
}

var TASKS = [
  task(7, "Pay the yearly property tax on the council portal before the deadline, penalties accrue daily after", "todo", null, []),
  task(8, "Review the video course subscription (auto-renewed 28 Sep) and keep or cancel", "todo", null, []),
  task(9, "Download the genome data files (raw, phased, imputed) from the provider account", "todo", null, []),
  task(10, "Release the app", "done", "2026-09-30T22:12:25.554Z", []),
  task(11, "Rotate the compliance webhook public key (the partner went live on the new key)", "done", "2026-10-01T13:45:10.597Z", steps(5, 5)),
  task(12, "Update the deploy tool in the pipeline repo to render env on staging and prod", "doing", null, steps(13, 2)),
  task(13, "Delete the last admin-panel parameter in prod", "todo", null, steps(4, 0))
]

// streams: the catalogue (default: the Inbox alone); stream: every task's
// stream; horizons / homes: per-id overrides; old: an older todocli's board,
// with no catalogue and no S9 fields.
function board(streams, stream, horizons, homes, old) {
  var tasks = TASKS.map(function(t) {
    var copy = JSON.parse(JSON.stringify(t)), id = String(t.id)
    if (stream) copy.stream = stream
    if (homes && homes[id]) copy.stream = homes[id]
    if (horizons && horizons[id]) copy.horizon = horizons[id]
    if (old) ["stream", "labels", "horizon", "priority", "size"].forEach(function(k) { delete copy[k] })
    return copy
  })
  var doc = { version: 1, focus: "Finish the deploy tool rollout: prod prerequisites then render on (task #12)",
    focus_task: null, tasks: tasks, stamp: "",
    sync: [{ name: "obsidian", enabled: true, lastOkAt: "2026-10-01T13:44:48.142Z", lastAttemptAt: "2026-10-01T13:44:48.142Z", intervalSec: null, error: null }] }
  if (!old) doc.streams = streams || [INBOX]
  return JSON.stringify(doc)
}
