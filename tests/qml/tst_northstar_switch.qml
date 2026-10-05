import QtQuick
import QtTest
import "../../NorthStar.js" as NorthStar
import "DoneTailBoard.js" as Board

// The real widget on the fake bar's copied coordinator (ADDENDUM-S11 §5.3,
// §5.4, §5.6): the star's click and open mark (AC-ST.73), the popup's keys
// (ST.76), `*` in the todo panel (ST.77), the flip both ways (ST.78) and
// never two popups (ST.80). Split from tst_northstar_bar.qml by
// responsibility (Rule 0): this file is the switching between the cards.
Item {
  id: top
  width: 480; height: 160
  NorthStarRig { id: rig; anchors.fill: parent }
  // The next bar panel for Tab: a third popout owner on the same bar.
  QtObject {
    id: other
    property bool opened: false
    function open() { opened = true; rig.bar.requestPopout(other) }
    function close() { opened = false; if (rig.bar.activePopout === other) rig.bar.releasePopout(other) }
  }
  property var switchClosed: []
  Connections { target: rig.widget.panel ? rig.todoBody() || null : null; function onPopoutSwitchClosingChanged() { if (target.popoutSwitchClosing) top.switchClosed.push("todo") } }
  Connections { target: rig.named(rig.widget, "northStarBody"); function onPopoutSwitchClosingChanged() { if (target.popoutSwitchClosing) top.switchClosed.push("northStar") } }
  TestCase {
    name: "NorthStarSwitch"; when: windowShown
    function init() {
      rig.widget.settings = ({ backend: "cli", cliPath: "/nonexistent/todocli" })
      tryVerify(function() { return rig.panel().backend === "cli" })
      rig.reset(); other.close(); top.switchClosed = []; wait(0)
    }
    function panel() { return rig.panel() }
    function popupOpen() { return rig.dump().northStarPopup !== null }
    function star(key) { panel().dispatch({ type: "key", key: key || "*" }) }
    // The cursor onto the first task row (row 0 is the board's focus line).
    function onTask() { panel().dispatch({ type: "move", dx: 0, dy: 1 }) }
    function quiet() { return [panel().store.queue.length, panel().store.pending, panel().store.writeProc.command, panel().message] }

    function test_a_left_click_toggles_the_popup_and_its_mark() {
      var button = rig.star().button
      button.triggerPress(Qt.LeftButton)
      compare(rig.dump().northStarPopup, { state: "set", stale: false })
      tryCompare(rig.star().openMark, "opacity", 0.9)
      button.triggerPress(Qt.LeftButton)
      compare(popupOpen(), false)
      tryCompare(rig.star().openMark, "opacity", 0)
      button.triggerPress(Qt.MiddleButton); button.triggerPress(Qt.RightButton)
      compare([popupOpen(), rig.dump().panelOpen], [false, false], "middle and right do nothing")
    }

    function test_popup_keys_do_only_what_they_name() {
      rig.widget.openNorthStar()
      var keys = rig.popupKeys(), before = quiet(), todo = JSON.stringify(panel().ui)
      "d s f p n N + m v ! z [ ] 3 R h l".split(" ").forEach(function(k) { keys.textKey(k) })
      keys.textKey("\u007f"); keys.textKey("\b"); keys.deleteRequested(); keys.activateRequested()
      keys.moveRequested(-1, 0); keys.moveRequested(1, 0)
      compare([quiet(), JSON.stringify(panel().ui), popupOpen(), rig.popup().help], [before, todo, true, false], "no store action, no pomodoro request, no transient")
      panel().store.readRequested = false
      keys.textKey("r"); compare(panel().store.readRequested, true, "r: one refresh")
      keys.textKey("?"); compare(rig.popup().model !== null && rig.popup().help, true)
      keys.tabRequested(1); keys.tabRequested(-1)
      compare(rig.bar.switches.map(function(s) { return [s.owner === rig.widget, s.direction] }), [[true, 1], [true, -1]], "Tab passes the widget")
      keys.closeRequested(); compare(popupOpen(), false, "Esc closes")
    }

    function test_star_key_switches_from_every_tab_and_when_busy() {
      for (var tab of ["overview", "I", "s1", "done"]) {
        rig.widget.open(); panel().selectTab(tab === "I" ? Board.INBOX.uid : tab); star()
        compare([rig.dump().panelOpen, popupOpen()], [false, true], tab)
        rig.widget.close()
      }
      rig.widget.open(); rig.fail(75, "database is locked"); star()
      compare([rig.dump().panelOpen, popupOpen()], [false, true], "E5: it only reads")
    }

    function test_star_key_explains_or_does_nothing() {
      rig.apply(undefined); rig.widget.open(); star()
      compare([panel().message, rig.dump().panelOpen, popupOpen()], [NorthStar.E41, true, false])
      rig.apply(rig.ns1)
      var inert = [function() { panel().openDetail("7") }, function() { panel().selectTab("s1"); onTask(); star("m") }, function() { onTask(); star("!") }, function() { rig.fail(-1, "", true) }, function() { panel().selectTab("overview"); rig.fresh() }]
      for (var i = 0; i < inert.length; i++) {
        rig.widget.close(); rig.apply(rig.ns1); rig.widget.open(); inert[i](); star()
        compare([rig.dump().panelOpen, popupOpen()], [true, false], "inert " + i)
      }
      rig.widget.close(); rig.apply(rig.ns1); rig.widget.open(); star("n"); star()
      compare([panel().ui.view, rig.dump().panelOpen, popupOpen()], ["compose", true, false], "compose types it")
      // The strip goes first: 2.1.2's TabStrip logs TypeErrors when the backend
      // switches under a shown strip (reproduced at e2b0985; not P6's).
      rig.widget.close(); rig.fresh(); rig.widget.settings = ({ backend: "json" }); tryVerify(function() { return panel().backend === "json" })
      rig.widget.open(); star()
      compare([panel().message, rig.dump().panelOpen, popupOpen()], [NorthStar.E40, true, false])
    }

    function test_the_flip_both_ways_ends_the_todo_panel_s_session_state() {
      rig.widget.open(); panel().selectTab("s1"); rig.widget.close(); rig.widget.open()
      var landing = panel().ui.cursor
      star()
      compare([rig.dump().panelOpen, popupOpen()], [false, true])
      rig.popupKeys().textKey("*")
      compare([rig.dump().panelOpen, popupOpen(), rig.dump().tab, panel().ui.cursor], [true, false, "work: tellkin", landing])
      star("n"); panel().dispatch({ type: "text", text: "Draft" })
      rig.star().button.triggerPress(Qt.LeftButton)
      rig.popupKeys().textKey("*")
      compare([panel().ui.view, panel().ui.name, panel().store.queue.length, panel().store.writeProc.command], ["list", "", 0, []], "the draft is gone, no add sent")
      onTask(); star("m"); verify(panel().ui.moving !== null)
      rig.widget.northStarIpc(); rig.popupKeys().textKey("*")
      compare([panel().ui.moving, panel().store.queue.length, panel().store.writeProc.command], [null, 0, []], "move mode ended, no move sent")
    }

    // `*` as a real key event through the kit's PanelKeyCatcher, from
    // Shift+8 and from the keypad, both ways (the MAN-NS3 keys, headless).
    function test_star_from_shift8_and_keypad_both_ways() {
      for (var mod of [Qt.ShiftModifier, Qt.KeypadModifier]) {
        rig.widget.open(); rig.todoBody().focusTarget.forceActiveFocus()
        keyPress(Qt.Key_Asterisk, mod); keyRelease(Qt.Key_Asterisk, mod)
        compare([rig.dump().panelOpen, popupOpen()], [false, true], "the todo panel's * " + mod)
        rig.popupKeys().forceActiveFocus()
        keyPress(Qt.Key_Asterisk, mod); keyRelease(Qt.Key_Asterisk, mod)
        compare([rig.dump().panelOpen, popupOpen()], [true, false], "the popup's * " + mod)
        rig.widget.close()
      }
    }

    // F-1 (2.2.1): Tab in the todo panel hands the bar the widget, the slot's
    // item, as the popup's Tab does; the panel item itself matches no slot.
    function test_tab_in_the_todo_panel_opens_the_next_panel() {
      rig.bar.next = other
      for (var mod of [Qt.NoModifier, Qt.ShiftModifier]) {
        rig.widget.open(); rig.todoBody().focusTarget.forceActiveFocus()
        keyPress(Qt.Key_Tab, mod); keyRelease(Qt.Key_Tab, mod)
        compare([other.opened, rig.dump().panelOpen], [true, false], "the next panel opens instead " + mod)
        other.close()
      }
      compare(rig.bar.switches.map(function(s) { return [s.owner === rig.widget, s.direction] }), [[true, 1], [true, -1]], "Tab and Shift+Tab pass the widget")
    }

    function test_never_two_popups() {
      rig.bar.next = other
      var steps = [["toggle", function() { rig.widget.togglePanel() }, rig.widget], ["northStar", function() { rig.widget.northStarIpc() }, rig.popup(), "todo"],
        ["* in the popup", function() { rig.popupKeys().textKey("*") }, rig.widget, "northStar"], ["star click", function() { rig.star().button.triggerPress(Qt.LeftButton) }, rig.popup(), "todo"],
        ["pill click", function() { rig.pill().triggerPress(Qt.LeftButton) }, rig.widget, "northStar"], ["* in the list", function() { star() }, rig.popup(), "todo"],
        ["Tab", function() { rig.popupKeys().tabRequested(1) }, other, "northStar"], ["northStar", function() { rig.widget.northStarIpc() }, rig.popup()],
        ["northStar", function() { rig.widget.northStarIpc() }, null]]
      for (var i = 0; i < steps.length; i++) {
        top.switchClosed = []
        steps[i][1]()
        verify(rig.invariant(), steps[i][0] + ": never both")
        compare(rig.bar.activePopout === steps[i][2], true, steps[i][0] + ": the bar's active popout is the card just opened")
        if (steps[i][3]) compare(top.switchClosed, [steps[i][3]], steps[i][0] + ": the outgoing card closed by the switch")
      }
      compare(other.opened, false, "the next panel closed when the popup reopened")
    }
  }
}
