import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model
import "Argv.js" as Argv

// The hand-off to the pomodoro plugin (PLAN §6.9, A52; UX §6). `startFor`
// and `pause` run `omarchy-shell <target> <fn> …` as a plain argv Process so
// the result word and omarchy-shell's `fail()` text are observable; a call
// made while one runs waits for it (the last one wins), and `result` names
// the task each call was for. The timer display comes from the pomodoro's
// state file, watched through its directory (atomic writes replace the
// inode); the pomodoro is never polled over IPC. Readers treat
// `running && now > endsAt + 10 s` as idle.
QtObject {
  id: link

  property string target: "abobreshov.pomodoro"
  property bool opened: false
  property double now: Date.now()
  property var state: null
  readonly property var view: Model.pomodoroView(state, now)
  readonly property string stateDir: Quickshell.env("HOME") + "/.local/state/abobreshov.pomodoro/"

  // {ok: true, word} or {ok: false, kind: missing|old|transient, text},
  // with the item the call was for (null for a label-only start or a pause).
  signal result(var r, var item)

  property var request: null   // the call in flight: {argv, item}
  property var next: null      // the call asked for meanwhile

  // `item` starts on that task; a null item starts a label-only pomodoro.
  function startFor(item, label) {
    call("startFor", [item ? item.id : "", Argv.sanitizeLabel(item ? item.name : label)], item)
  }

  function pause() { call("pause", [], null) }

  function call(fn, args, item) {
    var job = { argv: Argv.pomodoro(target, fn, args), item: item || null }
    if (proc.running) { next = job; return }
    request = job
    proc.run(job.argv)
  }

  function tick() { now = Date.now() }

  function rearm() {
    stateFile.reload()
    dirWatch.reload()
  }

  property ArgvProcess proc: ArgvProcess {
    onFinished: function(code, spawnFailed, out, err) {
      var r = Model.classifyShell(code, out, err, spawnFailed)
      link.result(r, link.request ? link.request.item : null)
      if (r.ok) link.rearm()
    }
    onStopped: {
      var job = link.next
      link.next = null
      link.request = job
      if (job) link.proc.run(job.argv)
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
