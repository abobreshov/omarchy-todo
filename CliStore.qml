import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model
import "Argv.js" as Argv

// The cli backend (PLAN §6.4, A34, A34b): every call is a plain argv
// `Process` built by Argv.js, `[<cliPath>, "--source", "omarchy", "--json",
// <cmd>, …, "--", <free text>]`, run behind `/usr/bin/env` so a missing
// binary exits 127 (Quickshell 0.3.1 emits no `exited` for a spawn failure).
// One read Process; writes go through a FIFO, one at a time, with one read
// after each; `sync all` runs single-flight outside that FIFO. Writes are
// optimistic and reverted on failure, never retried. Reads happen on load,
// on the change signal (a directory watch on todocli's state dir plus the
// `refresh()` push), on `r`, on panel open, every 30 s in an error state and
// every smallest enabled intervalSec while the panel is open. In an error
// state the last list stays (`stale`) and mutators reply `unavailable`.
// Inactive (backend json) it spawns nothing and watches nothing.
QtObject {
  id: store

  // ---- the store interface (PLAN §6.4)
  property var items: []
  property var focus: ({ text: "", taskId: null })
  property bool loaded: false
  property var error: null
  property bool stale: false
  property var sync: []
  property bool syncing: false
  property string banner: ""
  property bool opened: false

  signal documentLoaded(var doc)
  signal failed(var error)
  signal syncFinished(var result)

  property bool active: false
  property string cliPath: "todocli"
  readonly property string stampDir: Quickshell.env("HOME") + "/.local/state/todocli/"
  property bool hadList: false
  property bool readRequested: false
  property bool watchArmed: false
  property double lastGoodAt: 0
  property var queue: []
  property var pending: null

  function load() { read() }
  function refresh() { read(); return "ok" }

  // ---- read
  function read() {
    if (!active) return
    if (readProc.running) { readRequested = true; return }
    readExited = false
    readProc.command = Argv.forAction(cliPath, { type: "read" }, { envPrefix: true })
    readProc.running = true
  }

  function finishRead(code, spawnFailed) {
    var err = Model.classifyExit(code, readErr.text, spawnFailed)
    if (!err) {
      var doc = Model.fromCli(readOut.text)
      if (!doc.ok) err = doc.error
      else {
        items = doc.items
        focus = doc.focus
        sync = doc.sync
        error = null
        stale = false
        hadList = true
        loaded = true
        lastGoodAt = Date.now()
        documentLoaded(doc)
      }
    }
    if (err) {
      error = err
      stale = hadList
    }
    // The directory watch is armed only after the first read returns and
    // re-armed after every read while the path may still be missing.
    watchArmed = true
    stampWatch.reload()
  }

  // Runs once the read Process has fully stopped (never from inside its own
  // exited handler): the read that was asked for meanwhile.
  function afterRead() {
    if (readRequested) {
      readRequested = false
      read()
    }
  }

  // ---- writes (FIFO, one at a time, one read after each)
  function enqueue(action, revert, done) {
    queue.push({ action: action, revert: revert, done: done })
    pump()
  }

  function pump() {
    if (pending || writeProc.running || queue.length === 0) return
    pending = queue.shift()
    writeExited = false
    writeProc.command = Argv.forAction(cliPath, pending.action, { envPrefix: true })
    writeProc.running = true
  }

  function finishWrite(code, spawnFailed) {
    var err = Model.classifyExit(code, writeErr.text, spawnFailed)
    var job = pending
    pending = null
    if (job) {
      if (err && typeof job.revert === "function") job.revert()
      if (err) failed(err)
      if (typeof job.done === "function") job.done(err)
    }
  }

  // One read after each write, then the next queued write; runs once the
  // write Process has fully stopped.
  function afterWrite() {
    read()
    pump()
  }

  // ---- mutations (optimistic; replies mean accepted, not committed)
  function add(name, description) {
    if (error) return Model.unavailable(error)
    var r = Model.addItem(items, name, description)
    if (r.reply === "empty") return "empty"
    var tempId = r.item.id
    items = r.items
    enqueue({ type: "add", name: r.reply, description: Model.squish(description) }, function() {
      items = Model.removeItem({ items: items, focus: focus }, tempId).items
    }, null)
    return r.reply
  }

  function setStatus(id, status) {
    if (error) return Model.unavailable(error)
    var r = Model.setStatus({ items: items, focus: focus }, id, status)
    if (r.reply !== "ok") return r.reply
    var prevItems = items
    var prevFocus = focus
    items = r.items
    focus = r.focus
    enqueue({ type: "setStatus", id: String(id), status: status }, function() { items = prevItems; focus = prevFocus }, null)
    return "ok"
  }

  function setFocus(idOrClear, done) {
    if (error) {
      if (typeof done === "function") done(error)
      return Model.unavailable(error)
    }
    var r = Model.setFocus({ items: items, focus: focus }, idOrClear)
    if (r.reply !== "ok") {
      if (typeof done === "function") done(r.reply)
      return r.reply
    }
    var prevItems = items
    var prevFocus = focus
    items = r.items
    focus = r.focus
    enqueue({ type: "focus", id: String(idOrClear) }, function() { items = prevItems; focus = prevFocus }, done)
    return "ok"
  }

  function toggleStep(id, n) {
    if (error) return Model.unavailable(error)
    var r = Model.toggleStep(items, id, n)
    if (r.reply !== "ok") return r.reply
    var prevItems = items
    items = r.items
    enqueue({ type: "toggleStep", id: String(id), n: Number(n) }, function() { items = prevItems }, null)
    return "ok"
  }

  function remove(id) {
    if (error) return Model.unavailable(error)
    var r = Model.removeItem({ items: items, focus: focus }, id)
    if (r.reply !== "ok") return r.reply
    var prevItems = items
    var prevFocus = focus
    items = r.items
    focus = r.focus
    enqueue({ type: "remove", id: String(id) }, function() { items = prevItems; focus = prevFocus }, null)
    return "ok"
  }

  // `sync all`, single-flight outside the write FIFO; a second call while
  // one runs is ignored (footer shows "Syncing…").
  function syncNow() {
    if (error) return Model.unavailable(error)
    if (syncProc.running) return "ok"
    syncing = true
    syncExited = false
    syncProc.command = Argv.forAction(cliPath, { type: "syncNow" }, { envPrefix: true })
    syncProc.running = true
    return "ok"
  }

  function finishSync(code, spawnFailed) {
    syncing = false
    var err = Model.classifyExit(code, syncErr.text, spawnFailed)
    if (!err) {
      Qt.callLater(store.read)
      syncFinished({ ok: true })
    } else if (err.kind === "busy") {
      syncFinished({ ok: false, message: Model.MSG_SYNC_RUNNING })
    } else {
      error = err
      stale = hadList
      syncFinished({ ok: false, error: err })
    }
  }

  // ---- processes. Quickshell 0.3.1 flips `running` back to false without
  //      `started` or `exited` when a binary cannot be spawned; the env
  //      prefix makes that exit 127 instead, and the `*Exited` flags keep
  //      the FIFO moving should it ever happen anyway. Follow-up work is
  //      deferred with Qt.callLater so no Process is restarted from inside
  //      its own exited handler.
  property bool readExited: true
  property bool writeExited: true
  property bool syncExited: true

  property Process readProc: Process {
    stdout: StdioCollector { id: readOut; waitForEnd: true }
    stderr: StdioCollector { id: readErr; waitForEnd: true }
    onExited: function(exitCode) {
      store.readExited = true
      store.finishRead(exitCode, false)
    }
    onRunningChanged: {
      if (running) return
      if (!store.readExited) {
        store.readExited = true
        store.finishRead(-1, true)
      }
      Qt.callLater(store.afterRead)
    }
  }

  property Process writeProc: Process {
    stdout: StdioCollector { id: writeOut; waitForEnd: true }
    stderr: StdioCollector { id: writeErr; waitForEnd: true }
    onExited: function(exitCode) {
      store.writeExited = true
      store.finishWrite(exitCode, false)
    }
    onRunningChanged: {
      if (running) return
      if (!store.writeExited) {
        store.writeExited = true
        store.finishWrite(-1, true)
      }
      Qt.callLater(store.afterWrite)
    }
  }

  property Process syncProc: Process {
    stdout: StdioCollector { id: syncOut; waitForEnd: true }
    stderr: StdioCollector { id: syncErr; waitForEnd: true }
    onExited: function(exitCode) {
      store.syncExited = true
      store.finishSync(exitCode, false)
    }
    onRunningChanged: {
      if (running) return
      if (!store.syncExited) {
        store.syncExited = true
        store.finishSync(-1, true)
      }
    }
  }

  // ---- change signal: todocli replaces `<stampDir>/changed` after every
  //      committed write (PLAN §3.10); the directory holds no database, so
  //      the watch cannot self-trigger on reads (DECISIONS A-D4).
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
    interval: Math.max(1000, Model.smallestInterval(store.sync) * 1000)
    repeat: true
    running: store.active && store.opened && Model.smallestInterval(store.sync) > 0
    onTriggered: store.read()
  }

  onOpenedChanged: if (opened) read()
  // A new cliPath applies at once, not only at the next retry.
  onCliPathChanged: if (active) Qt.callLater(store.read)
  onActiveChanged: {
    if (active) read()
    else {
      queue = []
      readRequested = false
    }
  }
}
