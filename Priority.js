.pragma library

// Document vocabulary (CONTRACT-S9 §1). Input parsing belongs to P3.
var LEVELS = { low: 25, medium: 50, high: 75, critical: 100 }
var SIZES = ["XS", "S", "M", "L", "XL"]
var HORIZONS = ["short", "mid", "yearly", "long"]

// A stored number only: zero is set, strings and out-of-range values aren't.
function normalize(v) {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100 ? v : null
}

function normalizeSize(v) {
  return typeof v === "string" && SIZES.indexOf(v) !== -1 ? v : null
}
