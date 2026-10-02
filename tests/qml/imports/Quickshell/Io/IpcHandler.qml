import QtQuick

// Stub IpcHandler: registers nothing, so a probe can load the real
// BarWidget.qml and call the widget's functions directly.
QtObject {
  property bool enabled: false
  property string target: ""
}
