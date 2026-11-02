const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
const MAX_SUBDIVISIONS = 5;
const MAX_PLATES = 18;

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function hashSeed(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed) {
  let state = hashSeed(seed);
  return () => {
    let value = state += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function rotate(vector, angles) {
  const [xAngle, yAngle, zAngle] = angles;
  const cosX = Math.cos(xAngle), sinX = Math.sin(xAngle);
  const cosY = Math.cos(yAngle), sinY = Math.sin(yAngle);
  const cosZ = Math.cos(zAngle), sinZ = Math.sin(zAngle);

  const x1 = vector.x;
  const y1 = vector.y * cosX - vector.z * sinX;
  const z1 = vector.y * sinX + vector.z * cosX;
  const x2 = x1 * cosY + z1 * sinY;
  const y2 = y1;
  const z2 = -x1 * sinY + z1 * cosY;

  return {
    x: x2 * cosZ - y2 * sinZ,
    y: x2 * sinZ + y2 * cosZ,
    z: z2
  };
}

function createIcosahedron() {
  const vertices = [
    { x: -1, y: GOLDEN_RATIO, z: 0 },
    { x: 1, y: GOLDEN_RATIO, z: 0 },
    { x: -1, y: -GOLDEN_RATIO, z: 0 },
    { x: 1, y: -GOLDEN_RATIO, z: 0 },
    { x: 0, y: -1, z: GOLDEN_RATIO },
    { x: 0, y: 1, z: GOLDEN_RATIO },
    { x: 0, y: -1, z: -GOLDEN_RATIO },
    { x: 0, y: 1, z: -GOLDEN_RATIO },
    { x: GOLDEN_RATIO, y: 0, z: -1 },
    { x: GOLDEN_RATIO, y: 0, z: 1 },
    { x: -GOLDEN_RATIO, y: 0, z: -1 },
    { x: -GOLDEN_RATIO, y: 0, z: 1 }
  ].map(normalize);
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];

  for (const face of faces) {
    const [a, b, c] = face.map(index => vertices[index]);
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const normal = {
      x: ab.y * ac.z - ab.z * ac.y,
      y: ab.z * ac.x - ab.x * ac.z,
      z: ab.x * ac.y - ab.y * ac.x
    };
    if (normal.x * (a.x + b.x + c.x)
      + normal.y * (a.y + b.y + c.y)
      + normal.z * (a.z + b.z + c.z) < 0) {
      [face[1], face[2]] = [face[2], face[1]];
    }
  }
  return { vertices, faces };
}

function midpointIndex(a, b, vertices, midpoints) {
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  if (midpoints.has(key)) return midpoints.get(key);

  const midpoint = normalize({
    x: (vertices[a].x + vertices[b].x) / 2,
    y: (vertices[a].y + vertices[b].y) / 2,
    z: (vertices[a].z + vertices[b].z) / 2
  });
  const index = vertices.push(midpoint) - 1;
  midpoints.set(key, index);
  return index;
}

function subdivide(vertices, faces) {
  const midpoints = new Map();
  const refined = [];
  for (const [a, b, c] of faces) {
    const ab = midpointIndex(a, b, vertices, midpoints);
    const bc = midpointIndex(b, c, vertices, midpoints);
    const ca = midpointIndex(c, a, vertices, midpoints);
    refined.push(
      [a, ab, ca],
      [b, bc, ab],
      [c, ca, bc],
      [ab, bc, ca]
    );
  }
  return refined;
}

function addNeighbor(neighbors, a, b) {
  neighbors[a].add(b);
  neighbors[b].add(a);
}

export function generateIcosphereCells(seed, subdivisions = 2) {
  if (!Number.isInteger(subdivisions) || subdivisions < 0 || subdivisions > MAX_SUBDIVISIONS) {
    throw new RangeError(`Subdivisions must be an integer from 0 to ${MAX_SUBDIVISIONS}.`);
  }

  const { vertices, faces: baseFaces } = createIcosahedron();
  let faces = baseFaces;
  for (let level = 0; level < subdivisions; level++) {
    faces = subdivide(vertices, faces);
  }

  const random = createRandom(String(seed));
  const angles = [random(), random(), random()].map(value => value * Math.PI * 2);
  const rotatedVertices = vertices.map(vertex => rotate(vertex, angles));
  const neighbors = faces.map(() => new Set());
  const edgeOwners = new Map();

  faces.forEach(([a, b, c], cellIndex) => {
    for (const [start, end] of [[a, b], [b, c], [c, a]]) {
      const key = start < end ? `${start}:${end}` : `${end}:${start}`;
      const owner = edgeOwners.get(key);
      if (owner === undefined) {
        edgeOwners.set(key, cellIndex);
      } else {
        addNeighbor(neighbors, cellIndex, owner);
      }
    }
  });

  return faces.map(([a, b, c], index) => {
    const center = normalize({
      x: rotatedVertices[a].x + rotatedVertices[b].x + rotatedVertices[c].x,
      y: rotatedVertices[a].y + rotatedVertices[b].y + rotatedVertices[c].y,
      z: rotatedVertices[a].z + rotatedVertices[b].z + rotatedVertices[c].z
    });
    return {
      index,
      center,
      vertices: [rotatedVertices[a], rotatedVertices[b], rotatedVertices[c]],
      neighbors: [...neighbors[index]].sort((left, right) => left - right)
    };
  });
}

export function generatePlateTerrain(cells, seed, continentalProportion = 0.4) {
  if (!Array.isArray(cells) || cells.length < 2) {
    throw new RangeError("At least two spherical cells are required to generate plates.");
  }
  if (!Number.isFinite(continentalProportion)
    || continentalProportion < 0
    || continentalProportion > 1) {
    throw new RangeError("Continental proportion must be a number from 0 to 1.");
  }

  const random = createRandom(`${seed}:plates`);
  const plateCount = Math.min(
    MAX_PLATES,
    Math.max(2, Math.round(Math.sqrt(cells.length / 4)))
  );
  const plates = Array.from({ length: plateCount }, (_, id) => {
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(1 - z * z);
    return {
      id,
      center: {
        x: radius * Math.cos(angle),
        y: z,
        z: radius * Math.sin(angle)
      }
    };
  });

  const continentalCount = continentalProportion === 0
    ? 0
    : continentalProportion === 1
      ? plateCount
      : Math.min(
        plateCount - 1,
        Math.max(1, Math.round(plateCount * continentalProportion))
      );
  const plateOrder = plates.map(plate => plate.id);
  for (let index = plateOrder.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [plateOrder[index], plateOrder[swapIndex]] = [plateOrder[swapIndex], plateOrder[index]];
  }

  for (let index = 0; index < plates.length; index++) {
    const crustType = index < continentalCount ? "continental" : "oceanic";
    const baseElevation = crustType === "continental" ? 0.18 : -0.2;
    plates[plateOrder[index]].crustType = crustType;
    plates[plateOrder[index]].baseElevation = baseElevation + (random() - 0.5) * 0.05;
  }

  const terrainCells = cells.map(cell => {
    let nearestPlate = plates[0];
    let nearestDistance = -Infinity;
    for (const plate of plates) {
      const distance = cell.center.x * plate.center.x
        + cell.center.y * plate.center.y
        + cell.center.z * plate.center.z;
      if (distance > nearestDistance) {
        nearestPlate = plate;
        nearestDistance = distance;
      }
    }

    const baseElevation = nearestPlate.baseElevation + (random() - 0.5) * 0.03;
    return {
      ...cell,
      plateId: nearestPlate.id,
      crustType: nearestPlate.crustType,
      baseElevation,
      elevation: baseElevation
    };
  });

  return { cells: terrainCells, plates };
}

function crossProduct(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function dotProduct(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function applyTectonicRelief(cells, plates, seed) {
  if (!Array.isArray(cells) || !Array.isArray(plates) || plates.length < 2) {
    throw new RangeError("Spherical cells and at least two plates are required.");
  }

  const random = createRandom(`${seed}:motion`);
  const movingPlates = plates.map(plate => {
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const speed = 0.25 + random() * 0.55;
    const radius = Math.sqrt(1 - z * z) * speed;
    return {
      ...plate,
      rotationVector: {
        x: radius * Math.cos(angle),
        y: z * speed,
        z: radius * Math.sin(angle)
      }
    };
  });
  const plateById = new Map(movingPlates.map(plate => [plate.id, plate]));
  const relief = cells.map(() => 0);
  const boundaries = [];
  const cellBoundaries = cells.map(() => []);
  const motionThreshold = 0.08;

  for (const cellA of cells) {
    for (const neighborId of cellA.neighbors) {
      if (neighborId <= cellA.index) continue;
      const cellB = cells[neighborId];
      if (!cellB || cellA.plateId === cellB.plateId) continue;

      const plateA = plateById.get(cellA.plateId);
      const plateB = plateById.get(cellB.plateId);
      if (!plateA || !plateB) {
        throw new RangeError("Every cell must reference a generated plate.");
      }

      const midpoint = normalize({
        x: cellA.center.x + cellB.center.x,
        y: cellA.center.y + cellB.center.y,
        z: cellA.center.z + cellB.center.z
      });
      const centerDifference = subtract(cellB.center, cellA.center);
      const tangentDirection = normalize({
        x: centerDifference.x - midpoint.x * dotProduct(centerDifference, midpoint),
        y: centerDifference.y - midpoint.y * dotProduct(centerDifference, midpoint),
        z: centerDifference.z - midpoint.z * dotProduct(centerDifference, midpoint)
      });
      const velocityA = crossProduct(plateA.rotationVector, midpoint);
      const velocityB = crossProduct(plateB.rotationVector, midpoint);
      const motionRate = dotProduct(subtract(velocityB, velocityA), tangentDirection);
      const type = motionRate > motionThreshold
        ? "divergent"
        : motionRate < -motionThreshold
          ? "convergent"
          : "transform";

      let reliefA;
      let reliefB;
      if (type === "convergent") {
        if (cellA.crustType === cellB.crustType) {
          reliefA = cellA.crustType === "continental" ? 0.09 : -0.09;
          reliefB = cellA.crustType === "continental" ? 0.09 : 0.065;
        } else {
          reliefA = cellA.crustType === "oceanic" ? -0.09 : 0.065;
          reliefB = cellB.crustType === "oceanic" ? -0.09 : 0.065;
        }
      } else if (type === "divergent") {
        reliefA = -0.045;
        reliefB = -0.045;
      } else {
        reliefA = cellA.plateId < cellB.plateId ? 0.035 : -0.035;
        reliefB = -reliefA;
      }

      relief[cellA.index] += reliefA;
      relief[cellB.index] += reliefB;
      const boundary = {
        cellA: cellA.index,
        cellB: cellB.index,
        plateA: cellA.plateId,
        plateB: cellB.plateId,
        type,
        motionRate,
        reliefA,
        reliefB
      };
      boundaries.push(boundary);
      cellBoundaries[cellA.index].push({
        neighborId: cellB.index,
        type,
        relief: reliefA
      });
      cellBoundaries[cellB.index].push({
        neighborId: cellA.index,
        type,
        relief: reliefB
      });
    }
  }

  const terrainCells = cells.map((cell, index) => {
    const baseElevation = cell.baseElevation ?? cell.elevation;
    const tectonicRelief = Math.max(-0.18, Math.min(0.18, relief[index]));
    return {
      ...cell,
      baseElevation,
      tectonicRelief,
      elevation: baseElevation + tectonicRelief,
      boundaries: cellBoundaries[index]
    };
  });

  return { cells: terrainCells, plates: movingPlates, boundaries };
}
