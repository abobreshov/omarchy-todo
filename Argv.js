.pragma library

// Argv builders. Every external command the panel runs is a plain argv list
// for a Quickshell `Process` (never a shell string, never `bar.run()` or
// `Util.execDetached`), so user text is always exactly one argument
// (PLAN §6.4, A34, A43; UX §4.7 item 5).

var DEFAULT_CLI = "todocli"
var DEFAULT_POMODORO = "abobreshov.pomodoro"

function toList(value) {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value.map(function(v) { return String(v) })
  return [String(value)]
}

// [<cliPath>, "--source", "omarchy", "--json", <args…>, "--", <free text…>]
// Global flags come first, so `--json` can never land in a title; `--` is
// emitted only when free text follows it. `envPrefix` runs the binary
// behind `/usr/bin/env`: Quickshell 0.3.1 emits no `exited` for a binary it
// cannot spawn, while env exits 127 for one it cannot find (_verified L77).
function todocli(cliPath, args, freeText, opts) {
  var path = cliPath === undefined || cliPath === null || String(cliPath) === "" ? DEFAULT_CLI : String(cliPath)
  var argv = [path, "--source", "omarchy", "--json"].concat(toList(args))
  var free = toList(freeText)
  if (free.length > 0) argv = argv.concat(["--"]).concat(free)
  if (opts && opts.envPrefix) argv.unshift("/usr/bin/env")
  return argv
}

// The A34 command table, keyed by the store action.
function forAction(cliPath, action, opts) {
  if (!action || typeof action !== "object") return null
  switch (action.type) {
    case "read": return todocli(cliPath, ["board"], [], opts)
    case "add": {
      var args = ["add"]
      if (action.description !== undefined && action.description !== null && String(action.description) !== "") args.push("--description=" + String(action.description))
      return todocli(cliPath, args, [String(action.name)], opts)
    }
    case "setStatus": {
      var verb = action.status === "done" ? "done" : (action.status === "doing" ? "start" : (action.status === "todo" ? "reopen" : null))
      if (!verb) return null
      return todocli(cliPath, [verb, String(action.id)], [], opts)
    }
    case "focus":
      return String(action.id) === "clear"
        ? todocli(cliPath, ["focus", "--clear"], [], opts)
        : todocli(cliPath, ["focus", "--task", String(action.id)], [], opts)
    case "toggleStep": return todocli(cliPath, ["step", String(action.id), String(action.n)], [], opts)
    case "remove": return todocli(cliPath, ["rm", String(action.id)], [], opts)
    case "syncNow": return todocli(cliPath, ["sync", "all"], [], opts)
    default: return null
  }
}

// ["omarchy-shell", <target>, <fn>, <args…>]; omarchy-shell itself puts `--`
// before the arguments, so a title that starts with a dash stays one
// argument (_verified L55).
function pomodoro(target, fn, args) {
  var t = target === undefined || target === null || String(target) === "" ? DEFAULT_POMODORO : String(target)
  return ["omarchy-shell", t, String(fn)].concat(toList(args))
}

// The state directory is made 0700 whether or not it exists (A34; AC-2.10).
function stateDir(dir) {
  return ["install", "-d", "-m", "0700", String(dir)]
}

// The pomodoro's label rule (A53), applied before the hand-off so both
// plugins agree on the text.
function sanitizeLabel(value) {
  if (value === undefined || value === null) return ""
  return String(value).replace(/[\x00-\x1f\x7f]/g, " ").replace(/^\s+|\s+$/g, "").slice(0, 120)
}
