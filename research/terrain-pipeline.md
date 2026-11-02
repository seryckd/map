## Terrain Pipeline

### Stage 1: Macro Shape
  Tectonic/Plate Simulation or Low-Frequency Noise
  Establishes major continents, ocean basins, and massive mountain chains.

  1. Cellular Partioning
     __Action__: Scatter random seed points across your map space or 3D sphere.
     __Algorithm__: Generate a Voronoi diagram (and optionally run Lloyd’s Relaxation to prevent jagged, splintered shapes) to divide the surface into discrete polygons.
     __Result__: You now have a grid of distinct tectonic plates, each with defined borders and center points.

  2. Crust Classification
     __Action__: Assign a geological type to each plate.
     __Algorithm__: Designate plates as either Continental (thick, buoyant granite) or Oceanic (thin, dense basalt). Apply a simplified isostatic formula based on crust thickness and density to establish baseline elevations.
     __Result__: Continental plates float high above the zero-line (forming dry plateaus), while oceanic plates sink deep below sea level (forming abyssal plains).

  3. Tectonic Kinematics & Boundary Collision
     __Action__: Simulate continental drift.
     __Algorithm__: Assign Euler velocity vectors to each plate, making them drift across the globe. Evaluate adjacent border cells to classify boundaries:
      - Convergent: Buckle edges upward into massive linear mountain chains or subduct oceanic crust into trenches.
      - Divergent: Sink boundaries to form rift valleys and ocean basins.
      - Transform: Apply jagged shear offsets.
    __Result__: Mechanically generated mountain ranges and fault lines that match real-world geophysics instead of looking random.

  4. Global Mathematical Masking
    __Action__: Control the macro distribution of land and water.
    __Algorithm__: Apply mathematical modifiers to the raw heightmap:
      - Exponential Bias: Raise values to a power (h^2 or h^3) to sharply separate shallow water from high land.
      - Radial Gradients: Multiply height values by a distance-from-center mask if you are generating isolated island continents surrounded by an infinite ocean.
    __Result__: A clean, intentional distribution of continents rather than a chaotic, evenly scattered noise field.

  5. Macro-Feature Blending (Ridged Noise & Shelves)
     __Action__: Add geological realism to the continental edges.
     __Algorithm__: 
      - Blend low-frequency Ridged Multifractal noise along continental margins to create jagged coastal ranges.
      - Carve shallow continental shelves around landmasses before plunging down into deep ocean trenches.
     __Result__: A finished macro heightmap featuring distinct landmasses, major mountain spines, continental shelves, and deep oceans—ready to be handed off to Stage 2 (Detail Pass with OpenSimplex Noise).

### Stage 2: Detail Pass
  Layered OpenSimplex Noise (FBM) + Domain Warping
  Adds ridges, cliffs, and organic surface complexity to the mountains.
### Stage 3: Weathering
  Hydraulic and thermal erosion
  Carves river valleys, carves sharp gullies, deposits sediment in low areas, and smooths out unstable cliffs via thermal sliding.
### Stage 4: Texturing (splatmapping)
  Slope & Altitude Analysis.
  Automatically paints textures—grass in flat valleys, rock on steep slopes, snow on high peaks—based on the final eroded data.
