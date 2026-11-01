# Rectangular Macro-Tectonic Viewer Implementation

## Purpose

This document specifies an initial browser implementation for a rectangular tectonic simulation and its stepped visualizer. The implementation follows [macro-research.md](./macro-research.md) while intentionally using the smallest useful grid, Canvas 2D architecture, and a fixed plate partition.

The implementation is a macro-scale visual model, not a calibrated geophysical solver. Configured amplitudes and units are illustrative tuning values and must be labelled in the UI.

## Scope and defaults

- Canvas and simulation dimensions: `900 × 700` cells.
- Representation: fixed rectangular grid; 4-neighbor adjacency.
- Number of plates: `12`.
- Initial continent setup: `1` or `2` seeded elliptical continental regions, with all remaining cells oceanic.
- Plate partition: direct nearest-seed Euclidean assignment plus 4 Lloyd relaxations.
- Plate membership: fixed during the prototype. Plate velocities may change boundary classifications and elevations, but they do not move cells between plates.
- Horizontal wrapping: disabled by default.
- Vertical wrapping: disabled.
- Rendering: Canvas 2D at native simulation resolution, initially showing elevation plus a selectable overlay.
- Dependencies: no packages are required for the core implementation. Use one existing seedable 2D noise implementation only if later detail is needed.

## Main configuration

The UI should expose these settings, grouped in a control panel. Configuration changes take effect on **Reset/Regenerate**, except for display-only options, unless otherwise noted.

### Simulation and display

| Key | Default | Suggested range | Purpose |
|---|---:|---:|---|
| `width` | `900` | `128–1200` | Horizontal grid cell count. |
| `height` | `700` | `128–900` | Vertical grid cell count. |
| `seed` | generated/string | any string | Deterministic PRNG and noise seed. |
| `plateCount` | `12` | `4–32` | Number of tectonic plates. |
| `lloydIterations` | `4` | `0–10` | Evens plate regions before simulation. |
| `timeStep` | `1.0` | `0.1–5` | Arbitrary model-time units per full simulation step. |
| `autoStepMs` | `500` | `100–3000` | Delay used by auto-advance mode. |
| `horizontalWrap` | `false` | checkbox | Reserved; keep disabled for this prototype. |

### Initial crust

| Key | Default | Suggested range | Purpose |
|---|---:|---:|---|
| `continentCount` | `1` | `1–2` | Number of generated continental masks. |
| `continentalRadiusX` | `165` | `40–300` | Horizontal radius for initial continents. |
| `continentalRadiusY` | `115` | `40–260` | Vertical radius. |
| `continentBlend` | `0.12` | `0–0.3` | Noise edge roughness. |
| `continentalThickness` | `35` | `20–50` | Arbitrary crust-height units. |
| `oceanicThickness` | `7` | `4–12` | Arbitrary crust-height units. |
| `continentalDensity` | `2.7` | `2.5–2.9` | Relative crust density. |
| `oceanicDensity` | `3.0` | `2.8–3.4` | Relative crust density. |
| `mantleDensity` | `3.3` | `3.2–3.4` | Reference mantle density. |

### Kinematics and boundaries

| Key | Default | Suggested range | Purpose |
|---|---:|---:|---|
| `velocityRange` | `1.0` | `0.1–3.0` | Maximum arbitrary speed of a plate. |
| `optionalPlateRotation` | `false` | checkbox | Start with constant 2D plate vectors. |
| `normalThreshold` | `0.12` | `0–0.5` | Minimum normal relative velocity for convergence/divergence. |
| `tangentThreshold` | `0.12` | `0–0.5` | Minimum tangential relative velocity for transform classification. |
| `boundaryInfluenceRadius` | `8` | `1–30` | Distance over which boundary effects decay. |
| `upliftScale` | `0.8` | `0–3` | Added continental or collision uplift per step. |
| `trenchScale` | `1.0` | `0–3` | Trench lowering per step. |
| `volcanicArcScale` | `0.45` | `0–2` | Volcanic island/arc uplift per step. |
| `transformNoiseScale` | `0.08` | `0–0.4` | Minor transform shear elevation noise. |

