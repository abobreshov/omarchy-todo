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
import "Streams.js" as Streams
import "Tabs.js" as Tabs
import "Order.js" as Order
import "Cursor.js" as Cursor

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
  readonly property var storeIdMap: backend === "cli" ? cliStore.idMap : ({})
  readonly property TodoStore store: backend === "cli" ? cliStore : jsonStore

  // ---- state
  property var ui: KeyMap.initialUi()
  // Rows ticked done during this panel session: id -> pre-tick status. Only
  // the pruned map is read, so a reverted write or an external reopen drops
  // the row from it at once (UX §4.5 done-row rule; PLAN A34b).
  property string currentTab: "overview"
  property var clock: function() { return Date.now() }
  property double viewDayStart: 0
  property int tickSequence: 0
  property var latches: ({})
  property var sessionReopened: ({})
  property var previousCatalogue: []
  property var wheelState: ({})
  property var strip: null
  signal cursorScroll(bool reset)
  property var sessionDone: ({})
  readonly property var liveSessionDone: View.pruneSessionDone(sessionDone, items)
  property string message: ""
  property double clockNow: Date.now()

  readonly property var items: store.items
  readonly property var focusModel: store.focus
  readonly property var pomodoro: pomo.view
  readonly property int openCount: View.openCount(items)
  readonly property bool metadata: backend === "cli" && store.hasStreams
  readonly property var catalogue: store.streams
  readonly property var tabs: Tabs.tabsOf(catalogue)
  readonly property bool tabStripAvailable: metadata && store.loaded && Tabs.active(catalogue).length > 1
  readonly property bool stripShown: tabStripAvailable && ui.view === "list"
  readonly property string tabKey: currentTab === "overview" || currentTab === "done" ? currentTab : (tabs.filter(function(t) { return t.uid === root.currentTab })[0] || { key: "overview" }).key
  readonly property var displayRows: metadata ? (currentTab === "done" ? Streams.doneRows(items, catalogue, viewOptions) : currentTab === "overview" && Tabs.active(catalogue).length > 1 ? Streams.overviewRows(items, catalogue, viewOptions) : Streams.tabRows(items, tabKey === "overview" ? "inbox" : tabKey, viewOptions)) : View.sortForList(View.visibleItems(items, liveSessionDone), liveSessionDone).map(function(it) { return { kind: "item", item: it, badge: "", streamCaption: "" } })
  readonly property var viewOptions: ({ sessionDone: liveSessionDone, latches: latches, streams: catalogue, horizonFilter: ui.horizonFilter, dayStart: viewDayStart, reopened: sessionReopened })
  readonly property bool prioritySlot: metadata && Streams.prioritySlot(items)
  readonly property bool badgeSlot: metadata && Streams.badgeSlot(catalogue, items)
  readonly property string countLabel: metadata ? Streams.countCaption(items, catalogue, tabKey, ui.horizonFilter, displayRows) : View.countLabel(items)
  readonly property string movePrompt: Tabs.movePrompt(ui, reducerCtx())
  readonly property var listItems: displayRows.filter(function(r) { return r.kind === "item" }).map(function(r) { return r.item })
  readonly property var focusLineModel: View.focusLine(items, focusModel, pomodoro)
  readonly property string focusCaption: View.focusCaption(focusLineModel, catalogue, tabKey, metadata)
  readonly property int firstRow: focusLineModel ? 1 : 0
  readonly property var rows: View.listRows(focusLineModel, displayRows)
  readonly property var detailItem: Model.findItem(items, ui.selectedId)
  readonly property var pill: Chrome.pillState({
    backend: backend, loaded: store.loaded, error: store.error, items: items, focus: focusModel,
    hasStreams: store.hasStreams, sync: store.sync, vertical: vertical, maxChars: maxChars, now: clockNow
  })
  readonly property var footerModel: store.hasSync ? Chrome.footer(store.sync, clockNow, { syncing: store.syncing }) : null
  readonly property var errorModel: Errors.errorView(store.error, { cliPath: cliPath, moduleName: moduleName })
  readonly property string banner: store.banner
  readonly property bool errored: store.error !== null
  // E3: the empty-state copy waits for the first read; `Loading…` shows
  // instead, and only once the first read has taken 300 ms.
  readonly property bool loading: !store.loaded && store.error === null
  property bool loadingShown: false
  readonly property string emptyCopy: loading ? (loadingShown ? "Loading…" : "") : (store.loaded ? (metadata ? Streams.emptyCopy(items, tabKey === "overview" && Tabs.active(catalogue).length === 1 ? "inbox" : tabKey, ui.horizonFilter, displayRows) : (View.emptyCopy(items) || "")) : "")
  onLoadingChanged: if (!loading) loadingShown = false
  readonly property var storeError: store.error
  // Change handlers below write `ui`; during construction the first
  // evaluation of a readonly binding also emits its change signal, which
  // would loop back into any binding that read `ui`, so they wait for
  // Component.onCompleted.
  property bool ready: false

  onStoreErrorChanged: if (ready) dispatch({ type: "storeError", error: storeError })
  readonly property string rowFingerprint: JSON.stringify(rows)
  onRowFingerprintChanged: if (ready) Qt.callLater(root.reconcile)
  onCatalogueChanged: if (ready) Qt.callLater(root.reconcile)
  function reconcile() {
    var oldTab = previousCatalogue.filter(function(s) { return s.uid === root.currentTab })[0]
    var gone = currentTab !== "overview" && currentTab !== "done" && !tabs.some(function(t) { return t.uid === root.currentTab })
    if (metadata && gone) {
      currentTab = "overview"
      showMessage((oldTab ? oldTab.key : "Stream") + " was archived · showing Overview")
      dispatch({ type: "resetCursor" })
      cursorScroll(true)
    } else if ((!metadata || Tabs.active(catalogue).length < 2) && currentTab !== "overview") {
      currentTab = "overview"
      dispatch({ type: "resetCursor" })
      cursorScroll(true)
    }
    var maps = Cursor.sessionMaps({ latches: latches, reopened: sessionReopened, sessionDone: sessionDone }, items, storeIdMap)
    if (JSON.stringify(maps.latches) !== JSON.stringify(latches)) latches = maps.latches
    if (JSON.stringify(maps.reopened) !== JSON.stringify(sessionReopened)) sessionReopened = maps.reopened
    if (JSON.stringify(maps.sessionDone) !== JSON.stringify(sessionDone)) sessionDone = maps.sessionDone
    dispatch({ type: "rows" })
    previousCatalogue = catalogue
  }

  // Deferred so every setting derived from the new `settings` object (the
  // cli path in particular) has settled before the other store loads.
  onStoreChanged: if (ready) Qt.callLater(root.applyBackend)

  function applyBackend() {
    sessionDone = ({}); latches = ({}); sessionReopened = ({}); tickSequence = 0
    message = ""
    store.load()
  }

  // Reopening lands on the remembered tab and samples a new view day.
  // Session latches end at close; degraded modes retain A-D7's visibility.
  onOpenedChanged: {
    if (!ready) return
    if (!opened) {
      sessionDone = ({}); latches = ({}); sessionReopened = ({}); tickSequence = 0
      wheelState = ({})
      dispatch({ type: "close" })
    } else {
      clockNow = clock()
      viewDayStart = Order.dayStartOf(clockNow)
      dispatch({ type: "open" })
      cursorScroll(true)
    }
  }

  Component.onCompleted: {
    viewDayStart = Order.dayStartOf(clock())
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
      currentTab: currentTab, tabKey: tabKey, catalogue: catalogue, previousCatalogue: previousCatalogue, hasStreams: store.hasStreams, items: items, busy: errored, idMap: storeIdMap,
      rows: rows, steps: detailItem ? detailItem.plan.length : 0, backend: backend, focus: focusModel,
      sessionDone: liveSessionDone, pomodoro: pomodoro, prefill: focusModel && focusModel.text ? focusModel.text : ""
    }
  }

  function dispatch(event) {
    event.now = clock()
    var r = KeyMap.reduceUi(ui, event, reducerCtx())
    var oldCursor = ui.cursor, oldKey = ui.cursorKey
    if (JSON.stringify(ui) !== JSON.stringify(r.ui)) ui = r.ui
    if (event.type !== "hover" && (oldCursor !== ui.cursor || oldKey !== ui.cursorKey)) cursorScroll(false)
    for (var i = 0; i < r.actions.length; i++) apply(r.actions[i])
  }

  // A key-driven mutation refused from a known error state shows its
  // `unavailable: <reason>` reply as the transient.
  function noteReply(reply) {
    if (typeof reply === "string" && reply.indexOf("unavailable") === 0) showMessage(reply)
  }

  function apply(action) {
    switch (action.type) {
      case "add": case "setStatus": case "focus": case "toggleStep": case "remove": case "move":
        noteReply(perform(action)); break
      case "selectTab": selectTab(action.uid); break
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
    var action = KeyMap.keyAction("list", key, { item: it, currentTab: currentTab, onFocusLine: false, focus: focusModel, backend: backend, sessionDone: liveSessionDone, pomodoro: pomodoro })
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
    if (errored) return Errors.unavailable(store.error)
    var it = Model.findItem(items, action.id)
    var tick = currentTab === "done" ? null : View.tickDone({ items: items, sessionDone: sessionDone, pomodoro: pomodoro }, action)
    if (tick && metadata) {
      var home = Model.homeOf(catalogue, Model.isOrphan(catalogue, it) ? "inbox" : it.stream)
      var peers = Streams.latchBlock(items, it, catalogue, latches, currentTab === "overview" && Tabs.active(catalogue).length > 1)
      var held = Object.assign({}, latches)
      held[it.id] = Order.latchOf(it, peers, home ? home.uid : undefined, tickSequence++)
      latches = held
    }
    if (currentTab === "done" && it && it.status === "done" && action.type === "setStatus" && action.status === "todo") {
      var reopened = Object.assign({}, sessionReopened)
      if (!Object.prototype.hasOwnProperty.call(reopened, it.id)) reopened[it.id] = it.completedAt
      sessionReopened = reopened
    }
    if (action.type === "setStatus") action.at = clock()
    var reply = store.perform(action, null)
    if (tick && reply === "ok") {
      sessionDone = tick.sessionDone
      if (tick.message !== "") showMessage(tick.message)
    }
    if (action.type === "move" && reply === "ok") showMessage("#" + action.id + " moved to " + (action.stream === "inbox" ? "Inbox" : action.stream))
    return reply
  }
  function selectTab(uid) {
    if (ui.view !== "list" || currentTab === uid) return
    currentTab = uid
    dispatch({ type: "resetCursor" })
    cursorScroll(true)
  }
  function pickTarget(uid) { dispatch({ type: "chooseTab", uid: uid }) }
  function wheelTab(ev) {
    if (!stripShown || ui.view !== "list") return
    var result = Tabs.wheel(wheelState, ev)
    wheelState = result.state
    if (result.step !== 0) dispatch({ type: "stepTab", direction: result.step })
  }
  function tab(name) {
    var error = Tabs.unavailable(reducerCtx(), false)
    if (error !== "") return error
    if (Tabs.active(catalogue).length < 2 && Model.squish(name).toLowerCase() === "done") return Tabs.E21
    var resolved = Tabs.resolve(tabs, name)
    if (typeof resolved === "string") return resolved
    var uid = Tabs.active(catalogue).length < 2 ? "overview" : resolved.uid
    if (ui.view === "list") selectTab(uid)
    else currentTab = uid
    return "ok"
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
      hasStreams: store.hasStreams, catalogue: catalogue, tab: tabKey, strip: stripShown ? strip : null, horizonFilter: ui.horizonFilter, moving: ui.moving, displayRows: displayRows, latches: latches, reopened: sessionReopened, dayStart: viewDayStart,
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
