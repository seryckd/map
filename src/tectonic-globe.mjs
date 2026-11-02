import {
  applyTectonicRelief,
  generateIcosphereCells,
  generatePlateTerrain,
  applyGlobalShaping,
  createRandomSeed,
  getCellInspectionColor,
  getSurfaceElevation
} from "./tectonic-globe-core.mjs";

const canvas = document.getElementById("globe");
const viewport = document.getElementById("viewport");
const seedInput = document.getElementById("seed");
const continentalInput = document.getElementById("continental-proportion");
const continentalValue = document.getElementById("continental-value");
const globalBiasInput = document.getElementById("global-bias");
const globalBiasValue = document.getElementById("global-bias-value");
const inspectionViewInput = document.getElementById("inspection-view");
const viewLegend = document.getElementById("view-legend");
const generateButton = document.getElementById("generate");
const randomSeedButton = document.getElementById("generate-random");
const status = document.getElementById("status");
const cellCount = document.getElementById("cell-count");
const SUBDIVISIONS = 3;
const ELEVATION_EXAGGERATION = 0.55;

let currentCells = [];
let currentBoundaries = [];
let currentInspectionView = "terrain";
let THREE;
let renderer;
let camera;
let controls;
let scene;
let globeGroup;

function showError(error) {
  status.textContent = `Globe generation failed: ${error.message}`;
  cellCount.textContent = "Generation failed";
}

function getVertexElevations(cells) {
  const elevationTotals = new Map();
  const vertexCounts = new Map();
  for (const cell of cells) {
    for (const vertex of cell.vertices) {
      const key = `${vertex.x},${vertex.y},${vertex.z}`;
      elevationTotals.set(
        key,
        (elevationTotals.get(key) || 0) + getSurfaceElevation(cell)
      );
      vertexCounts.set(key, (vertexCounts.get(key) || 0) + 1);
    }
  }
  return new Map([...elevationTotals].map(([key, total]) => [
    key,
    total / vertexCounts.get(key)
  ]));
}

function createCellGeometry(cells, view) {
  const positions = new Float32Array(cells.length * 9);
  const colors = new Float32Array(cells.length * 9);
  const vertexElevations = getVertexElevations(cells);

  let offset = 0;
  for (const cell of cells) {
    const color = getCellInspectionColor(cell, view);
    for (const vertex of cell.vertices) {
      const key = `${vertex.x},${vertex.y},${vertex.z}`;
      const elevation = vertexElevations.get(key);
      const radius = 1 + elevation * ELEVATION_EXAGGERATION;
      positions[offset++] = vertex.x * radius;
      positions[offset++] = vertex.y * radius;
      positions[offset++] = vertex.z * radius;
      colors[offset - 3] = color[0];
      colors[offset - 2] = color[1];
      colors[offset - 1] = color[2];
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createBoundaryGeometry(cells, boundaries) {
  const positions = new Float32Array(boundaries.length * 6);
  const colors = new Float32Array(boundaries.length * 6);
  const vertexElevations = getVertexElevations(cells);
  const boundaryColors = {
    convergent: [0.94, 0.35, 0.28],
    divergent: [0.36, 0.78, 0.91],
    transform: [0.98, 0.79, 0.34]
  };
  let offset = 0;
  for (const boundary of boundaries) {
    const cellA = cells[boundary.cellA];
    const cellB = cells[boundary.cellB];
    const sharedVertices = cellA.vertices.filter(vertex => cellB.vertices.includes(vertex));
    const color = boundaryColors[boundary.type];
    for (const vertex of sharedVertices) {
      const key = `${vertex.x},${vertex.y},${vertex.z}`;
      const radius = 1 + vertexElevations.get(key) * ELEVATION_EXAGGERATION + 0.006;
      positions[offset] = vertex.x * radius;
      positions[offset + 1] = vertex.y * radius;
      positions[offset + 2] = vertex.z * radius;
      colors[offset] = color[0];
      colors[offset + 1] = color[1];
      colors[offset + 2] = color[2];
      offset += 3;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function renderCells(cells, boundaries, view) {
  const geometry = createCellGeometry(cells, view);
  const surface = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0
    })
  );
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x142a32, transparent: true, opacity: 0.7 })
  );
  const children = [surface, edges];
  if (view === "boundaries") {
    children.push(new THREE.LineSegments(
      createBoundaryGeometry(cells, boundaries),
      new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2 })
    ));
  }

  for (const child of globeGroup.children) {
    child.geometry?.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach(material => material.dispose());
    } else {
      child.material?.dispose();
    }
  }
  globeGroup.clear();
  globeGroup.add(...children);
}

