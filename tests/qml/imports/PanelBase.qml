import QtQuick
Item {
  property var bar: null
  property var settings: ({})
  property string moduleName: ""
  property string ipcTarget: ""
  property bool manageIpc: false
  property bool opened: false
  function setting(name, fallback) { return settings[name] === undefined ? fallback : settings[name] }
  function open() { opened = true }
  function close() { opened = false }
  function switchPanel(direction) {}
}
