# Macro-Shape Tectonic Simulation: Implementation Research

This document converts `research/macro-shape.md` into implementation-ready research for JavaScript. It is not an implementation specification for a specific library and does not fix visual constants or physical units; those values must be tunable.

## Scope

The implementation target is a rectangular 2D map containing one or two continents. It is not a full-globe, whole-planet, longitude/latitude, or spherical mesh simulator. The map should use a fixed-width, fixed-height grid initially; horizontal and vertical wrapping are optional map features and should be explicitly configured rather than assumed.

Because the scope is planar:

- Plate velocities are 2D vectors or localized offsets in map-grid coordinates.
- Voronoi seeds and centroids are 2D positions.
- Euler-pole, great-circle, unit-sphere, and spherical Rodrigues rotation sections in the source are **not required** for the initial implementation.
- Icosphere, Fibonacci-sphere, H3, spherical Voronoi, geodesic, and 3D globe packages are useful reference material only, not core dependencies.
- Domain warping and boundary effects operate in rectangular coordinates with an optional edge mode.
- One or two continents is a map-generation goal, not a limit on the number of internal plate regions.

The 2D output can later be projected or rendered as 3D terrain, but rendering projection is separate from the simulation.

## Recommended simulation pipeline

1. Partition a rectangular width × height grid or planar mesh into plates.
2. Assign each plate a 2D velocity vector, crust properties, and stable plate ID.
3. Advance plate motion in map coordinates.
4. Detect neighboring boundary cells or edges and classify each interaction.
5. Modify crust, elevation, and boundary metadata from the interaction.
6. Age oceanic crust and apply isostatic adjustment over time.
7. Smooth the result and domain-warp boundary/coordinate fields.
8. Repeat the simulation steps, then pass the height field to later terrain erosion/detail passes.

The pipeline should keep simulation state separate from rendering state. A plate is a logical body and may own many mesh faces or map cells.

## 1. Plate partitioning

### Voronoi diagram

**Purpose:** assign every map position or mesh element to its nearest plate seed.

#### Inputs

- `seedPositions`: one 2D position per plate, usually generated randomly and distributed over a desired continental/oceanic region.
- `siteCount`: desired plate count.
- `samplePoints`: cells, pixels, vertices, or face centroids that will be assigned to a plate.
- Optional seed positions constrained against clustering.

#### Output

A plate ID on each sample point plus a collection of boundary edges between neighboring plate IDs.

#### Required operations for the rectangular map

Use Euclidean distance in map coordinates for the nearest-seed pass:

```text
For each sample point P = (x, y):
    bestPlate = -1
    bestDistance = Infinity
    For each plate seed S = (sx, sy):
        dx = P.x - S.x
        dy = P.y - S.y
        distanceSquared = dx * dx + dy * dy
        If distanceSquared < bestDistanceSquared:
            update bestPlate and bestDistanceSquared
    result[P] = bestPlate
```

- This is O(samples × seeds); a fixed grid or `d3-delaunay` spatial lookup can reduce later overhead.
- Unless wrapping is an explicit feature, do not add distance across map edges.
- For a seamless horizontal prototype, compare `dx` to both the normal delta and `dx ± width` and choose the smallest distance.
- Vertical wrapping should be disabled for a rectangular map unless a specific design calls for a horizontal band or toroidal world.

This is intentionally straightforward but is O(samples × plates). A spatial index or bounded search should be added for large maps. Candidates include a k-d tree, uniform grid, or a hierarchical mesh lookup.

#### Lloyd relaxation

Lloyd relaxation makes Voronoi regions more evenly sized and prevents weakly constrained, splintered plates.

For each iteration:

1. For every sample point, keep its plate assignment.
2. Compute the arithmetic 2D centroid of each plate's sample points.
3. Replace each seed with that new center.
4. Re-run plate partitioning.

For a grid, average `(x, y)` coordinates and optionally weight each point by cell area. The grid is rectangular, so equal-area cells normally give a simple arithmetic mean. With horizontal wrap enabled, unwrapped centroid coordinates can cross the seam; use minimum-displacement coordinates relative to the first member, then wrap the result back into `[0, width)`.

```text
For each plate p:
    sumX = 0; sumY = 0; weight = 0
    For each sample position (x, y) assigned to p:
        sumX += weight(x, y) * x
        sumY += weight(x, y) * y
        weight += weight(x, y)
    If weight > 0:
        seed[p] = (sumX / weight, sumY / weight)
```

Suggested state per plate:

```text
{
    id,
    seedPosition: Float64Array(2),
    type: "continental" | "oceanic" | "mixed",
    crust: typed/array state per cell,
    velocity: Float64Array(2),
    boundaryCells: Set<number>,
    ageByCell: Float64Array | Map<number, number>
}
```

Use a bounded iteration count, such as 2–10 iterations initially. Need relaxation convergence/stability metrics in addition to visual output.

### Grid and mesh representations

#### Rectangular grid — preferred first implementation

- Store `width × height` cells in a `Uint32Array` for plate IDs.
- Store elevation, crust type, thickness, density, and age in typed arrays.
- Use 4-neighbor adjacency for cells in a first pass; use 8-neighbor adjacency only if explicitly testing diagonal boundaries.
- Add explicit edge handling so map borders do not unexpectedly connect.
- If horizontal wrap is enabled, compare and traverse the first/last columns as neighbors, but keep the array and boundary extraction rectangular.
- Keep map coordinates in cell units initially; use a separate scale only for display or projected rendering.

