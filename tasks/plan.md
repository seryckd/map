# Implementation Plan: Spherical Terrain Macro-Shape

## Overview

Implement the approved `macro-shape` capability as a new standalone page at
`src/tectonic-globe.html`. A deterministic spherical mesh provides terrain
cells and their adjacency. Seeded plate properties and motion produce baseline
elevation and tectonic boundary effects; global shaping and margin features
refine that elevation before rendering it on an interactive Three.js globe.
The existing `src/redblob.html` remains untouched, and later pipeline stages
are out of scope.

## Architecture Decisions

- **Use an icosphere triangle mesh as terrain cells.** Each triangular face
  represents one cell at its normalized spherical centroid. Shared mesh edges
  define neighboring cells and avoid implementing a separate spherical
  polygon/Voronoi library. Plate membership is assigned by nearest plate seed
  under spherical angular distance, yielding an approximate spherical Voronoi
  partition.
- **Keep computation and presentation in one standalone page.** Use a
  version-pinned Three.js ES module and its matching `OrbitControls` addon from
  the same CDN/version. No package or build system is introduced.
- **Represent plate movement with spherical rotation vectors.** Relative
  tangential velocity across each inter-plate boundary determines convergent,
  divergent, or transform classification. Apply bounded, simplified
  elevation modifiers rather than claiming geophysical accuracy.
- **Make all procedural choices deterministic.** Use a seeded PRNG for plate
  placement, crust type, rotation vectors, and feature parameters. Use
  spherical-coordinate sampling for coherent ridge noise to avoid longitude
  seams and polar singularities.
- **Expose the land/sea distribution as user controls.** Provide a continental
  plate proportion control and a global elevation/sea-level bias. Apply global
  shaping uniformly on the sphere; do not use a center-based radial mask.
- **Keep spherical cell records in memory.** Each cell retains its unit
  position, elevation, plate identifier, crust type, and boundary metadata
  needed by future region-selection work. No export or region-selection UI is
  included.
- **Use visual layers for inspection.** Provide terrain, plate, and boundary
  views to make the required simulation stages observable without adding
  separate wizard screens.

## Task List

### Phase 1: Interactive spherical foundation

- [ ] Task 1: Create a standalone interactive globe and seeded cell mesh
- [ ] Task 2: Generate spherical plates and baseline crust elevation

### Checkpoint: Foundation

- [ ] The standalone page loads from a local HTTP server.
- [ ] The globe rotates and zooms; the cell mesh is visible across poles and
  the longitude seam.
- [ ] Plate and crust generation is repeatable for a fixed seed and renders
  both continental and oceanic regions.
- [ ] Review the in-memory cell and adjacency representation before proceeding.

### Phase 2: Tectonic macro relief

- [ ] Task 3: Classify moving plate boundaries and apply tectonic relief
- [ ] Task 4: Add spherical global shaping, shelves, and ridges

### Checkpoint: Terrain pipeline

- [ ] Convergent, divergent, and transform boundaries are classified and
  visible; elevation responds to those classes.
- [ ] Global land/sea controls, shelves, and ridges work without a radial
  center mask or spherical-coordinate discontinuities.
- [ ] Same seed and settings reproduce the same terrain data.

### Phase 3: Inspection and acceptance

- [ ] Task 5: Add terrain inspection views and verify Stage 1 end to end

### Checkpoint: Complete

- [ ] All spec success criteria are met in a browser.
- [ ] External-library and generation errors are visible to the user.
- [ ] Existing `src/redblob.html` and later pipeline stages remain untouched.
- [ ] Review the completed implementation before considering the capability
  ready.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| CDN or addon version mismatch / network unavailable | Globe fails to initialize | Pin matching module and addon versions; show a clear loading error; verify using the documented local HTTP server. |
| Mesh resolution causes slow generation or rendering | Poor interactive experience | Start with a moderate icosphere subdivision; measure browser responsiveness and adjust resolution without changing the cell-data contract. |
| Approximate plate dynamics may be mistaken for physical simulation | Misleading terrain behavior | Keep boundary rules intentionally simplified and deterministic; label the result as procedural rather than physically accurate. |
| Ridge noise or boundary calculations introduce seams or polar artifacts | Visible defects on the globe | Perform all sampling and boundary calculations in 3D spherical coordinates; manually inspect multiple longitudes and polar regions. |
| Several controls interact to produce all-land or all-ocean worlds | Terrain stages become hard to inspect | Constrain control ranges and verify both crust classes and coastline transitions across representative settings. |
| No automated test infrastructure exists | Regressions may escape manual review | Use explicit browser acceptance checks for determinism, boundary classes, globe controls, and spherical continuity; do not claim automated coverage. |

## Open Questions

- None. The spec leaves implementation parameters to planning; initial
  subdivision, plate count, and control defaults can be chosen conservatively
  and tuned during implementation.
