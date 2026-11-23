import { Vector3 } from './vendor/three.module.js';

// Camera on the seaward side, looking across the beach toward the neighborhood.
export const mapViewDirection = new Vector3(.52, 1.63, -.82).normalize();
export const almaFrontYaw = Math.atan2(mapViewDirection.x, mapViewDirection.z);

export function frameNeighborhood(camera, controls, landmarks, width, height) {
  const right = new Vector3(mapViewDirection.z, 0, -mapViewDirection.x).normalize();
  const up = new Vector3().crossVectors(mapViewDirection, right);
  const horizontal = landmarks.map(point => point.dot(right));
  const vertical = landmarks.map(point => point.dot(up));
  const left = Math.min(...horizontal), rightEdge = Math.max(...horizontal);
  const bottom = Math.min(...vertical), top = Math.max(...vertical);
  const sideMargin = Math.min(96, width * .12);
  const topMargin = Math.min(width < 900 ? 202 : 178, height * .25);
  const bottomMargin = Math.min(width < 900 ? 134 : 151, height * .23);
  const unitsPerPixel = Math.max((rightEdge-left)/(width-sideMargin*2),
    (top-bottom)/(height-topMargin-bottomMargin));
  camera.zoom = Math.min(controls.maxZoom, Math.max(controls.minZoom,
    (camera.right-camera.left)/(width*unitsPerPixel)));
  const actualUnits = (camera.right-camera.left)/(width*camera.zoom);
  const centerY = (top+bottom)/2 + (topMargin-bottomMargin)*actualUnits/2;
  const groundUp = new Vector3(up.x,0,up.z);
  controls.target.copy(right).multiplyScalar((left+rightEdge)/2)
    .addScaledVector(groundUp,centerY/groundUp.lengthSq());
  camera.position.copy(controls.target).addScaledVector(mapViewDirection,2150);
  camera.updateProjectionMatrix();
  controls.update();
}
