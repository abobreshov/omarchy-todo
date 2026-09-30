import QtQuick

// Stub Process: setting running does nothing; no process is spawned.
QtObject {
  property var command: []
  property bool running: false
  property var stdout: null
  property var stderr: null
  signal exited(int exitCode, int exitStatus)
}