function updateInspectionView() {
  currentInspectionView = inspectionViewInput.value;
  for (const legend of viewLegend.querySelectorAll("[data-view-legend]")) {
    legend.classList.toggle("active", legend.dataset.viewLegend === currentInspectionView);
  }
  canvas.setAttribute("aria-label", `${inspectionViewInput.selectedOptions[0].text} globe view`);
  if (currentCells.length) renderCells(currentCells, currentBoundaries, currentInspectionView);
}

function generate() {
  const seed = seedInput.value.trim();
  if (!seed) {
    status.textContent = "Enter a seed before generating a globe.";
    seedInput.focus();
    return;
  }

  generateButton.disabled = true;
  status.textContent = "Generating spherical cells…";
  try {
    const cells = generateIcosphereCells(seed, SUBDIVISIONS);
    const { cells: platedCells, plates } = generatePlateTerrain(
      cells,
      seed,
      Number(continentalInput.value) / 100
    );
    const tectonicTerrain = applyTectonicRelief(platedCells, plates, seed);
    const shapedTerrain = applyGlobalShaping(
      tectonicTerrain.cells,
      seed,
      Number(globalBiasInput.value) / 100
    );
    currentCells = shapedTerrain.cells;
    currentBoundaries = tectonicTerrain.boundaries;
    renderCells(currentCells, currentBoundaries, currentInspectionView);
    cellCount.textContent = `${currentCells.length.toLocaleString()} spherical cells · ${plates.length} plates`;
    const landPercentage = Math.round(
      currentCells.filter(cell => cell.elevation > 0).length / currentCells.length * 100
    );
    const boundaryCounts = tectonicTerrain.boundaries.reduce((counts, boundary) => {
      counts[boundary.type]++;
      return counts;
    }, { convergent: 0, divergent: 0, transform: 0 });
    status.textContent = `Globe ready · seed “${seed}” · ${landPercentage}% land · C ${boundaryCounts.convergent} / D ${boundaryCounts.divergent} / T ${boundaryCounts.transform}`;
  } catch (error) {
    showError(error);
  } finally {
    generateButton.disabled = false;
  }
}

async function initialize() {
  try {
    THREE = await import("three");
    const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0, 4.5);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 1.5;
    controls.maxDistance = 6;

    scene.add(new THREE.AmbientLight(0xc3dce2, 1.5));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(-3, 4, 5);
    scene.add(keyLight);
    globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const resizeObserver = new ResizeObserver(() => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    });
    resizeObserver.observe(viewport);

    generateButton.addEventListener("click", generate);
    randomSeedButton.addEventListener("click", () => {
      seedInput.value = createRandomSeed();
      generate();
    });
    continentalInput.addEventListener("input", () => {
      continentalValue.value = `${continentalInput.value}%`;
    });
    continentalInput.addEventListener("change", generate);
    globalBiasInput.addEventListener("input", () => {
      globalBiasValue.value = `${globalBiasInput.value}%`;
    });
    globalBiasInput.addEventListener("change", generate);
    inspectionViewInput.addEventListener("change", updateInspectionView);
    seedInput.addEventListener("keydown", event => {
      if (event.key === "Enter") generate();
    });

    function animate() {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    generate();
    updateInspectionView();
    animate();
  } catch (error) {
    showError(error);
    generateButton.disabled = true;
    randomSeedButton.disabled = true;
    continentalInput.disabled = true;
    globalBiasInput.disabled = true;
    inspectionViewInput.disabled = true;
  }
}

initialize();
