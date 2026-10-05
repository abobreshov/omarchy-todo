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
import "Priority.js" as Priority

// Composition root: bind pure views/reducers, forward IPC and store actions.
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
  // Session-done visibility follows current status; rollbacks prune it.
  property string currentTab: "overview"
  property var clock: function() { return Date.now() }
  // Sample the local day at open; reads and ticks never roll the view over.
  property double viewDayStart: 0
  property int tickSequence: 0
  property var latches: ({})
  property var sessionReopened: ({})
  property var previousCatalogue: []
  property var wheelState: ({})
  property var strip: null
  property int stripFirst: 1
  readonly property bool wheelLatched: Tabs.wheelLatched(wheelState, clockNow)
  signal cursorScroll(bool reset)
  // id → pre-tick status; current status prunes rolled-back ticks.
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
  readonly property var displayRows: metadata ? Streams.viewRows(items, catalogue, tabKey, viewOptions) : View.sortForList(View.visibleItems(items, liveSessionDone), liveSessionDone).map(function(it) { return { kind: "item", item: it, badge: "", streamCaption: "" } })
  readonly property string viewKey: Streams.viewKey(tabKey, catalogue)
  readonly property var viewOptions: ({ sessionDone: liveSessionDone, latches: latches, streams: catalogue, horizonFilter: ui.horizonFilter, dayStart: viewDayStart, reopened: sessionReopened })
  readonly property bool prioritySlot: metadata && Streams.prioritySlot(items)
  readonly property bool badgeSlot: metadata && Streams.badgeSlot(catalogue, items)
  readonly property string countLabel: metadata ? Streams.countCaption(items, catalogue, viewKey, ui.horizonFilter, displayRows) : View.countLabel(items)
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
  readonly property string emptyCopy: loading ? (loadingShown ? "Loading…" : "") : (store.loaded ? (metadata ? Streams.emptyCopy(items, viewKey, ui.horizonFilter, displayRows) : (View.emptyCopy(items) || "")) : "")
  onLoadingChanged: if (!loading) loadingShown = false
  readonly property var storeError: store.error
  // Defer change handlers until construction ends to avoid ui binding loops.
  // Initial readonly evaluations emit change signals during construction.
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
    var maps = Order.sessionMaps({ latches: latches, reopened: sessionReopened, sessionDone: sessionDone }, items, storeIdMap)
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
    dispatch({ type: "resetCursor" })
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
  function reducerCtx() { return KeyMap.panelContext(root) }

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
      case "add": case "setStatus": case "focus": case "toggleStep": case "remove": case "move": case "setPriority": case "setSize":
        noteReply(perform(action)); break
      case "selectTab": selectTab(action.uid); break
      case "startPomodoro": noteReply(startPomodoro(action.id)); break
      case "pausePomodoro": pomo.pause(); break
      case "refresh": refresh(); break
      case "syncNow": syncNow(); break
      case "message": showMessage(action.text); break
      case "close": root.close(); break
      case "switchPanel": if (hostWidget && hostWidget.bar) hostWidget.bar.switchPanelFrom(hostWidget, action.direction); break   // the slot's item, as the popup passes (F-1)
      case "composeOpened": bodyPanel.openCompose(action.prefill); break
      case "northStar": if (hostWidget) hostWidget.openNorthStar(); break
      default: break
    }
  }

  function hoverRow(index) { dispatch({ type: "hover", index: index }) }
  function openDetail(id) { dispatch({ type: "selectTask", id: id }) }
  function activateFocusLine() {
    if (ui.picker) return
    dispatch({ type: "hover", index: 0 })
    dispatch({ type: "enter" })
  }
  function backToList() { dispatch({ type: "esc" }) }
  function beginCompose() { dispatch({ type: "key", key: "n" }) }

  // Mouse twins share key actions; delete still arms before removing.
  function rowKey(id, key) {
    if (ui.picker) return
    var it = Model.findItem(items, id)
    var action = KeyMap.keyAction("list", key, { item: it, currentTab: currentTab, onFocusLine: false, focus: focusModel, backend: backend, sessionDone: liveSessionDone, pomodoro: pomodoro })
    if (!action) return
    if (action.type === "delete") dispatch({ type: "delete", id: String(id) })
    else apply(action)
  }
  function tickRow(id) { rowKey(id, "d") }
  function toggleStepAt(n) { if (!ui.picker && detailItem) perform({ type: "toggleStep", id: detailItem.id, n: n }) }

  // ---- operations: the IPC functions, the keys and the buttons call these.
  // Every mutation goes through the store's perform; ticking a row done
  // remembers its pre-tick position first (UI-14).
  function perform(action) {
    if (errored) return Errors.unavailable(store.error)
    var tick = currentTab === "done" ? null : View.tickDone({ items: items, sessionDone: sessionDone, pomodoro: pomodoro }, action)
    var ctx = { items: items, catalogue: catalogue, metadata: metadata, currentTab: currentTab }
    // Record tick-time values and peers before the optimistic store write.
    var held = Order.recordTick({ latches: latches, tickSequence: tickSequence }, action, ctx)
    latches = held.latches; tickSequence = held.tickSequence
    sessionReopened = Order.recordReopen({ reopened: sessionReopened }, action, ctx)
    if (action.type === "setStatus") action.at = clock()
    var reply = store.perform(action, null)
    if (tick && reply === "ok") {
      sessionDone = tick.sessionDone
      if (tick.message !== "") showMessage(tick.message)
    }
    if (action.type === "move" && reply === "ok") showMessage("#" + action.id + " moved to " + (action.stream === "inbox" ? "Inbox" : action.stream))
    if (reply === "ok" && Priority.resultMessage(action) !== "") showMessage(Priority.resultMessage(action))
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
    if (!stripShown || ui.view !== "list" || ui.picker) return
    var result = Tabs.wheel(wheelState, ev)
    clockNow = ev.at
    wheelState = result.state
    wheelQuiet.restart()
    if (result.step !== 0) dispatch({ type: "stepTab", direction: result.step })
  }
  function tab(name) {
    var result = Tabs.ipcTab(tabs, name, reducerCtx())
    if (result.reply !== "ok") return result.reply
    if (ui.view === "list") selectTab(result.uid)
    else currentTab = result.uid
    return result.reply
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

  function dump() { return JSON.stringify(View.dumpView(View.panelState(root))) }

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
    id: wheelQuiet
    interval: Tabs.QUIET_MS
    onTriggered: root.wheelState = ({})
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
