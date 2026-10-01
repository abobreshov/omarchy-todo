.pragma library
.import "Model.js" as Model

var TIP_DELETE = "Delete (x x or Del)"
var TIP_DELETE_ARMED = "Click or x again to delete"
var CAPTION_ARMED = "click or x again to delete"

// UX §4.2 row anatomy, the right cluster: the plan progress, then three
// fixed slots: the focus mark or its ghost, the pomodoro mark or its ghost,
// and the {del} ghost. Each slot is always laid out and a ghost only fades
// in (opacity) while the row is hovered: a control made visible under the
// pointer takes the hover from the row, which hides it again, and the icons
// flicker (the hover glitch); a hidden control that keeps its space cannot.
// The armed delete (x, Delete, BackSpace or the ghost, once) replaces the
// progress and the first two slots with its caption; the {del} slot stays,
// `held` (shown and live without hover), so the second click lands where
// the first did. A done row keeps it: done rows can be deleted too.
function rowActions(item, ctx) {
  var c = ctx || {}
  var it = item || { id: "", status: "todo" }
  var armed = c.armed === true
  var isDone = it.status === "done"
  var isFocus = Model.isFocused(c.focus, it.id)
  var attached = Model.isAttached(c.pomodoro, it.id)
  return {
    armed: armed,
    caption: armed ? CAPTION_ARMED : "",
    progress: armed ? "" : Model.planProgress(it),
    focus: { mark: !armed && isFocus, ghost: !armed && !isFocus && !isDone, held: false, tooltip: "Set focus (f)" },
    pomodoro: {
      mark: !armed && attached,
      running: attached && c.pomodoro.running === true,
      ghost: !armed && !attached && !isDone,
      held: false,
      tooltip: "Start pomodoro (p)"
    },
    del: { mark: false, ghost: true, held: armed, tooltip: armed ? TIP_DELETE_ARMED : TIP_DELETE }
  }
}
