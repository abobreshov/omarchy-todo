import QtQuick
import "../.." as Todo
import "DoneTailBoard.js" as Board

// The real widget (BarWidget.qml, its Panel.qml and CliStore, the star and
// the popup) over the fake bar, for the bar-level probes
// (tst_northstar_bar.qml, tst_northstar_switch.qml). Reads are applied
// through CliStore.finishRead, as the stubbed Process's exit would apply
// them; nothing is spawned. The backdrop is the bar's background.
Item {
  id: rig
  property double now: Date.parse("2026-10-01T21:00:00Z")
  readonly property alias bar: fakeBar
  readonly property alias widget: widget
  readonly property var ns1: ({ title: "Почему вы здесь?", description: "Строить то, что важно.\n\nКаждый день — шаг.", updatedAt: "2026-10-01T19:40:00.000Z", via: "cli" })
  readonly property var work: ({ uid: "s1", key: "work: tellkin", group: "work", name: "tellkin", position: 1, system: false, createdAt: "", archivedAt: null, open: 2 })
  readonly property var readArgv: ["/nonexistent/todocli", "--source", "omarchy", "--json", "board"]

  Rectangle { anchors.fill: parent; color: fakeBar.background }
  FakeBar { id: fakeBar }
  Todo.BarWidget { id: widget; bar: fakeBar; moduleName: "abobreshov.todo"; settings: ({ backend: "cli", cliPath: "/nonexistent/todocli" }) }

  function panel() { return widget.panel }
  function store() { return widget.panel.store }
  function named(item, name) {
    if (!item) return null
    if (item.objectName === name) return item
    for (var i = 0; i < (item.children || []).length; i++) { var hit = named(item.children[i], name); if (hit) return hit }
    return null
  }
  function star() { return named(widget, "northStarButton") }
  function pill() { return named(widget, "todoPill") }
  function popup() { return named(widget, "northStarPanel") }
  function popupKeys() { return named(widget, "northStarBody").focusTarget }
  function todoBody() { return panel().children.filter(function(c) { return c.host !== undefined })[0] }
  function dump() { return JSON.parse(widget.dump()) }
  function invariant() { var d = dump(); return !(d.panelOpen && d.northStarPopup !== null) }

  // A board read carrying `northStar` (undefined: an older todocli's board).
  function apply(northStar) {
    var d = JSON.parse(Board.board([Board.INBOX, work], null, null, { "7": "work: tellkin", "8": "work: tellkin" }))
    if (northStar !== undefined) d.northStar = northStar
    var s = store()
    s.queue = []; s.pending = null; s.readGen = 0; s.writeGen = 0; s.error = null
    s.finishRead(0, false, JSON.stringify(d), "")
  }
  function fail(code, stderr, spawnFailed) { store().finishRead(code, spawnFailed === true, "", stderr || "") }
  // No read applied yet, as a fresh store starts.
  function fresh() {
    var s = store()
    s.loaded = false; s.error = null; s.stale = false; s.hasNorthStar = false; s.northStar = null
    s.items = []; s.streams = []; s.hasStreams = false
  }
  function reset() {
    widget.close()
    fakeBar.activePopout = null; fakeBar.switches = []; fakeBar.next = null; fakeBar.vertical = false
    panel().clock = function() { return rig.now }
    panel().message = ""
    apply(ns1)
  }
}
