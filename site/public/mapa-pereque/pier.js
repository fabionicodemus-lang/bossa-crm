import * as THREE from './vendor/three.module.js';

// The pier follows its mapped axis from the Meia Praia bank to the round pavilion.
export function buildPier(scene, world) {
  const start = world([-48.58565, -27.14398]);
  const end = world([-48.584046, -27.142834]);
  const group = new THREE.Group();
  group.position.set(start[0], 0, start[1]);
  group.rotation.y = Math.atan2(end[0] - start[0], end[1] - start[1]);
  scene.add(group);
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const geometries = {
    box: new THREE.BoxGeometry(1,1,1),
    round: new THREE.CylinderGeometry(1,1,1,48),
    rim: new THREE.TorusGeometry(1,.021,5,90),
    tube: new THREE.CylinderGeometry(1,1,1,8)
  };
  const parts = new Map();
  const axis = new THREE.Vector3(0,1,0);
  let assemblyTransform = null;
  function part(shape,color,position,scale,rotation) {
    const key = shape + color;
    if (!parts.has(key)) parts.set(key,{shape,color,matrices:[]});
    const q = rotation || new THREE.Quaternion();
    const placement = new THREE.Matrix4().compose(new THREE.Vector3(...position),q,new THREE.Vector3(...scale));
    if (assemblyTransform) placement.premultiply(assemblyTransform);
    parts.get(key).matrices.push(placement);
  }
  function beam(a,b,r,color) {
    const startPoint = new THREE.Vector3(...a), finish = new THREE.Vector3(...b);
    const delta = finish.clone().sub(startPoint);
    part('tube',color,startPoint.add(finish).multiplyScalar(.5).toArray(),[r,delta.length(),r],new THREE.Quaternion().setFromUnitVectors(axis,delta.normalize()));
  }
  const deck='#ba9672', trim='#e6c893', glass='#36505a', frame='#49454a';
  part('box',deck,[0,4,length/2],[22,2,length]);
  for(let z=8;z<length-13;z+=13){
    for(const side of [-1,1]){
      part('tube','#696e6b',[side*8,1,z],[1,7,1]);
      part('box',glass,[side*7,7.5,z],[6.8,5,10]);
      part('box',trim,[side*7,10.3,z],[8.2,.9,11.7]);
      for(const shift of [-4,0,4])part('box',frame,[side*3.5,7.6,z+shift],[.4,5.2,.4]);
      part('box',trim,[side*10.6,6.2,z],[.3,.35,13]);
    }
  }
  // Glazed entrance with projecting timber canopy.
  part('box','#9c684b',[-5,10,3],[12,13,12]);
  part('box',glass,[2,10,2],[9,13,12]);
  part('box',trim,[0,18,3],[21,1.1,17]);
  // The cafe has stacked circular floors, dark glazing and a guitar on its facade.
  const radius=12;
  for(const y of [4,9.5,15]){
    part('round',trim,[0,y,length],[radius+1,1,radius+1]);
    if(y<15)part('round',glass,[0,y+2.7,length],[radius,4.8,radius]);
  }
  for(let i=0;i<26;i++){const a=i*Math.PI/13;part('box',frame,[radius*Math.sin(a),9.6,length+radius*Math.cos(a)],[.45,11,.45]);}
  part('round','#864f48',[0,16,length],[8,1.2,8]);
  const signZ=length+12.3;
  const guitar=new THREE.Shape();
  guitar.moveTo(0,0);guitar.bezierCurveTo(-4,0,-4,4,-2,5);guitar.bezierCurveTo(-.5,5,-2,7,-1,7.5);
  guitar.lineTo(-.4,8);guitar.lineTo(-.4,17);guitar.lineTo(-.8,18);guitar.lineTo(-.7,20);
  guitar.lineTo(.9,20);guitar.lineTo(.8,18);guitar.lineTo(.4,17);guitar.lineTo(.4,8);
  guitar.bezierCurveTo(3,9,1,6,2,5);guitar.bezierCurveTo(4,4,4,0,0,0);
  const guitarMesh=new THREE.Mesh(new THREE.ShapeGeometry(guitar),new THREE.MeshStandardMaterial({color:'#d64955',side:THREE.DoubleSide}));
  guitarMesh.position.set(0,4,signZ);group.add(guitarMesh);
  // Sixty metres at the same horizontal scale as the OSM base.
  const wheelX=-17,wheelZ=-6,r=21.8,cy=25.4,ivory='#f2ede4';
  assemblyTransform = new THREE.Matrix4().makeTranslation(wheelX,0,wheelZ)
    .multiply(new THREE.Matrix4().makeRotationY(-Math.PI/2))
    .multiply(new THREE.Matrix4().makeTranslation(-wheelX,0,-wheelZ));
  part('box','#b9aba0',[wheelX,1,wheelZ],[25,2,18]);
  for(const z of [-3.3,3.3]){
    part('rim',ivory,[wheelX,cy,wheelZ+z],[r,r,r]);
    for(const side of [-1,1])beam([wheelX+side*11,2,wheelZ+side*.4+z*1.8],[wheelX,cy,wheelZ+z],.67,ivory);
  }
  for(let i=0;i<30;i++){
    const angle=i*2*Math.PI/30,x=wheelX+r*Math.cos(angle),y=cy+r*Math.sin(angle);
    for(const sign of [-1,1])beam([wheelX,cy,wheelZ-sign*2],[x,y,wheelZ+sign*3.3],.15,ivory);
    beam([x,y,wheelZ-3.3],[x,y,wheelZ+3.3],.23,ivory);
    part('box',glass,[x,y-1.1,wheelZ],[2.6,2,3.6]);
    for(const dy of [-2.15,.02])part('box',ivory,[x,y+dy,wheelZ],[2.8,.42,3.8]);
  }
  for(const {shape,color,matrices} of parts.values()){
    const mesh=new THREE.InstancedMesh(geometries[shape],new THREE.MeshStandardMaterial({color,roughness:.78}),matrices.length);
    matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
}
