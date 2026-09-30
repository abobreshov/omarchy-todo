pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "Errors.js" as Errors
import "View.js" as View
import "Chrome.js" as Chrome
import "Pomodoro.js" as Pomodoro
import "Keys.js" as KeyMap

// The todo panel: the composition root. The BarWidget.qml entry point owns
// the IPC target and lifecycle forwarding; this file picks the store
// (`backend === "cli" ? cliStore : jsonStore`, PLAN §6.4), runs the view
// machine through KeyMap.reduceUi, applies the actions it returns to the
// store, and hosts the views (TaskList, ComposeView, DetailView,
// StatusFooter). All logic lives in the .js libraries; this file binds and
// forwards.
Panel {
  id: root

  moduleName: "abobreshov.todo"
  ipcTarget: "abobreshov.todo"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  property bool vertical: false
  readonly property var barIdentity: hostWidget || root

  readonly property color contentForeground: bar ? bar.foreground : Color.foreground
  readonly property string contentFontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property color dimForeground: Qt.darker(contentForeground, 1.5)

  // ---- settings (PLAN §6.5, A18): every read goes through setting() and
  //      Model.coerce; a backend change reloads from the other store.
  readonly property var cfg: Model.coerce({
    backend: setting("backend", Model.DEFAULTS.backend),
    cliPath: setting("cliPath", Model.DEFAULTS.cliPath),
    pomodoroTarget: setting("pomodoroTarget", Model.DEFAULTS.pomodoroTarget),
    maxChars: setting("maxChars", Model.DEFAULTS.maxChars)
  })
  readonly property string backend: cfg.backend
  readonly property string cliPath: cfg.cliPath
  readonly property string pomodoroTarget: cfg.pomodoroTarget
  readonly property int maxChars: cfg.maxChars
  // The one place the backend is looked at: everything else binds to `store`.
  readonly property TodoStore store: backend === "cli" ? cliStore : jsonStore

  // ---- state
  property var ui: KeyMap.initialUi()
  // Rows ticked done during this panel session: id -> pre-tick status. Only
  // the pruned map is read, so a reverted write or an external reopen drops
  // the row from it at once (UX §4.5 done-row rule; PLAN A34b).
  property var sessionDone: ({})
  readonly property var liveSessionDone: View.pruneSessionDone(sessionDone, items)
  property string message: ""
  property double clockNow: Date.now()

  readonly property var items: store.items
  readonly property var focusModel: store.focus
  readonly property var pomodoro: pomo.view
  readonly property int openCount: View.openCount(items)
  readonly property string countLabel: View.countLabel(items)
  readonly property var listItems: View.sortForList(View.visibleItems(items, liveSessionDone), liveSessionDone)
  readonly property var focusLineModel: View.focusLine(items, focusModel, pomodoro)
  readonly property int firstRow: focusLineModel ? 1 : 0
  readonly property var rows: View.listRows(focusLineModel, listItems)
  readonly property var detailItem: Model.findItem(items, ui.selectedId)
  readonly property var pill: Chrome.pillState({
    backend: backend, loaded: store.loaded, error: store.error, items: items, focus: focusModel,
    sync: store.sync, vertical: vertical, maxChars: maxChars, now: clockNow
  })
  readonly property var footerModel: store.hasSync ? Chrome.footer(store.sync, clockNow, { syncing: store.syncing }) : null
  readonly property var errorModel: Errors.errorView(store.error, { cliPath: cliPath, moduleName: moduleName })
  readonly property string banner: store.banner
  readonly property bool errored: store.error !== null
  // E3: the empty-state copy waits for the first read; `Loading…` shows
  // instead, and only once the first read has taken 300 ms.
  readonly property bool loading: !store.loaded && store.error === null
  property bool loadingShown: false
  readonly property string emptyCopy: loading ? (loadingShown ? "Loading…" : "") : (store.loaded ? (View.emptyCopy(items) || "") : "")
  onLoadingChanged: if (!loading) loadingShown = false
  readonly property var storeError: store.error
  // Change handlers below write `ui`; during construction the first
  // evaluation of a readonly binding also emits its change signal, which
  // would loop back into any binding that read `ui`, so they wait for
  // Component.onCompleted.
  property bool ready: false

  onStoreErrorChanged: if (ready) dispatch({ type: "storeError", error: storeError })

  // Deferred so every setting derived from the new `settings` object (the
  // cli path in particular) has settled before the other store loads.
  onStoreChanged: if (ready) Qt.callLater(root.applyBackend)

  function applyBackend() {
    sessionDone = ({})
    message = ""
    store.load()
  }

  // Coming back to a shut panel always lands on the list, whatever tab was
  // left showing; done rows are hidden again (A-D7).
  onOpenedChanged: {
    if (!ready) return
    if (!opened) {
      sessionDone = ({})
      dispatch({ type: "close" })
    } else {
      dispatch({ type: "open" })
      clockNow = Date.now()
    }
  }

  Component.onCompleted: {
    ready = true
    store.load()
  }

  function focusKeyCatcher() {
    Qt.callLater(function() { if (bodyPanel) bodyPanel.focusKeys() })
  }

  function showMessage(text) {
    message = String(text || "")
    messageTimer.restart()
  }

  // ---- the reducer
  function reducerCtx() {
    return {
      rows: rows, steps: detailItem ? detailItem.plan.length : 0, backend: backend, focus: focusModel,
      sessionDone: liveSessionDone, pomodoro: pomodoro, prefill: focusModel && focusModel.text ? focusModel.text : ""
    }
  }

  function dispatch(event) {
    event.now = Date.now()
    var r = KeyMap.reduceUi(ui, event, reducerCtx())
    ui = r.ui
    for (var i = 0; i < r.actions.length; i++) apply(r.actions[i])
  }

  // A key-driven mutation refused from a known error state shows its
  // `unavailable: <reason>` reply as the transient.
  function noteReply(reply) {
    if (typeof reply === "string" && reply.indexOf("unavailable") === 0) showMessage(reply)
  }

  function apply(action) {
    switch (action.type) {
      case "add": case "setStatus": case "focus": case "toggleStep": case "remove":
        noteReply(perform(action)); break
      case "startPomodoro": noteReply(startPomodoro(action.id)); break
      case "pausePomodoro": pomo.pause(); break
      case "refresh": refresh(); break
      case "syncNow": syncNow(); break
      case "message": showMessage(action.text); break
      case "close": root.close(); break
      case "switchPanel": root.switchPanel(action.direction); break
      case "composeOpened": bodyPanel.openCompose(action.prefill); break
      default: break
    }
  }

  function hoverRow(index) { dispatch({ type: "hover", index: index }) }
  function openDetail(id) { dispatch({ type: "selectTask", id: id }) }
  function activateFocusLine() {
    dispatch({ type: "hover", index: 0 })
    dispatch({ type: "enter" })
  }
  function backToList() { dispatch({ type: "esc" }) }
  function beginCompose() { dispatch({ type: "key", key: "n" }) }

  // Mouse twins of the keys (UX §4.6); each calls the same function. A
  // delete button ("x") goes through the reducer with its row's id, so the
  // first click arms and the second removes, as `x x` does.
  function rowKey(id, key) {
    var it = Model.findItem(items, id)
    var action = KeyMap.keyAction("list", key, { item: it, onFocusLine: false, focus: focusModel, backend: backend, sessionDone: liveSessionDone, pomodoro: pomodoro })
    if (!action) return
    if (action.type === "delete") dispatch({ type: "delete", id: String(id) })
    else apply(action)
  }
  function tickRow(id) { rowKey(id, "d") }
  function toggleStepAt(n) { if (detailItem) perform({ type: "toggleStep", id: detailItem.id, n: n }) }

  // ---- operations: the IPC functions, the keys and the buttons call these.
  // Every mutation goes through the store's perform; ticking a row done
  // remembers its pre-tick position first (UI-14).
  function perform(action) {
    var tick = View.tickDone({ items: items, sessionDone: sessionDone, pomodoro: pomodoro }, action)
    var reply = store.perform(action, null)
    if (tick && reply === "ok") {
      sessionDone = tick.sessionDone
      if (tick.message !== "") showMessage(tick.message)
    }
    return reply
  }

  function openTask(id) {
    var it = Model.findItem(items, id)
    root.open()
    if (!it) {
      var text = View.msgTaskNotFound(id)
      showMessage(text)
      return text
    }
    dispatch({ type: "selectTask", id: it.id })
    return "ok"
  }

  function refresh() {
    store.refresh()
    clockNow = Date.now()
    return "ok"
  }

  function syncNow() { return store.syncNow() }

  // `p` / middle click / IPC startPomodoro (PLAN §6.9, A52): Pomodoro.js
  // decides, this executes; `startFor` runs only after the focus write
  // exits 0.
  function startPomodoro(id) {
    var intent = Pomodoro.pomodoroIntent({ items: items, focus: focusModel, pomodoro: pomodoro, error: store.error, backend: backend }, id)
    switch (intent.kind) {
      case "pause": pomo.pause(); break
      case "startLabel": pomo.startFor(null, intent.label); break
      case "focusThenStart": {
        var task = intent.item
        var reply = store.perform({ type: "focus", id: task.id }, function(err) { if (!err) pomo.startFor(task) })
        if (reply !== "ok") { showMessage(reply); return reply }
        break
      }
      default:
        if (intent.message !== "") showMessage(intent.message)
        return intent.reply
    }
    return "ok"
  }

  function dump() {
    return JSON.stringify(View.dumpView({
      backend: backend, cliPath: cliPath, view: ui.view, stale: store.stale, error: store.error, pill: pill,
      items: items, focus: focusModel, sessionDone: liveSessionDone, banner: banner === "" ? null : banner,
      hasStreams: store.hasStreams, streams: store.streams,
      footer: ui.view === "error" ? null : footerModel, message: message === "" ? null : message
    }))
  }

  // ---- stores and links: the inactive store spawns and watches nothing.
  JsonStore {
    id: jsonStore
    active: root.store === jsonStore
  }

  CliStore {
    id: cliStore
    active: root.store === cliStore
    cliPath: root.cliPath
    opened: root.opened
  }

  PomodoroLink {
    id: pomo
    target: root.pomodoroTarget
    opened: root.opened
    onResult: function(r, item) {
      var text = Pomodoro.pomodoroMessage(r, item, { remaining: root.pomodoro.remaining, backend: root.backend, target: root.pomodoroTarget })
      if (text !== "") root.showMessage(text)
    }
  }

  Connections {
    target: root.store
    function onFailed(error) { root.showMessage(Errors.msgNotSaved(error)) }
    function onSyncFinished(result) { if (!result.ok && result.message) root.showMessage(result.message) }
  }

  Timer {
    interval: 300
    repeat: false
    running: root.loading
    onTriggered: root.loadingShown = true
  }

  Timer {
    id: messageTimer
    interval: 4000
    repeat: false
    onTriggered: root.message = ""
  }

  // One second tick while open: the focus-line timer, the footer's relative
  // times and the armed-delete timeout.
  Timer {
    interval: 1000
    repeat: true
    running: root.opened
    onTriggered: {
      root.clockNow = Date.now()
      pomo.tick()
      if (root.ui.armedId !== "") root.dispatch({ type: "tick" })
    }
  }

  PanelBody {
    id: bodyPanel
    host: root
  }
}
