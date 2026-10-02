import QtQuick

// The bar as a third-party widget sees it (the PluginBarApi facade's
// surface), with Bar.qml's single-popout coordinator copied as the shell has
// it: tests/coordination-pin.test.mjs pins requestPopout and releasePopout to
// plugins/bar/Bar.qml. switchPanelFrom records each call and opens `next`.
QtObject {
  property color foreground: "#ffffff"
  property color barForeground: "#ffffff"
  property color background: "#000000"
  property color urgent: "#a55555"
  property string fontFamily: "JetBrainsMono Nerd Font"
  property string position: "top"
  property bool vertical: false
  property int barSize: vertical ? 28 : 26
  property bool transparent: false
  property bool foregroundAnimationEnabled: false
  property var activePopout: null
  property var clickTargets: []
  property var switches: []
  property var next: null
  function showTooltip(target, text) {}
  function hideTooltip(target) {}
  function registerClickTarget(target) {}
  function unregisterClickTarget(target) {}
  function targetBelongsToWindow() { return true }
  function moduleWidgets(id) { return [] }

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

  function switchPanelFrom(owner, direction) {
    switches = switches.concat([{ owner: owner, direction: direction }])
    if (next) next.open()
    return next !== null
  }
}
