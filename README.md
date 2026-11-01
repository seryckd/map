# map
playing with maps

### Data Structure

* gridsize
* points: seed points
* numRegions: points.length as every point is the centre of a region
* numEdges: count of halfEdges
* halfEdges: a halfEdge is a line between two points.
  A triangle is composed of 3 halfEdges. If two triangles share the
  same two points (an edge) then each triangle has a halfEdge with the
  same points.
* triangles: every entry is a triangle over 3 points
* centers: cicumcenter of every triangle
  the circumcenter is the center of a circle with all 3 points of the
  triangle on the edge.

Voronoi Region: the polygon formed by the circumcenters of all the
triangles fron the seed point.

Elevation of each point is close to 0-1.

### Voronoi

Seeds : The initial base points scattered across the space.
Voronoi Cells: The territory or polygon assigned to each individual seed.
Edges: The borders separating adjacent cells. Every point on an edge is exactly equidistant between the two nearest seeds.
Vertices: The corners where three or more edges meet. These points are equidistant to three or more seeds.
