import QtQuick
// The kit Panel (Ui/Panel.qml), headless: `opened` is a plain property in
// place of the PanelController, and the popout-switch lines are the kit's.
Item {
  property var bar: null
  property var settings: ({})
  property string moduleName: ""
  property string ipcTarget: ""
  property bool manageIpc: false
  property bool opened: false
  property bool popoutSwitching: false
  property bool popoutSwitchClosing: false
  function setting(name, fallback) { return settings[name] === undefined ? fallback : settings[name] }
  function open() { opened = true }
  function close() { opened = false }
  function closeForPopoutSwitch() {
    popoutSwitchClosing = true
    close()
    Qt.callLater(function() { popoutSwitchClosing = false })
  }
  function toggle() { opened ? close() : open() }
  function switchPanel(direction) {}
}
