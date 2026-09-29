import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model
import "Argv.js" as Argv

// The hand-off to the pomodoro plugin (PLAN §6.9, A52; UX §6). `startFor`
// and `pause` run `omarchy-shell <target> <fn> …` as a plain argv Process so
// the result word and omarchy-shell's `fail()` text are observable. The
// timer display comes from the pomodoro's state file, watched through its
// directory (atomic writes replace the inode); the pomodoro is never polled
// over IPC. Readers treat `running && now > endsAt + 10 s` as idle.
QtObject {
  id: link

  property string target: "abobreshov.pomodoro"
  property bool opened: false
  property double now: Date.now()
  property var state: null
  readonly property var view: Model.pomodoroView(state, now)
  readonly property string stateDir: Quickshell.env("HOME") + "/.local/state/abobreshov.pomodoro/"

  // {ok: true, word} or {ok: false, kind: missing|old|transient, text}
  signal result(var r)

  function startFor(taskId, title) {
    if (proc.running) return
    proc.command = Argv.pomodoro(target, "startFor", [String(taskId || ""), Argv.sanitizeLabel(title)])
    proc.running = true
  }

  function pause() {
    if (proc.running) return
    proc.command = Argv.pomodoro(target, "pause", [])
    proc.running = true
  }

  function tick() { now = Date.now() }

  function rearm() {
    stateFile.reload()
    dirWatch.reload()
  }

  property bool procStarted: false

  property Process proc: Process {
    stdout: StdioCollector { id: out; waitForEnd: true }
    stderr: StdioCollector { id: err; waitForEnd: true }
    onStarted: link.procStarted = true
    onExited: function(exitCode) {
      var r = Model.classifyShell(exitCode, out.text, err.text, false)
      link.result(r)
      if (r.ok) link.rearm()
    }
    onRunningChanged: {
      if (running) return
      if (!link.procStarted) link.result(Model.classifyShell(-1, "", "", true))
      link.procStarted = false
    }
  }

  property FileView stateFile: FileView {
    path: link.stateDir + "state.json"
    watchChanges: false
    printErrors: false
    onLoaded: link.state = Model.parsePomodoroState(text())
    onLoadFailed: link.state = null
  }

  property FileView dirWatch: FileView {
    path: link.stateDir
    watchChanges: true
    printErrors: false
    onFileChanged: link.reloadTimer.restart()
  }

  property Timer reloadTimer: Timer {
    interval: 150
    repeat: false
    onTriggered: link.stateFile.reload()
  }

  onOpenedChanged: if (opened) rearm()
}
