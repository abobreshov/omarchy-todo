// AC-ST.92 (ADDENDUM-S11 §5.6, C2-M5): the coordination the headless probes
// run is the installed shell's. The QML seams copy two pieces of the shell:
// Ui/KeyboardPanel.qml's onOpenChanged block (the popout request, release
// and switch flags) into tests/qml/imports/KeyboardPanelBase.qml, and
// plugins/bar/Bar.qml's requestPopout and releasePopout into the fake bars.
// This test reads `$OMARCHY_PATH/shell` (default /usr/share/omarchy/shell),
// read-only, and compares each pair whitespace-normalised, so an Omarchy
// update that changes either fails here, not on the live bar.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { here } from "./helpers.mjs";

const shell = path.join(process.env.OMARCHY_PATH || "/usr/share/omarchy", "shell");
const read = (file) => fs.readFileSync(file, "utf8");
const squash = (text) => text.replace(/\s+/g, " ").trim();

// The one block that starts at `head` (a regular expression), through its
// matching closing brace: {text, from, to} with 1-based lines.
function block(source, head, name) {
  const found = [...source.matchAll(new RegExp(head.source, "gm"))];
  assert.equal(found.length, 1, name + ": exactly one " + head.source);
  const start = found[0].index, open = source.indexOf("{", start);
  let depth = 0, end = open;
  for (; end < source.length; end++) {
    if (source[end] === "{") depth++;
    if (source[end] === "}" && --depth === 0) break;
  }
  assert.equal(depth, 0, name + ": the block closes");
  const line = (i) => source.slice(0, i).split("\n").length;
  return { text: source.slice(start, end + 1), from: line(start), to: line(end) };
}

const pairs = [
  ["Ui/KeyboardPanel.qml", /^[ \t]*onOpenChanged:\s*\{/, "qml/imports/KeyboardPanelBase.qml"],
  ["plugins/bar/Bar.qml", /^[ \t]*function requestPopout\(owner\)\s*\{/, "qml/FakeBar.qml"],
  ["plugins/bar/Bar.qml", /^[ \t]*function releasePopout\(owner\)\s*\{/, "qml/FakeBar.qml"]
];

test("AC-ST.92: the seams' copied coordination is the installed shell's, whitespace-normalised", () => {
  assert.ok(fs.existsSync(shell), "the installed shell at " + shell);
  for (const [shellFile, head, copy] of pairs) {
    const installed = block(read(path.join(shell, shellFile)), head, shellFile);
    const copied = block(read(path.join(here, copy)), head, copy);
    assert.equal(squash(copied.text), squash(installed.text),
      `${copy} no longer matches ${shellFile} L${installed.from}–${installed.to}: re-copy the block and re-run the QML suite`);
  }
});

test("the block reader finds one block, through its matching brace, and refuses an unclosed one", () => {
  const src = "a {\n}\n  onOpenChanged: {\n    if (x) { y() }\n  }\nz";
  assert.deepEqual(block(src, /^[ \t]*onOpenChanged:\s*\{/, "src"), { text: "  onOpenChanged: {\n    if (x) { y() }\n  }", from: 3, to: 5 });
  assert.throws(() => block("onOpenChanged: {\nonOpenChanged: {}", /^[ \t]*onOpenChanged:\s*\{/, "two"), /exactly one/);
  assert.throws(() => block("onOpenChanged: {\n  {", /^[ \t]*onOpenChanged:\s*\{/, "open"), /the block closes/);
  assert.equal(squash("  a \n\t b  "), "a b");
});
