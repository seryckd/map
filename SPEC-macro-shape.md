# Spec: Spherical Terrain Macro-Shape (`macro-shape`)

## Objective

Build a new standalone browser page that generates and displays Stage 1 of a
procedural terrain pipeline on an interactive spherical globe. The generator
creates large-scale landforms through five ordered steps: spherical plate
partitioning, crust classification, tectonic boundary effects, global
land/sea shaping, and continental shelves and ridges.

The audience is a map-generation experimenter exploring seeded procedural
worlds. Stage 1 keeps spherical per-cell terrain and plate data in memory so
future stages can work on selected rectangular regions. Those later stages
and region extraction are not part of this work.

## Tech Stack

- Standalone HTML, CSS, and vanilla JavaScript.
- Three.js loaded as a version-pinned CDN dependency for interactive 3D globe
  rendering.
- No package manager, server-side component, or persistent storage is required.

## Commands

- Serve locally: `python3 -m http.server 8000`
- Open the page: `http://localhost:8000/src/tectonic-globe.html`
- Build, test, and lint: no corresponding commands are currently configured.

## Project Structure

- `src/tectonic-globe.html` — new standalone Stage 1 generator and globe viewer.
- `research/terrain-pipeline.md` — source research for the five terrain steps.
- `CAPABILITY-MAP.md` — initiative scope and capability dependencies.
- `SPEC-macro-shape.md` — this module's requirements.

The existing `src/redblob.html` is not to be modified for this capability.

## Code Style

Follow the project's existing browser JavaScript style: descriptive
`camelCase` names, `const` for stable references, small named functions, and
standard browser APIs. For example, the current generator uses:

```js
function nextHalfedge(edge) {
  return edge % 3 === 2 ? edge - 2 : edge + 1;
}
```

Keep the new page standalone and avoid introducing a framework or dependencies
beyond the approved Three.js rendering dependency.

## Functional Requirements

1. **Spherical plate partitioning:** Generate a global partition of the sphere
   into discrete plates, with each cell associated with a plate. Optional
   relaxation may be used to improve the partition.
2. **Crust classification:** Assign continental or oceanic crust to plates and
   use crust properties to establish baseline elevation, producing elevated
   continental regions and deeper ocean basins.
3. **Tectonic boundaries:** Assign plate motion on the sphere and classify
   neighboring plate boundaries as convergent, divergent, or transform.
   Boundary effects contribute mountain uplift, trenches, rifts, or shear
   features as appropriate to the adjacent crust and motion.
4. **Global shaping:** Provide control over the global land/sea distribution
   without applying a center-focused radial island mask. Shaping must operate
   consistently over the spherical domain.
5. **Macro-feature blending:** Add low-frequency ridged features around
   continental margins and shallow shelves transitioning toward deeper ocean.
6. **Globe interaction:** Display generated terrain on a Three.js globe that
   the user can rotate and zoom.
7. **Reproducibility and data:** Generation from the same seed and settings
   yields the same terrain. Keep per-cell spherical location, elevation, and
   plate association available in memory for future region-based processing.
   File export and later-stage region processing are excluded.

The five steps execute in order as one Stage 1 generation workflow. The viewer
does not need to expose each step as a separate user-operated wizard page.

## Testing Strategy

There is no test framework or browser automation configured in the project.
For this capability:

- Manually load the page in a browser and confirm the globe renders, rotates,
  and zooms.
- Check that all five generation steps complete and that the displayed globe
  includes distinct continental and oceanic regions and visible tectonic-scale
  features.
- Generate twice with the same seed and settings and compare terrain data;
  change the seed and confirm the generated terrain changes.
- Inspect cells at multiple longitudes and latitudes, including across the
  longitude seam and near the poles, to check spherical continuity and
  availability of the in-memory per-cell data.

Do not claim automated test, build, or lint coverage unless a corresponding
tool is added and run.

## Boundaries

- **Always:** Keep this capability isolated from `src/redblob.html`; preserve
  deterministic generation; keep terrain data associated with spherical
  coordinates; surface library-loading or generation errors to the user.
- **Ask first:** Add dependencies beyond the approved Three.js CDN dependency;
  add a test/build toolchain; change the spherical domain or the five-step
  scope; introduce persistent storage or a data-export format.
- **Never:** Implement the later detail, weathering, or texturing stages as
  part of this Stage 1 scope; replace the spherical domain with a planar map;
  commit secrets.

## Success Criteria

- The new standalone page loads from a local HTTP server and displays a
  rotatable, zoomable spherical globe.
- A seeded generation runs the five Stage 1 steps in their specified order and
  produces both continental and oceanic terrain.
- Plate boundaries produce elevation features corresponding to convergent,
  divergent, and transform classifications.
- Global land/sea shaping does not force land toward the center of the sphere
  and has no longitude-seam or pole-specific discontinuity.
- The same seed and settings reproduce the same per-cell terrain data; a
  different seed can produce a different world.
- Spherical cell locations, elevations, and plate associations remain
  available in memory for future region selection.
- No later pipeline stage, region extraction UI, or export feature is included.

## Open Questions

- None blocking specification approval. Exact generation parameters and
  implementation algorithms should be selected during planning while
  preserving these functional requirements.
