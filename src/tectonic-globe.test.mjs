import test from "node:test";
import assert from "node:assert/strict";

import { generateIcosphereCells } from "./tectonic-globe-core.mjs";

test("generates four triangular neighbors for each spherical cell", () => {
  const cells = generateIcosphereCells("test-world", 2);

  assert.equal(cells.length, 320);
  for (const cell of cells) {
    assert.equal(cell.neighbors.length, 3);
    const centerLength = Math.hypot(cell.center.x, cell.center.y, cell.center.z);
    assert.ok(Math.abs(centerLength - 1) < 1e-12);
    for (const neighborIndex of cell.neighbors) {
      assert.ok(cells[neighborIndex].neighbors.includes(cell.index));
    }
  }
});

test("produces identical cell positions for the same seed", () => {
  assert.deepEqual(
    generateIcosphereCells("stable-seed", 1),
    generateIcosphereCells("stable-seed", 1)
  );
});

test("keeps cell vertices on the unit sphere with outward-facing triangles", () => {
  const cells = generateIcosphereCells("surface-check", 1);
  for (const cell of cells) {
    const [a, b, c] = cell.vertices;
    for (const vertex of cell.vertices) {
      assert.ok(Math.abs(Math.hypot(vertex.x, vertex.y, vertex.z) - 1) < 1e-12);
    }

    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const faceNormal = {
      x: ab.y * ac.z - ab.z * ac.y,
      y: ab.z * ac.x - ab.x * ac.z,
      z: ab.x * ac.y - ab.y * ac.x
    };
    assert.ok(faceNormal.x * cell.center.x
      + faceNormal.y * cell.center.y
      + faceNormal.z * cell.center.z > 0);
  }
});

test("changes the spherical cell orientation when the seed changes", () => {
  assert.notDeepEqual(
    generateIcosphereCells("world-a", 1),
    generateIcosphereCells("world-b", 1)
  );
});

test("rejects subdivision levels outside the supported range", () => {
  assert.throws(() => generateIcosphereCells("world", -1), RangeError);
  assert.throws(() => generateIcosphereCells("world", 8), RangeError);
});
