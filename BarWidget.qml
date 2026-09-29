import QtQuick
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Bar button for the todo plugin. Owns this instance's IPC handler and the
// pill; the list, the editor, the stores and the save file all live in
// Panel.qml, which is loaded eagerly so the list hydrates as soon as the
// shell starts rather than waiting for the first click.
//
// One IpcHandler per widget instance is the shell's own pattern
// (Ui/BarWidget.qml, the first-party clock): the target routes to one
// instance, which relays `refresh()` to its peers with `broadcast`; a
// mutator runs once on the routed instance and `dump()` answers from it
// (PLAN §6.6). Quickshell 0.3.1 logs a warning for the second registration
// on the same target and keeps the first (S2 probe).
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
  readonly property var pill: panel ? panel.pill : Model.pillState({ backend: "json", loaded: false, items: [], focus: null, sync: [], vertical: root.vertical, maxChars: 24, now: 0 })
  // Forwarded so opening another widget's popup closes this one cleanly.
  readonly property bool popoutSwitchClosing: panel ? panel.popoutSwitchClosing === true : false

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
  function close() { if (panel) panel.close() }
  function togglePanel() { if (panel) panel.toggle() }
  function closeForPopoutSwitch() { if (panel) panel.closeForPopoutSwitch() }
  // The `refresh()` IPC push lands on one instance and is relayed here.
  function refresh() { if (panel) panel.refresh() }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

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
    function add(name: string, description: string): string {
      if (!root.panel) return "unavailable"
      return root.panel.addItem(name, description)
    }

    // `omarchy-shell abobreshov.todo remove <id>`.
    function remove(id: string): string {
      if (!root.panel) return "unavailable"
      return root.panel.deleteItem(id)
    }

    function status(): string {
      return root.itemCount + " todo" + (root.itemCount === 1 ? "" : "s")
    }

    // Fork additions (UX §10.3). Replies mean accepted, not committed, in
    // cli mode; `unavailable: <reason>` from a known error state.
    function setStatus(id: string, status: string): string {
      if (!root.panel) return "unavailable"
      return root.panel.setStatus(id, status)
    }

    function focus(id: string): string {
      if (!root.panel) return "unavailable"
      return root.panel.setFocus(id)
    }

    function startPomodoro(id: string): string {
      if (!root.panel) return "unavailable"
      return root.panel.startPomodoro(id)
    }

    function toggleStep(id: string, n: string): string {
      if (!root.panel) return "unavailable"
      return root.panel.toggleStep(id, n)
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

    function dump(): string {
      if (!root.panel) return "unavailable"
      return root.panel.dump()
    }
  }

  // One WidgetButton (UX §3.3): the label auto-sizes the slot on horizontal
  // bars; icon-only keeps upstream's iconSlot; vertical bars are icon-only.
  WidgetButton {
    id: button
    anchors.fill: parent
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
        if (!root.panel || root.panel.startPomodoro("focus") === "no focus") root.togglePanel()
      }
    }
  }
}