### Crust aging and post-processing

| Key | Default | Suggested range | Purpose |
|---|---:|---:|---|
| `thermalSubsidenceScale` | `0.35` | `0–1.5` | Age-dependent oceanic depth increase. |
| `isostasyFactor` | `0.4` | `0.1–1.0` | Surface response to thickness/density deviation. |
| `diffusionRate` | `0.08` | `0–0.25` | Height diffusion coefficient per pass. |
| `diffusionIterations` | `3` | `0–12` | Number of ping-pong Laplacian passes. |
| `talusThreshold` | `0.02` | `0–0.25` | Minimum slope for thermal relaxation. |
| `talusTransferRate` | `0.12` | `0–0.5` | Fraction transferred across a steep edge. |
| `talusIterations` | `2` | `0–10` | Number of local slope-relaxation passes. |
| `domainWarpAmplitude` | `0` initially | `0–30` | Visual coordinate/elevation warp amount. Keep zero initially. |
| `domainWarpFrequency` | `0.015` | `0.005–0.05` | Low-frequency noise coordinate scale. |

All ranges are UI guards, not physical claims. Reset invalid values to defaults and preserve the complete configuration in snapshots.

## Simulation state

Use typed arrays for large per-cell fields and plain objects for plates and boundaries.

### Plate record

```js
{
  id: 0,
  seed: [x, y],
  velocity: [vx, vy],
  center: [cx, cy],
  type: "mixed",
  cellCount: 0
}
```

### Per-cell arrays, each length `width * height`

```text
plateId      Uint32Array
crustType    Uint8Array     // 0 oceanic, 1 continental
thickness    Float32Array
baseDensity  Float32Array
age          Float32Array
createdAt    Float32Array
baseHeight   Float32Array   // crust/isostasy result before boundary effects
height       Float32Array   // displayed macro elevation
boundaryMask Uint8Array     // convergent/divergent/transform or none
```

Keep `baseHeight` and `height` separate so the renderer can compare tectonic crust state with post-processing effects if desired.

### Boundary record

```js
{
  a: 12345,
  b: 12346,
  plateA: 0,
  plateB: 1,
  normal: [nx, ny],
  tangent: [tx, ty],
  relativeNormal: 0.5,
  relativeTangential: 0.1,
  type: "divergent",
  crustA: 0,
  crustB: 1
}
```

Each boundary segment is a right-facing grid edge between two adjacent cells. Use one record per 4-neighbor boundary pair to avoid duplicate edges. Cache the list while plate membership and geometry are unchanged.

## Module structure

Create a standalone page such as `src/tectonic.html`, with the core logic separated into functions or classes where practical:

```text
tectonic.html
── configuration and controls
── deterministic PRNG / noise helpers
── PlatePartitioner
── PlateKinematics
── BoundaryProcessor
── CrustModel
── SurfacePostProcessor
── TectonicView
── validation and diagnostics
```

### PlatePartitioner

Responsibilities:

1. Generate plate seeds with a string-seeded PRNG and rejection sampling against seed clustering.
2. Assign every cell to its nearest seed using `dx² + dy²`.
3. Run bounded Lloyd relaxation:
   - assign cells,
   - compute the centroid of each plate,
   - move each seed to its centroid,
   - reassign cells.
4. Skip Lloyd updates for empty plates and record a warning if one remains.
5. Derive plate centers and cell counts.
6. Extract boundary segments and expose them as renderer and diagnostic data.

For a full-size `900 × 700` grid, a direct `630000 × 12 × 4` assignment pass may be acceptable for prototypes but should be visually profiled. No spatial index or package is needed initially.

### Initial crust generation

1. Select one or two elliptical continental locations using the seeded PRNG.
2. Set `crustType = continental` where ellipse distance plus low-frequency noise is below a threshold.
3. Initialize continental cells with the configured thickness, density, and age `0`.
4. Initialize ocean cells with thin crust, higher density, and a seeded oceanic age between `0` and `100` model-time units.
5. Seed `height` with a base continental/oceanic elevation, then add optional low-frequency detail.
6. Apply one pass of isostasy before the first simulation step.

