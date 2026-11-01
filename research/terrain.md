

## Ideas

### Hydraulic Erosion:
How it works: Simulates droplets of water falling onto the terrain, moving downhill based on gravity, picking up sediment, carrying it away, and depositing it where the slope flattens out.
Result: Carves out realistic river valleys, gullies, sediment fans, and canyons.


### Diamond-Square Algorithm (Random Midpoint Displacement):
How it works: Starts with a grid where the corners are seeded with height values. It alternates between a "diamond step" (averaging corner points to find the center and adding random displacement) and a "square step" (finding edge midpoints).   
Wikipedia
Pros/Cons: Historically very popular for island generation and heightmaps. However, raw Diamond-Square can suffer from noticeable grid-aligned artifacts (creases along the axes) unless modified.   
Wikipedia

### Fault Formation (Midpoint Displacements):
How it works: Randomly draws a line across the map and raises the elevation on one side while lowering it on the other. Repeating this thousands of years (iterations) creates dramatic, jagged fault lines and mountain ranges.

Midpoint displacement is 1D.
Diamond square is 2D.


### Thermal Erosion (Weathering):
How it works: Simulates rock crumbling due to gravity and weather. If the slope of a piece of terrain exceeds the "talus angle" (the maximum steepness a material can maintain), dirt and rock slide down to lower elevations.
Result: Smooths out overly sharp peaks and fills in steep cliffs, creating natural scree slopes.


### Plate Tectonic Simulators:
How it works: Simulates continental plates moving across a sphere, colliding (forming mountain ranges like the Himalayas via subduction/folding), pulling apart (forming ocean basins and rifts), and sliding past each other.
Result: Generates scientifically plausible global maps with realistic mountain chains, trenches, and island arcs.

Plate Initialization (Voronoi Diagrams):
The map is divided into a set of tectonic plates using a Voronoi diagram (cellular regions spreading out from random seed points).
Movement & Velocity:
Every plate is assigned a random velocity vector (a direction and speed it is drifting across the globe).

Interaction at Boundaries:
Where plates crash into each other (Convergent boundaries), the crust buckles upward, creating massive, linear mountain ranges (like the Himalayas or the Andes).
Where plates pull apart (Divergent boundaries), the crust thins and sinks, creating ocean basins, rift valleys, and mid-ocean ridges.
Where plates slide past each other (Transform boundaries), they create jagged, fractured fault lines (like the San Andreas Fault).

Smoothing and Aging:
Once the plates finish their movement phase, the raw collision data is smoothed out into a base heightmap.


### L-Systems (Lindenmayer Systems):
How it works: A string-rewriting grammar originally meant for botany, but heavily used to generate river networks, canyon structures, and road grids.

### Domain Warping:
How it works: Feeds the output of one noise function into the input coordinates of another noise function (e.g., evaluating Noise(coords+Noise(coords))).
Result: Twists and swirls the terrain, creating organic, fluid-like geological formations that look heavily weathered and complex.


### Layered Simplex or OpenSimplex Noise
Before erosion can do its work, you need a continental landmass. Developers avoid original Perlin noise or Diamond-Square in modern pipelines in favor of Simplex noise (or its unpatented cousin, OpenSimplex).
Why OpenSimplex/Simplex over Perlin? Traditional Perlin noise has noticeable grid-aligned artifacts (axis-aligned creases). Simplex noise uses a grid based on simplices (triangles/tetrahedrons), which eliminates visual grid artifacts, scales better to higher dimensions, and is computationally cheaper at higher resolutions.

### Fractal Layering (FBM): 
A single layer of noise just looks like blurry hills. To get realistic mountains, developers layer multiple "octaves" of noise using Fractal Brownian Motion (FBM):
Base Octave: Low frequency, high amplitude (creates massive continental shapes and broad mountain ranges).
Higher Octaves: High frequency, low amplitude (adds rugged bumps, ridges, and surface roughness).
Parameters: You control this with persistence (how fast high-frequency details shrink) and lacunarity (how fast frequency increases per octave).


## Modern Terrain Pipelin

* Macro Shape
  Tectonic/Plate Simulation or Low-Frequency Noise
  Establishes major continents, ocean basins, and massive mountain chains.
* Detail Pass
  Layered OpenSimplex Noise (FBM) + Domain Warping
  Adds ridges, cliffs, and organic surface complexity to the mountains.
* Weathering
  Hydraulic and thermal erosion
  Carves river valleys, carves sharp gullies, deposits sediment in low areas, and smooths out unstable cliffs via thermal sliding.
* Texturing (splatmapping)
  Slope & Altitude Analysis.
  Automatically paints textures—grass in flat valleys, rock on steep slopes, snow on high peaks—based on the final eroded data.
