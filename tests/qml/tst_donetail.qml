import QtQuick
import QtTest
import qs.Commons
import "../.." as Todo
import "../../Model.js" as Model
import "../../Order.js" as Order
import "../../Store.js" as Store
import "DoneTailBoard.js" as Board

// The done tail is drawn (CHANGELOG 2.1.1, UX §25, CONTRACT-S9 §8 (A2)): on
// the live 2.1.0 board the dump listed #11 after the open rows but the panel
// drew an empty row-sized slot there. The real Panel.qml, PanelBody and
// TaskList run here against a card-coloured background; every item row's
// delegate must exist, be visible and opaque, sit inside the rows viewport
// and put ink on the card for its glyph and its title (a grab of the window,
// so the Flickable's clip counts). Inbox only, a stream tab, a horizon
// section and Overview's groups; then A-D7's degraded paths (older todocli,
// json), where a ticked row stays for the session and is gone on reopen.
Item {
  id: top
  width: 420; height: 640
  // A minute after #11 was done: the view day holds #11 in any time zone.
  property double now: Date.parse("2026-10-01T13:46:10Z")
  Rectangle { id: card; anchors.fill: parent; color: Color.popups.background }
  Todo.Panel {
    id: panel
    clock: function() { return top.now }
    settings: ({ backend: "cli", cliPath: "/nonexistent/todocli" })
  }
  TestCase {
    name: "DoneTail"; when: windowShown
    readonly property var work: ({ uid: "s1", key: "work: a", group: "work", name: "a", position: 1, system: false, createdAt: "", archivedAt: null, open: 0 })

    function init() {
      panel.close()
      if (panel.backend !== "cli") {
        panel.settings = ({ backend: "cli", cliPath: "/nonexistent/todocli" })
        tryVerify(function() { return panel.backend === "cli" })
      }
      wait(0)
    }
    function load(doc, tab) {
      panel.close()
      var s = panel.store
      s.queue = []; s.pending = null; s.readGen = 0; s.writeGen = 0; s.error = null
      s.finishRead(0, false, doc, "")
      panel.open()
      if (tab) panel.selectTab(tab)
      wait(50)
      waitForRendering(top)
    }
    function flick() { return findChild(panel, "todoRows") }
    function delegates() { return flick().contentItem.children[0].children.filter(function(c) { return c.itemData !== undefined }) }
    function rowOf(id) { return delegates().filter(function(r) { return r.itemData.id === id })[0] }
    function ids() { return panel.displayRows.filter(function(r) { return r.kind === "item" }).map(function(r) { return r.item.id }) }
    function tail() { return ["11", "10"].filter(function(id) { return Order.inTail(Model.findItem(panel.items, id), panel.viewDayStart) }) }
    function glyphOf(row) { return row.children.filter(function(c) { return c.text === Model.statusGlyph(row.itemData.status) })[0] }
    function titleOf(row) { return row.children.filter(function(c) { return c.text === row.itemData.name })[0] }
    // Pixels in `item`'s window rect that are not the card's colour.
    function ink(img, item) {
      var p = item.mapToItem(top, 0, 0), n = 0
      for (var x = Math.max(0, Math.floor(p.x)); x < Math.min(img.width, p.x + item.width); x++)
        for (var y = Math.max(0, Math.floor(p.y)); y < Math.min(img.height, p.y + item.height); y++)
          if (!Qt.colorEqual(img.pixel(x, y), card.color)) n++
      return n
    }
    // What keeps row `id` from being drawn: [] when nothing does.
    function problems(id, img) {
      var f = flick(), row = rowOf(id), out = []
      if (row === undefined) return ["#" + id + " has no delegate"]
      var glyph = glyphOf(row), title = titleOf(row)
      if (glyph === undefined || title === undefined) return ["#" + id + " has no glyph or title"]
      var inks = [ink(img, glyph), ink(img, title)]
      console.log("PROBE #" + id + " y=" + row.y + " h=" + row.height + " viewport=" + f.contentY + "+" + f.height + " content=" + f.contentHeight + " ink=" + inks.join("/"))
      if (!row.visible || row.opacity === 0 || row.height === 0) out.push("#" + id + " delegate hidden")
      if (!glyph.visible || glyph.text === "" || !title.visible || title.text === "") out.push("#" + id + " glyph or title empty")
      if (row.y < f.contentY || row.y + row.height > f.contentY + f.height) out.push("#" + id + " outside the rows viewport")
      if (inks[0] === 0) out.push("#" + id + " glyph not drawn")
      if (inks[1] === 0) out.push("#" + id + " title not drawn")
      if (row.itemData.status === "done") {
        // #rrggbb: Qt.darker's dim is not exactly equal to its own copy.
        var dim = String(panel.dimForeground)
        if (glyph.text !== Model.G.done) out.push("#" + id + " not the done glyph")
        if (!title.font.strikeout) out.push("#" + id + " title not struck")
        if (String(title.color) !== dim || String(glyph.color) !== dim) out.push("#" + id + " not dim")
        if (dim === String(card.color)) out.push("dim is the card colour")
      }
      return out
    }
    function allDrawn() {
      var f = flick(), img = grabImage(top), out = []
      compare(delegates().length, ids().length)
      ids().forEach(function(id) { out = out.concat(problems(id, img)) })
      compare(out, [])
      compare(f.height, f.contentHeight, "the rows fit: the viewport is their height")
      // The card asks for what the list lays out: one gap above the rows, a
      // second only above a shown help line (2.1.2).
      compare(f.parent.desiredHeight, f.parent.implicitHeight, "no spare gap under the rows")
    }

    function test_inbox_only_done_tail_is_drawn() {
      load(Board.board())
      compare(panel.stripShown, false)
      compare(Order.dayKey(panel.viewDayStart), Order.dayKey(Order.dayStartOf(top.now)), "the view day is the clock's local day in any zone")
      compare(ids(), ["12", "7", "8", "9", "13"].concat(tail()))
      compare(ids()[5], "11")
      allDrawn()
      // The help line shown: the rows keep their height above it.
      panel.dispatch({ type: "key", key: "?" })
      compare(panel.ui.help, true)
      wait(50); waitForRendering(top)
      allDrawn()
      panel.dispatch({ type: "key", key: "?" })
    }
    // The Done tab sits in the same rows viewport: its last row was clipped too.
    function test_done_tab_rows_are_drawn() {
      load(Board.board([Board.INBOX, work], null, null, { "11": "work: a" }), "done")
      compare(panel.tabKey, "done")
      allDrawn()
    }
    function test_stream_tab_done_tail_is_drawn() {
      load(Board.board([Board.INBOX, work], "work: a"), "s1")
      compare(panel.stripShown, true)
      compare(panel.tabKey, "work: a")
      compare(ids(), ["12", "7", "8", "9", "13"].concat(tail()))
      allDrawn()
    }
    function test_horizon_section_done_tail_is_drawn() {
      load(Board.board([Board.INBOX, work], "work: a", { "11": "mid", "13": "mid", "9": "yearly" }), "s1")
      compare(panel.displayRows.map(function(r) { return r.kind === "section" ? r.horizon : r.item.id }).join(" "), "12 7 8 " + (tail().indexOf("10") !== -1 ? "10 " : "") + "mid 13 11 yearly 9")
      allDrawn()
      load(Board.board([Board.INBOX, work], "work: a", { "11": "mid", "13": "mid" }), "s1")
      compare(ids().slice(-2), ["13", "11"])
      allDrawn()
    }
    function test_overview_groups_done_tail_is_drawn() {
      load(Board.board([Board.INBOX, work], null, null, { "9": "work: a", "11": "work: a", "13": "work: a" }))
      compare(panel.tabKey, "overview")
      compare(panel.displayRows.map(function(r) { return r.kind === "header" ? r.stream : r.item.id }).join(" "), "inbox 12 7 8 " + (tail().indexOf("10") !== -1 ? "10 " : "") + "work: a 9 13 11")
      allDrawn()
      load(Board.board([Board.INBOX, work], null, null, { "7": "work: a", "8": "work: a" }))
      compare(ids().indexOf("11") < ids().indexOf("7"), true)
      allDrawn()
    }
    // A-D7: no streams, no tail; a row ticked this session stays, done, and
    // is gone on the next open.
    function degraded(name) {
      compare(ids(), ["12", "7", "8", "9", "13"], name + " shows no done row on open")
      allDrawn()
      compare(panel.perform({ type: "setStatus", id: "13", status: "done" }), "ok")
      wait(50); waitForRendering(top)
      compare(ids(), ["12", "7", "8", "9", "13"], name + " keeps the ticked row")
      compare(rowOf("13").itemData.status, "done")
      allDrawn()
      panel.close(); panel.open(); wait(50)
      compare(ids(), ["12", "7", "8", "9"], name + " hides it on the next open")
    }
    function test_older_todocli_and_json_hide_done_rows_on_open() {
      load(Board.board(null, null, null, null, true))
      compare(panel.metadata, false)
      degraded("older todocli")
      panel.settings = ({ backend: "json" })
      tryVerify(function() { return panel.backend === "json" })
      wait(50)
      panel.close()
      var items = JSON.parse(Board.board()).tasks.map(function(t) { return Model.normalize({ id: String(t.id), name: t.title, status: t.status, plan: t.plan }) })
      panel.store.applyLoaded(Store.serializeDocument({ focus: { text: "Finish the rollout", taskId: null }, todos: items }))
      panel.open(); wait(50); waitForRendering(top)
      degraded("json")
    }
  }
}
