import QtQuick
import QtTest
import "../.." as Todo

// Headless probe of TaskRow's hover geometry (UX §4.2, the fixed-slot rule;
// docs/reports/HOVER-GLITCH-VIDEO.md): the fork's real TaskRow.qml is loaded
// against the installed shell's Ui/Commons with the Quickshell types stubbed
// (tests/qml/imports), on the offscreen platform. The row's height and its
// icon cluster's geometry must be one value before, during and after a
// hover, including with the pointer resting on a ghost button; every
// measurement is logged as a PROBE line. Run: tests/qml/run.sh.
Item {
  id: top
  width: 420
  height: 200

  QtObject {
    id: uiState
    property int cursor: -1
    property string armedId: ""
  }

  QtObject {
    id: fakePanel
    property var ui: uiState
    property var focusModel: null
    property var pomodoro: ({ phase: "idle", running: false, remaining: 0, taskId: "", label: "", attached: false })
    property color contentForeground: "#ffffff"
    property color dimForeground: "#888888"
    property string contentFontFamily: "monospace"
    property bool errored: false
    property var calls: []
    function hoverRow(i) { uiState.cursor = i; calls.push("hover:" + i) }
    function openDetail(id) { calls.push("open:" + id) }
    function rowKey(id, k) { calls.push("key:" + id + ":" + k) }
    function tickRow(id) { calls.push("tick:" + id) }
  }

  Todo.TaskRow {
    id: row
    width: parent.width
    panel: fakePanel
    modelData: ({ id: "1", name: "buy salt", status: "todo", plan: [] })
    rowIndex: 0
  }

  TestCase {
    name: "HoverGeometry"
    when: windowShown

    function cluster() {
      var kids = row.children
      for (var i = 0; i < kids.length; i++) if (String(kids[i]).indexOf("QQuickRow") === 0) return kids[i]
      return null
    }
    function geom() {
      var c = cluster()
      return JSON.stringify({ h: row.height, cx: c ? c.x : -1, cw: c ? c.width : -1, ch: c ? c.height : -1 })
    }
    function ghostOpacities() {
      var c = cluster(); var out = []
      if (!c) return "none"
      for (var i = 0; i < c.children.length; i++) {
        var k = c.children[i]
        if (!k.visible) continue
        var kk = k.children
        for (var j = 0; j < kk.length; j++) if (String(kk[j]).indexOf("PanelActionButton") === 0 || String(kk[j]).indexOf("BorderSurface") === 0) out.push(kk[j].opacity.toFixed(2) + "/" + (kk[j].visible ? "v" : "h") + "/" + (kk[j].enabled ? "e" : "d"))
        if (String(k).indexOf("PanelActionButton") === 0 || String(k).indexOf("BorderSurface") === 0) out.push(k.opacity.toFixed(2) + "/" + (k.visible ? "v" : "h") + "/" + (k.enabled ? "e" : "d"))
      }
      return out.join(" ")
    }

    function test_hover_keeps_geometry() {
      waitForRendering(row)
      wait(100)
      var before = geom()
      console.log("PROBE before  " + before + " hovered=" + row.rowHovered + " ghosts=" + ghostOpacities())

      // 1. pointer onto the row's right cluster
      mouseMove(row, row.width - 30, row.height / 2)
      wait(200)
      var during = geom()
      console.log("PROBE cluster " + during + " hovered=" + row.rowHovered + " ghosts=" + ghostOpacities())

      // 2. pointer exactly over the last (right-most) visible child of the cluster, a ghost button slot
      var c = cluster()
      var last = null
      for (var i = c.children.length - 1; i >= 0; i--) if (c.children[i].visible) { last = c.children[i]; break }
      var p = last.mapToItem(row, last.width / 2, last.height / 2)
      var samples = []
      for (var s = 0; s < 12; s++) {
        mouseMove(row, p.x + (s % 2), p.y)
        wait(40)
        samples.push(row.height + ":" + (row.rowHovered ? "H" : "-"))
      }
      var over = geom()
      console.log("PROBE ghost   " + over + " hovered=" + row.rowHovered + " ghosts=" + ghostOpacities() + " samples=" + samples.join(","))

      // 3. pointer off the row
      mouseMove(top, 5, top.height - 5)
      wait(200)
      var after = geom()
      console.log("PROBE after   " + after + " hovered=" + row.rowHovered + " ghosts=" + ghostOpacities() + " calls=" + fakePanel.calls.join(","))

      compare(during, before, "geometry changed while hovered")
      compare(over, before, "geometry changed with the pointer over a ghost button")
      compare(after, before, "geometry changed after the hover")
      verify(row.rowHovered === false, "row still hovered after leaving")
      verify(samples.every(function (x) { return x === samples[0] }), "the height moved under the pointer: " + samples.join(","))
    }
  }
}