This representation directly supports rectangular maps with one or two continents and avoids fixed global topology, spherical polar artifacts, and geodesic edge math outside this scope.

#### Optional planar triangular mesh

A Delaunay/half-edge mesh may be used for visually organic Voronoi plate boundaries on the same rectangle, but the grid remains the simpler and preferred source of truth.

- Use planar sites only, with coordinates constrained to `0 ≤ x < width` and `0 ≤ y < height`.
- Clip dual polygons to the rectangle rather than creating global/geographic polygons.
- Do not use icospheres, Fibonacci spheres, or spherical dual construction for this project.
- Grid-backed plate state is still a valid fallback for crust and elevation updates.

### Half-edge mesh

The source recommends a half-edge or dual-connected edge list when boundary movement, collision, or vertex splitting becomes important.

Store:

```text
Vertex {
    position: Float64Array(2),
    halfEdge: HalfEdgeId
}

Face {
    plateId,
    halfEdge: HalfEdgeId,
    crustType,
    elevation,
    age
}

HalfEdge {
    vertex: VertexId,
    face: FaceId,
    opposite: HalfEdgeId,
    next: HalfEdgeId,
    prev: HalfEdgeId,
    boundaryRole: optional
}
```

Recommended functions:

- `edgeOf(v1, v2)` to find the matching directed edge.
- `oppositeEdge(e)` to reach the adjacent face.
- `nextAroundVertex(v)` to enumerate incident edges.
- `nextAroundFace(f)` to enumerate face boundaries.
- `splitBoundaryVertex(...)` if boundaries are subdivided or vertices collide during evolution.

For JS, numeric IDs into typed arrays or plain arrays are preferable to storing object pointers. The opposite-edge lookup should be built once after subdivision and updated only when topology changes.

A half-edge mesh is the strongest representation for true plate boundaries, but a 2D grid is sufficient for a prototype that does not change mesh topology during simulation.

## 2. Plate kinematics

### Rectangular-map motion

**Purpose:** derive the velocity of cells or boundary points in the rectangular map.

Euler-pole spherical rotation is documented in the source but is not required for this scope. Each plate stores a simple 2D velocity or displacement vector:

```text
{
    velocityX: number,
    velocityY: number
}
```

For a cell position `(x, y)`, with a small step `Δt`:

```text
sampleVelocity = plate.velocity
nextX = x + sampleVelocity.x * deltaTime
nextY = y + sampleVelocity.y * deltaTime
```

For the initial deterministic prototype, velocities can be constant for the entire plate. After motion is understood, a localized rotation can be represented as `(x-center)`, but this is a convenience field—not a globe Euler pole and not required for cross-continent motion.

Optional planar rotation for a small plate may use:

```text
centeredX = x - plate.centerX
centeredY = y - plate.centerY
rotatedX = centeredX * cos(θ) - centeredY * sin(θ)
rotatedY = centeredX * sin(θ) + centeredY * cos(θ)
```

Keep this optional. The main first-pass velocity is `(vx, vy)` with stable units and `deltaTime`.

### Relative boundary velocity

For boundary cell or face positions:

```text
velocityA = plateA.velocity
velocityB = plateB.velocity
relativeVelocity = velocityA - velocityB
normal = normalized perpendicular to the local boundary segment
```

The sign convention must be consistent:

- `normalTowardB` or `normalTowardA` points from one plate into the adjacent plate.
- Convergence is negative normal-relative motion: plates approach along the boundary normal.
- Divergence is positive normal-relative motion: plates separate.
- Transform behavior is relative tangential motion.

## 3. Boundary detection and classification

### Boundary extraction

For a grid, a boundary segment exists between neighboring cells with different plate IDs. For a mesh, inspect opposite half-edge faces.

Store boundary records separately from cells:

```text
{
    edgeId: number,
    aCellId: number,
    bCellId: number,
    plateA: number,
    plateB: number,
    normal: Float64Array(2),
    tangent: Float64Array(2),
    relativeNormalVelocity: number,
    relativeTangentialVelocity: number,
    boundaryType: "convergent" | "divergent" | "transform" | null,
    crustA: "continental" | "oceanic",
    crustB: "continental" | "oceanic"
}
```

Boundary lists can be derived each simulation step rather than permanently mutated. Cache them between mutation passes if topology is stable.

### Classification thresholds

The source supplies geological categories but no exact threshold. Use configurable minimum velocities or ratios rather than hard-coded signs:

```text
normalMagnitude = abs(relativeNormalVelocity)
tangentMagnitude = abs(relativeTangentialVelocity)

if normalMagnitude > normalThreshold && platesApproach:
    type = convergent
else if normalMagnitude > normalThreshold && platesSeparate:
    type = divergent
else if tangentMagnitude > tangentThreshold:
    type = transform
```

If a boundary has both normal and tangential motion, convert a dominant component or retain oblique motion explicitly. Oblique motion is not required to map to one of the three, but it is useful for parameterizing geological effects.

### Convergent boundary effects

#### Oceanic–continental convergence

