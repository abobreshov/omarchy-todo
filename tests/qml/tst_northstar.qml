import QtQuick
import QtTest
import qs.Commons
import "../.." as Todo
import "../../Store.js" as Store
import "../../NorthStar.js" as NorthStar
import "../../Model.js" as Model

// The star and the popup on their own (ADDENDUM-S11 §5.2, §5.3, §5.8): the
// slot and the open mark (B1, B5), the popup's width and heading (P1, P2,
// P4), its bodies, plain text and scroll. AC-ST.71, 73, 74, 75, 82 and 83 at
// the QML level. The real NorthStarButton, NorthStarPanel and NorthStarBody
// run over the headless kit seams; a fake store holds what a read assigns.
Item {
  id: top
  width: 480; height: 640
  property double now: Date.parse("2026-10-01T21:00:00Z")
  FakeBar { id: fakeBar }
  QtObject {
    id: store
    property bool loaded: true
    property bool hasNorthStar: true
    property var northStar: null
    property var error: null
    property int refreshes: 0
    function refresh() { refreshes += 1; return "ok" }
  }
  QtObject { id: host; property var bar: fakeBar; property int opens: 0; function open() { opens += 1 } }
  Todo.NorthStarButton { id: button; bar: fakeBar; y: 560 }
  // Shown here: in the shell the card is its own window, but the headless
  // KeyboardPanel seam is an Item, and a Column lays out only visible items.
  Todo.NorthStarPanel { id: popup; visible: true; bar: fakeBar; store: store; backend: "cli"; hostWidget: host; clock: function() { return top.now } }
  TestCase {
    name: "NorthStar"; when: windowShown
    readonly property string nsT: "Почему вы здесь?"
    readonly property string nsD: "Строить то, что важно.\n\nКаждый день — шаг."
    readonly property var ns1: ({ title: nsT, description: nsD, updatedAt: "2026-10-01T19:40:00.000Z", via: "cli" })
    function body() { return findChild(popup, "northStarBody") }
    function part(name) { return findChild(popup, name) }
    function keys() { return body().focusTarget }
    // What CliStore.finishRead assigns for a board carrying `raw` (absent:
    // the key-less board of an older todocli).
    function read(raw, over) {
      var doc = Store.fromCli(raw === undefined ? { version: 1, tasks: [] } : { version: 1, tasks: [], northStar: raw })
      store.northStar = doc.northStar; store.hasNorthStar = doc.hasNorthStar; store.loaded = true; store.error = null
      for (var k in over || {}) store[k] = over[k]
      popup.backend = "cli"
    }
    function init() { popup.close(); host.opens = 0; store.refreshes = 0; fakeBar.vertical = false; read(ns1); wait(0) }

    function test_the_star_slot_never_changes_only_its_colour_and_mark() {
      var slot = Style.bar.iconSlot
      for (var state of ["unset", "set"]) for (var open of [false, true]) for (var hover of [false, true]) {
        button.starState = state; button.popupOpen = open
        if (hover) mouseMove(button, 3, 3); else mouseMove(top, 1, 1)
        compare([button.visible, button.width, button.height, button.button.text], [true, slot, fakeBar.barSize, NorthStar.GLYPH], state + open + hover)
        compare(String(button.button.foreground), String(state === "set" ? Color.accent : fakeBar.barForeground))
        tryCompare(button.button, "opacity", state === "set" ? 1 : 0.45)
        tryCompare(button.openMark, "opacity", open ? 0.9 : 0)
        compare([button.openMark.x, button.openMark.y, button.openMark.width, button.openMark.height], [Math.round((slot - Style.space(10)) / 2), fakeBar.barSize - 2 * Style.space(2), Style.space(10), Style.space(2)], "B5: only the mark's opacity changes")
      }
      button.starState = "hidden"
      compare(button.visible, false)
      fakeBar.vertical = true; button.starState = "set"
      compare([button.width, button.height, button.openMark.width, button.openMark.height], [fakeBar.barSize, slot, Style.space(2), Style.space(10)], "one slot high on a vertical bar")
    }

    function test_one_width_and_a_fixed_heading_in_every_state() {
      var long = "Почему".repeat(20), heading = part("northStarHeading"), star = part("northStarGlyph"), x = heading.x
      var states = [[ns1], [{ title: long, description: nsD }], [{ title: nsT }], [null], [42], [undefined], [ns1, { loaded: false }], [ns1, { loaded: false, error: { kind: "missing", message: "todocli not found" } }], [ns1, { error: { kind: "failed", message: "x" } }]]
      for (var i = 0; i < states.length; i++) {
        read(states[i][0], states[i][1])
        compare(body().contentWidth, Style.space(400), "P1")
        compare([star.x, star.y, heading.x], [0, 0, x], "P2")
        compare(heading.lineCount > 0 && Math.abs(star.height - heading.implicitHeight / heading.lineCount) <= 1, true, "the star's line box is the heading's first line")
      }
      read({ title: long, description: nsD })
      verify(heading.lineCount > 1, "a 120-letter title wraps")
      popup.backend = "json"
      compare([body().contentWidth, heading.text, String(star.color)], [Style.space(400), "North Star", String(body().dim)])
    }

    function test_the_set_body() {
      popup.open()
      var heading = part("northStarHeading"), desc = part("northStarDescription")
      compare([heading.text, heading.font.pixelSize, heading.font.bold, heading.textFormat, heading.wrapMode], [nsT, Style.font.title, true, Text.PlainText, Text.WrapAtWordBoundaryOrAnywhere])
      compare(part("northStarCaption").text, "North Star · updated " + Model.noteTime(ns1.updatedAt, top.now, false) + " · via cli", "20:40 under Europe/London (node)")
      compare([desc.text, desc.lineCount], [nsD, 3], "the empty middle line kept")
      compare([part("northStarEditHint").text, part("northStarHistoryHint").text], [NorthStar.EDIT_HINT, NorthStar.HISTORY_HINT])
      compare(String(part("northStarGlyph").color), String(Color.accent))
      for (var name of ["northStarNoDescription", "northStarMessage", "northStarMessageCaption", "northStarStale", "northStarHelp"]) compare(part(name).text, "", name)
      read({ title: nsT })
      compare([part("northStarNoDescription").text, part("northStarDescription").text], ["No description yet.", ""])
    }

    function test_the_other_bodies_with_their_copy() {
      var cases = [[[null], "unset", "No North Star yet.", NorthStar.UNSET_CAPTION, true], [[undefined], "older", "North Star needs a newer todocli.", "", false],
        [[ns1, { loaded: false }], "loading", "Loading…", "", false], [[ns1, { loaded: false, error: { kind: "missing", message: "todocli not found" } }], "error", "todocli not found.", "The todo list shows what went wrong.", false]]
      for (var c of cases) {
        read(c[0][0], c[0][1])
        compare([popup.model.state, part("northStarHeading").text, part("northStarMessage").text, part("northStarMessageCaption").text], [c[1], "North Star", c[2], c[3]], c[1])
        compare([part("northStarHistoryHint").text !== "", part("northStarCaption").text, part("northStarEditHint").text, part("northStarDescription").text], [c[4], "", "", ""], c[1])
      }
      popup.backend = "json"
      compare([part("northStarMessage").text, part("northStarHistoryHint").text], ["North Star needs backend = cli.", ""])
      read(ns1, { error: { kind: "failed", message: "database error: the North Star row is not a North Star (x); todocli northstar clear removes it" } })
      compare([part("northStarDescription").text, part("northStarStale").text], [nsD, "todocli error · showing the last good read"])
    }

    function test_plain_text_and_the_identity() {
      read({ title: "  <b>Почему</b>\n вы   здесь? 🌟 ", description: "Первая строка\r\nвторая\r\n\r\n\r\n**третья**  \r\n" })
      compare(part("northStarHeading").text, "<b>Почему</b> вы здесь? 🌟")
      compare(part("northStarDescription").text, "Первая строка\nвторая\n\n\n**третья**")
      read({ title: "a﻿b" })
      compare(part("northStarHeading").text, "a﻿b")
      var texts = ["northStarGlyph", "northStarHeading", "northStarCaption", "northStarDescription", "northStarNoDescription", "northStarMessage", "northStarMessageCaption", "northStarEditHint", "northStarHistoryHint", "northStarStale", "northStarHelp"]
      for (var name of texts) compare(part(name).textFormat, Text.PlainText, name)
      compare(findChild(body(), "northStarCaption").elide, Text.ElideRight)
    }

    function test_scroll_steps_keep_or_reset_and_reopen_at_the_top() {
      read({ title: nsT, description: ("Строка " + "слово ".repeat(60) + "\n").repeat(12).slice(0, 4000) })
      popup.open()
      var flick = body().flick, step = Style.space(48)
      waitForRendering(top) // the Column lays out at polish
      verify(flick.interactive, "4000 characters scroll")
      for (var i = 0; i < 3; i++) keys().moveRequested(0, 1)
      compare(flick.contentY, 3 * step)
      read(Object.assign({}, store.northStar, { updatedAt: "2026-10-01T20:59:00.000Z", via: "claude" }))
      compare(flick.contentY, 3 * step, "a read with the same text keeps the offset")
      for (i = 0; i < 400; i++) keys().moveRequested(0, 1)
      compare(flick.contentY, flick.contentHeight - flick.height, "clamped")
      keys().moveRequested(0, -1)
      compare(flick.contentY, flick.contentHeight - flick.height - step)
      read(Object.assign({}, store.northStar, { description: store.northStar.description + "!" }))
      compare(flick.contentY, 0, "a changed description goes to the top")
      keys().moveRequested(0, 1); popup.close(); popup.open()
      compare(flick.contentY, 0, "each open starts at the top")
    }

    function test_popup_keys_route_through_the_kit_signals() {
      popup.open()
      keys().textKey("?"); compare([popup.help, part("northStarHelp").text], [true, NorthStar.POPUP_HELP])
      keys().textKey("r"); compare(store.refreshes, 1)
      keys().textKey("*"); compare(host.opens, 1, "* opens the todo panel")
      keys().tabRequested(-1)
      var last = fakeBar.switches[fakeBar.switches.length - 1]
      compare([last.owner === host, last.direction], [true, -1], "Tab: switchPanelFrom(<the widget>, -1)")
      keys().closeRequested(); compare(popup.opened, false)
      popup.open(); compare(popup.help, false, "the help starts hidden")
    }
  }
}
