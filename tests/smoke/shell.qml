import QtQuick
import Quickshell
import Quickshell.Io

// Headless smoke harness (tests/smoke.sh): loads the fork's BarWidget with a
// fake bar facade in a scratch Quickshell instance and answers IPC on that
// instance's own socket. It never opens the panel, so no window appears.
// `qs.Ui` / `qs.Commons` resolve through the Ui and Commons symlinks the
// script places next to this file.
ShellRoot {
  id: root

  property var settingsObj: JSON.parse(Quickshell.env("SMOKE_SETTINGS") || "{}")
  property var widget: loader.item

  QtObject {
    id: fakeBar
    property color foreground: "#ffffff"
    property color barForeground: "#ffffff"
    property color background: "#000000"
    property color urgent: "#a55555"
    property string fontFamily: "JetBrainsMono Nerd Font"
    property string position: "top"
    property bool vertical: Quickshell.env("SMOKE_VERTICAL") === "1"
    property int barSize: vertical ? 28 : 26
    property bool transparent: false
    property bool foregroundAnimationEnabled: false
    property var activePopout: null
    property var shell: null
    function showTooltip(target, text) {}
    function hideTooltip(target) {}
    function registerClickTarget(target) {}
    function unregisterClickTarget(target) {}
    function requestPopout(owner) {}
    function releasePopout(owner) {}
    function switchPanelFrom(owner, direction) { return false }
    function targetBelongsToWindow() { return true }
    function moduleWidgets(id) { return root.widget ? [root.widget] : [] }
    function run(command) { console.log("SMOKE bar.run called: " + command) }
  }

  Loader {
    id: loader
    source: "file://" + Quickshell.env("SMOKE_PLUGIN") + "/BarWidget.qml"
    onLoaded: {
      item.bar = fakeBar
      item.moduleName = "abobreshov.todo"
      item.settings = root.settingsObj
    }
    onStatusChanged: if (status === Loader.Error) console.log("SMOKE load error: " + sourceComponent.errorString())
  }

  IpcHandler {
    target: "smoke"
    function settings(json: string): string {
      root.settingsObj = JSON.parse(json)
      if (loader.item) loader.item.settings = root.settingsObj
      return "ok"
    }
    function pill(): string { return JSON.stringify(loader.item ? loader.item.pill : null) }
    // The row's {del} button as TaskRow's onClicked calls it (Panel.rowKey):
    // one call arms the row, a second within 3 s removes the item. Answers
    // the armed id (tests/smoke.sh).
    function deleteRow(id: string): string {
      var panel = loader.item ? loader.item.panel : null
      if (!panel) return "unavailable"
      panel.rowKey(id, "x")
      return JSON.stringify(panel.ui.armedId)
    }
    function width(): string { return String(loader.item ? loader.item.implicitWidth : -1) }
    function quit(): void { Qt.quit() }
  }
}