- The denser oceanic plate is selected as the overriding/subducting participant based on crust density.
- Add a low-elevation trench along the subducting plate boundary.
- Uplift and compress the continental edge into a mountain range.
- Use a distance falloff from the boundary so effects spread naturally into adjacent cells.

Useful spatial decay choices:

```text
weight = clamp(1 - distance / influenceRadius, 0, 1)
newElevation = oldElevation + convergentUplift * weight * convergenceRate
trenchDepth = trenchMaxDepth * weight
```

Production versions should maintain separate buoyancy/crust and surface-height fields rather than replacing elevation directly.

#### Continental–continental convergence

- Neither side is assigned oceanic/buoyant-subduction behavior if both are continental.
- Apply strong symmetric or adjusted uplift on both sides.
- Add compression metadata and fold-oriented noise to break up an unnaturally straight range.

#### Oceanic–oceanic convergence

- Subduct the denser or older oceanic plate.
- Lower elevation in a narrow trench line.
- Uplift a volcanic island-chain strip behind the overriding side.

The source does not specify subduction depth or volcanic placement formulas. These should be model parameters and must not be inferred as fixed constants.

### Divergent boundaries

- Move the boundary geometry or related crust outward.
- Lower local elevation and create a rift/oceanic-basin band.
- Add new low-lying oceanic crust at or near the boundary.
- Increment crust age elsewhere from its creation time.

Cell-based state for a newborn crust segment should include:

```text
{
    crustType: "oceanic",
    age: 0,
    thickness,
    elevation,
    createdAtStep
}
```

### Transform boundaries

- Apply lateral offset/shear near the boundary.
- Add a narrow band of high-frequency displacement and jagged faults.
- Use minor elevation noise on cells on both sides.
- Do not uplift or subduct solely because the normal component is zero.

A deterministic noise seed is recommended so boundary generation and replay are stable.

## 4. Crustal properties and aging

### Required crust fields

```text
crustType: Uint8Array        // 0 continental, 1 oceanic, optional mixed
thickness: Float32Array
density: Float32Array
age: Float32Array            // oceanic only
createdAt: Float32Array
baseElevation: Float32Array
```

A plate type such as `type: "continental"` should be derived from the underlying crust cells rather than assumed constant; mixed crust is an important middle state.

### Isostasy

The simulation uses Archimedes-style buoyancy:

```text
heavier crust -> lower surface position
lighter, thicker crust -> higher surface position
```

A lightweight implementation should maintain a crust thickness/density column per cell and update elevation through a force-balance expression rather than directly overwriting crust type height.

A generic form is:

```text
surfaceElevation = referenceElevation
                 + compensationFactor * (crustThickness - referenceThickness)
                 - densityFactor * (crustDensity - referenceDensity)
```

Exact coefficients depend on chosen mantle/crust densities and units and are not supplied in the source. They should be exposed as configuration.

Suggested JS approach:

1. Compute a column adjustment from crust thickness and density.
2. Apply it to a base elevation array.
3. Re-run smoothing after isostatic updates if sharp crust transitions create artifacts.

### Thermal subsidence

Oceanic crust is younger, hotter, and less dense near a divergent boundary and becomes colder, denser, and deeper as it ages.

Suggested state transition per simulation step:

```text
for each oceanic cell:
    age += deltaTime
    depth = initialDivergentDepth + subsidence(age)
    density = increaseTowardAgingLimit(age)
```

`subsidence(age)` is deliberately unspecified. Common age-dependent models can be parameterized behind one function, such as:

```text
function subsidenceFromAge(age, parameters) {
    // thermal half-space-style or other normalized function
}
```

Do not expose an unverified physical coefficient in the core API. Keep the function configurable and document the unit convention.

### Crust conversion and mutation

Collision and divergence may change crust properties:

- New divergent crust: oceanic, `age = 0`, low elevation.
- Subducted crust: mark as consumed/removed in a plate model; maintain recycling state or remove where geometry permits.
- Continental collision: thicken crust and increase buoyancy/elevation.
- Transform boundaries: preserve crust type and mostly alter shear/elevation noise.

For grid implementations, maintaining a `plateId` per cell plus a crust record per cell is enough. For a half-edge implementation, each face or vertex can carry the same fields, with averages used during split/merge operations.

## 5. Diffusion and smoothing

### Iterative height averaging

A Laplacian/diffusion pass can spread elevation peaks and trenches without changing geological plate assignments.

For each cell, excluding boundary or ocean data where a mask disallows smoothing:

```text
newHeight[i] = oldHeight[i] + diffusionRate * laplacian(oldHeight, i)
```

A practical neighbor implementation in JS is `Float32Array` ping-pong buffers rather than allocating per iteration.

For grids:

```text
laplacian = neighborSum / neighborCount - centerHeight
```

For meshes:

- Average against face- or vertex-neighbor values.
- Preserve area weighting where neighboring face areas differ.
- Bound the update with `clamp` or iterate in small diffusion steps.

Run only a small number of smoothing iterations initially; repeated smoothing can erase trench and mountain bands entirely.

### Thermal/hydraulic relaxation

The source combines these categories as post-processing relaxation. They map to:

- **Thermal relaxation:** limit slope, transfer elevation from steep to neighboring lower cells, and repeat until a talus threshold is approximated.
- **Height averaging/hydraulic relaxation:** spread sharp elevation differences and can approximate broad erosion or sediment transport while preserving scale.

