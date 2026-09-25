import QtQuick
import Quickshell.Io
import qs.Commons
import qs.Ui

// Bar button for the checklist todo plugin. Owns the plugin's single IPC
// target and the icon; the list, the editor, and the save file all live in
// Panel.qml, which is loaded eagerly so the list hydrates as soon as the
// shell starts rather than waiting for the first click.
BarWidget {
  id: root

  moduleName: "tathagat11.checklist-todo"

  // Moving a bar widget briefly overlaps the retiring instance with its
  // replacement; registering the IPC target immediately can collide with the
  // copy that has not been torn down yet, so wait a tick for the slot to clear.
  property bool ipcRegistrationReady: false

  readonly property var panel: panelLoader.item
  readonly property bool opened: panel ? panel.opened === true : false
  readonly property int itemCount: panel ? panel.items.length : 0
  // Forwarded so opening another widget's popup closes this one cleanly.
  readonly property bool popoutSwitchClosing: panel ? panel.popoutSwitchClosing === true : false

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  function open() { if (panel) panel.open() }
  function close() { if (panel) panel.close() }
  function togglePanel() { if (panel) panel.toggle() }
  function closeForPopoutSwitch() { if (panel) panel.closeForPopoutSwitch() }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()
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

    // `omarchy-shell tathagat11.checklist-todo add "Buy milk" "Semi-skimmed"`.
    function add(name: string, description: string): string {
      if (!root.panel) return "unavailable"
      return root.panel.addItem(name, description)
    }

    // `omarchy-shell tathagat11.checklist-todo remove <id>`.
    function remove(id: string): string {
      if (!root.panel) return "unavailable"
      root.panel.deleteItem(id)
      return "ok"
    }

    function status(): string {
      return root.itemCount + " todo" + (root.itemCount === 1 ? "" : "s")
    }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰄲"
    fontSize: Style.bar.iconFont
    fixedWidth: root.vertical ? -1 : Style.bar.iconSlot
    fixedHeight: root.vertical ? Style.bar.iconSlot : -1
    tooltipText: root.itemCount > 0
      ? root.itemCount + " todo" + (root.itemCount === 1 ? "" : "s")
      : "Checklist Todo"

    onPressed: function(pressedButton) {
      if (pressedButton === Qt.LeftButton) root.togglePanel()
    }
  }
}