Reasonable initial height formula:

```js
baseHeight =
  0.02 * (thickness - referenceThickness) -
  0.08 * (density - mantleDensity);
```

This is normalized model elevation and must not be presented as metres.

### PlateKinematics

Assign each plate a constant `Float64Array` or two-element velocity in model-cell units:

```text
velocityX = randomBetween(-velocityRange, velocityRange)
velocityY = randomBetween(-velocityRange, velocityRange)
```

Keep a zero-velocity mode for debugging and supply a small `zeroPlateId` test by setting one or both plate vectors manually through the browser console.

Optional planar rotation can be added behind the `optionalPlateRotation` flag, using the plate center and a small angle. It is not Euler-pole physics.

For a boundary, use the midpoint cell normal. In 4-neighbor grid terms, use either a vertical or horizontal outward segment normal. The relative velocity is:

```text
relative = velocityA - velocityB
relativeNormal = dot(relative, normalTowardB)
relativeTangential = dot(relative, tangent)
```

Choose one consistent normal direction at boundary extraction and retain the sign convention for classification and effects.

### BoundaryProcessor

Classify each boundary before mutation:

```text
if relativeNormal > normalThreshold: divergent
else if relativeNormal < -normalThreshold: convergent
else if abs(relativeTangential) > tangentThreshold: transform
else: inactive
```

Oblique boundaries retain the dominant type in this prototype; expose the raw normal and tangential values in the inspector.

For every boundary segment, apply effects into a snapshot buffer rather than directly mutating the current height array.

#### Convergence

- Identify oceanic and continental participants.
- If one side is oceanic and one side continental, reduce oceanic-side height in a narrow trench and raise continental-side height with the configured uplift and radius.
- If both are continental, uplift both sides symmetrically.
- If both are oceanic, choose the side with higher density/age as the subducting side, lower it as a trench, and raise a narrow volcanic strip on the overriding side.
- Compression should preserve crust type and increase continental thickness for collision-adjacent cells.

#### Divergence

- Lower local elevation in the boundary band.
- Convert a small boundary-adjacent band of ocean-only cells to new oceanic crust with age `0`.
- Preserve continental crust; divergent continental boundaries should become a lower rift band rather than immediately creating new ocean crust.

Because grid membership is fixed, new oceanic crust must be created only where the boundary processor is permitted to mutate crust directly. Do not move or redistribute plate cells.

#### Transform

- Add bounded deterministic noise proportional to `transformNoiseScale`.
- Apply a small lateral shear artifact along the segment.
- Preserve crust types; do not create uplift or a trench solely from zero normal motion.

### CrustModel

Apply in this order:

1. Age oceanic crust: `age += timeStep`.
2. Increase oceanic density toward a configurable aging limit.
3. Apply normalized subsidence:
   ```js
   depth = thermalSubsidenceScale * Math.sqrt(age)
   density += thermalSubsidenceScale * age * 0.002
   ```
4. Recalculate `baseHeight` from thickness and density:
   ```js
   baseHeight =
     referenceHeight +
     isostasyFactor * 0.1 * (thickness - referenceThickness) -
     isostasyFactor * 0.12 * (density - mantleDensity);
   ```
5. Add the accumulated boundary delta.

The equations are intentionally normalized. Add an explanatory UI label that values are arbitrary model units and not metres/Ma.

### SurfacePostProcessor

Run separately and snapshot-safe:

1. **Diffusion:** use an old/new Float32Array ping-pong pair. For each interior cell, average 4 neighbors and add `diffusionRate * (neighborAverage - center)`.
2. **Thermal relaxation:** optionally transfer a fraction of excess height between each pair whose difference exceeds `talusThreshold`.
3. **Domain warp:** add low-frequency noise only to a cached warp/elevation overlay field. Do not reassign plate cells by warped coordinates. When `domainWarpAmplitude = 0`, skip this pass.
4. Clamp all height values to a configured safe display range, for example `[-3, 6]`, while retaining overflow diagnostics.