A general relaxation pass is:

```text
For stepCount iterations:
    For each eligible cell:
        excess = height[i] - neighborHeight[j]
        If excess > threshold:
            transfer = (excess - threshold) * transferRate
            height[i] -= transfer
            height[j] += transfer
```

Use masks for fixed plate-boundary features if the producer should preserve mountain/trench shapes. Protect boundary records from being smoothed into horizontal flatness.

### Cellular automaton smoothing

A second option is to classify heights or crust states and replace cells from local neighborhood majority/voting rules:

```text
For each cell:
    sample neighborhood state/elevation
    newState = deterministic combination(neighborhood)
```

Smooth only border pixels and run limited iterations. This is a stylistic cleanup, not a replacement for isostasy or boundary physics.

### Domain warping

Domain warping prevents straight synthetic-looking boundaries and fault lines.

Given a position `p`, a noise function `N`, and warp amplitude:

```text
warpedPosition = p + warpAmplitude * NVector(p)
value = noiseFunction(warpedPosition)
```

A 2D JS form:

```text
const qx = lowFrequencyNoise(x + offsets[0], y + offsets[1]);
const qy = lowFrequencyNoise(x + offsets[2], y + offsets[3]);
const warped = baseNoise(x + warpAmount * qx, y + warpAmount * qy);
```

For a rectangular map, evaluate noise directly in 2D cell coordinates. If horizontal wrap is enabled, use coherent wrap-aware noise coordinates at the left/right seam. A warp should normally affect boundary rendering/elevation noise; applying it to plate membership after kinematics can require rebuilding grid or mesh boundaries.

## 6. JS-oriented module boundaries

A useful separation is:

```text
PlatePartitioner
├── generateSeeds
├── assignCells
├── relaxSeeds
└── extractBoundaryEdges

PlateKinematics
├── createRotation
├── pointVelocity
├── advancePlate
└── relativeBoundaryVelocity

BoundaryProcessor
├── detectNeighbors
├── classifyBoundary
├── applyConvergence
├── applyDivergence
└── applyTransform

CrustModel
├── initializeCrust
├── ageOceanicCrust
├── applyThermalSubsidence
└── applyIsostasy

SurfacePostProcessor
├── diffuseHeight
├── thermalRelax
├── hydraulicRelax
└── domainWarp
```

Suggested public model types in JS:

```js
class Plate {
    // id: number
    // seedPosition: Float64Array
    // pole: Float64Array
    // angularVelocity: number
}

class CrustColumn {
    // type: "continental" | "oceanic"
    // thickness: number
    // density: number
    // age: number
    // elevation: number
}

class BoundaryEdge {
    // left/right cell or plate IDs
    // normal: Float64Array
    // tangent: Float64Array
    // relativeNormalVelocity: number
    // relativeTangentialVelocity: number
    // type: "convergent" | "divergent" | "transform"
}
```

The source does not require object classes. Numeric arrays and compact records are often more appropriate for large grids.

## 7. State, tuning, and determinism

Every mutable array or object should be paired with a clear update phase:

1. Sample 2D plate velocities from the beginning of the step.
2. Partition or detect boundaries from the same geometry snapshot.
3. Calculate boundary effects from the snapshot.
4. Mutate crust and age fields.
5. Apply isostasy and subsidence.
6. Advance plate positions.
7. Apply smoothing/warping.
8. Snapshot/rebuild boundary topology if plate membership changed.

Use a seeded pseudo-random generator for:

- Initial seeds.
- Plate pole choices.
- Angular velocities within chosen ranges.
- Transform shear/noise.
- Domain-warp offsets.

Record simulation parameters separately from state. This enables replay, debugging, and visual tuning.

Recommended tunable parameter groups:

```text
partition: plateCount, relaxationIterations, seedDistribution
kinematics: angularVelocityRange, timeStep
boundaries: normalThreshold, tangentThreshold,
            upliftScale, trenchScale, volcanicArcScale,
            influenceRadius
crust: continentalDensity, oceanicDensity,
       referenceThickness, isostasyFactor,
       initialOceanicDepth, subsidenceScale
relaxation: diffusionRate, diffusionIterations,
            talusThreshold, thermalTransferRate,
            warpAmplitude, warpFrequency
```

## 8. Validation and debugging

Minimum invariants for every step:

- Every sample point has exactly one plate ID.
- Plate seed positions remain unit normalized.
- Plate Euler poles remain unit normalized.
- Boundary records refer to valid neighboring plates/cells.
- Elevation arrays have finite values.
- Crust type and density combinations remain finite and valid.
- Oceanic age never becomes negative.
- Diffusion updates use ping-pong or snapshot arrays, not partially mutated source values.

Useful diagnostics:

- Plate count and average/median plate area.
- Histogram of plate sizes before and after Lloyd relaxation.
- Percentage of divergent, convergent, and transform boundary length.
- Total uplift, trench volume, and oceanic crust area per step.
- Maximum elevation and depth after each pass.
- Number and location of boundary topology anomalies.

Start with deterministic seeded rectangular-grid tests at a small resolution such as 32×32 or 64×64. Validate rectangular boundaries, one/two-continent plate layouts, fixed plate membership, 2D relative velocity classification, and optional horizontal wrap behavior. Spherical implementation tests are not required for this scope.

