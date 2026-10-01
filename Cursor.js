.pragma library
.import "Queue.js" as Queue

function selectable(row) { return !!row && (row.kind === "item" || row.kind === "focus") && row.selectable !== false }
function nextSelectable(rows, from, dir) {
  for (var i = from + dir; i >= 0 && i < rows.length; i += dir) if (selectable(rows[i])) return i
  return selectable(rows[from]) ? from : -1
}
function firstSelectable(rows, doneTab) {
  if (doneTab) {
    for (var i = 0; i < rows.length; i++) if (rows[i].kind === "item" && selectable(rows[i])) return i
    return 0
  }
  return Math.max(0, nextSelectable(rows, -1, 1))
}
function keyOf(row) { return row.kind === "focus" ? "focus" : "item:" + row.item.id }
function anchorOf(ui, rows) { return selectable(rows[ui.cursor]) ? keyOf(rows[ui.cursor]) : "" }
function translatedKey(key, map) { return key.indexOf("item:") === 0 ? "item:" + Queue.realId(key.slice(5), map || {}) : key }
function reanchor(ui, rows, idMap) {
  var out = {}, key = translatedKey(ui.cursorKey || "", idMap)
  for (var k in ui) out[k] = ui[k]
  for (var n = 0; n < rows.length; n++) {
    if (selectable(rows[n]) && keyOf(rows[n]) === key) { out.cursor = n; out.cursorKey = key; break }
  }
  if (n === rows.length) {
    var from = Math.min(Math.max(ui.cursor, 0), rows.length - 1)
    var at = selectable(rows[from]) ? from : nextSelectable(rows, from, 1)
    if (at < 0) at = nextSelectable(rows, from, -1)
    out.cursor = at < 0 ? 0 : at
    out.cursorKey = anchorOf(out, rows)
  }
  out.selectedId = Queue.realId(ui.selectedId || "", idMap || {})
  out.armedId = Queue.realId(ui.armedId || "", idMap || {})
  if (out.armedId !== "" && !rows.some(function(r) { return r.item && r.item.id === out.armedId })) out.armedId = ""
  if (ui.moving) out.moving = { id: Queue.realId(ui.moving.id, idMap || {}), targetUid: ui.moving.targetUid }
  return out
}
function scrollTo(contentY, viewHeight, rowY, rowHeight) {
  if (rowY < contentY) return rowY
  if (rowY + rowHeight > contentY + viewHeight) return Math.max(0, rowY + rowHeight - viewHeight)
  return contentY
}
