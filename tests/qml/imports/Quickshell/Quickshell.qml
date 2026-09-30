pragma Singleton
import QtQuick

// Stub of the Quickshell singleton for the headless qmltestrunner probe: the
// shell's Commons singletons call only env() and execDetached(). HOME is a
// directory that does not exist, so no real config is ever read, and nothing
// is ever spawned.
QtObject {
  function env(name) {
    if (name === "HOME") return "/nonexistent/omarchy-todo-probe-home"
    return ""
  }
  function execDetached(argv) {}
}
