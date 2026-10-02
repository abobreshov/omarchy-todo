import QtQuick
import QtTest
import qs.Commons
import "../.." as Todo
import "../../Store.js" as Store

// AC-ST.90, the drawn popup (the done-row lesson; tst_donetail.qml's
// shape): for every body, each line the body shows is a visible Text inside
// the Flickable's viewport at contentY 0 that puts ink on the card in a grab
// of the window (so the clip counts), every other line is hidden, and a body
// shorter than the cap is never clipped (contentHeight <= height). The real
// NorthStarPanel and NorthStarBody over the headless seams, on a card-coloured
// background.
Item {
  id: top
  width: 480; height: 640
  property double now: Date.parse("2026-10-01T21:00:00Z")
  Rectangle { id: card; anchors.fill: parent; color: Color.popups.background }
  FakeBar { id: fakeBar }
  QtObject {
    id: store
    property bool loaded: true
    property bool hasNorthStar: true
    property var northStar: null
    property var error: null
    function refresh() { return "ok" }
  }
  // Shown: the headless KeyboardPanel seam is an Item, not a window.
  Todo.NorthStarPanel { id: popup; visible: true; bar: fakeBar; store: store; backend: "cli"; clock: function() { return top.now } }
  TestCase {
    name: "NorthStarDrawn"; when: windowShown
    readonly property var ns1: ({ title: "Почему вы здесь?", description: "Строить то, что важно.\n\nКаждый день — шаг.", updatedAt: "2026-10-01T19:40:00.000Z", via: "cli" })
    readonly property var lines: ["northStarGlyph", "northStarHeading", "northStarCaption", "northStarDescription", "northStarNoDescription", "northStarMessage", "northStarMessageCaption", "northStarEditHint", "northStarHistoryHint", "northStarStale", "northStarHelp"]
    readonly property var setLines: ["northStarGlyph", "northStarHeading", "northStarCaption", "northStarDescription", "northStarEditHint", "northStarHistoryHint"]
    function part(name) { return findChild(popup, name) }
    function read(raw, over) {
      var doc = Store.fromCli(raw === undefined ? { version: 1, tasks: [] } : { version: 1, tasks: [], northStar: raw })
      store.northStar = doc.northStar; store.hasNorthStar = doc.hasNorthStar; store.loaded = true; store.error = null
      for (var k in over || {}) store[k] = over[k]
      popup.backend = "cli"
    }
    // Pixels in the window rect (x, y, w, h) that stand off the card: a
    // channel at least 0.2 from its colour, so a line tinted a few per cent
    // over the card is not drawn. `first` stops at the first one (a line
    // only needs some ink).
    function legible(c) { var b = card.color; return Math.max(Math.abs(c.r - b.r), Math.abs(c.g - b.g), Math.abs(c.b - b.b)) >= 0.2 }
    function inkIn(img, x, y, w, h, first) {
      var n = 0
      for (var px = Math.max(0, Math.floor(x)); px < Math.min(img.width, x + w); px++)
        for (var py = Math.max(0, Math.floor(y)); py < Math.min(img.height, y + h); py++)
          if (legible(img.pixel(px, py)) && ++n && first) return n
      return n
    }
    function ink(img, item) { var p = item.mapToItem(top, 0, 0); return inkIn(img, p.x, p.y, item.width, item.height, true) }
    // What keeps `shown` from being drawn, and any other line from hiding: [] when nothing does.
    // `prev` is the bottom of the last shown line in Column order; the star
    // shares the heading's row, so it is skipped.
    function allDrawn(name, shown) {
      popup.close(); popup.open(); wait(50) // grabImage polishes and renders the window itself
      var flick = findChild(popup, "northStarScroll"), img = grabImage(top), out = [], prev = 0
      for (var line of lines) {
        var t = part(line), p = t.mapToItem(flick, 0, 0), want = shown.indexOf(line) !== -1
        if (t.visible !== want) out.push(line + (want ? " hidden" : " shown"))
        if (!want) continue
        if (t.text === "" || t.opacity === 0 || t.height === 0) out.push(line + " empty")
        if (p.y < 0 || p.y + t.height > flick.height || p.x < 0 || p.x + t.width > flick.width + 0.5) out.push(line + " outside the viewport")
        if (ink(img, t) === 0) out.push(line + " not drawn")
        if (line === "northStarGlyph") continue
        if (p.y < prev - 0.5) out.push(line + " overlaps the line above")
        prev = p.y + t.height
      }
      if (flick.contentHeight > flick.height) out.push("clipped: " + flick.contentHeight + " > " + flick.height)
      compare(out, [], name)
      return img
    }

    function test_ns1_every_line_and_each_paragraph() {
      read(ns1)
      var img = allDrawn("NS1", setLines), desc = part("northStarDescription"), p = desc.mapToItem(top, 0, 0)
      var lh = desc.implicitHeight / desc.lineCount
      compare(desc.lineCount, 3)
      compare([inkIn(img, p.x, p.y, desc.width, lh, true) > 0, inkIn(img, p.x, p.y + lh, desc.width, lh, false), inkIn(img, p.x, p.y + 2 * lh, desc.width, lh, true) > 0], [true, 0, true], "two paragraphs inked, the empty line empty")
    }
    function test_a_120_letter_title() {
      read({ title: "Почему".repeat(20), description: ns1.description })
      var img = allDrawn("120 letters", setLines), h = part("northStarHeading"), hp = h.mapToItem(top, 0, 0), lh = h.implicitHeight / h.lineCount
      verify(h.lineCount > 1)
      for (var i = 0; i < h.lineCount; i++) verify(inkIn(img, hp.x, hp.y + i * lh, h.width, lh, true) > 0, "heading line " + i)
      verify(part("northStarCaption").mapToItem(top, 0, 0).y >= hp.y + h.height, "the caption below the heading's last line")
    }
    function test_a_title_only_north_star() {
      read({ title: ns1.title })
      allDrawn("title only", ["northStarGlyph", "northStarHeading", "northStarCaption", "northStarNoDescription", "northStarEditHint", "northStarHistoryHint"])
    }
    function test_the_unset_body() {
      read(null)
      allDrawn("unset", ["northStarGlyph", "northStarHeading", "northStarMessage", "northStarMessageCaption", "northStarHistoryHint"])
    }
    function test_e40_e41_and_loading() {
      read(ns1); popup.backend = "json"
      allDrawn("E40", ["northStarGlyph", "northStarHeading", "northStarMessage"])
      read(undefined)
      allDrawn("E41", ["northStarGlyph", "northStarHeading", "northStarMessage"])
      read(ns1, { loaded: false })
      allDrawn("Loading", ["northStarGlyph", "northStarHeading", "northStarMessage"])
    }
    function test_the_error_pair() {
      read(ns1, { loaded: false, error: { kind: "missing", message: "todocli not found" } })
      allDrawn("E4 before any read", ["northStarGlyph", "northStarHeading", "northStarMessage", "northStarMessageCaption"])
    }
    function test_ns1_with_the_stale_line() {
      read(ns1, { error: { kind: "failed", message: "database error: the North Star row is not a North Star (x); todocli northstar clear removes it" } })
      allDrawn("stale", setLines.concat(["northStarStale"]))
      compare(part("northStarStale").text, "todocli error · showing the last good read")
    }
    function test_the_help_line_too() {
      read(ns1)
      popup.open(); popup.help = true
      wait(50)
      var img = grabImage(top), help = part("northStarHelp")
      compare([help.visible, ink(img, help) > 0], [true, true])
    }
  }
}
