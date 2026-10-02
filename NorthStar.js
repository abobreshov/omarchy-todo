.pragma library
.import "Model.js" as Model
.import "Errors.js" as Errors

// The North Star (ADDENDUM-S11 §4.7, §5; CONTRACT-S9 r10 §10.1): the board
// key, the glyph, every panel string, and the pure decisions the bar's star,
// its popup, `dump` and the todo panel's `?` line bind to. Pure and total,
// as Model.js: a document value never throws. The panel only reads it.
//
// `s`, the state every decision takes: {backend, loaded, hasNorthStar,
// northStar, error}, the store's fields as the last applied read left them.

var BOARD_KEY = "northStar"
var GLYPH = String.fromCodePoint(0xF0AE2) // md-star_four_points (ND-18)
var TOOLTIP_WIDTH = 60

// Every panel string of §4.7.3, once.
var NAME = "North Star"
var TIP_OPEN = "North Star · click to open"
var TIP_UNSET = "North Star · not set\nSet it with todocli northstar set, or ask Claude."
var NO_DESCRIPTION = "No description yet."
var EDIT_HINT = "Edit with todocli northstar set … or ask Claude."
var HISTORY_HINT = "Earlier versions: todocli northstar history"
var UNSET_BODY = "No North Star yet."
var UNSET_CAPTION = "Set it with todocli northstar set --title '…' --description '…', or ask Claude to set it."
var E40 = "North Star needs backend = cli."
var E41 = "North Star needs a newer todocli."
var LOADING = "Loading…"
var ERROR_CAPTION = "The todo list shows what went wrong."
var STALE_SUFFIX = " · showing the last good read"
var HELP_ITEM = " · * north star"
var POPUP_HELP = "j k scroll · * todo list · r reload · Esc close · Tab next panel"

// ---------------------------------------------------------------- normalize

// The crate's classes (todocli/src/domain/text.rs L10–24, domain/north_star.rs
// normalise_description): Rust's `char::is_whitespace` is Unicode White_Space,
// and squish adds every Cc control. Never JS `\s`, which holds U+FEFF too
// (challenger C1-L4), so normalize is the identity on what the crate wrote.
var WHITE_SPACE = "\\t\\n\\u000b\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000"
var SQUISH_RUN = new RegExp("[" + WHITE_SPACE + "\\u0000-\\u001f\\u007f-\\u009f]+", "g")
var WHITE_SPACE_CHAR = new RegExp("[" + WHITE_SPACE + "]")

function squishTitle(s) { return s.replace(SQUISH_RUN, " ").replace(/^ | $/g, "") }

// CRLF and a lone CR become LF, then the trailing White_Space goes.
function normalDescription(s) {
  var text = s.replace(/\r\n?/g, "\n")
  var n = text.length
  while (n > 0 && WHITE_SPACE_CHAR.test(text.charAt(n - 1))) n--
  return text.slice(0, n)
}

function textOrNull(value) { return typeof value === "string" && value !== "" ? value : null }

// The board's raw `northStar` → {title, description, updatedAt, via} | null.
function normalize(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null
  var title = typeof raw.title === "string" ? squishTitle(raw.title) : ""
  var description = typeof raw.description === "string" ? normalDescription(raw.description) : ""
  if (title === "" && description === "") return null
  return { title: title, description: description, updatedAt: textOrNull(raw.updatedAt), via: textOrNull(raw.via) }
}

// ---------------------------------------------------------------- tooltip

// A word's code points, a surrogate pair as one, each combining mark
// U+0300–U+036F held to the code point before it: {text, size, mark}.
function clusters(word) {
  var out = []
  for (var i = 0; i < word.length; i++) {
    var c = word.charCodeAt(i), unit = word.charAt(i)
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < word.length && word.charCodeAt(i + 1) >= 0xDC00 && word.charCodeAt(i + 1) <= 0xDFFF) unit += word.charAt(++i)
    var mark = c >= 0x300 && c <= 0x36F
    if (mark && out.length > 0) { out[out.length - 1].text += unit; out[out.length - 1].size += 1 }
    else out.push({ text: unit, size: 1, mark: mark })
  }
  return out
}

