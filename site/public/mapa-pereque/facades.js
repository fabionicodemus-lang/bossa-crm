import {almaFrontYaw} from './map-view.js';
import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { refineAlmaFacadeFinishes } from './alma-facade-finishes.js';
import { addGroundFacadeFeatures } from './flow-facade-details.js';

const models = new Map();
const loader = new GLTFLoader();
export const highlightedMapScale = (85000 / 111100) * 2.1;
const graphite = {
  Facade_paint_ice: '#3b3d42', Facade_paint_white: '#30343b',
  Facade_concrete: '#48494e', Facade_plaster: '#3e4146', Facade_paint_gray: '#44474c'
};

function finishFlow(group, podium) {
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const material = mesh.material;
    if (graphite[material.name]) {
      material.map = null;
      material.color.set(graphite[material.name]);
      material.roughness = .81;
      material.metalness = .02;
    } else if (material.name === 'Facade_frame_light') {
      material.color.set('#b49a7d');
    } else if (material.name === 'Facade_perforated' || material.name === 'Hall_Perforated') {
      material.color.set('#363a3e');
    } else if (material.name === 'Facade_glass' && podium) {
      material.color.set('#cedee7');
      material.opacity = .92;
      material.transparent = true;
      material.depthWrite = false;
      material.metalness = .2;
    }
  });
}

async function loadModel(id) {
  const isFlow = id === 'flow';
  const files = isFlow
    ? ['flow-facade', 'ground-building-facade-v18', 'flow-hall']
    : ['fachada-01', 'fachada-02', 'alma-hall'];
  const parts = await Promise.all(files.map(name => loader.loadAsync('assets/torres/' + name + '.glb')));
  const building = new THREE.Group();
  for (const [index, part] of parts.entries()) {
    const mesh = part.scene;
    if (isFlow) {
      if (index === 0) mesh.position.y += 14.4;
      if (index === 2) mesh.position.set(.94, 0, 4.67);
      finishFlow(mesh, index === 1);
    } else if (index === 2) {
      mesh.position.set(9.15, .92, -3.62);
    } else {
      refineAlmaFacadeFinishes(mesh);
    }
    building.add(mesh);
  }
  if (isFlow) addGroundFacadeFeatures(building);
  building.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.receiveShadow = true;
    mesh.castShadow = !mesh.material.transparent;
  });
  const bounds = new THREE.Box3().setFromObject(building, true);
  const center = bounds.getCenter(new THREE.Vector3());
  building.position.set(-center.x, -bounds.min.y, -center.z);
  const group = new THREE.Group();
  group.add(building);
  return { group, size: bounds.getSize(new THREE.Vector3()) };
}

function getModel(id) {
  if (!models.has(id)) {
    models.set(id, loadModel(id).catch(error => {
      models.delete(id);
      throw error;
    }));
  }
  return models.get(id);
}

export async function addMapFacade(scene, place, x, z) {
  const {group, size} = await getModel(place.id);
  const tower = group.clone();
  tower.scale.setScalar(highlightedMapScale);
  tower.rotation.y = place.id === 'flow' ? .55 : almaFrontYaw;
  tower.position.set(x, .45, z);
  scene.add(tower);
  place.height = size.y * highlightedMapScale + 4;
}

export async function showFacade(place) {
  const dialog = document.querySelector('#facadeView');
  if (dialog.open) return;
  const canvas = dialog.querySelector('canvas');
  const status = dialog.querySelector('[role="status"]');
  dialog.querySelector('h2').textContent = place.name;
  status.textContent = 'Carregando a fachada…';
  dialog.showModal();
  const ticket = Symbol();
  dialog.viewTicket = ticket;
  const active = () => dialog.open && dialog.viewTicket === ticket;
  try {
    const {group, size} = await getModel(place.id);
    if (!active()) return;
    const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    const scene = new THREE.Scene();
    scene.add(group.clone(), new THREE.HemisphereLight('#effaff', '#c4b8a8', 2.4));
    const sun = new THREE.DirectionalLight('#fff1da', 2.4);
    sun.position.set(-50, 110, 80);
    scene.add(sun);
    const h = size.y;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(size.x,size.z)*.65, Math.max(size.x,size.z)*.66, h*.014, 80), new THREE.MeshStandardMaterial({color:'#cfc6b5',roughness:.93}));
    base.position.y = -h*.007;
    scene.add(base);
    const camera = new THREE.PerspectiveCamera(29, 1, .1, 3000);
    const controls = new OrbitControls(camera, canvas);
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI * .485;
    controls.target.set(0, h*.48, 0);
    const direction = new THREE.Vector3(place.id === 'flow' ? -.36 : .38, .21, 1).normalize();
    function fit() {
      const w = canvas.clientWidth, height = canvas.clientHeight;
      if (!w || !height) return;
      renderer.setSize(w, height, false);
      camera.aspect = w / height;
      const distance = Math.max(h*1.24, Math.hypot(size.x,size.z)*1.25/camera.aspect)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
      controls.minDistance = h*.35;
      controls.maxDistance = distance*2.8;
      camera.position.copy(controls.target).addScaledVector(direction, distance);
      camera.updateProjectionMatrix();
      controls.update();
      render();
    }
    function render() { renderer.render(scene, camera); }
    controls.addEventListener('change', render);
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    dialog.querySelector('[data-turn]').onclick = () => {
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0,1,0), Math.PI/6);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    };
    dialog.addEventListener('close', () => {
      observer.disconnect();
      controls.dispose();
      base.material.dispose();
      base.geometry.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.replaceWith(canvas.cloneNode());
    }, {once:true});
    fit();
    status.textContent = '';
  } catch (error) {
    if (active()) status.textContent = 'Não foi possível abrir a fachada. Feche e tente novamente.';
    console.error(error);
  }
}
