import QtQuick
import Quickshell.Io

// One argv Process with one result. `finished(code, spawnFailed, out, err)`
// is emitted once per run, synchronously: from `exited`, or from the
// `running` flip alone when the binary could not be spawned (Quickshell
// 0.3.1 then emits neither `started` nor `exited`; S2 probe), which the
// callers read as E4. `stopped` follows one event-loop turn later, once the
// Process may be started again. Every external command runs through this,
// as a plain argv list (PLAN §6.4, A34; never a shell string).
Process {
  id: proc

  signal finished(int code, bool spawnFailed, string out, string err)
  signal stopped()

  property bool exitSeen: true

  function run(argv) {
    exitSeen = false
    command = argv
    running = true
  }

  stdout: StdioCollector { id: outText; waitForEnd: true }
  stderr: StdioCollector { id: errText; waitForEnd: true }

  onExited: function(code) {
    exitSeen = true
    finished(code, false, outText.text, errText.text)
  }

  onRunningChanged: {
    if (running) return
    if (!exitSeen) {
      exitSeen = true
      finished(-1, true, "", "")
    }
    Qt.callLater(function() { proc.stopped() })
  }
}
