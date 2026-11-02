# Project Context

## What this project is

`map` is a selection of procedural map generation experiments using brower-based JavaScript.

## Stack and commands

- Plain HTML, CSS, and JavaScript; there is no package manifest or build system.
- `src/redblob.html` loads Simplex Noise and Delaunator from pinned CDN URLs.

## Conventions

- Keep changes focused and follow the existing vanilla JavaScript style in
  `src/redblob.html`; avoid adding frameworks or dependencies without need.
- Preserve the standalone-page workflow unless a task explicitly changes it.
- Keep generated map behavior deterministic for a given seed where applicable.
- Update the relevant project documentation when a change makes it inaccurate.

## Boundaries

- Do not overwrite or discard unrelated working-tree changes.
- Do not add secrets or local environment files to the repository.
- Do not claim tests or build checks passed when no such commands are configured.
