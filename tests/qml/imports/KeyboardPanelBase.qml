import QtQuick
// The kit KeyboardPanel (Ui/KeyboardPanel.qml) without its window: the
// geometry helpers, close(), and the popout coordination block copied as
// the shell has it, with the members it names. tests/coordination-pin.test.mjs
// pins the copy to the installed shell's source.
Item {
  id: root
  property var anchorItem: null
  property var owner: null
  property var bar: null
  property bool open: false
  property bool centerOnBar: false
  property var focusTarget: null
  property real contentWidth: 340
  property real contentHeight: 520
  property bool popoutSwitching: false
  property bool popoutSwitchClosing: false
  property bool focusPrimed: false
  readonly property var coordinatorKey: owner || root
  width: contentWidth
  height: contentHeight
  function fittedContentWidth(value) { return value }
  function fittedContentHeight(value, cap) { return Math.min(value,cap) }
  function close() {
    if (owner && "close" in owner) owner.close()
    else root.open = false
  }
  function beginFocusPrime() { if (open) focusPrimeTimer.restart() }

  onOpenChanged: {
    if (open) {
      focusPrimed = false
      beginFocusPrime()
      if (focusTarget) Qt.callLater(function() {
        if (root.open && root.focusTarget) root.focusTarget.forceActiveFocus()
      })
    } else {
      focusPrimeTimer.stop()
      focusPrimed = false
    }
    if (!bar) return
    if (open) {
      popoutSwitchClosing = false
      popoutSwitching = bar.activePopout && bar.activePopout !== coordinatorKey
      bar.requestPopout(coordinatorKey)
      if (popoutSwitching) popoutSwitchTimer.restart()
    } else {
      popoutSwitchClosing = !!(owner && owner.popoutSwitchClosing)
      popoutSwitching = false
      if (bar.activePopout === coordinatorKey) bar.releasePopout(coordinatorKey)
      if (popoutSwitchClosing) closeSwitchTimer.restart()
    }
  }

  Timer { id: focusPrimeTimer; interval: 75; onTriggered: if (root.open) root.focusPrimed = true }
  Timer { id: popoutSwitchTimer; interval: 150; onTriggered: root.popoutSwitching = false }
  Timer { id: closeSwitchTimer; interval: 1; onTriggered: root.popoutSwitchClosing = false }
}