Do not thermal-relax ocean cells across every step by default. Provide a boundary mask and skip smoothing up to one cell on convergent/divergent bands if blocky boundaries must be retained.

## Stepped UI pipeline

The simulation should be driven by named phases rather than one opaque `advance()` call:

```text
0  Partition Plate Seeds
1  Assign Plate Regions
2  Lloyd Relaxation
3  Initialize Crust
4  Plate Kinematics
5  Detect Boundaries
6  Classify Boundaries
7  Process Boundary Effects
8  Age and Isostasy
9  Smooth and Warp
10 Complete / Next Step
```

For prototype simplicity, initialization phases `0–3` run together on reset. A full simulation advance then exposes phases `4–10`.

### Click-step behavior

- `Next Step` executes one pipeline phase and draws immediately.
- The phase indicator lists the current/next phase and an explanation panel.
- `Back` is unnecessary because mutations are not reversible. Provide `Reset` and `Previous Snapshot` only if snapshots are implemented.
- Keep the phase paused for the user until **Next Step** is pressed.
- A single `Run Simulation Step` button executes phases `4–9` as one transaction after phase `3`, for convenience.

### Auto-advance behavior

- `Auto Advance` toggles a timer.
- Each timer tick calls one full simulation cycle, not necessarily a named phase, to prevent the UI from spending the whole interval inside intermediate buffers.
- If phase-by-phase mode is enabled, the timer advances exactly one named phase.
- `Step interval` is the configurable `autoStepMs` value.
- Disable auto-advance while reset/regenerate is running.
- `Pause` preserves the phase and timer state.

## Canvas rendering

The canvas element should be:

```html
<canvas id="map" width="900" height="700"></canvas>
```

Fit it responsively to its container, but set backing-store dimensions exactly to the grid dimensions. Render at native resolution and scale CSS dimensions with `object-fit`/`width: 100%` behavior.

### Render layers

Use a radio button or select to choose one primary layer:

- `Elevation`: deep ocean, shallow ocean, lowland, upland, mountain, snow.
- `Plates`: one color per plate ID.
- `Crust`: oceanic vs continental.
- `Oceanic Age`: low `age` to high `age` gradient.
- `Boundary Type`: convergent red, divergent blue, transform yellow, inactive gray.
- `Velocity`: optional arrows at coarse sampled intervals.

Boundary records and plate region outlines should be overlays configurable independently:

- plate boundaries: 1 CSS pixel,
- coastline: computed where continental crust and oceanic crust meet, 1–2 pixels,
- velocity arrows: sampled every 25–35 cells,
- plate seed marker: small dot and plate ID.

### Elevation palette

A simple normalized palette:

```text
height < -1.5  #173a66
height < -0.5  #356da3
height <  0.0  #82b4d1
height <  0.5  #c9b889
height <  1.5  #78996a
height <  3.0  #9a8f78
else           #d9d9d4
```

Plate IDs and direction vectors must remain legible if elevation rendering is switched off.

### Hover inspector

Hovering the canvas should report:

```text
cell x/y
plate ID
plate velocity
crust type
thickness/density
age
height/baseHeight
neighbor boundary type
```

Canvas coordinates should be converted from pointer CSS coordinates to backing-grid coordinates using the canvas bounding rectangle.

## Controls

### Default control layout

```text
Simulation
  Seed
  Reset/Generate
  Next Phase
  Run Simulation Step
  Auto Advance
  Auto interval

Parameters
  Plate Count
  Lloyd Iterations
  Velocity Range
  Boundary Thresholds
  Boundary Influence
  Uplift / Trench / Arc
  Isostasy / Subsidence
  Diffusion / Relaxation
  Domain Warp

View
  Elevation / Plates / Crust / Age / Boundaries
  Toggle Plate Seeds
  Toggle Velocity Arrows
  Toggle Boundary Overlay
```

