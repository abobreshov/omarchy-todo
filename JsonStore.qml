import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model
import "Argv.js" as Argv

// The json backend: upstream's FileView + atomicWrites + guarded-before-write
// persistence (the pattern the first-party notifications service uses),
// with the version 2 document (PLAN A17). Differences from upstream: the
// state directory is made with `install -d -m 0700` (AC-2.10); the first
// start without a file of its own reads the upstream plugin's file once and
// saves a copy, never writing it (AC-2.6); an unparsable non-empty file
// shows a banner and blocks saves instead of being overwritten (E14).
// Nothing here spawns a process other than `install`, and never todocli.
QtObject {
  id: store

  // ---- the store interface (PLAN §6.4); views bind to these only
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

  readonly property string stateDir: Quickshell.env("HOME") + "/.local/state/abobreshov.todo/"
  readonly property string savePath: stateDir + "todos.json"
  readonly property string upstreamPath: Quickshell.env("HOME") + "/.local/state/tathagat11.checklist-todo/todos.json"

  // E14: the file could not be parsed; saves stay blocked until it reads.
  property bool blocked: false
  property bool triedUpstream: false

  function applyLoaded(raw) {
    var doc = Model.parseDocument(raw)
    if (!doc.ok) {
      banner = Model.MSG_UNREADABLE
      blocked = true
      loaded = true
      return
    }
    banner = ""
    blocked = false
    // Skip no-op updates so this instance's own write (and the directory
    // reload it provokes) does not churn the views on every save.
    if (loaded && Model.serializeDocument(doc) === Model.serializeDocument({ focus: focus, todos: items })) return
    items = doc.todos
    focus = doc.focus
    loaded = true
    documentLoaded(doc)
  }

  // First run: no file of our own. Read the upstream plugin's file once,
  // keep its ids, and save a v2 copy in our own path.
  function onOwnFileMissing() {
    if (loaded) return
    if (!triedUpstream) {
      triedUpstream = true
      upstreamFile.path = upstreamPath
      return
    }
    applyLoaded("")
  }

  function applyUpstream(raw) {
    if (loaded) return
    var doc = Model.parseDocument(raw)
    items = doc.ok ? doc.todos : []
    focus = doc.ok ? doc.focus : { text: "", taskId: null }
    loaded = true
    documentLoaded(doc)
    if (items.length > 0) saveNow()
  }

  function saveNow() {
    // Never write before reading: a save issued in the gap between
    // construction and the file landing would clobber the list we are
    // about to restore.
    if (!loaded || blocked) return
    saveFile.setText(Model.serializeDocument({ focus: focus, todos: items }))
  }

  function scheduleSave() { saveTimer.restart() }

  function reloadFromDisk() {
    saveFile.reload()
    // Start (or restart) the directory watch now the directory exists.
    stateDirWatch.reload()
  }

  function load() { ensureDirProc.running = true }
  function refresh() { reloadFromDisk(); return "ok" }

  // ---- mutations (synchronous; replies are final, as upstream)
  function add(name, description) {
    var r = Model.addItem(items, name, description)
    if (r.reply === "empty") return "empty"
    items = r.items
    scheduleSave()
    return r.reply
  }

  function setStatus(id, status) {
    var r = Model.setStatus({ items: items, focus: focus }, id, status)
    if (r.reply !== "ok") return r.reply
    items = r.items
    focus = r.focus
    scheduleSave()
    return "ok"
  }

  function setFocus(idOrClear, done) {
    var r = Model.setFocus({ items: items, focus: focus }, idOrClear)
    if (r.reply === "ok") {
      items = r.items
      focus = r.focus
      scheduleSave()
    }
    if (typeof done === "function") done(r.reply === "ok" ? null : r.reply)
    return r.reply
  }

  function toggleStep(id, n) {
    var r = Model.toggleStep(items, id, n)
    if (r.reply !== "ok") return r.reply
    items = r.items
    scheduleSave()
    return "ok"
  }

  function remove(id) {
    var r = Model.removeItem({ items: items, focus: focus }, id)
    if (r.reply !== "ok") return r.reply
    items = r.items
    focus = r.focus
    scheduleSave()
    return "ok"
  }

  function syncNow() { return Model.MSG_SYNC_NEEDS_CLI }

  // ---- persistence objects
  property Process ensureDirProc: Process {
    command: Argv.stateDir(store.stateDir)
    onExited: Qt.callLater(store.reloadFromDisk)
  }

  property FileView saveFile: FileView {
    path: store.savePath
    watchChanges: false
    atomicWrites: true
    printErrors: false
    onLoaded: store.applyLoaded(text())
    // First run: no file yet. FileView reports that as a load failure, and
    // without this branch `loaded` stays false forever and saving is a no-op.
    // After E14 a missing file means the user deleted the unreadable one, as
    // the banner suggests: the block lifts and the list starts empty.
    onLoadFailed: store.blocked ? store.applyLoaded("") : store.onOwnFileMissing()
  }

  property FileView upstreamFile: FileView {
    path: ""
    watchChanges: false
    printErrors: false
    onLoaded: store.applyUpstream(text())
    onLoadFailed: store.applyUpstream("")
  }

  // Watch the directory rather than the file: the file does not exist on the
  // first run, and atomic writes replace its inode, so a file watch would go
  // quiet after the first write. The directory always exists and sees every
  // rewrite, which is what keeps both monitors' panels in step.
  property FileView stateDirWatch: FileView {
    path: store.stateDir
    watchChanges: true
    printErrors: false
    onFileChanged: store.dirReloadTimer.restart()
  }

  property Timer dirReloadTimer: Timer {
    interval: 150
    repeat: false
    onTriggered: if (store.loaded) store.saveFile.reload()
  }

  property Timer saveTimer: Timer {
    interval: 300
    repeat: false
    onTriggered: store.saveNow()
  }
}
