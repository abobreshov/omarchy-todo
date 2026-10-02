.pragma library
.import "NorthStar.js" as NorthStar
.import "Errors.js" as Errors

// The North Star's input (ADDENDUM-S11 §5.4, §4.7.1): `*` in the todo
// panel, the popup's keys and IPC `northStar()`. Pure, as Keys.js: QML
// forwards the kit's signals and the store's state, and executes what these
// return.

// The popup's j / k step in unscaled pixels; the QML scales it with
// Style.space, so SCROLL_STEP = Style.space(48) on screen.
var SCROLL_STEP = 48

// `*` in the todo panel's list view, any tab, any row. `s`: {backend,
// loaded, hasNorthStar}; a capability-free context does nothing.
function keyIntent(s) {
  if (!s) return null
  if (s.backend !== "cli") return { type: "message", text: NorthStar.E40 }
  if (!s.loaded) return null
  if (!s.hasNorthStar) return { type: "message", text: NorthStar.E41 }
  return { type: "northStar" }
}

// The offset after a step of `delta` pixels, clamped to the content.
function scrollTo(contentY, delta, contentHeight, height) {
  return Math.max(0, Math.min(Math.max(0, contentHeight - height), contentY + delta))
}

// One kit signal in the popup → {type: close | flip | scroll | reload |
// help | switchPanel} or null: Enter, Space, h, l, Left, Right, the delete
// keys and every other letter do nothing. `ev`: {type: esc | tab | move |
// key | enter | space | delete, key, dx, dy, direction}; `st`: {contentY,
// contentHeight, height, step}, the Flickable and the scaled step.
function popupKey(ev, st) {
  var e = ev || {}
  if (e.type === "esc") return { type: "close" }
  if (e.type === "tab") return { type: "switchPanel", direction: e.direction < 0 ? -1 : 1 }
  if (e.type === "move" && e.dy) return { type: "scroll", contentY: scrollTo(st.contentY, e.dy > 0 ? st.step : -st.step, st.contentHeight, st.height) }
  if (e.type !== "key") return null
  if (e.key === "*") return { type: "flip" }
  if (e.key === "r") return { type: "reload" }
  if (e.key === "?") return { type: "help" }
  return null
}

// IPC `northStar()`, checked in §4.7.1's order: {action: none | close |
// open, reply}. `s`: {panelLoaded, popupOpen, backend, loaded, hasNorthStar,
// error}. The popup always opens, and its body states the reason.
function ipcIntent(s) {
  if (!s.panelLoaded) return { action: "none", reply: "unavailable" }
  if (s.popupOpen) return { action: "close", reply: "ok" }
  var reply = "ok"
  if (s.backend !== "cli") reply = NorthStar.E40
  else if (!s.loaded) reply = Errors.unavailable(s.error)
  else if (!s.hasNorthStar) reply = NorthStar.E41
  return { action: "open", reply: reply }
}