## 9. Source-derived gaps and decisions left open

The source material establishes an architecture and broad behavior but does not provide:

- Plate seed distribution algorithm details beyond random seeds.
- Exact planar Voronoi implementation and rectangle-clipping approach.
- Exact Lloyd convergence tolerance or iteration count.
- Whether optional 2D plate rotation is needed; this replaces Euler-pole selection for the current scope.
- Physical units for velocity, time, crust thickness, density, and elevation.
- Exact boundary normal/tangent thresholds.
- Exact convergence/divergence influence widths.
- Trench depth, mountain uplift, volcanic arc, and fold amplitudes.
- Crust density/thickness values.
- Isostasy compensation coefficients.
- Thermal subsidence formula or coefficients.
- Smoothing iteration counts or diffusion rates.
- Noise implementation and domain-warp parameters.

These omissions should be treated as configuration or follow-up research, not silently invented implementation constants.

## Appendix: existing JavaScript modules worth evaluating

This appendix is a research survey, not a recommendation to add dependencies. Versions and licenses below reflect npm metadata checked on 2026-11-01. Confirm the current license, maintenance status, browser format, bundle size, TypeScript support, and API before adopting a package.

The current simulator is scoped to a rectangular grid of one or two continents. Therefore, planar modules are preferred; spherical/icosphere/H3/geodesy packages are retained only as context from the broader source research and are explicitly not required dependencies. A package described as “spherical” must not drive the core simulation unless the scope later changes.

### Modules already used by this workspace

