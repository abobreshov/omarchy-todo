import QtQuick
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "Store.js" as Store
import "Chrome.js" as Chrome
import "Pomodoro.js" as Pomodoro
import "NorthStar.js" as NorthStar
import "NorthStarKeys.js" as NorthStarKeys

// Bar button for the todo plugin. Owns this instance's IPC handler, the
// pill and the North Star's star and popup (ADDENDUM-S11 §5.1: one widget,
// two buttons, two popout owners); the list, the editor, the stores and the
// save file all live in Panel.qml, which is loaded eagerly so the list
// hydrates as soon as the shell starts rather than waiting for the first
// click. The star and its popup read Panel.qml's store: no second read.
//
// One IpcHandler per widget instance is the shell's own pattern
// (Ui/BarWidget.qml, the first-party clock): the target routes to one
// instance, which relays `refresh()` to its peers with `broadcast`; a
// mutator runs once on the routed instance and `dump()` answers from it
// (PLAN §6.6). Quickshell 0.3.1 logs a warning (not an error) for the second
// registration on the same target; the later registration answers (S2
// probe, recorded in the README).
BarWidget {
  id: root

  moduleName: "abobreshov.todo"

  // Moving a bar widget briefly overlaps the retiring instance with its
  // replacement; registering the IPC target immediately can collide with the
  // copy that has not been torn down yet, so wait a tick for the slot to clear.
  property bool ipcRegistrationReady: false

  readonly property var panel: panelLoader.item
  readonly property bool opened: panel ? panel.opened === true : false
  readonly property int itemCount: panel ? panel.openCount : 0
  readonly property var pill: panel ? panel.pill : Chrome.pillState({ vertical: root.vertical, maxChars: Model.DEFAULTS.maxChars })
  // Forwarded so opening another widget's popup closes this one cleanly.
  readonly property bool popoutSwitchClosing: panel ? panel.popoutSwitchClosing === true : false
  readonly property var northStarState: panel ? northStarPanel.northStarState : null

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
    if ("vertical" in target) target.vertical = root.vertical
    if ("moduleName" in target) target.moduleName = root.moduleName
  }

  function open() { if (panel) panel.open() }
  // `close`/`hide` close whichever of the two popups is open.
  function close() { if (panel) panel.close(); northStarPanel.close() }
  function togglePanel() { if (panel) panel.toggle() }
  function closeForPopoutSwitch() { if (panel) panel.closeForPopoutSwitch() }
  // The `refresh()` IPC push lands on one instance and is relayed here.
  function refresh() { if (panel) panel.refresh() }
  // One Store.js action per mutating IPC function, with upstream's replies.
  function perform(action) { return panel ? Store.ipcReply(action, panel.perform(action)) : "unavailable" }

  function metadata(kind, id, value) {
    if (!panel) return "unavailable"
    var r = Store.metadataIntent({ backend: panel.backend, hasStreams: panel.store.hasStreams, error: panel.store.error, items: panel.items, focus: panel.focusModel }, kind, id, value)
    return r.action ? root.perform(r.action) : r.reply
  }

  // The North Star (§4.7.1): `*` and IPC open the popup, a click toggles it.
  function openNorthStar() { northStarPanel.open() }
  function toggleNorthStar() { northStarPanel.toggle() }
  function northStarIpc() {
    var r = NorthStarKeys.ipcIntent(Object.assign({ panelLoaded: !!panel, popupOpen: northStarPanel.opened }, northStarPanel.northStarState))
    if (r.action !== "none") r.action === "open" ? northStarPanel.open() : northStarPanel.close()
    return r.reply
  }
  // Today's dump with §4.7.2's four keys appended.
  function dump() {
    if (!panel) return "unavailable"
    var d = JSON.parse(panel.dump()), extra = NorthStar.dumpOf(northStarState, panel.opened, northStarPanel.opened)
    for (var k in extra) d[k] = extra[k]
    return JSON.stringify(d)
  }

  implicitWidth: buttons.implicitWidth
  implicitHeight: buttons.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()
  onVerticalChanged: injectPanel()
  Component.onCompleted: ipcRegistrationTimer.start()

  Timer {
    id: ipcRegistrationTimer
    interval: 100
    onTriggered: root.ipcRegistrationReady = true
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      // The bar assigns `bar` and `settings` across two ticks on first mount;
      // a second pass catches whichever landed after the loader completed.
      Qt.callLater(root.injectPanel)
    }
  }

  IpcHandler {
    enabled: root.ipcRegistrationReady
    target: root.moduleName

    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.togglePanel() }

    // Upstream surface, arities and replies kept (DECISIONS A-R2.1).
    // `omarchy-shell abobreshov.todo add "Buy milk" "Semi-skimmed"`.
    function add(name: string, description: string): string { return root.perform({ type: "add", name: name, description: description }) }

    // `omarchy-shell abobreshov.todo remove <id>`.
    function remove(id: string): string { return root.perform({ type: "remove", id: id }) }

    function status(): string {
      return root.itemCount + " todo" + (root.itemCount === 1 ? "" : "s")
    }

    // Fork additions (UX §10.3). Replies mean accepted, not committed, in
    // cli mode; `unavailable: <reason>` from a known error state.
    function setStatus(id: string, status: string): string { return root.perform({ type: "setStatus", id: id, status: status }) }
    function setPriority(id: string, value: string): string { return root.metadata("priority", id, value) }
    function setSize(id: string, value: string): string { return root.metadata("size", id, value) }
    function focus(id: string): string { return root.perform({ type: "focus", id: id }) }
    function toggleStep(id: string, n: string): string { return root.perform({ type: "toggleStep", id: id, n: n }) }

    function startPomodoro(id: string): string {
      if (!root.panel) return "unavailable"
      return root.panel.startPomodoro(id)
    }

    function openTask(id: string): string {
      if (!root.panel) return "unavailable"
      return root.panel.openTask(id)
    }

    function refresh(): string {
      root.broadcast("refresh")
      return "ok"
    }

    function syncNow(): string {
      if (!root.panel) return "unavailable"
      return root.panel.syncNow()
    }

    function tab(name: string): string { return root.panel ? root.panel.tab(name) : "unavailable" }

    function dump(): string { return root.dump() }
    function northStar(): string { return root.northStarIpc() } // SUPER + ALT + N
  }

  // The pill, then the star (§5.2): a row on a horizontal bar, a column on a
  // vertical one. The pill never moves, and a hidden star takes no slot, so
  // the widget is then 2.1.2's size exactly (§5.8 B3, B4).
  Grid {
    id: buttons
    columns: root.vertical ? 1 : 2

    // One WidgetButton (UX §3.3): the label auto-sizes the slot on horizontal
    // bars; icon-only keeps upstream's iconSlot; vertical bars are icon-only.
    WidgetButton {
      id: button
      objectName: "todoPill"
      bar: root.bar
      text: root.pill.glyph + (root.pill.label !== "" ? " " + root.pill.label : "")
      fontSize: Style.bar.iconFont
      fixedWidth: !root.vertical && root.pill.label === "" ? Style.bar.iconSlot : -1
      fixedHeight: root.vertical ? Style.bar.iconSlot : -1
      active: root.pill.urgent
      dimmed: root.pill.dimmed
      tooltipText: root.pill.tooltip

      onPressed: function(pressedButton) {
        if (pressedButton === Qt.LeftButton) root.togglePanel()
        else if (pressedButton === Qt.MiddleButton) {
          // UX §3.4: the same function as `p` on the focus line; no focus
          // toggles the panel.
          if (!root.panel || root.panel.startPomodoro("focus") === Pomodoro.NO_FOCUS) root.togglePanel()
        }
      }
    }

    NorthStarButton {
      bar: root.bar
      starState: NorthStar.barState(root.northStarState)
      tooltipText: NorthStar.iconTooltip(root.northStarState)
      popupOpen: northStarPanel.opened
      onActivated: root.toggleNorthStar()
    }
  }

  // Its own popout owner (ND-31): the bar's coordinator closes the todo panel
  // when it opens, and the reverse. It reads the todo panel's store.
  NorthStarPanel {
    id: northStarPanel
    bar: root.bar
    hostWidget: root
    anchorItem: button
    store: root.panel ? root.panel.store : null
    backend: root.panel ? root.panel.backend : "json"
  }
}
