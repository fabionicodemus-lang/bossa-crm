import * as THREE from './vendor/three.module.js';

/** Architectural accents registered on the supplied V10 FRONT facade. */
const BRICK_FACE = { x0: .70, x1: 3.65, z: 13.012, y0: 3.16, y1: 100.03 };
const ACM_FRONT_Z = 13.322;
const bronze = '#aa7458';
const portalFinBounds = [[8.445, 8.935], [10.555, 11.155]];

const random = (() => {
  let state = 2052027;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
})();

function texture(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function makeBlackBrick() {
  // 2.95 × 2.56 m seamless tile: running-bond black face brick, 8 mm mortar.
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 1024;
  const c = canvas.getContext('2d');
  c.fillStyle = '#111316'; c.fillRect(0, 0, 1024, 1024);
  const rows = 32, columns = 12, course = 1024 / rows, brick = 1024 / columns;
  for (let row = 0; row < rows; row++) {
    const stagger = row % 2 ? brick / 2 : 0;
    for (let col = -1; col <= columns; col++) {
      const x = col * brick + stagger;
      const y = row * course;
      const tone = 33 + Math.round(random() * 17);
      c.fillStyle = `rgb(${tone},${tone + 1},${tone + 3})`;
      c.fillRect(x + 2.5, y + 2.7, brick - 5, course - 4.7);
      c.fillStyle = 'rgba(255,255,255,.055)';
      c.fillRect(x + 4, y + 4.5, brick - 8, 1.2);
      c.fillStyle = 'rgba(0,0,0,.24)';
      c.fillRect(x + 3.5, y + course - 5, brick - 7, 1.8);
      for (let i = 0; i < 17; i++) {
        const xx = x + 5 + random() * (brick - 11);
        const yy = y + 5 + random() * (course - 11);
        const bright = random() > .54;
        c.fillStyle = bright ? 'rgba(145,152,151,.095)' : 'rgba(0,0,0,.19)';
        c.fillRect(xx, yy, 1 + random() * 5, .5 + random() * 2);
      }
    }
  }
  const tex = texture(canvas, 1, (BRICK_FACE.y1 - BRICK_FACE.y0) / 2.56);
  tex.name = 'Tijolinho_preto_FLOW_7_5cm';
  return tex;
}

function makeBronzeGrain() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d');
  c.fillStyle = bronze; c.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x++) {
    const light = random() * .085 + Math.sin(x * .55) * .019;
    c.fillStyle = `rgba(252,221,172,${light.toFixed(3)})`;
    c.fillRect(x, 0, .6, 256);
  }
  return texture(canvas, 1, 24);
}

function addPlate(group, name, width, height, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 6;
  group.add(mesh);
  return mesh;
}

function drawGlowLetter(c, letter, x, y, size, color, trackingWeight = 400) {
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `${trackingWeight} ${size}px "Arial Narrow", Arial, sans-serif`;
  c.shadowColor = 'rgba(255,184,96,.96)';
  c.shadowBlur = Math.max(13, size * .23);
  c.fillStyle = '#ffe4b2'; c.fillText(letter, x, y);
  c.shadowBlur = Math.max(6, size * .11);
  c.fillStyle = color; c.fillText(letter, x, y);
  c.shadowBlur = 0;
}

function verticalFlowSign() {
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 1536;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  for (const [n, letter] of [...'FLOW'].entries()) {
    drawGlowLetter(c, letter, 192, 184 + n * 225, 140, '#fff2ce', 300);
  }
  for (const [n, letter] of [...'APTOS'].entries()) {
    drawGlowLetter(c, letter, 192, 1075 + n * 84, 55, '#f6dbaf', 300);
  }
  return texture(canvas);
}

function bossaLogo() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 320;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  const letters = [...'BOSSA'];
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '200 185px "Arial Narrow", Arial, sans-serif';
  c.shadowColor = 'rgba(255,243,219,.62)'; c.shadowBlur = 17;
  c.fillStyle = '#fff8ef';
  letters.forEach((letter, index) => c.fillText(letter, 160 + index * 175, 152));
  c.shadowBlur = 0;
  c.font = '400 26px Arial, sans-serif';
  const small = [...'EMPREENDIMENTOS'];
  small.forEach((letter, index) => c.fillText(letter, 114 + index * 56, 294));
  return texture(canvas);
}