Parameter changes can update labels and pending config immediately. A generated model should remain unchanged until `Reset/Generate` is pressed, preventing surprise mutations while tuning.

## Determinism

Create two PRNG streams from the same seed:

```text
modelSeed  // plates, continents, initial crust, plate velocities
noiseSeed  // transform noise, warp, initial detail
```

Hash the user seed with FNV-1a or a similar simple function and implement a versioned PRNG such as Mulberry32. Record the PRNG algorithm name and implementation version in the snapshot.

Do not derive simulation result directly from `Math.random()`.

A reset with the same seed and configuration should create identical arrays and plate boundaries. A snapshot should contain:

```js
{
  formatVersion: 1,
  grid: { width: 900, height: 700 },
  config,
  step,
  phase,
  seed,
  plateIds: [...],
  plateRecords: [...],
  crustType: [...],
  thickness: [...],
  density: [...],
  age: [...],
  height: [...]
}
```

Do not add an undo feature unless snapshot storage is bounded in memory. At `900 × 700`, one typed-array snapshot is roughly several megabytes; maintain only a configurable history depth such as 4–10.

## Diagnostics

Display these values after reset and each full step:

- current step and phase,
- plate count and cell count per plate,
- average and median plate area,
- plate count with fewer than 1% of cells,
- boundary segment counts by type,
- percentage of grid sides that are boundaries,
- continental/oceanic cell percentages,
- mean, minimum, and maximum height,
- uplift/trench/arc volume proxies,
- oceanic area and mean age,
- largest immediate height change from a step.

Useful invariants to validate before each render:

- every cell has a plate ID in `[0, plateCount)`;
- every plate seed has finite coordinates inside the map;
- every boundary plate/cell ID exists;
- all typed-array values are finite;
- oceanic age is never negative;
- crust type is either oceanic or continental;
- diffusion uses the old and new buffers only in their proper update direction;
- the sum of plate cell counts equals `width * height`;
- maximum and minimum elevation remain within configured clamp bounds or trigger a warning.

## Testing

Start with small deterministic maps rather than testing only at `900 × 700`.

1. **Grid invariants:** test `32 × 32`; verify plate coverage and cell counts sum correctly.
2. **One-plate case:** verify no boundary segments and unchanged partition.
3. **Two opposite plates:** verify each boundary segment is detected exactly once.
4. **Convergent classification:** construct two fixed velocity vectors and assert normal motion below zero.
5. **Divergent classification:** construct separating vectors and assert positive normal motion.
6. **Transform classification:** construct equal opposite tangential vectors and assert transform dominance.
7. **Ocean–continent convergence:** verify the ocean side loses height and the continent side gains height.
8. **Continental collision:** verify uplift on both sides of the boundary.
9. **Oceanic aging:** verify age and depth increase monotonically.
10. **Diffusion:** verify finite output and ping-pong buffers preserve no partial-update state.
11. **Replay:** identical seed/config produce identical boundary types, heights, and ages.
12. **Large-grid smoke test:** run reset plus three steps on `900 × 700`; record frame and step duration.

## Implementation sequence

1. Create `src/tectonic.html` with Canvas 2D, sidebar controls, diagnostics, and `900 × 700` backing dimensions.
2. Implement typed-array state and seeded plate generation.
3. Implement nearest-seed assignment and Lloyd relaxation.
4. Initialize the crust and one/two continent masks.
5. Add boundary detection and inspectable boundary records.
6. Implement relative velocity classification.
7. Implement snapshot-based convergence/divergence/transform effects.
8. Add aging, subsidence, and isostasy.
9. Add diffusion and optional small-iteration thermal relaxation.
10. Add elevation, plate, crust, age, and boundary rendering modes.
11. Add click-step and auto-advance modes.
12. Profile and optimize only the expensive loops found during large-grid testing.

This sequence leaves plate topology fixed and delivers the requested viewable macro-tectonic model without Voronoi packages, mesh evolution, sphere math, or 3D rendering. Plate membership changes and advanced boundary splitting should be follow-up features, not hidden behavior in the first implementation.