- [`simplex-noise`](https://www.npmjs.com/package/simplex-noise), MIT, current npm `4.0.3`, is already loaded in [src/redblob.html](/Users/darrens/src/projects/map/src/redblob.html). That prototype uses `2.4.0` and the class-based API `new SimplexNoise(random)` / `noise2D(x,y)`. Version 4 removed the class API and built-in seed support; it exposes `createNoise2D()`, `createNoise3D()`, and `createNoise4D()` and expects an injected PRNG. Do not upgrade automatically. It is useful for seeded elevation, moisture, transform shear, FBM, and domain warping. The workspace use is 2D; 3D and 4D APIs are not needed for the current rectangular scope.
- [`delaunator`](https://www.npmjs.com/package/delaunator), ISC, current npm `5.1.0`, is already used as a CDN dependency in the prototype. The prototype loads `4.0.1`; `Delaunator.from(points, getX, getY)` and the `triangles` / `halfedges` / `hull` arrays remain directly relevant. Its README explicitly exposes these arrays for half-edge traversal and says `update()` supports iterative Lloyd-style workflows where coordinates change in place. It is fast, robust, typed-array-friendly, and excellent for 2D grids, but it is not spherical.
- The prototype has its own [`calculateCentroids`, `nextHalfedge`, and `edgesAroundPoint` functions](/Users/darrens/src/projects/map/src/redblob.html:176), making it a small reference implementation for dual Voronoi-cell traversal over Delaunator triangles. These functions are planar and can be adapted to rectangle-clipped or optional horizontally wrapped maps without spherical equivalents.

### Reference-only spherical modules (not for the current scope)

#### `d3-geo-voronoi` — primary spherical candidate

- Package: https://www.npmjs.com/package/d3-geo-voronoi
- Repository: https://github.com/Fil/d3-geo-voronoi
- Version: `2.1.0`; license: ISC.
- Purpose: spherical Delaunay triangulation and dual Voronoi cells for longitude/latitude or 3D-sphere point data. It also exposes convenience operations for hulls, circumcenters, Urquhart graphs, and finding the containing cell.
- Fit: This is the most direct library to evaluate for seed partitioning on a globe. Prefer it when seed count and resolution are moderate and geographic coordinate output is useful.
- Caveats: Its README and package documentation should be inspected in detail before choosing its cell or coordinate conventions. Verify seam behavior, antipodal/degenerate cases, performance, exact spherical dual construction, and whether containment results are suitable for every mesh sample point. The library does not itself implement plate motion or geological crust state.

#### `d3-delaunay` — primary planar counterpart

- Package: https://www.npmjs.com/package/d3-delaunay
- Repository: https://github.com/d3/d3-delaunay
- Version: `6.0.4`; license: ISC.
- Purpose: a Delaunay/Voronoi implementation with neighbors, `.find()`, cell polygons, clipping, and typed-array/traversal support for 2D point sets.
- Fit: Good for the prototype/grid implementation, especially nearest-site lookup, Lloyd relaxation over clipped cells, and region polygon generation.
- Caveats: It is 2D; wrap longitude and polar/spherical distance separately. Its planar nearest-neighbor API must not be used unchanged for antipodal globe points.

#### `@turf/` packages — planar/spherical GIS helpers

- Package examples: `@turf/voronoi`, `@turf/boolean-point-in-polygon`, `@turf/point-grid`, `@turf/triangle-grid`; license varies but Turf is generally MIT.
- Fit: Polygon boolean checks, point-in-polygon, grid creation, measurements, and GeoJSON interoperability.
- Caveats: Many Turf operations use Turf's geographic conventions rather than a true subdivided spherical topology. Use them as boundary conversion/diagnostic tools, not as the core Euler-pole or plate-membership engine. Package footprint can be large if importing the monolithic package; prefer individual packages where possible.

#### `d3-geo`

- Package: https://www.npmjs.com/package/d3-geo
- Version: `3.1.1`; license: ISC.
- Fit: Spherical projections, paths, geographic shapes, distance and rotation helpers, and map rendering.
- Caveat: It solves map projections and spherical geography, not Voronoi topology by itself; combine only with geometry modules that preserve the relevant neighbor lists.

#### `spherical-geometry-js`

- Package: https://www.npmjs.com/package/spherical-geometry-js
- Version: `3.0.2`; license: MIT.
- Fit: A JS port of spherical geometry operations commonly used by Google Maps APIs. May help with polygon-area, contains, lat/lon conversion, great-circle calculations, and triangular calculations.
- Caveat: Audit whether operations treat a sphere, ellipsoid, or Earth approximation and whether APIs expect longitude/latitude radians/degrees. It is not a plate or mesh engine.

#### `geodesy`

- Package: https://www.npmjs.com/package/geodesy
- Version: `2.4.0`; license: MIT.
- Fit: Latitude/longitude distance, bearing, destination, ellipsoidal calculations, datum, UTM/MGRS utilities, and reference-coordinate conversions.
- Caveat: Earth-specific geodesy calculations have units, datum, and ellipsoid assumptions that may not match a unit-sphere procedural planet. Vector/axis-angle routines or a dedicated unit-sphere math module remain better for Euler rotation.

### Reference-only spherical mesh/grid generation (not for this scope)

#### Fibonacci lattice — implement directly

No package is necessary. A deterministic Fibonacci sphere is straightforward:

```js
function fibonacciPoint(i, count) {
    const y = 1 - 2 * (i + 0.5) / count;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = Math.PI * (3 - Math.sqrt(5)) * (i + 0.5);
    return [Math.cos(theta) * r, y, Math.sin(theta) * r];
}
```

Fit: evenly distributed seed/sample points and tests for spherical partitioning. Simplicity is an advantage; neighbor links still need a separate mesh or spatial-index layer.

#### `icosphere`, `icomesh`, and `icosphere-fast`

- `icosphere` package: https://www.npmjs.com/package/icosphere, `1.0.0`, MIT.
- `icomesh` package: https://www.npmjs.com/package/icomesh, `1.1.0`, ISC.
- `icosphere-fast` package: https://www.npmjs.com/package/icosphere-fast, `0.0.1`, license should be checked before use.
- Fit: Generate subdivided icosphere vertex/face buffers for a mesh-backed spherical simulation.
- Caveats: Evaluate output types, face winding, subdivision behavior, degeneracy, duplicate vertices, and whether area/neighbor structures are generated. If only one package can provide vertex and triangular-index buffers, the caller still needs to derive opposite edges and face/vertex neighbors. Verify maintenance for `icosphere-fast` because its npm metadata reports a very old version/release state and no clear repository field.

#### `primitive-icosphere` and `primitive-sphere`

- Packages: `primitive-icosphere` / `primitive-sphere`, npm, licenses should be checked individually.
- Fit: Ready-made WebGL-compatible geometry attributes, indexing, normals, and UVs, useful if Three.js or another renderer is adopted later.
- Caveat: Rendering geometry does not supply geological or half-edge simulation state.

#### `three`

- Package: https://www.npmjs.com/package/three
- Version: `0.187.0`; license: MIT.
- Fit: BufferGeometry, `Vector3`, axis-angle/rotation/quaternion operations, mesh rendering, raycasting, and useful spherical visual diagnostics.
- Caveats: Three.js is a rendering and math dependency, not a tectonic simulator. Adding it only for vector math is heavy; prefer `gl-matrix` or small unit-sphere helpers for simulation state.

#### `h3-js`

- Package: https://www.npmjs.com/package/h3-js
- Version: `4.5.0`; license: Apache-2.0.
- Fit: A fixed hierarchical, Earth-indexed hexagonal grid with neighbor, distance, parent/child, and polygon operations. It can be a fast alternative to custom plate partitioning on Earth.
- Caveats: Cells are Earth-bound and Earth-oriented, not generic unit-sphere or arbitrary procedural planets. Hexagons do not themselves prevent different plate velocities or crust mutations. Coordinate conventions and world-bounds assumptions need review. Apache-2.0 attribution requirements should be retained.

### Half-edge and triangle mesh modules

#### Existing `Delaunator` flat half-edge arrays

- Best for a prototype because no extra mesh object layer is required.
- Keep `triangles`, `halfedges`, and point coordinates together and derive boundary edges from triangle adjacency.
- Use `robust-predicates` or a tested geometry stack for degenerate predicates rather than copying only the loop logic.

#### `three-mesh-halfedge`

- Package: https://www.npmjs.com/package/three-mesh-halfedge
- Version: `1.0.3`; license: MIT.
- Fit: Adds half-edge traversal around Three.js geometry.
- Caution: The package is tied to Three.js and appears niche; inspect compatibility with the exact Three.js and geometry/index type. It may require conversion of arbitrary plate meshes and does not implement plate evolution.

#### `@sherifmagdy/three-mesh-halfedge`

- Package: https://www.npmjs.com/package/@sherifmagdy/three-mesh-halfedge
- Version: `2.5.2`; license: MIT.
- Fit: A more recently published TypeScript Three.js half-edge alternative.
- Caution: Avoid assuming updates retain compatibility with the older package; compare APIs, test coverage, maintenance, source provenance, and license. It is suitable only if Three.js is already part of the implementation.

#### Implement a compact flat half-edge structure first

For minimal dependencies, a typed-array or array-of-record structure is likely safer than an object-heavy mesh package for cells carrying plate/crust/age state. `Delaunator` already supplies exactly the flat `triangles` and `halfedges` arrays needed for a planar start. A dedicated implementation may remain necessary for spherical splitting, sewing boundary loops, crust conversion, and vertex/edge mutation.

### Vector and rotation math

#### `gl-matrix`

- Package: https://www.npmjs.com/package/gl-matrix
- Version: `3.4.4`; license: MIT.
- Fit: `vec3` dot/cross/normalize and `mat3`/`quat` operations; suitable for plate point velocity, Euler pole math, tangent frames, and rotation matrices.
- Caveat: Most operations target Float32 or WebGL conventions. Check whether simulation state should remain Float64 to preserve long-run or global precision. It does not provide Euler-pole-specific plate logic.

#### Three.js vector/rotation classes

- Fit: `Vector3`, `Quaternion`, axis-angle rotation, and visual coordinate conversion.
- Caveat: Higher memory and object allocation overhead than simulation typed arrays. Convert to typed arrays in bulk and keep Three.js outside the core simulation update loop.

#### Minimal implementation using existing JS

For the first plate simulator, own 3–5 functions for normalize, dot, cross, Rodrigues rotation, and angular velocity × position may be smaller and easier to test than adding a math package. This is especially appropriate if every simulation value is a `Float64Array` or plain array.

### Noise, FBM, domain warping, and randomness

#### `simplex-noise` upgrade options

- Version to pin for compatibility with existing HTML: `2.4.0`.
- Modern version: `4.0.3`, MIT. Pair with a separate seeded PRNG and use `createNoise2D/3D/4D`.
- `open-simplex-noise` version `3.0.0`, license Unlicense.
- `fast-simplex-noise` version `4.0.0`, license should be verified individually.
- `noisejs` version `2.1.0`, license should be verified individually and is mainly an older Perlin/Simplex implementation.

Choose based on dimensionality and reproducibility requirements:

- 2D noise: recommended for the rectangular canvas/heightmap prototype.
- 3D noise: not required for a rectangular map; only useful if a future implementation renders or stores noise on a globe.
- 4D noise: optional animated/weather variables, but no evidence in the research source or current scope that this is required.

#### Seeded PRNG candidates

- `seedrandom`, version `3.0.5`, MIT: string seeds and deterministic PRNG methods.
- `alea`, version `1.0.1`, MIT: a simple independently available seeded PRNG and the PRNG recommended by `simplex-noise` 4.x docs.
- Native custom `mulberry32` already used by the prototype is sufficient, but not independently standardized; retain a seed and algorithm version if deterministic replay is required.

Record noise implementation, major version, PRNG algorithm, seed, frequency, amplitudes, octaves, persistence, and lacunarity. Noise output can change between major package versions.

### Spatial indexing and nearest-seed lookup

#### `d3-delaunay` `.find()` and containment APIs

Useful for Voronoi containment and nearest seed lookup in 2D. On a sphere, use only the spherical modules or explicitly maintain tangent-space/local candidates.

#### `kdbush`

- Package: https://www.npmjs.com/package/kdbush
- Version: `4.1.0`; license: ISC.
- Fit: Static 2D nearest-neighbor queries and bulk-loaded point lookup. It is efficient for repeated assignment of grid points and Lloyd relaxation in a planar prototype.
- Caveat: It does not understand great-circle distance, periodic maps, or a sphere.

#### `rbush`

- Package: https://www.npmjs.com/package/rbush
- Version: `4.0.1`; license: MIT.
- Fit: Rectangle bounding-box indexing for boundary segments, drawn Voronoi polygons, and selected sample neighborhoods.
- Caveat: Use only with periodic/spherical bounding wrappers supplied by the application.

#### Implement rectangular candidate lookup

For moderate grid sizes, the direct `samples × seeds` Euclidean loop is sufficient to start. If scaling is needed:

- Use an uniform rectangular bucket/grid index to limit candidate seeds.
- Use `kdbush` or `d3-delaunay.find()` for planar nearest-site lookup.
- If horizontal wrap is enabled, account for copied seeds across the left/right seam or disable wrapping for the initial prototype.
- Precompute nearest seed assignments only after seed changes; avoid per-cell lookup during rendering.

Spherical dot/cross candidate lookup, latitude/longitude bins, and icosphere strategies are out of scope for the rectangular implementation.

### Robust geometry and polygon clipping

#### `robust-predicates`

- Package: https://www.npmjs.com/package/robust-predicates
- Version: `3.0.3`; license Unlicense.
- Fit: Robust orientation/incircle predicates needed for custom Delaunay, Voronoi, or boundary construction.
- Caution: Most implementations already choose their robust predicate package internally; adding this package should be unnecessary unless building custom triangulation.

#### `polygon-clipping`

- Package: https://www.npmjs.com/package/polygon-clipping
- Version: `0.15.7`; license MIT.
- Fit: Union, intersection, difference, and XOR of 2D polygons and multipolygons with holes.
- Caveat: Planar only. It cannot represent plates splitting on a sphere without cutting/unwrapping polygons, and unwrapping can introduce longitude/polar artifacts.

#### `topojson-client`

- Package: https://www.npmjs.com/package/topojson-client
- Version: `3.1.0`; license ISC.
- Fit: GeoJSON/TopoJSON conversion, topology manipulation, and geographic serialization.
- Caveat: Output interchange/serialization, not simulation physics.

### Erosion and smoothing

The current research reveals no clearly maintained general-purpose JS package that directly implements coupled plate tectonics, thermal subsidence, isostasy, and tectonic boundary effects. Similarly, npm search did not find a package matching a complete hydraulic erosion model suitable for the requested macro-pipeline.

Likely implementation approach:

- Use typed arrays and direct neighbor loops for diffusion and Laplacian smoothing.
- Implement thermal relaxation as a slope threshold and elevation transfer.
- Implement hydraulic erosion as droplet or cell-to-cell transfer only after establishing the terrain pipeline.
- Use `kdbush`, `rbush`, or a mesh neighbor structure to identify candidate cells if erosion is accelerated later.
- Use `three-mesh-bvh` only if raycasting a rendered 3D terrain becomes necessary; it does not implement erosion.

Do not select a hydraulic-analysis package just because it contains “hydraulic” in its name. It may solve pipe networks, civil-water systems, or coastal risk maps and not terrain sediment transport.

### Rendering and derived map utilities

- `three` only for a future optional 3D rectangular-terrain rendering view; not for globe simulation.
- Canvas/SVG for the default 2D view. Geographic projection packages are reference-only.
- `topojson-client` for serialized geographic topology.
- Canvas 2D is sufficient for the existing prototype and is likely the least-complex visual front end for an initial tectonic prototype.

### Package-selection matrix

The spherical rows below are reference-only and should not be selected for the current rectangular-grid scope.

| Need | Strong first evaluation | Alternate/minimal option | Main caution |
|---|---|---|---|
| Planar Voronoi + dual | `d3-delaunay` | `delaunator` + custom dual traversal | no sphere/wrap |
| Spherical Voronoi/Delaunay | out of scope | direct spherical assignment | do not use for rectangular maps |
| Existing prototype triangulation | `delaunator@4.0.1` | upgrade to `5.1.0` only with compatibility review | version/API and package output format |
| Simplex noise | `simplex-noise@2.4.0` or `@4.0.3 + alea` | custom Simplex/OpenSimplex implementation | major output/API differences |
| Seeded randomness | `seedrandom` or `alea` | `mulberry32` custom | persist algorithm version |
| Plane nearest site | `d3-delaunay.find()` or `kdbush` | direct O(N×S) scan | use rectangular or optional wrap-aware distance, not great-circle distance |
| Rectangular vector math | small 2D `Float64Array` routines | `gl-matrix` vec2 | keep simulation coordinates separate from rendering |
| Icosphere/Fibonacci mesh | out of scope | rectangular grid or planar mesh | do not generate or simulate a globe |
| Hex Earth grid | out of scope | rectangular 4/8-neighbor or planar triangular cells | Earth-specific and unsuitable for the rectangle |
| Half-edge Three.js mesh | `@sherifmagdy/three-mesh-halfedge` or `three-mesh-halfedge` | custom compact flat structure + Delaunator arrays | package compatibility/maintenance |
| Half-edge planar prototype | Delaunator flat arrays | custom arrays/objects | no mutation/topology splitting yet |
| Robust custom triangulation | `robust-predicates` | rely on Delaunator internals | no need unless replacing triangulator |
| Plate polygon clipping | `polygon-clipping`/`martinez-polygon-clipping` only as planar research | custom split boundary records | planar clipping is not sphere-safe |
| Isostasy/erosion/aging | direct JS implementation | mesh/grid neighborhood helpers | no complete domain package found |
| Diffusion smoothing | direct typed-array passes | custom weighted mesh average | preserve geological masks |

### Suggested dependency sequence

1. **Prototype:** keep the existing `simplex-noise@2.4.0` and `delaunator@4.0.1`, use a fixed rectangular grid and seeded PRNG, and implement 2D plate state and boundary passes without extra packages.
2. **Planar Voronoi:** add or evaluate `d3-delaunay` for a nearest-site lookup and rectangle-clipped regions only if planar mesh boundaries are needed. Benchmark against direct rectangular Euclidean assignment.
3. **Mesh evolution:** add a planar half-edge structure or `Delaunator` traversal only when actual edge splitting/merging is required. Do not add an icosphere, spherical Voronoi, H3, or globe mesh.
4. **Domain detail:** add modern `simplex-noise` + a seeded PRNG or keep the existing pinned API. Add typed-array `kdbush`/RBush-style lookup only after profiling shows nearest-site assignment or boundary lookup is a bottleneck.
5. **Rendering:** use Canvas 2D for the initial result. Add Three.js only for a future optional 3D terrain view; keep the simulation state independent of rendering and do not generate a globe.

This sequence keeps the experimental core independent of rendering libraries, Earth geodesy packages, spherical topology, and map-projection conventions while supporting a rectangular map of one or two continents.