function addBacklitSigns(group) {
  const graphics = [
    ['FLOW APTOS · letreiro vertical iluminado', verticalFlowSign(), 1.03, 8.4, 2.18, 11.05, BRICK_FACE.z + .064],
    ['BOSSA Empreendimentos · logotipo iluminado', bossaLogo(), 2.72, .85, 17.08, 3.82, 13.18],
  ];
  for (const [name, map, width, height, x, y, z] of graphics) {
    addPlate(group, name, width, height, x, y, z, new THREE.MeshBasicMaterial({
      map, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
  }
}

function makeLightHalo() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 16;
  const c = canvas.getContext('2d');
  const gradient = c.createLinearGradient(0, 0, 128, 0);
  gradient.addColorStop(0, 'rgba(255,207,149,0)');
  gradient.addColorStop(.48, 'rgba(255,211,154,.24)');
  gradient.addColorStop(.58, 'rgba(255,202,139,.62)');
  gradient.addColorStop(1, 'rgba(255,212,166,0)');
  c.fillStyle = gradient; c.fillRect(0, 0, 128, 16);
  const halo = texture(canvas);
  halo.name = 'LED_indireto_ACM_bronze_3000K';
  return halo;
}

function curvedBase(index, y) {
  // The two champagne/bronze blades curve back into the actual recessed
  // entry structure below the garage podium. Their lower feet also flare
  // gently outwards so the 1.8 m door stays unobstructed.
  const t = THREE.MathUtils.clamp((y - .30) / 5.7, 0, 1);
  const blend = 1 - t * t * (3 - 2 * t);
  return {
    offsetX: (index === 0 ? -.17 : .17) * blend,
    offsetZ: -.59 * blend,
  };
}

// Folded ACM has light-catching returns. Each panel is a rounded section,
 // aligned to the existing architectural front and its curved base.
function foldedBronzeGeometry(index, width, y0, y1) {
  const radius = .012, depth = .080, half = width / 2;
  const profile = [];
  const corners = [
    [half-radius,-radius,0], [-half+radius,-radius,Math.PI/2],
    [-half+radius,-depth+radius,Math.PI], [half-radius,-depth+radius,Math.PI*1.5],
  ];
  for (const [cx,cz,start] of corners) {
    for (let i=0;i<=3;i++) {
      const angle = start + Math.PI*i/6;
      profile.push([cx+radius*Math.cos(angle),cz+radius*Math.sin(angle)]);
    }
  }
  const xyz=[], uv=[], triangles=[];
  const panels = Math.ceil((y1-y0)/3.15);
  for (let panel=0;panel<panels;panel++) {
    const from=y0+panel*(y1-y0)/panels+.002, to=y0+(panel+1)*(y1-y0)/panels-.002;
    const steps=from<6 ? 18 : 1;
    const first=xyz.length/3;
    for (let j=0;j<=steps;j++) {
      const y=from+(to-from)*j/steps, bend=curvedBase(index,y);
      for (const [x,z] of profile) {
        xyz.push(x+bend.offsetX,y-(y0+y1)/2,z+bend.offsetZ);
        uv.push(x/width+.5,y/(y1-y0));
      }
    }
    const count=profile.length;
    for (let j=0;j<steps;j++) for (let k=0;k<count;k++) {
      const a=first+j*count+k, b=first+j*count+(k+1)%count;
      triangles.push(a,a+count,b,b,a+count,b+count);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(triangles); geometry.computeVertexNormals();
  return geometry;
}

function addCurvedBronzeRibbon(group, name, width, y0, y1, x, z, material, index, offsetZ = 0) {
  const height=y1-y0;
  const folded = material.isMeshStandardMaterial;
  const geometry=folded ? foldedBronzeGeometry(index,width,y0,y1) : new THREE.PlaneGeometry(width,height,1,82);
  if (!folded) {
  const array=geometry.attributes.position;
  for (let i=0;i<array.count;i++) {
    const y=array.getY(i)+(y0+y1)/2;
    const {offsetX,offsetZ:depth}=curvedBase(index,y);
    array.setXYZ(i,array.getX(i)+offsetX,array.getY(i),depth+offsetZ);
  }
  array.needsUpdate=true;
  geometry.computeVertexNormals();
  }
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name=name;
  mesh.position.set(x,(y0+y1)/2,z);
  mesh.receiveShadow=folded;
  mesh.castShadow=folded;
  mesh.renderOrder=folded ? 0 : 6;
  group.add(mesh);
  return mesh;
}

function addBronzeFins(group, reflections) {
  const bronzeMap = makeBronzeGrain();
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#efddc7'), map: bronzeMap,
    metalness: .71, roughness: .29,
    envMap: reflections || null, envMapIntensity: .85,
    side: THREE.DoubleSide,
  });
  const led = new THREE.MeshBasicMaterial({
    color: '#ffdeb1', toneMapped: false, transparent: true,
    opacity: .92, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.MeshBasicMaterial({
    map: makeLightHalo(), transparent: true, toneMapped: false, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  for (const [index, [left, right]] of portalFinBounds.entries()) {
    const width = right - left;
    addCurvedBronzeRibbon(group, `ACM bronze escovado · fin ${index + 1} · curva inferior`,
      width,.075,99.925,(left + right) / 2,ACM_FRONT_Z,material,index);
    // Actual setbacks between the bronze and backing; delicate 3000 K
    // backlighting also follows the return curve, rather than a straight LED
    // slicing through the bottom of the recessed entrance.
    for (const edge of [left - .045, right + .045]) {
      addCurvedBronzeRibbon(group,'Iluminação indireta · difusor 3000 K · curva',
        .034,.18,99.5,edge,ACM_FRONT_Z,led,index,.018);
      addCurvedBronzeRibbon(group,'Iluminação indireta · halo no revestimento · curva',
        .25,.18,99.5,edge,ACM_FRONT_Z,glow,index,.015);
    }
  }
}

export function addGroundFacadeFeatures(root, reflections) {
  const group = new THREE.Group();
  group.name = 'Flow_fachada_frontal · tijolinho preto · logotipos · ACM bronze';
  const brick = makeBlackBrick();
  const cladding = new THREE.MeshStandardMaterial({
    map: brick, bumpMap: brick, bumpScale: .014, roughness: .89,
    metalness: .025, side: THREE.FrontSide,
  });
  addPlate(group, 'Tijolinhos pretos · faixa vertical FLOW APTOS',
    BRICK_FACE.x1 - BRICK_FACE.x0, BRICK_FACE.y1 - BRICK_FACE.y0,
    (BRICK_FACE.x1 + BRICK_FACE.x0) / 2,
    (BRICK_FACE.y1 + BRICK_FACE.y0) / 2,
    BRICK_FACE.z, cladding);
  addBronzeFins(group, reflections);
  addBacklitSigns(group);
  root.add(group);
  return group;
}
