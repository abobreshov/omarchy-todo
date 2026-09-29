.pragma library
.import "Model.js" as Model

// The cli backend's error kinds (UX §7 E4, E5, E7, E8; PLAN A34) in one
// place: the exit mapping that produces them and every piece of copy keyed
// by kind. Adding a kind is one entry in ERRORS. Pure and total, as Model.js.

// The UX §7 copy per error kind, in one table: `short` names it on the pill
// and as the error-view title, `reason` is the `unavailable: <reason>` reply
// and the classifyExit message, `body`/`hint` fill the error view (E4, E7,
// E8), `banner` makes E5 a line above the last good list instead. An
// unknown kind reads as E7.
var ERRORS = {
  missing: {
    short: "todocli not found", reason: "todocli not found",
    body: function(e, o) { return "This panel is set to backend = cli, but it can't run \"" + o.cliPath + "\". Nothing was changed." },
    hint: function(e, o) { return "Point the panel at todocli:\n  omarchy bar set " + o.moduleName + " cliPath /path/to/todocli\nor go back to the panel's own list:\n  omarchy bar set " + o.moduleName + " backend json" }
  },
  busy: {
    short: "Database busy or locked", reason: "database busy", glyph: Model.G.lock,
    banner: function(e, o) { return "Database busy or locked. " + (o.lastGoodAt ? "Showing the list from " + Model.clockLabel(o.lastGoodAt, o.utc) + ". " : "") + "r retry" }
  },
  protocol: {
    short: "Can't read todocli output", reason: "can't read todocli output",
    body: function() { return "todocli answered, but not in the format this panel expects (JSON schema v1). Update the plugin or todocli so their versions match." }
  },
  failed: {
    short: "todocli error", reason: "todocli error",
    body: function(e) {
      var head = Model.lines(e.message, 3)
      return (head.length ? head.join("\n") + "\n" : "") + "Run todocli board in a terminal to see the full error."
    }
  }
}

// Exit mapping of UX §7 / PLAN A34. A binary that cannot be spawned reaches
// here as `spawnFailed` (ArgvProcess); a wrapper script that cannot find the
// real binary exits 127, which reads the same.
function classifyExit(code, stderr, spawnFailed) {
  if (spawnFailed || code === 127) return { kind: "missing", message: ERRORS.missing.reason }
  if (code === 0) return null
  if (code === 75) return { kind: "busy", message: ERRORS.busy.reason }
  var head = Model.lines(stderr, 3)
  return { kind: "failed", message: head.length ? head.join("\n") : "todocli exited " + code }
}

function errorCopy(error) { return ERRORS[error && error.kind] || ERRORS.failed }

function errorShort(error) { return error ? errorCopy(error).short : "" }

// The reply of every mutator from a known error state (AC-17.4).
function unavailable(error) { return error ? "unavailable: " + errorCopy(error).reason : "unavailable" }

// The error view (E4, E7, E8) or the banner (E5) for `error`; null for none.
function errorView(error, opts) {
  if (!error) return null
  var o = opts || {}
  var c = errorCopy(error)
  var ctx = { cliPath: o.cliPath || Model.DEFAULTS.cliPath, moduleName: o.moduleName || Model.MODULE, lastGoodAt: o.lastGoodAt, utc: o.utc }
  return {
    glyph: c.glyph || Model.G.alert,
    title: c.banner ? null : c.short,
    body: c.body ? c.body(error, ctx) : "",
    hint: c.hint ? c.hint(error, ctx) : "",
    banner: c.banner ? c.banner(error, ctx) : null
  }
}

// The transient for a reverted write (UX §7): the error, or a raw stderr.
function msgNotSaved(errorOrStderr) {
  if (errorOrStderr && typeof errorOrStderr === "object") {
    if (errorOrStderr.kind === "busy") return "Not saved — database busy. Press r to retry."
    return "Not saved — " + (Model.firstLine(errorOrStderr.message) || "todocli error") + "."
  }
  return "Not saved — " + (Model.firstLine(errorOrStderr) || "todocli error") + "."
}
