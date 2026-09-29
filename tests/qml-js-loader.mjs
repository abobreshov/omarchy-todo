// Loads a QML `.pragma library` JavaScript file under Node for unit tests.
//
// The `.pragma library` line (always line 1) becomes the opening of a wrapper
// function whose parameters are the `.import "X.js" as Q` qualifiers, and
// every `.import` line is blanked, so line numbers in the coverage report
// match the source file. The script runs in this context through
// `vm.Script` with its absolute filename, so Node's
// `--experimental-test-coverage` attributes lines to it and objects it
// returns share the test's prototypes (research/_verified.md, "Node coverage
// over QML .js libraries"; PLAN A28).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

export function loadQmlJs(file, imports = {}) {
  const abs = path.resolve(file);
  const src = fs.readFileSync(abs, "utf8");
  const lines = src.split("\n");
  const names = new Set();
  const params = Object.keys(imports);
  if (!/^\.pragma\s+library/.test(lines[0])) throw new Error(abs + ": line 1 must be `.pragma library`");
  const blanked = lines.map((line, i) => {
    if (i === 0) return "(function(" + params.join(",") + "){";
    if (/^\.import\s/.test(line)) return "";
    const fn = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line);
    if (fn) names.add(fn[1]);
    const v = /^var\s+([A-Za-z_$][\w$]*)\s*=/.exec(line);
    if (v) names.add(v[1]);
    return line;
  });
  const tail = "\n;return {" + [...names].join(",") + "}})";
  const script = new vm.Script(blanked.join("\n") + tail, { filename: abs });
  const factory = script.runInThisContext();
  return factory(...params.map((p) => imports[p]));
}
