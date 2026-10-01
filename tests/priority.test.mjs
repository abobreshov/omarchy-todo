import { test } from "node:test";
import assert from "node:assert/strict";
import { lib } from "./helpers.mjs";

const Priority = lib("Priority.js");

test("document priorities accept only integers 0–100, including zero (UI-30)", () => {
  for (const v of [0, 25, 37, 50, 75, 100]) assert.equal(Priority.normalize(v), v);
  for (const v of [null, undefined, "0", 101, -1, 7.5, true, NaN, Infinity, -Infinity, {}, []]) {
    assert.equal(Priority.normalize(v), null, String(v));
  }
});

test("document sizes are already uppercase; input parsing is a separate domain", () => {
  for (const v of ["XS", "S", "M", "L", "XL"]) assert.equal(Priority.normalizeSize(v), v);
  for (const v of ["xl", "XXL", "", null, undefined, 1, true, {}]) assert.equal(Priority.normalizeSize(v), null);
});

test("vocabulary equals CONTRACT-S9 §1", () => {
  assert.deepEqual(Priority.LEVELS, { low: 25, medium: 50, high: 75, critical: 100 });
  assert.deepEqual(Priority.SIZES, ["XS", "S", "M", "L", "XL"]);
  assert.deepEqual(Priority.HORIZONS, ["short", "mid", "yearly", "long"]);
});


test("Q-S24 bands, glyphs, zero and unset share one derivation", () => {
  for (const [v, level] of [[0,"low"],[37,"low"],[38,"medium"],[62,"medium"],[63,"high"],[87,"high"],[88,"critical"],[100,"critical"]]) {
    assert.equal(Priority.levelOf(v), level);
    assert.notEqual(Priority.markOf(v), "");
  }
  for (const v of [null,undefined,"0",101]) {
    assert.equal(Priority.levelOf(v), ""); assert.equal(Priority.markOf(v), "");
  }
});


test('metadata copy is shared by tooltips, fields and result messages', () => {
  for (const [value,text] of [[null,'priority: (none)'],[0,'priority: low (0)'],[80,'priority: high (80)']])
    assert.equal(Priority.priorityText(value),text);
  for (const [value,text] of [[null,'size: (none)'],['XS','size: XS'],['XL','size: XL']])
    assert.equal(Priority.sizeText(value),text);
});
