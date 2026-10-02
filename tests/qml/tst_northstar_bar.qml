import QtQuick
import QtTest
import qs.Commons
import qs.Ui
import "../../NorthStar.js" as NorthStar

// The real widget on a fake bar (ADDENDUM-S11 §5.2, §5.7, §5.8, §4.7):
// the star's state and slot (AC-ST.70, 71), the drawn star and the pill's
// ink beside 2.1.2's pill (ST.91), IPC northStar() (ST.79), live updates
// (ST.84), stale, not blank (ST.85) and dump (ST.88). Reads go through
// CliStore.finishRead (NorthStarRig.qml).
Item {
  id: top
  width: 480; height: 160
  NorthStarRig { id: rig; anchors.fill: parent }
  // 2.1.2's pill for the same document: e2b0985's WidgetButton, verbatim.
  WidgetButton {
    id: ref212
    y: 100
    bar: rig.bar
    text: rig.widget.pill.glyph + (rig.widget.pill.label !== "" ? " " + rig.widget.pill.label : "")
    fontSize: Style.bar.iconFont
    fixedWidth: !rig.widget.vertical && rig.widget.pill.label === "" ? Style.bar.iconSlot : -1
    fixedHeight: rig.widget.vertical ? Style.bar.iconSlot : -1
    active: rig.widget.pill.urgent
    dimmed: rig.widget.pill.dimmed
    tooltipText: rig.widget.pill.tooltip
  }
  TestCase {
    name: "NorthStarBar"; when: windowShown
    readonly property string e74: "database error: the North Star row is not a North Star (the title is not UTF-8); todocli northstar clear removes it"
    function init() {
      rig.widget.settings = ({ backend: "cli", cliPath: "/nonexistent/todocli" })
      tryVerify(function() { return rig.panel().backend === "cli" })
      rig.reset(); wait(0)
    }
    // The Grid lays out at polish: let a frame pass before reading geometry.
    function settle() { waitForRendering(top, 200) }
    function icon() { return rig.dump().northStarIcon.state }
    function popupState() { var p = rig.dump().northStarPopup; return p ? p.state + (p.stale ? "+stale" : "") : null }

    function test_the_star_state_per_read() {
      compare(icon(), "set")
      for (var bad of [null, 42, "text", [], { title: "", description: "" }]) { rig.apply(bad); compare(icon(), "unset", JSON.stringify(bad)) }
      rig.apply(undefined); compare(icon(), "hidden", "the older-todocli board")
      rig.apply(rig.ns1); rig.fail(1, e74); compare(icon(), "set", "NS1 then E7")
      rig.fresh(); compare(icon(), "hidden", "no read yet")
      rig.widget.settings = ({ backend: "json" }); tryVerify(function() { return rig.panel().backend === "json" })
      compare(icon(), "hidden")
      compare(rig.dump().northStarIcon.tooltip, "")
    }

    function test_the_widget_grows_only_when_the_star_comes_or_goes() {
      var pill = rig.pill(), star = rig.star(), slot = Style.bar.iconSlot
      rig.apply(undefined); settle()
      compare([rig.widget.implicitWidth, pill.x, star.visible], [pill.implicitWidth, 0, false], "hidden: the pill alone")
      compare(rig.widget.implicitWidth, ref212.implicitWidth, "2.1.2's size for the same document")
      rig.apply(rig.ns1); settle()
      var shown = rig.widget.implicitWidth
      compare([shown, star.x, star.width], [pill.implicitWidth + slot, pill.implicitWidth, slot], "adding the key: one slot")
      for (var raw of [null, rig.ns1, null]) { rig.apply(raw); settle(); compare([rig.widget.implicitWidth, pill.x], [shown, 0], "set and clear") }
      // An error changes the pill's own label (2.1.2's E5 pill), never the star's slot.
      rig.fail(75, "database is locked"); settle(); compare([rig.widget.implicitWidth, star.visible], [pill.implicitWidth + slot, true], "an error")
      rig.widget.openNorthStar(); settle(); compare(rig.widget.implicitWidth, pill.implicitWidth + slot, "the popup open")
      rig.widget.close()
      rig.bar.vertical = true; settle()
      compare([star.x, star.y, star.height, rig.widget.implicitHeight], [0, pill.height, slot, pill.implicitHeight + slot], "below the pill, one slot high")
    }

    // The ink of a window rect in a grab: {n, top}, top the pixel furthest
    // from the backdrop; `cols` collects the inked x offsets.
    function inkOf(img, item, cols) { var p = item.mapToItem(top, 0, 0); return inkAt(img, p.x, p.y, item.width, item.height, cols) }
    function inkAt(img, x0, y0, w, h, cols) {
      var out = { n: 0, top: null, d: -1 }, bg = rig.bar.background
      for (var x = Math.floor(x0); x < x0 + w; x++) for (var y = Math.floor(y0); y < y0 + h; y++) {
        var c = img.pixel(x, y)
        if (Qt.colorEqual(c, bg)) continue
        out.n++
        if (cols && cols.indexOf(x - Math.floor(x0)) === -1) cols.push(x - Math.floor(x0))
        var d = Math.abs(c.r - bg.r) + Math.abs(c.g - bg.g) + Math.abs(c.b - bg.b)
        if (d > out.d) { out.d = d; out.top = c }
      }
      return out
    }
    function near(c, want) { return Math.abs(c.r - want.r) <= 0.02 && Math.abs(c.g - want.g) <= 0.02 && Math.abs(c.b - want.b) <= 0.02 }
    function test_the_drawn_star_and_the_unchanged_pill() {
      var star = rig.star(), pill = rig.pill(), fg = rig.bar.barForeground, bg = rig.bar.background
      tryCompare(star.button, "opacity", 1); wait(200)
      var img = grabImage(top), set = inkOf(img, star), cols = [], ref = []
      inkOf(img, pill, cols); inkOf(img, ref212, ref)
      verify(set.n > 0 && near(set.top, Color.accent), "set: Color.accent, " + set.top)
      compare(cols.sort(function(a, b) { return a - b }), ref.sort(function(a, b) { return a - b }), "the pill's ink columns are 2.1.2's")
      rig.apply(null)
      tryCompare(star.button, "opacity", 0.45); wait(200)
      var unset = inkOf(grabImage(top), star), dimmed = Qt.rgba(fg.r * 0.45 + bg.r * 0.55, fg.g * 0.45 + bg.g * 0.55, fg.b * 0.45 + bg.b * 0.55, 1)
      verify(unset.n > 0 && near(unset.top, dimmed), "unset: the dimmed bar foreground, " + unset.top)
      console.log("PROBE star set=" + set.top + " (" + set.n + " px, accent " + Color.accent + ") unset=" + unset.top + " (" + unset.n + " px, dimmed " + dimmed + ") pill columns=" + cols.length)
      rig.apply(undefined); wait(200)
      img = grabImage(top); var after = []
      inkOf(img, pill, after)
      compare([star.visible, rig.widget.implicitWidth], [false, pill.implicitWidth], "hidden: no slot")
      compare(inkAt(img, pill.width, 0, Style.bar.iconSlot, pill.height, null).n, 0, "hidden: no ink after the pill")
      compare(after.sort(function(a, b) { return a - b }), ref.sort(function(a, b) { return a - b }), "the pill unmoved")
    }

    function test_ipc_northStar_replies_per_state() {
      compare([rig.widget.northStarIpc(), popupState()], ["ok", "set"])
      compare([rig.widget.northStarIpc(), popupState()], ["ok", null])
      rig.widget.open(); compare(rig.dump().panelOpen, true)
      compare([rig.widget.northStarIpc(), rig.dump().panelOpen, popupState()], ["ok", false, "set"])
      rig.widget.close(); rig.apply(undefined)
      compare([rig.widget.northStarIpc(), popupState()], ["North Star needs a newer todocli.", "older"])
      rig.widget.close(); rig.apply(rig.ns1); rig.fail(1, e74)
      compare([rig.widget.northStarIpc(), popupState()], ["ok", "set+stale"])
      rig.widget.close(); rig.fresh()
      compare([rig.widget.northStarIpc(), popupState()], ["unavailable", "loading"])
      rig.widget.close(); rig.fail(-1, "", true)
      compare([rig.widget.northStarIpc(), popupState()], ["unavailable: todocli not found", "error"])
      rig.widget.close(); rig.widget.settings = ({ backend: "json" }); tryVerify(function() { return rig.panel().backend === "json" })
      compare([rig.widget.northStarIpc(), popupState()], ["North Star needs backend = cli.", "json"])
      var s = rig.panel().store
      rig.widget.settings = ({ backend: "cli", cliPath: "/nonexistent/todocli" }); tryVerify(function() { return rig.panel().backend === "cli" })
      compare([rig.store().readProc.command, rig.store().writeProc.command, rig.store().syncProc.command, rig.store().queue], [rig.readArgv, [], [], []], "board reads only")
    }

    function test_live_updates_while_open() {
      rig.widget.openNorthStar()
      rig.apply(Object.assign({}, rig.ns1, { description: "Новое описание." }))
      compare([rig.popup().opened, rig.popup().model.description], [true, "Новое описание."])
      rig.apply(null)
      compare([popupState(), icon(), rig.popup().model.message], ["unset", "unset", "No North Star yet."])
      rig.apply(undefined)
      compare([popupState(), icon(), rig.popup().model.message], ["older", "hidden", "North Star needs a newer todocli."])
    }

    function test_stale_not_blank() {
      rig.fail(74, e74)
      compare([icon(), rig.widget.pill.urgent, rig.widget.northStarIpc(), popupState()], ["set", true, "ok", "set+stale"])
      compare([rig.popup().model.description, rig.popup().model.staleLine], [rig.ns1.description, "todocli error · showing the last good read"])
      rig.apply(rig.ns1)
      compare([popupState(), rig.popup().model.staleLine], ["set", ""])
    }

    function test_dump_is_today_s_plus_four_keys() {
      var states = [function() {}, function() { rig.widget.open() }, function() { rig.widget.openNorthStar() }, function() { rig.apply(undefined) }, function() { rig.fail(1, e74) }]
      for (var i = 0; i < states.length; i++) {
        states[i]()
        var d = rig.dump(), today = JSON.parse(rig.panel().dump()), keys = Object.keys(d)
        compare(keys.slice(-4), ["panelOpen", "northStar", "northStarIcon", "northStarPopup"])
        for (var k of keys.slice(-4)) delete d[k]
        compare(d, today, "with the four keys removed, today's dump")
        verify(today.view !== "northstar")
      }
      compare(rig.dump().northStar, null)
      rig.apply(rig.ns1)
      compare(rig.dump().northStar, { title: rig.ns1.title, hasDescription: true })
      compare(rig.dump().northStarIcon, { state: "set", tooltip: "Почему вы здесь?\n" + NorthStar.TIP_OPEN })
    }
  }
}