// Lines of at most `width` code points, broken at spaces; a longer word
// breaks between clusters, never inside a pair, never before a mark.
function wrap(title, width) {
  var lines = [], line = "", used = 0
  title.split(" ").forEach(function(word) {
    var cs = clusters(word), size = cs.reduce(function(n, c) { return n + c.size }, 0)
    if (used > 0 && (used + 1 + size <= width || cs[0].mark)) { line += " " + word; used += 1 + size; return }
    if (used > 0) { lines.push(line); line = ""; used = 0 }
    cs.forEach(function(c) {
      if (used > 0 && used + c.size > width) { lines.push(line); line = ""; used = 0 }
      line += c.text; used += c.size
    })
  })
  lines.push(line)
  return lines
}

// The set star's tooltip for a normalised North Star.
function tooltip(ns) { return ns.title === "" ? TIP_OPEN : wrap(ns.title, TOOLTIP_WIDTH).join("\n") + "\n" + TIP_OPEN }

// ---------------------------------------------------------------- states

// The star (§5.2, S0–S4): "hidden" | "unset" | "set". The store assigns
// `northStar` only when a read applies, so a failing read leaves it as is.
function barState(s) {
  if (!s || s.backend !== "cli" || !s.loaded || !s.hasNorthStar) return "hidden"
  return s.northStar ? "set" : "unset"
}

function iconTooltip(s) {
  var state = barState(s)
  return state === "set" ? tooltip(s.northStar) : (state === "unset" ? TIP_UNSET : "")
}

// The popup's body: "set" | "unset" | "json" | "older" | "loading" | "error".
function bodyState(s) {
  if (s.backend !== "cli") return "json"
  if (!s.loaded) return s.error ? "error" : "loading"
  if (!s.hasNorthStar) return "older"
  return s.northStar ? "set" : "unset"
}

// Stale, not blank (ND-38): a read had applied and the store reports an error.
function isStale(s) { return s.backend === "cli" && s.loaded === true && !!s.error }

// The `?` item's condition: cli mode and the key present, set or unset.
function available(s) { return !!s && s.backend === "cli" && s.loaded === true && s.hasNorthStar === true }

function heading(ns) { return ns && ns.title !== "" ? ns.title : NAME }

// `North Star · updated 20:40 · via cli`; `<when>` is the local note time.
function caption(ns, now) {
  var when = ns && ns.updatedAt !== null ? Model.noteTime(ns.updatedAt, now, false) : ""
  return NAME + (when !== "" ? " · updated " + when : "") + (ns && ns.via !== null ? " · via " + ns.via : "")
}

var MESSAGES = { unset: UNSET_BODY, json: E40, older: E41, loading: LOADING }

// What the popup draws (§5.3): "" hides a line.
function popupModel(s, now) {
  var state = bodyState(s), set = state === "set", ns = set ? s.northStar : null, stale = isStale(s)
  return {
    state: state, set: set, stale: stale,
    heading: heading(ns), caption: set ? caption(ns, now) : "",
    description: set ? ns.description : "", noDescription: set && ns.description === "" ? NO_DESCRIPTION : "",
    message: state === "error" ? Errors.errorShort(s.error) + "." : (MESSAGES[state] || ""),
    messageCaption: state === "unset" ? UNSET_CAPTION : (state === "error" ? ERROR_CAPTION : ""),
    editHint: set ? EDIT_HINT : "", historyHint: set || state === "unset" ? HISTORY_HINT : "",
    staleLine: stale ? Errors.errorShort(s.error) + STALE_SUFFIX : ""
  }
}

// A read keeps the popup's scroll unless the title or the description changed.
function sameText(a, b) {
  if (!a || !b) return !a && !b
  return a.title === b.title && a.description === b.description
}

// The four keys `dump` appends (§4.7.2); the description never travels.
function dumpOf(s, panelOpen, popupOpen) {
  var state = barState(s)
  return {
    panelOpen: panelOpen === true,
    northStar: state === "set" ? { title: s.northStar.title, hasDescription: s.northStar.description !== "" } : null,
    northStarIcon: { state: state, tooltip: iconTooltip(s) },
    northStarPopup: popupOpen === true ? { state: bodyState(s), stale: isStale(s) } : null
  }
}
