import test from "node:test";
import assert from "node:assert/strict";

import {
  generateIcosphereCells,
  generatePlateTerrain
} from "./tectonic-globe-core.mjs";

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

test("assigns deterministic spherical plates and distinct crust elevations", () => {
  const cells = generateIcosphereCells("plate-world", 2);
  const result = generatePlateTerrain(cells, "plate-world", 0.4);
  const repeated = generatePlateTerrain(cells, "plate-world", 0.4);
  const continental = result.cells.filter(cell => cell.crustType === "continental");
  const oceanic = result.cells.filter(cell => cell.crustType === "oceanic");

  assert.deepEqual(result, repeated);
  assert.ok(result.plates.length >= 2);
  assert.ok(continental.length > 0);
  assert.ok(oceanic.length > 0);
  assert.ok(Math.min(...continental.map(cell => cell.elevation))
    > Math.max(...oceanic.map(cell => cell.elevation)));

  for (const cell of result.cells) {
    const plate = result.plates[cell.plateId];
    assert.equal(cell.crustType, plate.crustType);
    const nearestPlate = result.plates.reduce((nearest, candidate) => {
      const distance = cell.center.x * candidate.center.x
        + cell.center.y * candidate.center.y
        + cell.center.z * candidate.center.z;
      return distance > nearest.distance ? { plate: candidate, distance } : nearest;
    }, { plate: null, distance: -Infinity });
    assert.equal(cell.plateId, nearestPlate.plate.id);
  }

  assert.ok(result.cells.some(cell => cell.neighbors.some(neighborIndex =>
    result.cells[neighborIndex].plateId !== cell.plateId)));
});

test("rejects an invalid continental plate proportion", () => {
  const cells = generateIcosphereCells("plate-world", 0);
  assert.throws(() => generatePlateTerrain(cells, "plate-world", -0.1), RangeError);
  assert.throws(() => generatePlateTerrain(cells, "plate-world", 1.1), RangeError);
});

test("changes plate terrain with a different seed and supports proportion endpoints", () => {
  const cells = generateIcosphereCells("fixed-mesh", 2);
  const firstWorld = generatePlateTerrain(cells, "first-world", 0.4);
  const secondWorld = generatePlateTerrain(cells, "second-world", 0.4);
  assert.notDeepEqual(firstWorld, secondWorld);

  const allOceanic = generatePlateTerrain(cells, "fixed-mesh", 0);
  const allContinental = generatePlateTerrain(cells, "fixed-mesh", 1);
  assert.ok(allOceanic.plates.every(plate => plate.crustType === "oceanic"));
  assert.ok(allContinental.plates.every(plate => plate.crustType === "continental"));
});
