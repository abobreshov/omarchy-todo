import QtQuick
import Quickshell
import Quickshell.Io

// Headless smoke harness (tests/smoke.sh): loads the fork's BarWidget with a
// fake bar facade in a scratch Quickshell instance and answers IPC on that
// instance's own socket. `qs.Ui` / `qs.Commons` resolve through the Ui and
// Commons the script places next to this file, with Ui/KeyboardPanel.qml
// stubbed (tests/qml/imports/KeyboardPanelBase.qml): IPC can open the todo
// panel and the North Star popup, and still no window appears.
ShellRoot {
  id: root

  property var settingsObj: JSON.parse(Quickshell.env("SMOKE_SETTINGS") || "{}")
  property var widget: loader.item

  // Positioners lay out at polish, which a window never shown never runs:
  // lay out `item`'s subtree, children first.
  function layOut(item, depth) {
    if (!item || depth > 40) return
    var kids = item.children || []
    for (var i = 0; i < kids.length; i++) layOut(kids[i], depth + 1)
    if (item.contentItem && item.contentItem !== item && item.contentItem.children) layOut(item.contentItem, depth + 1)
    if (typeof item.forceLayout === "function") item.forceLayout()
  }

  // Depth-first search by objectName through items' and windows' data.
  function named(obj, name, depth) {
    if (!obj || depth > 40) return null
    if (obj.objectName === name) return obj
    var lists = [obj.data, obj.contentItem]
    for (var l = 0; l < lists.length; l++) {
      var kids = lists[l]
      if (!kids || kids.length === undefined) continue
      for (var i = 0; i < kids.length; i++) {
        var hit = named(kids[i], name, depth + 1)
        if (hit) return hit
      }
    }
    return null
  }

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
    property int switches: 0
    function showTooltip(target, text) {}
    function hideTooltip(target) {}
    function registerClickTarget(target) {}
    function unregisterClickTarget(target) {}
    // Bar.qml's single-popout coordinator, copied as the shell has it
    // (tests/coordination-pin.test.mjs pins the copy).
    function requestPopout(owner) {
      if (activePopout === owner) return
      if (activePopout) {
        if ("closeForPopoutSwitch" in activePopout) activePopout.closeForPopoutSwitch()
        else if ("close" in activePopout) activePopout.close()
      }
      activePopout = owner
    }

    function releasePopout(owner) {
      if (activePopout === owner) activePopout = null
    }
    function switchPanelFrom(owner, direction) { switches += 1; return false }
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
    // The list row of task `id` in the closed panel (its content is built
    // eagerly, and laid out here): the glyph and title texts, whether the
    // delegate is visible, and whether it lies inside the rows viewport,
    // which clips (CHANGELOG 2.1.1: the done tail drew an empty row).
    function row(id: string): string {
      var rows = loader.item && loader.item.panel ? root.named(loader.item.panel, "todoRows", 0) : null
      if (!rows) return "unavailable"
      // The stubbed card is an Item under BarWidget's hidden Loader: show
      // that branch (no window renders it) so `visible` is the row's own.
      var hidden = loader.item.panel.parent
      hidden.visible = true
      root.layOut(rows.parent, 0)
      var list = rows.contentItem.children[0].children
      for (var i = 0; i < list.length; i++) {
        var r = list[i]
        if (r.itemData === undefined || r.itemData.id !== id) continue
        var texts = []
        for (var j = 0; j < r.children.length; j++) if (typeof r.children[j].text === "string") texts.push(r.children[j])
        var out = JSON.stringify({ glyph: texts[0].text, title: texts[1].text, visible: r.visible && texts[0].visible && texts[1].visible,
          opacity: r.opacity, height: r.height, inViewport: r.y >= rows.contentY && r.y + r.height <= rows.contentY + rows.height })
        hidden.visible = false
        return out
      }
      hidden.visible = false
      return "no row"
    }
    // The pill and the star sit in a Grid, laid out here as for row().
    function width(): string { if (loader.item) root.layOut(loader.item, 0); return String(loader.item ? loader.item.implicitWidth : -1) }
    // Which card the fake bar's coordinator holds: todo | northStar | none.
    function active(): string {
      var a = fakeBar.activePopout
      return !a ? "none" : a === loader.item ? "todo" : a.objectName === "northStarPanel" ? "northStar" : "other"
    }
    function quit(): void { Qt.quit() }
  }
}
