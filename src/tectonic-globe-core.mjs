const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
const MAX_SUBDIVISIONS = 5;

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
