pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "Keys.js" as KeyMap

// The todo panel: the composition root. The BarWidget.qml entry point owns
// the IPC target and lifecycle forwarding; this file picks the store
// (`backend === "cli" ? cliStore : jsonStore`, PLAN §6.4), runs the view
// machine through KeyMap.reduceUi, applies the actions it returns to the
// store, and hosts the views (list, compose, detail, error). All logic lives
// in Model.js / Keys.js / Argv.js; this file binds and forwards.
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
    backend: setting("backend", "json"),
    cliPath: setting("cliPath", "todocli"),
    pomodoroTarget: setting("pomodoroTarget", "abobreshov.pomodoro"),
    maxChars: setting("maxChars", 24)
  })
  readonly property string backend: cfg.backend
  readonly property string cliPath: cfg.cliPath
  readonly property string pomodoroTarget: cfg.pomodoroTarget
  readonly property int maxChars: cfg.maxChars
  readonly property var store: backend === "cli" ? cliStore : jsonStore

  // ---- state
  property var ui: KeyMap.initialUi()
  // Rows ticked done during this panel session: id -> pre-tick status. Only
  // the pruned map is read, so a reverted write or an external reopen drops
  // the row from it at once (UX §4.5 done-row rule; PLAN A34b).
  property var sessionDone: ({})
  readonly property var liveSessionDone: Model.pruneSessionDone(sessionDone, items)
  property string message: ""
  property double clockNow: Date.now()
  property var pendingPomodoroItem: null

  readonly property var items: store.items
  readonly property var focusModel: store.focus
  readonly property var pomodoro: pomo.view
  readonly property int openCount: Model.openCount(items)
  readonly property string countLabel: Model.countLabel(items)
  readonly property var listItems: Model.sortForList(Model.visibleItems(items, liveSessionDone), liveSessionDone)
  readonly property var focusLineModel: Model.focusLine(items, focusModel, pomodoro)
  readonly property int firstRow: focusLineModel ? 1 : 0
  readonly property var rows: {
    var out = []
    if (focusLineModel) out.push({ kind: "focus", item: focusLineModel.item, selectable: focusLineModel.selectable })
    for (var i = 0; i < listItems.length; i++) out.push({ kind: "item", item: listItems[i], selectable: true })
    return out
  }
  readonly property var detailItem: Model.findItem(items, ui.selectedId)
  readonly property var pill: Model.pillState({
    backend: backend, loaded: store.loaded, error: store.error, items: items, focus: focusModel,
    sync: store.sync, vertical: vertical, maxChars: maxChars, now: clockNow
  })
  readonly property var footerModel: backend === "cli" ? Model.footer(store.sync, clockNow, { syncing: store.syncing }) : null
  readonly property var errorModel: backend === "cli" ? Model.errorView(store.error, { cliPath: cliPath, moduleName: moduleName, lastGoodAt: cliStore.lastGoodAt }) : null
  readonly property string banner: backend === "cli" ? (errorModel && errorModel.banner ? errorModel.banner : "") : store.banner
  readonly property bool cliError: backend === "cli" && store.error !== null
  // E3: the empty-state copy waits for the first read; cli mode shows
  // `Loading…` instead, and only once the first read has taken 300 ms.
  readonly property bool loading: backend === "cli" && !store.loaded && store.error === null
  property bool loadingShown: false
  readonly property string emptyCopy: loading ? (loadingShown ? "Loading\u2026" : "") : (store.loaded ? (Model.emptyCopy(items) || "") : "")
  onLoadingChanged: if (!loading) loadingShown = false
  readonly property var storeError: store.error
  // Change handlers below write `ui`; during construction the first
  // evaluation of a readonly binding also emits its change signal, which
  // would loop back into any binding that read `ui`, so they wait for
  // Component.onCompleted.
  property bool ready: false

  // The error view replaces the list body for E4/E7/E8; E5 is a banner.
  onStoreErrorChanged: {
    if (!ready) return
    if (backend === "cli" && storeError && storeError.kind !== "busy") dispatch({ type: "showError" })
    else if (!storeError) dispatch({ type: "clearError" })
  }

  // Deferred so every setting derived from the new `settings` object (the
  // cli path in particular) has settled before the other store loads.
  onBackendChanged: if (ready) Qt.callLater(root.applyBackend)

  function applyBackend() {
    sessionDone = ({})
    message = ""
    dispatch({ type: "clearError" })
    cliStore.active = backend === "cli"
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
    cliStore.active = backend === "cli"
    store.load()
  }

  function focusNameField() {
    if (nameField) nameField.forceActiveFocus()
  }

  function focusKeyCatcher() {
    Qt.callLater(function() { if (keyCatcher) keyCatcher.forceActiveFocus() })
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
      case "composeOpened":
        nameField.text = action.prefill
        descriptionField.text = ""
        Qt.callLater(root.focusNameField)
        break
      default: break
    }
  }

  // Compose fields own their text; the reducer decides what Enter/Esc/Tab do.
  function composeKey(field, kind) {
    dispatch({ type: "text", text: field.text })
    dispatch({ type: kind })
    if (ui.view !== "compose") {
      nameField.text = ""
      descriptionField.text = ""
      focusKeyCatcher()
    } else if (ui.composeField === "description") descriptionField.forceActiveFocus()
    else nameField.forceActiveFocus()
  }

  function hoverRow(index) { dispatch({ type: "hover", index: index }) }
  function openDetail(id) { dispatch({ type: "selectTask", id: id }) }
  function activateFocusLine() {
    dispatch({ type: "hover", index: 0 })
    dispatch({ type: "enter" })
  }
  function backToList() { dispatch({ type: "esc" }) }
  function beginCompose() { dispatch({ type: "key", key: "n" }) }
  function cancelCompose() { composeKey(nameField, "esc") }
  function saveCompose() {
    dispatch({ type: "text", text: nameField.text })
    if (ui.composeField === "name") {
      dispatch({ type: "enter" })
      if (ui.composeField !== "description") { focusNameField(); return }
    }
    composeKey(descriptionField, "enter")
  }
  function armDelete(id) {
    if (ui.view === "detail" && ui.selectedId === String(id)) dispatch({ type: "delete" })
    else { dispatch({ type: "selectTask", id: id }); dispatch({ type: "delete" }) }
  }

  // Mouse twins of the keys (UX §4.6); each calls the same function.
  function rowKey(id, key) {
    var it = Model.findItem(items, id)
    var action = KeyMap.keyAction("list", key, { item: it, onFocusLine: false, focus: focusModel, backend: backend, sessionDone: liveSessionDone, pomodoro: pomodoro })
    if (action) apply(action)
  }
  function tickRow(id) { rowKey(id, "d") }
  function toggleStepAt(n) { if (detailItem) perform({ type: "toggleStep", id: detailItem.id, n: n }) }

  // ---- operations: the IPC functions, the keys and the buttons call these.
  // Every mutation goes through the store's perform; ticking a row done
  // remembers its pre-tick position first (UI-14).
  function perform(action) {
    var tick = Model.tickDone({ items: items, sessionDone: sessionDone, pomodoro: pomodoro }, action)
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
      var text = Model.msgTaskNotFound(id)
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

  function syncNow() {
    var reply = store.syncNow()
    if (backend !== "cli") showMessage(reply)
    return reply
  }

  // `p` / middle click / IPC startPomodoro (PLAN §6.9, A52): focus first, and
  // `startFor` only after the focus write exits 0; the attached task toggles
  // pause/resume; a free-text focus starts a label-only pomodoro.
  function startPomodoro(id) {
    var key = String(id)
    var it = null
    if (key === "focus") {
      it = Model.focusTask(items, focusModel)
      if (!it) {
        if (focusModel && focusModel.text) {
          pendingPomodoroItem = null
          pomo.startFor("", focusModel.text)
          return "ok"
        }
        return "no focus"
      }
    } else {
      it = Model.findItem(items, key)
      if (!it) return "unknown id"
    }
    if (pomodoro.phase !== "idle" && pomodoro.taskId === it.id) {
      pomo.pause()
      return "ok"
    }
    if (cliError) return Model.unavailable(store.error)
    var task = it
    var reply = store.perform({ type: "focus", id: task.id }, function(err) {
      if (err) return
      pendingPomodoroItem = task
      pomo.startFor(task.id, task.name)
    })
    if (reply !== "ok") {
      showMessage(reply === "refused: done" ? Model.msgDoneRow(task, backend) : reply)
      return reply
    }
    return "ok"
  }

  function dump() {
    return JSON.stringify(Model.dumpView({
      backend: backend, cliPath: cliPath, view: ui.view, stale: store.stale, error: store.error, pill: pill,
      items: items, focus: focusModel, sessionDone: liveSessionDone, banner: banner === "" ? null : banner,
      footer: ui.view === "error" ? null : footerModel, message: message === "" ? null : message
    }))
  }

  // ---- stores and links
  JsonStore { id: jsonStore }

  CliStore {
    id: cliStore
    cliPath: root.cliPath
    opened: root.opened
  }

  PomodoroLink {
    id: pomo
    target: root.pomodoroTarget
    opened: root.opened
    onResult: function(r) {
      if (r.ok) {
        if (r.word === "retargeted" && root.pendingPomodoroItem)
          root.showMessage(Model.msgPomodoroMoved(root.pendingPomodoroItem, root.pomodoro.remaining, root.backend))
      } else if (r.kind === "missing") root.showMessage(Model.msgPomodoroMissing(root.pomodoroTarget))
      else if (r.kind === "old") root.showMessage(Model.msgPomodoroOld(root.pomodoroTarget))
      else root.showMessage(Model.msgPomodoroNotStarted(r.text))
      root.pendingPomodoroItem = null
    }
  }

  Connections {
    target: root.store
    function onFailed(error) { root.showMessage(Model.msgNotSaved(error)) }
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

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(340))
    contentHeight: panel.fittedContentHeight(bodyColumn.implicitHeight, Style.space(520))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      // While an editor field is focused, keys belong to the field.
      blocked: nameField.activeFocus || descriptionField.activeFocus

      onCloseRequested: root.dispatch({ type: "esc" })
      onTabRequested: function(direction) { root.dispatch({ type: "tab", direction: direction }) }
      onMoveRequested: function(dx, dy) { root.dispatch({ type: "move", dx: dx, dy: dy }) }
      // Enter emits returnRequested + activateRequested, Space only the
      // latter; both open a row or toggle a step, so one handler serves.
      onActivateRequested: root.dispatch({ type: "enter" })
      onDeleteRequested: root.dispatch({ type: "delete" })
      onTextKey: function(t) { root.dispatch({ type: "key", key: t }) }

      Flickable {
        id: scroll
        anchors.fill: parent
        contentWidth: width
        contentHeight: bodyColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        Column {
          id: bodyColumn
          width: scroll.width
          spacing: Style.spacing.lg

          // ============================================================ LIST
          Column {
            visible: root.ui.view === "list"
            width: parent.width
            spacing: Style.spacing.md

            Item {
              width: parent.width
              height: Math.max(listTitle.implicitHeight, addButton.implicitHeight)

              Text {
                id: listTitle
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                text: "Todos"
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.title
                font.bold: true
              }

              Text {
                id: listCount
                anchors.right: addButton.left
                anchors.rightMargin: Style.spacing.lg
                anchors.verticalCenter: parent.verticalCenter
                text: root.countLabel
                color: root.dimForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.caption
              }

              PanelActionButton {
                id: addButton
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                iconText: Model.G.plus
                tooltipText: "New todo (n)"
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                enabled: !root.cliError
                onClicked: root.beginCompose()
              }
            }

            // E5 / E14 banner above the last good list.
            Row {
              visible: root.banner !== ""
              width: parent.width
              spacing: Style.spacing.controlGap

              Text {
                text: root.backend === "cli" ? Model.G.lock : Model.G.alert
                color: Color.urgent
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.subtitle
              }

              Text {
                width: parent.width - Style.space(24)
                text: root.banner
                textFormat: Text.PlainText
                wrapMode: Text.WordWrap
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.body
              }
            }

            FocusLine {
              width: parent.width
              panel: root
            }

            PanelSeparator {
              visible: root.focusLineModel !== null
              foreground: root.contentForeground
            }

            Text {
              visible: root.emptyCopy !== ""
              width: parent.width
              text: root.emptyCopy
              textFormat: Text.PlainText
              wrapMode: Text.WordWrap
              topPadding: Style.spacing.md
              bottomPadding: Style.spacing.md
              color: root.dimForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.body
            }

            Column {
              width: parent.width
              spacing: 0
              // The last good list stays readable at 0.6 while the DB is busy.
              opacity: root.banner !== "" && root.backend === "cli" ? 0.6 : 1

              Repeater {
                model: root.listItems

                delegate: TaskRow {
                  required property int index
                  width: bodyColumn.width
                  panel: root
                  rowIndex: root.firstRow + index
                }
              }
            }

            Text {
              visible: root.ui.help
              width: parent.width
              text: Model.helpLine("list", root.backend)
              textFormat: Text.PlainText
              wrapMode: Text.WordWrap
              color: root.dimForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
            }
          }

          // ========================================================= COMPOSE
          Column {
            visible: root.ui.view === "compose"
            width: parent.width
            spacing: Style.spacing.md

            Item {
              width: parent.width
              height: Math.max(composeTitle.implicitHeight, backFromCompose.implicitHeight)

              PanelActionButton {
                id: backFromCompose
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                iconText: Model.G.back
                tooltipText: "Back"
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                onClicked: root.cancelCompose()
              }

              Text {
                id: composeTitle
                anchors.left: backFromCompose.right
                anchors.leftMargin: Style.spacing.md
                anchors.verticalCenter: parent.verticalCenter
                text: "New todo"
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.title
                font.bold: true
              }
            }

            TextField {
              id: nameField
              width: parent.width
              placeholderText: "Name"
              foreground: root.contentForeground
              font.family: root.contentFontFamily

              Keys.onPressed: function(event) {
                if (event.key === Qt.Key_Escape) {
                  root.cancelCompose()
                  event.accepted = true
                } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                  root.composeKey(nameField, "enter")
                  event.accepted = true
                } else if (event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) {
                  // Tab never escapes to the neighbouring bar panel while typing.
                  root.dispatch({ type: "tab", direction: 1 })
                  descriptionField.forceActiveFocus()
                  event.accepted = true
                }
              }
            }

            TextField {
              id: descriptionField
              width: parent.width
              placeholderText: "Description"
              foreground: root.contentForeground
              font.family: root.contentFontFamily

              Keys.onPressed: function(event) {
                if (event.key === Qt.Key_Escape) {
                  root.cancelCompose()
                  event.accepted = true
                } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                  root.saveCompose()
                  event.accepted = true
                } else if (event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) {
                  root.dispatch({ type: "tab", direction: -1 })
                  nameField.forceActiveFocus()
                  event.accepted = true
                }
              }
            }

            Item {
              width: parent.width
              height: saveRow.implicitHeight

              Row {
                id: saveRow
                anchors.right: parent.right
                spacing: Style.spacing.md

                Button {
                  text: "Cancel"
                  foreground: root.contentForeground
                  fontFamily: root.contentFontFamily
                  onClicked: root.cancelCompose()
                }

                Button {
                  text: "Save"
                  bordered: true
                  foreground: root.contentForeground
                  fontFamily: root.contentFontFamily
                  onClicked: root.saveCompose()
                }
              }
            }
          }

          // ========================================================== DETAIL
          DetailView {
            visible: root.ui.view === "detail"
            width: parent.width
            panel: root
          }

          // =========================================================== ERROR
          ErrorView {
            visible: root.ui.view === "error"
            width: parent.width
            panel: root
          }

          // ================================================ FOOTER / MESSAGE
          StatusFooter {
            visible: root.ui.view !== "compose" && ((root.backend === "cli" && root.ui.view !== "error") || root.message !== "")
            width: parent.width
            panel: root
          }
        }
      }
    }
  }
}
