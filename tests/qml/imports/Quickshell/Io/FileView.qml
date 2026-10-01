import QtQuick

// Stub FileView: never loads, never emits, so the shell's Commons keep their
// compiled-in defaults.
QtObject {
  property string path: ""
  property bool watchChanges: false
  property bool printErrors: false
  property bool blockLoading: false
  property bool atomicWrites: false
  function setText(value) {}
  signal fileChanged()
  signal loaded()
  signal loadFailed(var error)
  function text() { return "" }
  function reload() {}
}
