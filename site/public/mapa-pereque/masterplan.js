import * as THREE from './vendor/three.module.js';

// All miniatures share geometry and materials. Only moving parts update their matrices.
export function createMasterplan(parent, sampleBeach, river) {
  const shapes = {
    block: new THREE.BoxGeometry(1,1,1),
    oval: new THREE.SphereGeometry(1,12,8),
    post: new THREE.CylinderGeometry(1,1,1,12),
    roof: new THREE.ConeGeometry(1,1,4),
    canopy: new THREE.ConeGeometry(1,1,12)
  };
  const root = new THREE.Group();
  const batches = new Map();
  const animators = [];
  const scenes = {};
  function group(host,x=0,y=0,z=0) {
    const g=new THREE.Group();
    g.position.set(x,y,z);
    host.add(g);
    return g;
  }
  function piece(host,shape,color,x,y,z,w,h,d,rz=0) {
    const part=group(host,x,y,z);
    part.scale.set(w,h,d);
    part.rotation.z=rz;
    const key=shape+':'+(host.userData.moving?'moving':'fixed');
    if(!batches.has(key)) batches.set(key,{shape,parts:[],moving:!!host.userData.moving});
    batches.get(key).parts.push({part,color});
    return part;
  }
  function moving(host,x=0,y=0,z=0) {
    const node=group(host,x,y,z);
    node.userData.moving=true;
    return node;
  }
  function body(host,shirt) {
    piece(host,'oval',shirt,0,1.6,0,.72,1,.54);
    piece(host,'oval','#c68a60',0,2.98,0,.52,.58,.5);
    piece(host,'oval','#554036',0,3.3,.04,.51,.31,.49);
  }
  function wake(h,length,width) {
    for(const side of [-1,1]) {
      const p=piece(h,'oval','#c7f0e6',side*width,.09,-length*.56,.24,.10,length*.49);
      p.rotation.y=-side*.18;
    }
  }
  function craft(boat,jet,color) {
    const scale=jet?1.65:1.4;
    boat.scale.setScalar(scale);
    const len=jet?3.2:3.8;
    piece(boat,'oval',color,0,.35,0,jet?1.25:.96,.59,len);
    piece(boat,'oval','#293f45',0,.80,-.13,jet?.86:.65,.24,len*.49);
    piece(boat,'oval',jet?'#f7f0d8':'#e7ac56',0,1,1.45,jet?1:.65,.36,.84);
    body(boat,jet?'#ee7754':'#eeb249');
    if(jet) {
      piece(boat,'block','#354848',0,1.9,1,1.72,.19,.21);
      for(const s of [-1,1]) piece(boat,'oval','#b77f58',s*.52,1.8,.52,.21,.23,.65);
    }
    wake(boat,jet?9:4.8,jet?1.45:.75);
    if(jet)return;
    const paddle=moving(boat,0,1.8,.32);
    piece(paddle,'block','#5e4532',0,0,0,4.15,.14,.14);
    for(const s of [-1,1])piece(paddle,'oval','#f9dfaa',s*2.22,0,0,.66,.16,.34);
    return paddle;
  }
  const lakePath=new THREE.CatmullRomCurve3([
    [151,-209],[180,-203],[227,-181],[271,-159],[297,-139],
    [282,-135],[250,-153],[211,-172],[177,-186]
  ].map(([x,z])=>new THREE.Vector3(x,0,z)),true);
  scenes.lake=[221,-174];
  const at=new THREE.Vector3(),tangent=new THREE.Vector3();
  for(let i=0;i<4;i++) {
    const boat=moving(root);
    const paddle=craft(boat,false,['#e56342','#308c9c','#da9940','#956187'][i]);
    animators.push(time=>{
      const u=(i/4+time/59)%1;
      lakePath.getPointAt(u,at);lakePath.getTangentAt(u,tangent);
      boat.position.set(at.x,.44,at.z);
      boat.rotation.set(0,Math.atan2(tangent.x,tangent.z),Math.sin(time*3+i)*.035);
      paddle.rotation.set(.19,Math.cos(time*3+i)*.38,Math.sin(time*3+i)*.55);
    });
  }

  const riverPath = new THREE.CurvePath();
  for(let i=1;i<river.length;i++)riverPath.add(new THREE.LineCurve3(
    new THREE.Vector3(river[i-1][0],0,river[i-1][1]),
    new THREE.Vector3(river[i][0],0,river[i][1])));
  const point=new THREE.Vector3(),dir=new THREE.Vector3();
  function riverPoint(angle,out) {
    const u=.51+.265*Math.cos(angle);
    riverPath.getPoint(u,point);riverPath.getTangent(u,dir);
    const side=4.0*Math.sin(angle);
    return out.set(point.x+dir.z*side,.54,point.z-dir.x*side);
  }
  const dockU=.49;
  riverPath.getPoint(dockU,point);riverPath.getTangent(dockU,dir);
  const dock=group(root,point.x-dir.z*9,.28,point.z+dir.x*9);
  // Local X crosses the river, local Z follows the fairway.
  dock.rotation.y=Math.atan2(dir.x,dir.z);
  scenes.marina=[point.x,point.z];
  piece(dock,'block','#99734d',0,1.1,0,5,1.5,58);
  for(let z=-25;z<=25;z+=10) {
    piece(dock,'block','#c89c69',3.3,1.05,z,7.4,1.0,1.25);
    piece(dock,'post','#74593e',.3,1.45,z,.38,3.4,.38);
    piece(dock,'oval','#fff3d6',4.3,.69,z+3.4,1.35,.65,2.9);
    piece(dock,'oval','#43717b',4.3,1.12,z+3.4,.8,.45,1.23);
  }
  const next=new THREE.Vector3();
  for(let i=0;i<2;i++){
    const jet=moving(root);
    craft(jet,true,i?'#e26d47':'#eac149');
    animators.push(time=>{
      const a=time*.14+i*Math.PI;
      riverPoint(a,jet.position);riverPoint(a+.003,next);
      jet.rotation.y=Math.atan2(next.x-jet.position.x,next.z-jet.position.z);
    });
  }

  function shore(t,offset) {
    const s=sampleBeach(t);
    const g=group(root,s.x+s.dz*offset,.35,s.z-s.dx*offset);
    g.rotation.y=Math.atan2(s.dx,s.dz);
    return g;
  }
  function court(t,index) {
    const g=shore(t,29);
    if(index===1)scenes.beach=[g.position.x,g.position.z];
    piece(g,'block','#e3b37a',0,.12,0,19,.24,32);
    for(const s of [-1,1]){
      piece(g,'block','#fff5cf',s*8,.28,0,.36,.14,28);
      piece(g,'block','#fff5cf',0,.28,s*14,16.35,.14,.36);
      piece(g,'post','#42656b',s*8.7,2.1,0,.24,4.2,.24);
    }
    for(let y=1.6;y<=3.7;y+=.62)piece(g,'block','#648486',0,y,0,17.4,.10,.1);
    for(let x=-8;x<=8;x+=1)piece(g,'block','#648486',x,2.65,0,.09,2.1,.1);
    piece(g,'block','#f8f0d8',0,3.85,0,17.6,.28,.19);
    for(let i=0;i<4;i++){
      const side=i<2?-1:1, lane=i%2?-1:1;
      const player=moving(g);
      body(player,side<0?'#e66f45':'#25849c');
      for(const s of [-1,1])piece(player,'block','#344f58',s*.33,.64,0,.41,1.23,.43,s*.12);
      const arm=moving(player,.6,2,0);
      piece(arm,'oval','#c68a60',.4,.16,.2,.5,.20,.21);
      piece(arm,'block','#85603e',.88,.3,.23,.49,.14,.13);
      piece(arm,'oval',side<0?'#bf5655':'#498e9b',1.3,.39,.22,.46,.57,.13);
      animators.push(time=>{
        const swing=time*1.6+index+i*.8;
        player.position.set(lane*3.8+Math.sin(swing)*1.6,0,side*(7.5+Math.cos(swing*.9)*1.2));
        player.rotation.y=side>0?Math.PI:0;
        arm.rotation.z=.4+Math.sin(swing*1.3)*.75;
      });
    }
    const ball=moving(g);
    piece(ball,'oval','#f4f174',0,0,0,.55,.55,.55);
    animators.push(time=>{
      const phase=time*1.65+index;
      ball.position.set(3.5*Math.sin(phase),2+5.4*Math.sin(phase)**2,8*Math.cos(phase));
    });
  }
  function kiosk(t,index) {
    const g=shore(t,10),cloth=index%2?'#428680':'#c66c4a';
    piece(g,'block','#bb9166',0,.3,0,13,.65,19);
    piece(g,'block','#ab7751',0,2.1,3.4,7,3.5,6.4);
    piece(g,'block','#e3ba84',0,3.65,.15,8,.48,1.5);
    for(const x of [-3.45,3.45])for(const z of [0,6.7])piece(g,'post','#856344',x,4.2,z,.22,6.6,.22);
    for(let i=0;i<7;i++)piece(g,'block',i%2?'#fff1ce':cloth,(i-3)*1.48,7.44,3.1,1.5,.62,10.4);
    for(const x of [-3.7,3.7]) {
      piece(g,'post','#866449',x,2.45,-5,.19,4.6,.19);
      piece(g,'canopy',cloth,x,5,-5,3.4,1.32,3.4);
      piece(g,'post','#f2e4c5',x,1.48,-5,1.3,.29,1.3);
      for(const z of [-6.8,-3.2])piece(g,'block','#bc8256',x,.8,z,1.6,1.5,.7);
    }
    const visitor=moving(g);body(visitor,'#3b8090');
    for(const s of [-1,1])piece(visitor,'block','#665241',s*.31,.65,0,.36,1.25,.43);
    animators.push(time=>{visitor.position.set(5.3,0,3*Math.sin(time*.5+index));visitor.rotation.y=Math.cos(time*.5+index);});
  }
  [.32,.43,.52,.68,.78].forEach(court);
  [.24,.35,.45,.54,.59,.71,.82].forEach(kiosk);

  const material=new THREE.MeshStandardMaterial({roughness:.77});
  root.updateMatrixWorld();
  for(const batch of batches.values()){
    const mesh=new THREE.InstancedMesh(shapes[batch.shape],material,batch.parts.length);
    mesh.castShadow=true;mesh.receiveShadow=true;batch.mesh=mesh;
    if(batch.moving){mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;}
    batch.parts.forEach(({part,color},i)=>{mesh.setMatrixAt(i,part.matrixWorld);mesh.setColorAt(i,new THREE.Color(color));});
    parent.add(mesh);
  }
  const dynamic=[...batches.values()].filter(b=>b.moving);
  let lastTime;
  function update(time){
    if(time===lastTime)return;
    lastTime=time;
    for(const animate of animators)animate(time);
    for(const b of dynamic){
      b.parts.forEach(({part},i)=>{part.updateWorldMatrix(true,false);b.mesh.setMatrixAt(i,part.matrixWorld);});
      b.mesh.instanceMatrix.needsUpdate=true;
    }
  }
  update(0);
  return {scenes,update};
}
