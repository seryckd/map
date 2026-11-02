import { generateIcosphereCells } from "./tectonic-globe-core.mjs";

const canvas = document.getElementById("globe");
const viewport = document.getElementById("viewport");
const seedInput = document.getElementById("seed");
const generateButton = document.getElementById("generate");
const status = document.getElementById("status");
const cellCount = document.getElementById("cell-count");
const SUBDIVISIONS = 3;

let currentCells = [];
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

function createCellGeometry(cells) {
  const positions = new Float32Array(cells.length * 9);
  let offset = 0;
  for (const cell of cells) {
    for (const vertex of cell.vertices) {
      positions[offset++] = vertex.x;
      positions[offset++] = vertex.y;
      positions[offset++] = vertex.z;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function renderCells(cells) {
  const geometry = createCellGeometry(cells);
  const surface = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0x4d8991,
      roughness: 0.92,
      metalness: 0
    })
  );
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x142a32, transparent: true, opacity: 0.7 })
  );

  for (const child of globeGroup.children) {
    child.geometry?.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach(material => material.dispose());
    } else {
      child.material?.dispose();
    }
  }
  globeGroup.clear();
  globeGroup.add(surface, edges);
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
    currentCells = generateIcosphereCells(seed, SUBDIVISIONS);
    renderCells(currentCells);
    cellCount.textContent = `${currentCells.length.toLocaleString()} spherical cells`;
    status.textContent = `Globe ready · seed “${seed}”`;
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
    camera.position.set(0, 0, 3.4);
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
    seedInput.addEventListener("keydown", event => {
      if (event.key === "Enter") generate();
    });

    function animate() {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    generate();
    animate();
  } catch (error) {
    showError(error);
    generateButton.disabled = true;
  }
}

initialize();
