# Tasks: Spherical Terrain Macro-Shape

## Task 1: Create a standalone interactive globe and seeded cell mesh

**Status:** Complete; verified in headless Chromium with Playwright.

**Description:** Add the new standalone page with a version-pinned Three.js
scene, orbit/zoom controls, a deterministic seed control, and an icosphere
terrain mesh whose triangular faces have spherical cell records and neighbor
relationships. Keep the existing map page unchanged.

**Acceptance criteria:**
- [x] `src/tectonic-globe.html` loads via the documented local HTTP server and
  displays a globe that can be rotated and zoomed.
- [x] Icosphere faces are represented by stable spherical cell locations and
  neighbor relationships, including at the poles and across the seam.
- [x] Seeded regeneration is deterministic, and initialization failures are
  communicated in the page.

**Verification:**
- [x] Run `python3 -m http.server 8000` and open
  `http://localhost:8000/src/tectonic-globe.html`.
- [x] Use Playwright to rotate and zoom the globe; confirm the rendered canvas
  changes.
- [x] Regenerate through the seed control and confirm the new seed and cell
  count appear; verify deterministic mesh locations with Node unit tests.
- [x] Confirm WebGL rendering and inspect a browser screenshot.

Playwright reported Chromium/OpenGL `GPU stall due to ReadPixels` performance
warnings during headless rendering; no page JavaScript errors were observed.

**Dependencies:** None

**Files likely touched:**
- `src/tectonic-globe.html`
- `src/tectonic-globe.mjs`
- `src/tectonic-globe-core.mjs`
- `src/tectonic-globe.test.mjs`

**Estimated scope:** Medium

## Task 2: Generate spherical plates and baseline crust elevation

**Description:** Assign seeded spherical plate centers and plate identifiers
to terrain cells, classify plates as continental or oceanic, and compute
baseline elevation from simplified crust properties. Add a continental
proportion control and preserve the resulting data in each cell record.

**Acceptance criteria:**
- [ ] Cells are assigned to a plate by spherical nearest-seed distance and
  adjacent cells expose plate boundaries.
- [ ] Continental and oceanic plates have distinct baseline elevation and
  crust metadata.
- [ ] A fixed seed and settings reproduce plate assignments and baseline
  elevations; changing the seed changes the generated world.

**Verification:**
- [ ] Use the browser to inspect plate assignments and confirm both crust
  classes are present.
- [ ] Compare the in-memory plate and elevation data across repeated seeded
  generations.

**Dependencies:** Task 1

**Files likely touched:**
- `src/tectonic-globe.html`

**Estimated scope:** Medium

## Checkpoint: Foundation

- [ ] Tasks 1-2 acceptance criteria pass through browser inspection.
- [ ] Confirm the per-cell data and adjacency support the next boundary stage.

## Task 3: Classify moving plate boundaries and apply tectonic relief

**Description:** Assign deterministic spherical rotation vectors to plates,
derive relative motion at adjacent plate boundaries, classify each boundary
as convergent, divergent, or transform, and apply corresponding bounded
uplift, trench, rift, or shear relief.

**Acceptance criteria:**
- [ ] Inter-plate boundaries receive one of the three required classifications
  based on relative tangential motion.
- [ ] Classified boundaries affect nearby cell elevations with distinct,
  bounded tectonic relief.
- [ ] Boundary classification and resulting elevations are deterministic for
  a fixed seed and settings.

**Verification:**
- [ ] Inspect generated boundary metadata and confirm all classes can be
  produced across representative seeds.
- [ ] Visually inspect uplift, trench, and rift effects on the globe.
- [ ] Repeat generation with an unchanged seed and compare classifications and
  elevations.

**Dependencies:** Task 2

**Files likely touched:**
- `src/tectonic-globe.html`

**Estimated scope:** Medium

## Task 4: Add spherical global shaping, shelves, and ridges

**Description:** Add global elevation/sea-level bias control and shape the
baseline plus tectonic relief into a useful land/sea distribution. Blend
continental shelves and deterministic low-frequency ridged features using
spherical sampling; do not apply a center-focused mask.

**Acceptance criteria:**
- [ ] Users can adjust the global land/sea distribution without introducing a
  radial island mask.
- [ ] Continental margins transition through shallow shelves toward deeper
  ocean; low-frequency ridged features contribute macro relief.
- [ ] Sampling and output remain continuous across the longitude seam and
  near the poles.

**Verification:**
- [ ] Adjust the global bias and continental proportion; confirm the coastline
  and sea/land balance respond.
- [ ] Inspect margin shelves and ridge features visually.
- [ ] Compare neighboring cells around the seam and near the poles for
  discontinuities.

**Dependencies:** Task 3

**Files likely touched:**
- `src/tectonic-globe.html`

**Estimated scope:** Medium

## Checkpoint: Terrain pipeline

- [ ] Tasks 3-4 acceptance criteria pass through browser inspection.
- [ ] Repeated generations with identical controls reproduce per-cell terrain.

## Task 5: Add terrain inspection views and verify Stage 1 end to end

**Description:** Add view controls to inspect terrain, plate ownership, and
boundary classes, then run the full Stage 1 browser acceptance pass and make
only in-scope fixes.

**Acceptance criteria:**
- [ ] Terrain, plate, and tectonic-boundary views can be selected to inspect
  generated data.
- [ ] All five Stage 1 steps run in order and their outputs are represented in
  the in-memory spherical cell records.
- [ ] All Stage 1 spec success criteria pass without changing
  `src/redblob.html` or implementing later stages.

**Verification:**
- [ ] Open the page through `python3 -m http.server 8000` and complete the
  interaction, determinism, crust, boundary, distribution, seam, and pole
  checks from `SPEC-macro-shape.md`.
- [ ] Confirm library-loading and generation errors are shown in the page.
- [ ] Review `git diff` to confirm only scoped files changed.

**Dependencies:** Task 4

**Files likely touched:**
- `src/tectonic-globe.html`

**Estimated scope:** Small
