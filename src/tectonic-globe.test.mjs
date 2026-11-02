import test from "node:test";
import assert from "node:assert/strict";

import {
  applyTectonicRelief,
  applyGlobalShaping,
  getSurfaceElevation,
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
    assert.equal(cell.baseElevation, cell.elevation);
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

test("classifies moving plate boundaries and applies deterministic bounded relief", () => {
  const cells = generateIcosphereCells("tectonic-mesh", 2);
  const terrain = generatePlateTerrain(cells, "tectonic-world", 0.4);
  const result = applyTectonicRelief(terrain.cells, terrain.plates, "tectonic-world");
  const repeated = applyTectonicRelief(terrain.cells, terrain.plates, "tectonic-world");
  const types = new Set(result.boundaries.map(boundary => boundary.type));
  const requiredTypes = new Set(["convergent", "divergent", "transform"]);

  assert.deepEqual(result, repeated);
  assert.ok(result.boundaries.length > 0);
  assert.deepEqual(types, requiredTypes);

  for (const boundary of result.boundaries) {
    const cellA = result.cells[boundary.cellA];
    const cellB = result.cells[boundary.cellB];
    assert.equal(
      boundary.type,
      boundary.motionRate > 0.08
        ? "divergent"
        : boundary.motionRate < -0.08
          ? "convergent"
          : "transform"
    );
    assert.notEqual(cellA.plateId, cellB.plateId);
    assert.ok(cellA.boundaries.some(edge =>
      edge.neighborId === cellB.index && edge.type === boundary.type));
    assert.ok(cellB.boundaries.some(edge =>
      edge.neighborId === cellA.index && edge.type === boundary.type));
    assert.ok(Math.abs(boundary.reliefA) <= 0.1);
    assert.ok(Math.abs(boundary.reliefB) <= 0.1);
  }

  for (const cell of result.cells) {
    assert.ok(Math.abs(cell.tectonicRelief) <= 0.18);
    assert.equal(cell.elevation, cell.baseElevation + cell.tectonicRelief);
  }

  const convergent = result.boundaries.filter(boundary => boundary.type === "convergent");
  const divergent = result.boundaries.filter(boundary => boundary.type === "divergent");
  const transform = result.boundaries.filter(boundary => boundary.type === "transform");
  assert.ok(convergent.some(boundary => boundary.reliefA > 0 || boundary.reliefB > 0));
  assert.ok(convergent.some(boundary => boundary.reliefA < 0 || boundary.reliefB < 0));
  assert.ok(divergent.every(boundary => boundary.reliefA < 0 && boundary.reliefB < 0));
  assert.ok(transform.every(boundary => boundary.reliefA * boundary.reliefB < 0));
});

test("produces all boundary classes across representative seeded worlds", () => {
  const requiredTypes = new Set(["convergent", "divergent", "transform"]);
  const observedTypes = new Set();
  for (const seed of ["motion-a", "motion-b", "motion-c", "motion-d"]) {
    const cells = generateIcosphereCells(seed, 2);
    const terrain = generatePlateTerrain(cells, seed, 0.4);
    const result = applyTectonicRelief(terrain.cells, terrain.plates, seed);
    result.boundaries.forEach(boundary => observedTypes.add(boundary.type));
  }
  assert.deepEqual(observedTypes, requiredTypes);
});

test("global elevation bias changes land-sea balance without altering plate data", () => {
  const cells = generateIcosphereCells("global-world", 3);
  const terrain = generatePlateTerrain(cells, "global-world", 0.4);
  const tectonic = applyTectonicRelief(terrain.cells, terrain.plates, "global-world");
  const lowBias = applyGlobalShaping(tectonic.cells, "global-world", -0.2);
  const highBias = applyGlobalShaping(tectonic.cells, "global-world", 0.2);
  const lowLand = lowBias.cells.filter(cell => cell.elevation > 0).length;
  const highLand = highBias.cells.filter(cell => cell.elevation > 0).length;

  assert.ok(highBias.cells.reduce((sum, cell) => sum + cell.elevation, 0)
    > lowBias.cells.reduce((sum, cell) => sum + cell.elevation, 0));
  assert.ok(highLand > lowLand);
  for (const cell of highBias.cells) {
    assert.equal(cell.plateId, tectonic.cells[cell.index].plateId);
    assert.equal(cell.tectonicRelief, tectonic.cells[cell.index].tectonicRelief);
  }
});

test("adds deterministic continental shelves and margin ridged features", () => {
  const cells = generateIcosphereCells("margin-world", 3);
  const terrain = generatePlateTerrain(cells, "margin-world", 0.4);
  const tectonic = applyTectonicRelief(terrain.cells, terrain.plates, "margin-world");
  const shaped = applyGlobalShaping(tectonic.cells, "margin-world");
  const repeated = applyGlobalShaping(tectonic.cells, "margin-world");
  const shelfCells = shaped.cells.filter(cell =>
    cell.crustType === "oceanic" && cell.shelfEffect > 0);
  const deepOcean = shaped.cells.filter(cell =>
    cell.crustType === "oceanic" && cell.shelfEffect === 0);
  const ridgedCells = shaped.cells.filter(cell => cell.ridgeEffect !== 0);

  assert.deepEqual(shaped, repeated);
  assert.ok(shelfCells.length > 0);
  assert.ok(deepOcean.length > 0);
  assert.ok(Math.min(...shelfCells.map(cell => cell.elevation))
    > Math.min(...deepOcean.map(cell => cell.elevation)));
  assert.ok(ridgedCells.some(cell => cell.ridgeEffect > 0));
  assert.ok(ridgedCells.some(cell => cell.ridgeEffect < 0));
  assert.ok(shaped.cells.every(cell => Math.abs(cell.ridgeEffect) <= 0.04));
});

test("samples macro ridges smoothly across spherical neighbors and polar cells", () => {
  const cells = generateIcosphereCells("spherical-features", 3);
  const terrain = generatePlateTerrain(cells, "spherical-features", 0.4);
  const tectonic = applyTectonicRelief(terrain.cells, terrain.plates, "spherical-features");
  const { cells: shaped } = applyGlobalShaping(tectonic.cells, "spherical-features");
  const polarCells = shaped.filter(cell => Math.abs(cell.center.y) > 0.9);

  assert.ok(polarCells.length > 0);
  assert.ok(shaped.every(cell => Number.isFinite(cell.ridgeEffect)));
  for (const cell of shaped) {
    for (const neighborIndex of cell.neighbors) {
      assert.ok(Math.abs(cell.ridgeEffect - shaped[neighborIndex].ridgeEffect) < 0.04);
    }
  }
});

test("rejects an invalid global elevation bias", () => {
  const cells = generateIcosphereCells("global-world", 1);
  const terrain = generatePlateTerrain(cells, "global-world", 0.4);
  const tectonic = applyTectonicRelief(terrain.cells, terrain.plates, "global-world");
  assert.throws(() => applyGlobalShaping(tectonic.cells, "global-world", -1), RangeError);
  assert.throws(() => applyGlobalShaping(tectonic.cells, "global-world", 1), RangeError);
});

test("global bias shifts sea level without changing rendered terrain relief", () => {
  const cells = generateIcosphereCells("bias-rendering", 3);
  const terrain = generatePlateTerrain(cells, "bias-rendering", 0.4);
  const tectonic = applyTectonicRelief(terrain.cells, terrain.plates, "bias-rendering");
  const lowBias = applyGlobalShaping(tectonic.cells, "bias-rendering", -0.26);
  const highBias = applyGlobalShaping(tectonic.cells, "bias-rendering", 0.21);

  assert.notEqual(lowBias.cells[0].elevation, highBias.cells[0].elevation);
  for (const cell of lowBias.cells) {
    assert.ok(Math.abs(
      getSurfaceElevation(cell)
        - getSurfaceElevation(highBias.cells[cell.index])
    ) < 1e-12);
  }
});
