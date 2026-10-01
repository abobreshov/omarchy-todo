.pragma library
.import "Model.js" as Model
.import "Errors.js" as Errors
.import "View.js" as View

// The pill and sync footer (UX §3.1, §4.7): two status surfaces.
// ---------------------------------------------------------------- pill

function failingTargets(sync) {
  return (sync || []).filter(function(t) { return t && t.enabled && t.error })
}

// UX §3.1 / DECISIONS A-D6: loading -> backend error -> doing task -> focus
// text -> open count -> empty; the sync overlay on states 3-6 in cli mode;
// vertical bars carry the state in the glyph only.
function pillState(input) {
  var cli = input.backend === "cli"
  var items = input.items || []
  var focus = input.focus || { text: "", taskId: null }
  var max = input.vertical ? 0 : input.maxChars
  var out
  if (cli && !input.loaded && !input.error)
    return { glyph: Model.G.icon, label: "", tooltip: "Checklist Todo\nLoading…", urgent: false, dimmed: true }
  if (cli && input.error)
    return { glyph: Model.G.icon, label: "", tooltip: "Checklist Todo\n" + Errors.errorShort(input.error) + ". Click for details.", urgent: true, dimmed: false }
  var open = View.openCount(items)
  var doing = View.doingTask(items, focus)
  if (doing) {
    var more = items.filter(function(it) { return it && it.status === "doing" }).length - 1
    var tip = "Doing: " + Model.tooltip(doing.name) + (more > 0 ? " (+" + more + " more)" : "")
    if (cli && input.hasStreams === true && doing.stream !== null && doing.stream !== undefined && doing.stream !== "inbox") tip += "\nStream: " + doing.stream
    if (focus.text && focus.text !== doing.name) tip += "\nFocus: " + Model.tooltip(focus.text)
    tip += "\n" + Model.todosWord(open)
    out = { glyph: Model.G.doing, label: Model.pillLabel(doing.name, max), tooltip: tip, urgent: false, dimmed: false }
  } else if (focus.text) {
    out = { glyph: Model.G.focus, label: Model.pillLabel(focus.text, max), tooltip: "Focus: " + Model.tooltip(focus.text) + "\n" + Model.todosWord(open), urgent: false, dimmed: false }
  } else if (open > 0) {
    out = { glyph: Model.G.icon, label: input.vertical ? "" : String(open), tooltip: Model.todosWord(open) + "\nNo focus set", urgent: false, dimmed: false }
  } else {
    out = { glyph: Model.G.icon, label: "", tooltip: "Checklist Todo\nNothing open. Click to add one.", urgent: false, dimmed: true }
  }
  if (cli) {
    var failing = failingTargets(input.sync)
    if (failing.length === 1) {
      out.glyph = Model.G.syncAlert
      out.tooltip += "\n" + Model.targetName(failing[0].name) + " sync failed " + Model.ago(failing[0].lastAttemptAt, input.now)
    } else if (failing.length > 1) {
      out.glyph = Model.G.syncAlert
      out.tooltip += "\n" + failing.length + " syncs failed"
    }
  }
  return out
}

// ---------------------------------------------------------------- footer

// The UX §4.7 reason per sync-target error kind (Errors.syncReason: the
// `sync all` transient uses the same copy).
function reason(error) { return Errors.syncReason(error) }

function footerTooltip(sync, now) {
  var out = []
  var list = sync || []
  for (var i = 0; i < list.length; i++) {
    var t = list[i]
    if (!t) continue
    var name = Model.targetName(t.name)
    if (!t.enabled) out.push(name + ": off")
    else if (t.error) out.push(name + ": failed " + Model.ago(t.lastAttemptAt, now) + " — " + reason(t.error))
    else out.push(name + ": ok " + Model.ago(t.lastOkAt, now))
  }
  return out.join("\n")
}

// UX §4.7 footer (cli mode only). `text` excludes the glyph; dump.footer
// shows {text, urgent}.
function footer(sync, now, opts) {
  var tip = footerTooltip(sync, now)
  var enabled = (sync || []).filter(function(t) { return t && t.enabled })
  if (opts && opts.syncing) return { glyph: Model.G.sync, text: "Syncing…", urgent: false, tooltip: tip, action: null }
  if (enabled.length === 0) return { glyph: Model.G.sync, text: "todocli · local only", urgent: false, tooltip: tip, action: null }
  var failing = failingTargets(enabled)
  if (failing.length === 1)
    return { glyph: Model.G.syncAlert, text: Model.targetName(failing[0].name) + " sync failed " + Model.ago(failing[0].lastAttemptAt, now) + " · R retry", urgent: true, tooltip: tip, action: "syncNow" }
  if (failing.length > 1)
    return { glyph: Model.G.syncAlert, text: failing.length + " syncs failed · R retry", urgent: true, tooltip: tip, action: "syncNow" }
  var stalest = null
  var oldestOk = null
  var never = false
  for (var i = 0; i < enabled.length; i++) {
    var t = enabled[i]
    var attempt = Model.toMillis(t.lastAttemptAt)
    if (!isNaN(attempt) && t.intervalSec > 0 && now - attempt > 3 * t.intervalSec * 1000 && (stalest === null || attempt < stalest)) stalest = attempt
    var ok = Model.toMillis(t.lastOkAt)
    if (isNaN(ok)) never = true
    else if (oldestOk === null || ok < oldestOk) oldestOk = ok
  }
  if (stalest !== null)
    return { glyph: Model.G.syncOff, text: "Sync daemon idle since " + Model.ago(stalest, now) + " · R sync now", urgent: false, tooltip: tip, action: "syncNow" }
  if (never)
    return { glyph: Model.G.sync, text: "todocli · not synced yet · R sync now", urgent: false, tooltip: tip, action: "syncNow" }
  return { glyph: Model.G.sync, text: "todocli · synced " + Model.ago(oldestOk, now), urgent: false, tooltip: tip, action: null }
}
