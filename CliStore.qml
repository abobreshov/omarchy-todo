import QtQuick
import Quickshell
import Quickshell.Io
import "Store.js" as Store
import "Queue.js" as Queue
import "Errors.js" as Errors
import "Argv.js" as Argv

// The cli backend (PLAN §6.4, A34, A34b): every call is a plain argv
// ArgvProcess built by Argv.js, `[<cliPath>, "--source", "omarchy",
// "--json", <cmd>, …, "--", <free text>]`; a binary that cannot be spawned
// reads as E4 (`missing`). One read Process; writes go through a FIFO, one
// at a time, with one read after each; `sync all` runs single-flight
// outside that FIFO. Writes are optimistic and reverted on failure, never
// retried; a failed write is undone by rebasing the writes still queued
// after it (Queue.rebase), so their optimistic changes stay. A read paints
// only when no write finished since it began (Queue.readApplies, the
// write generation), so a read that started before a commit never shows
// the pre-write board over the optimistic list. Reads happen on load, on
// the change signal (a directory watch on
// the directory of the stamp the board document names, `stamp`, plus the
// `refresh()` push), on `r`, on panel open,
// every 30 s in an error state and every smallest enabled intervalSec while
// the panel is open. In an error state the last list stays (`stale`) and
// mutators reply `unavailable`. Inactive (backend json) it spawns nothing
// and watches nothing.
TodoStore {
  id: store

  hasSync: true
  // E5 on a read: the banner above the last good list (UX §7).
  banner: error && error.kind === "busy" ? Errors.errorView(error, { lastGoodAt: lastGoodAt }).banner : ""

  property string cliPath: "todocli"
  // The directory of todocli's change stamp, taken from the first successful
  // read (`stamp` in the board document, PLAN §3.10) and re-armed on every
  // read; the XDG default stands in until a document names it (an older
  // build prints none).
  property string stampDir: Quickshell.env("HOME") + "/.local/state/todocli/"
  property bool readRequested: false
  property bool watchArmed: false
  property double lastGoodAt: 0
  property var queue: []
  property var pending: null
  // Temporary ids of optimistic adds -> the id todocli replied with (A34).
  property var idMap: ({})
  // The write generation: one more per finished write; a read remembers
  // the generation it was spawned under and paints only if it is unchanged.
  property int writeGen: 0
  property int readGen: 0

  function load() { read() }
  function refresh() { read(); return "ok" }

  // ---- read
  function read() {
    if (!active) return
    if (readProc.running) { readRequested = true; return }
    readGen = writeGen
    readProc.run(Argv.forAction(cliPath, { type: "read" }))
  }

  function finishRead(code, spawnFailed, out, err) {
    var e = Errors.classifyExit(code, err, spawnFailed)
    var doc = e ? null : Store.fromCli(out)
    if (doc && !doc.ok) e = doc.error
    if (e) {
      error = e
      stale = loaded
    } else if (Queue.readApplies(readGen, writeGen, pending, queue.length)) {
      // A read that lands while writes are queued, or that began before a
      // write finished, is superseded by the read after the last of them,
      // so it never undoes an optimistic change.
      items = doc.items
      focus = doc.focus
      sync = doc.sync
      if (Store.stampDir(doc.stamp) !== "") stampDir = Store.stampDir(doc.stamp)
      error = null
      stale = false
      loaded = true
      lastGoodAt = Date.now()
      documentLoaded(doc)
    }
    // The directory watch is armed only after the first read returns and
    // re-armed after every read while the path may still be missing.
    watchArmed = true
    stampWatch.reload()
  }

  // The read asked for while one was running; runs once the read Process
  // has fully stopped.
  function afterRead() {
    if (!readRequested) return
    readRequested = false
    read()
  }

  // ---- mutations (optimistic; a reply means accepted, not committed).
  //      The action is applied to the local doc at once and queued for the
  //      write FIFO with the doc from before it (`before`), the base a
  //      failure rebases the rest of the queue onto.
  function perform(action, done) {
    if (error) return Errors.unavailable(error)
    var r = Store.reduce({ items: items, focus: focus }, action)
    if (!r.ok) return r.reply
    var prev = { items: items, focus: focus }
    items = r.doc.items
    focus = r.doc.focus
    queue.push({ action: r.action, tempId: r.item ? r.item.id : null, before: prev, done: done })
    pump()
    return r.reply
  }

  // ---- writes (FIFO, one at a time, one read after each)
  function pump() {
    if (pending || writeProc.running || queue.length === 0) return
    pending = queue.shift()
    writeProc.run(Argv.forAction(cliPath, Queue.withRealId(pending.action, idMap)))
  }

  function finishWrite(code, spawnFailed, out, err) {
    var e = Errors.classifyExit(code, err, spawnFailed)
    var job = pending
    pending = null
    writeGen += 1
    if (!job) return
    if (e) {
      // Undo this write alone: the doc from before it with the still-queued
      // writes applied again, each rebased (Queue.rebase).
      var r = Queue.rebase(job.before, queue)
      queue = r.entries
      items = r.doc.items
      focus = r.doc.focus
      failed(e)
    } else if (job.tempId) idMap = Queue.rememberId(idMap, job.tempId, out)
    if (job.done) job.done(e)
  }

  // One read after each write, then the next queued write; runs once the
  // write Process has fully stopped.
  function afterWrite() {
    read()
    pump()
  }

  // ---- `sync all`, single-flight outside the write FIFO; a second call
  //      while one runs is ignored (footer shows "Syncing…").
  function syncNow() {
    if (error) return Errors.unavailable(error)
    if (syncProc.running) return "ok"
    syncing = true
    syncProc.run(Argv.forAction(cliPath, { type: "syncNow" }))
    return "ok"
  }

  // A failed sync is the footer's transient (Errors.classifySync reads the
  // envelope's kind), never the store's error: the list stays writable. Only
  // a binary that cannot run at all is E4, as a read would find.
  function finishSync(code, spawnFailed, out, err) {
    syncing = false
    var e = Errors.classifySync(code, out, err, spawnFailed)
    if (!e) {
      Qt.callLater(store.read)
      syncFinished({ ok: true })
      return
    }
    if (e.store) {
      error = { kind: e.kind, message: e.message }
      stale = loaded
    }
    syncFinished({ ok: false, message: e.message, kind: e.kind })
  }

  // ---- processes; follow-up work runs from `stopped`, never from inside
  //      a Process's own exit.
  property ArgvProcess readProc: ArgvProcess {
    onFinished: function(code, spawnFailed, out, err) { store.finishRead(code, spawnFailed, out, err) }
    onStopped: store.afterRead()
  }

  property ArgvProcess writeProc: ArgvProcess {
    onFinished: function(code, spawnFailed, out, err) { store.finishWrite(code, spawnFailed, out, err) }
    onStopped: store.afterWrite()
  }

  property ArgvProcess syncProc: ArgvProcess {
    onFinished: function(code, spawnFailed, out, err) { store.finishSync(code, spawnFailed, out, err) }
  }

  // ---- change signal: todocli replaces the stamp (`<stampDir>/changed`,
  //      the path the board names) after every committed write (PLAN
  //      §3.10); the directory holds no database, so the watch cannot
  //      self-trigger on reads (DECISIONS A-D4). A new stampDir re-binds
  //      the path, and the reload after the read re-arms the watch.
  property FileView stampWatch: FileView {
    path: store.stampDir
    watchChanges: store.active && store.watchArmed
    printErrors: false
    onFileChanged: store.stampTimer.restart()
  }

  property Timer stampTimer: Timer {
    interval: 150
    repeat: false
    onTriggered: store.read()
  }

  // Automatic retry every 30 s in an error state (AC-17.3).
  property Timer errorRetry: Timer {
    interval: 30000
    repeat: true
    running: store.active && store.error !== null
    onTriggered: store.read()
  }

  // Every smallest enabled intervalSec while the panel is open, so the
  // footer's `lastAttemptAt` and E10 stay live between stamps.
  property Timer intervalRead: Timer {
    interval: Math.max(1000, Store.smallestInterval(store.sync) * 1000)
    repeat: true
    running: store.active && store.opened && Store.smallestInterval(store.sync) > 0
    onTriggered: store.read()
  }

  onOpenedChanged: if (opened) read()
  // A new cliPath applies at once, not only at the next retry.
  onCliPathChanged: if (active) Qt.callLater(store.read)
  onActiveChanged: if (!active) {
    queue = []
    readRequested = false
    idMap = {}
  }
}
