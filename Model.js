.pragma library

// Pure helpers for the todo list. Everything here is total: a malformed or
// missing value becomes an empty string or an empty list rather than an
// exception, so a torn or hand-edited save file can never blank the widget.
//
// Storage shape (version 1):
//   { "version": 1, "todos": [ { "id": "...", "name": "...", "description": "..." } ] }

function makeId() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

function squish(value) {
  if (value === undefined || value === null) return ""
  return String(value).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "")
}

function normalize(item) {
  if (!item || typeof item !== "object") return null
  var name = squish(item.name)
  if (name === "") return null
  var id = squish(item.id)
  if (id === "") id = makeId()
  return { id: id, name: name, description: squish(item.description) }
}

function parse(raw) {
  var out = []
  var text = raw === undefined || raw === null ? "" : String(raw)
  if (squish(text) === "") return out

  var data
  try {
    data = JSON.parse(text)
  } catch (e) {
    return out
  }

  var list = null
  if (Array.isArray(data)) list = data
  else if (data && typeof data === "object" && Array.isArray(data.todos)) list = data.todos
  if (!list) return out

  var seen = {}
  for (var i = 0; i < list.length; i++) {
    var item = normalize(list[i])
    if (!item) continue
    if (seen[item.id]) item.id = makeId()
    seen[item.id] = true
    out.push(item)
  }
  return out
}

function serialize(items) {
  var list = []
  if (items) {
    for (var i = 0; i < items.length; i++) {
      var item = normalize(items[i])
      if (item) list.push(item)
    }
  }
  return JSON.stringify({ version: 1, todos: list }, null, 2) + "\n"
}
