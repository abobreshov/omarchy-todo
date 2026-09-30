.pragma library
.import "Model.js" as Model

// Argv builders. Every external command the panel runs is a plain argv list
// for a Quickshell `Process` (never a shell string, never `bar.run()` or
// `Util.execDetached`), so user text is always exactly one argument
// (PLAN §6.4, A34, A43; UX §4.7 item 5).

function toList(value) {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value.map(function(v) { return String(v) })
  return [String(value)]
}

// [<cliPath>, "--source", "omarchy", "--json", <args…>, "--", <free text…>]
// Global flags come first, so `--json` can never land in a title; `--` is
// emitted only when free text follows it. The binary is argv[0] itself, no
// wrapper: a path is never misread, and ArgvProcess reports a binary it
// cannot spawn (E4).
function todocli(cliPath, args, freeText) {
  var argv = [Model.str(cliPath) || Model.DEFAULTS.cliPath, "--source", "omarchy", "--json"].concat(toList(args))
  var free = toList(freeText)
  if (free.length > 0) argv = argv.concat(["--"]).concat(free)
  return argv
}

// The A34 command table, keyed by the Model.js action.
function forAction(cliPath, action) {
  if (!action || typeof action !== "object") return null
  switch (action.type) {
    case "read": return todocli(cliPath, ["board"], [])
    case "add": {
      var args = ["add"]
      if (action.stream !== undefined && action.stream !== null && String(action.stream) !== "") args.push("--stream=" + String(action.stream))
      if (action.horizon !== undefined && action.horizon !== null && String(action.horizon) !== "") args.push("--horizon=" + String(action.horizon))
      if (action.description !== undefined && action.description !== null && String(action.description) !== "") args.push("--description=" + String(action.description))
      return todocli(cliPath, args, [String(action.name)])
    }
    case "setStatus": {
      var verb = action.status === "done" ? "done" : (action.status === "doing" ? "start" : (action.status === "todo" ? "reopen" : null))
      if (!verb) return null
      return todocli(cliPath, [verb, String(action.id)], [])
    }
    case "focus":
      return String(action.id) === "clear"
        ? todocli(cliPath, ["focus", "--clear"], [])
        : todocli(cliPath, ["focus", "--task", String(action.id)], [])
    case "move": return todocli(cliPath, ["move", String(action.id), String(action.stream)], [])
    case "setPriority": return todocli(cliPath, ["priority", String(action.id), action.value === null ? "none" : String(action.value)], [])
    case "setSize": return todocli(cliPath, ["size", String(action.id), action.value === null ? "none" : String(action.value)], [])
    case "toggleStep": return todocli(cliPath, ["step", String(action.id), String(action.n)], [])
    case "remove": return todocli(cliPath, ["rm", String(action.id)], [])
    case "syncNow": return todocli(cliPath, ["sync", "all"], [])
    default: return null
  }
}

// ["omarchy-shell", <target>, <fn>, <args…>]; omarchy-shell itself puts `--`
// before the arguments, so a title that starts with a dash stays one
// argument (_verified L55).
function pomodoro(target, fn, args) {
  return ["omarchy-shell", Model.str(target) || Model.DEFAULTS.pomodoroTarget, String(fn)].concat(toList(args))
}

// The state directory is made 0700 whether or not it exists (A34; AC-2.10).
function stateDir(dir) {
  return ["install", "-d", "-m", "0700", String(dir)]
}

// The pomodoro's label rule (A53; abobreshov.pomodoro Phase.sanitizeLabel):
// controls (C0, DEL, C1) become spaces, trimmed, at most 120 characters,
// applied before the hand-off so both plugins agree on the text.
function sanitizeLabel(value) {
  if (value === undefined || value === null) return ""
  return String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/^\s+|\s+$/g, "").slice(0, 120)
}
