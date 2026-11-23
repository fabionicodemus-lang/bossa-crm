import {frameNeighborhood,mapViewDirection} from './map-view.js';
import {createMasterplan} from './masterplan.js';
import {addMapFacade,highlightedMapScale} from './facades.js';
import {buildPier} from './pier.js';
import * as THREE from './vendor/three.module.js';
import {OrbitControls} from './vendor/OrbitControls.js';

export function createWorld(canvas,features,places,onFrame){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#98d9df');
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 const camera=new THREE.OrthographicCamera(-800,800,500,-500,1,8000);
 const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.12;controls.screenSpacePanning=false;controls.minZoom=.4;controls.maxZoom=14;
 controls.minPolarAngle=.24;controls.maxPolarAngle=1.22;controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_ROTATE};
 const sun=new THREE.DirectionalLight('#fff2d8',2.4);sun.position.set(-550,1300,-550);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-1500,right:1500,top:1500,bottom:-1500,near:1,far:4500});sun.shadow.bias=-.0006;sun.shadow.normalBias=.35;scene.add(sun, new THREE.HemisphereLight('#d3efff','#a6ac78',1.15));
 const future=new THREE.Group();scene.add(future);future.visible=false;
 const S=85000,origin=[-48.5828,-27.1517];const world=p=>[(p[0]-origin[0])*S*.89,-(p[1]-origin[1])*S];
 buildPier(scene,world);
 const p3=(p,h=0)=>{let [x,z]=world(p);return new THREE.Vector3(x,h,z)};
 let seed=1951;function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}const pick=a=>a[Math.floor(rnd()*a.length)];
 const surfaces=new Map();function surface(g,color,parent){let key=color+(parent===future?"future":"main");if(!surfaces.has(key))surfaces.set(key,{color,parent,geometries:[]});surfaces.get(key).geometries.push(g)}
 const mats=new Map(),batches=new Map(),geoms={box:new THREE.BoxGeometry(1,1,1),ball:new THREE.IcosahedronGeometry(1,1),cone:new THREE.ConeGeometry(1,1,8),cyl:new THREE.CylinderGeometry(1,1,1,6)};
 const temp=new THREE.Object3D();
 function material(color){if(!mats.has(color))mats.set(color,new THREE.MeshStandardMaterial({color,roughness:.82}));return mats.get(color)}
 function instance(kind,color,x,y,z,sx,sy,sz,ry=0,rx=0,rz=0,parent=scene){let key=kind+'|'+color+'|'+(parent===future?'future':'main');if(!batches.has(key))batches.set(key,{kind,color,parent,items:[]});temp.position.set(x,y,z);temp.rotation.set(rx,ry,rz);temp.scale.set(sx,sy,sz);temp.updateMatrix();batches.get(key).items.push(temp.matrix.clone())}
 const box=(color,x,y,z,sx,sy,sz,ry=0,parent=scene)=>instance('box',color,x,y,z,sx,sy,sz,ry,0,0,parent);
 function polygon(points,color,y=0,parent=scene){if(points.length<3)return;let shape=new THREE.Shape();points.forEach((p,i)=>i?shape.lineTo(p[0],-p[1]):shape.moveTo(p[0],-p[1]));let g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);g.translate(0,y,0);surface(g,color,parent)}
 function ribbon(points,width,color,y=.1,parent=scene){let pos=[],ind=[];for(let i=0;i<points.length;i++){let a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1,nx=-dz/len*width/2,nz=dx/len*width/2;pos.push(points[i][0]+nx,y,points[i][1]+nz,points[i][0]-nx,y,points[i][1]-nz);if(i){let k=i*2;ind.push(k-2,k,k-1,k-1,k,k+1)}}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ind);g.computeVertexNormals();surface(g,color,parent)}
 const allCoast=features.filter(f=>f.t.natural==='coastline');let chain=[...allCoast.find(f=>f.id==='1288758164').p];let used=new Set(['1288758164']);while(true){let end=chain.at(-1),n=allCoast.find(f=>!used.has(f.id)&&Math.hypot(f.p[0][0]-end[0],f.p[0][1]-end[1])<1e-7);if(!n)break;chain.push(...n.p.slice(1));used.add(n.id)}chain.reverse();const coast=chain.map(world);
 const seaMaterial=new THREE.MeshPhongMaterial({color:'#428caa',shininess:100,specular:'#a0e3e6'});const ocean=new THREE.Mesh(new THREE.PlaneGeometry(16000,16000),seaMaterial);ocean.rotation.x=-Math.PI/2;ocean.position.y=-1.8;scene.add(ocean);
 const landPts=[world([-48.66,-27.20]),world([-48.66,-27.08]),...coast,world([-48.54,-27.20])];polygon(landPts,'#8eb682',0);
 const mainBeach=features.find(f=>f.id==='1288758164').p.slice().reverse().map(world);
 function normals(points,offset){return points.map((p,i)=>{let a=points[Math.max(0,i-1)],b=points[Math.min(i+1,points.length-1)],dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz)||1;return[p[0]+dz/d*offset,p[1]-dx/d*offset]})}
 ribbon(normals(mainBeach,22),70,'#70b8bc',-.6);ribbon(normals(mainBeach,8),25,'#a8d4c8',-.3);ribbon(normals(mainBeach,-10),38,'#f4dc9f',.15);ribbon(normals(mainBeach,-26),6,'#d6c78f',.19);
 ribbon(normals(mainBeach,66),33,'#76bebc',-.18,future);ribbon(normals(mainBeach,58),16,'#b7d7c6',.18,future);ribbon(normals(mainBeach,50),8,'#dfcb9d',.22,future);ribbon(normals(mainBeach,22),57,'#f5dfa6',.24,future);ribbon(normals(mainBeach,-26),15,'#e4d7bb',.24,future);ribbon(normals(mainBeach,-38),7,'#c77d64',.25,future);
 // Thin, broken crests and changing bands of colour give the sea a miniature scale.
 for(let row=0;row<22;row++){
  const offsetCoast=normals(mainBeach,48+row*22);
  along(offsetCoast,29+row%4*7,(x,z,dx,dz)=>{
   if(rnd()>.48)return;
   const len=3+rnd()*14;
   box(row%3===0?'#94c7d0':'#73acbb',x,-.82,z,len,.06,.45+rnd()*.7,-Math.atan2(dz,dx));
  });
 }
 const waters=[],green=[];for(let f of features){let ps=f.p.map(world);if(f.t.natural==='water'){waters.push(ps);polygon(ps,'#53b5ba',.26)}if(f.t.waterway){let width=f.t.waterway==='river'?22:5;ribbon(ps,width,'#4db3b7',.22);waters.push(ps)}if(['wood','scrub','wetland'].includes(f.t.natural)||['forest','grass','meadow'].includes(f.t.landuse)||f.t.leisure==='park'){polygon(ps,f.t.natural==='wood'?'#5b995e':'#79a86c',.1);if(ps.length>3)green.push(ps)}}
 const roads=features.filter(f=>f.t.highway&&!['footway','path','steps','cycleway','track'].includes(f.t.highway)).map(f=>({...f,pts:f.p.map(world),width:['primary','secondary','tertiary','motorway','trunk'].includes(f.t.highway)?13:7}));
 function inBounds(p){return p[0]>-1500&&p[0]<1700&&p[1]>-900&&p[1]<1250}
 for(let r of roads){if(!r.pts.some(inBounds))continue;ribbon(r.pts,r.width+5,'#d7d2b9',.3);ribbon(r.pts,r.width,'#74818a',.36);if(r.width>8){for(let i=1;i<r.pts.length;i++){let a=r.pts[i-1],b=r.pts[i],dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz);for(let t=8;t<d;t+=19){let x=a[0]+dx*t/d,z=a[1]+dz*t/d;if(inBounds([x,z]))box('#eadba5',x,.4,z,.42,.025,6,-Math.atan2(dz,dx)+Math.PI/2)}}}}
 function along(points,spacing,cb){let remaining=spacing/2;for(let i=1;i<points.length;i++){let a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz);while(remaining<d){cb(a[0]+dx*remaining/d,a[1]+dz*remaining/d,dx/d,dz/d);remaining+=spacing}remaining-=d}}
 function inside(x,z,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){let a=poly[i],b=poly[j];if(((a[1]>z)!==(b[1]>z))&&(x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]))c=!c}return c}
 function segDist(x,z,a,b){let dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)}
 function nearestCoast(x,z){let d=1e9;for(let i=1;i<coast.length;i++)d=Math.min(d,segDist(x,z,coast[i-1],coast[i]));return d}
 const waterPolys=features.filter(f=>f.t.natural==='water').map(f=>f.p.map(world));const riverSegs=features.filter(f=>f.t.waterway).flatMap(f=>{let a=f.p.map(world);return a.slice(1).map((b,i)=>[a[i],b,f.t.waterway==='river'?22:5])});
 const occupied=[];const reserved=places.filter(p=>p.type==='bossa').map(p=>world(p.p));
 function allowed(x,z,w,d){if(!inBounds([x,z])||!inside(x,z,landPts)||nearestCoast(x,z)<40)return false;if(reserved.some(p=>Math.hypot(x-p[0],z-p[1])<65))return false;if(waterPolys.some(p=>inside(x,z,p)))return false;if(riverSegs.some(s=>segDist(x,z,s[0],s[1])<s[2]/2+14))return false;let radius=Math.hypot(w,d)/2;return !occupied.some(p=>Math.hypot(x-p[0],z-p[1])<radius+p[2]+3)}
 function makeWindowTexture(body,glass,cols,rows){let c=document.createElement('canvas');c.width=128;c.height=256;let x=c.getContext('2d');x.fillStyle=body;x.fillRect(0,0,128,256);for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){x.fillStyle=glass;x.fillRect(i*128/cols+4,j*256/rows+4,128/cols-8,256/rows-7);x.fillStyle='rgba(224,248,244,.45)';x.fillRect(i*128/cols+4,j*256/rows+4,3,256/rows-7)}let t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t}
 for(let i=0;i<4;i++){let c=['#eceadd','#e2ddd0','#d2e0dd','#ebe0ce'][i];mats.set('facade'+i,new THREE.MeshStandardMaterial({map:makeWindowTexture(c,['#426b75','#4e777f','#527e87','#506c79'][i],4,12),roughness:.65}))}
 function structure(x,z,w,d,h,rot,style=0){let baseCol=pick(['#f3eee0','#d6d9cf','#e8d1b7','#ebeee4']);box('#c7c9b6',x,.5,z,w+4,.8,d+4,rot);if(h>18){box('facade'+style,x,h/2,z,w,h,d,rot);for(let y=4;y<h;y+=5.5)box(baseCol,x,y,z,w+1.2,.7,d+1.2,rot);if(h>32){
 const inset=w*.34,offset=w*.28;
 box(style%2?'#d6c7ae':'#ece8d7',x+Math.cos(rot)*offset,h*.51,z-Math.sin(rot)*offset,inset,h*1.02,d*1.04,rot);
 if(style===2||style===3){
  box('facade'+style,x+Math.cos(rot)*w*.11,h+2.8,z-Math.sin(rot)*w*.11,w*.65,5.6,d*.72,rot);
  box('#ded9c9',x+Math.cos(rot)*w*.11,h+5.8,z-Math.sin(rot)*w*.11,w*.68,.55,d*.76,rot);
 }
 }
 box(baseCol,x,h+.8,z,w+1.5,1.5,d+1.5,rot);box('#b4b8ae',x,h+2,z,w*.4,2,d*.3,rot)}else{box(baseCol,x,h/2,z,w,h,d,rot);box('#6c8b8e',x+Math.sin(rot)*d*.51,h*.52,z+Math.cos(rot)*d*.51,w*.6,h*.4,.2,rot);instance('roof',pick(['#b16e50','#bd8562','#818e8b']),x,h,z,w+2,5,d+2,rot);}}
 // Wedge roof for the low-rise homes.
 const roofG=new THREE.BufferGeometry();roofG.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,-.5,.5,0,-.5,0,1,-.5, -.5,0,.5,0,1,.5,.5,0,.5, -.5,0,-.5,0,1,-.5,0,1,.5, -.5,0,-.5,0,1,.5,-.5,0,.5, 0,1,-.5,.5,0,-.5,.5,0,.5,0,1,-.5,.5,0,.5,0,1,.5],3));roofG.computeVertexNormals();geoms.roof=roofG;
 let buildingCount=0;for(let f of features.filter(f=>f.t.building)){let pts=f.p.map(world);let x=pts.reduce((s,p)=>s+p[0],0)/pts.length,z=pts.reduce((s,p)=>s+p[1],0)/pts.length;let a=pts[0],b=pts[1];let w=Math.min(45,Math.max(9,Math.hypot(a[0]-b[0],a[1]-b[1]))),d=15+ rnd()*9;if(!allowed(x,z,w,d))continue;let h=Number(f.t['building:levels'])*3|| (rnd()<.6?7+rnd()*6:22+rnd()*38);structure(x,z,w,d,Math.min(h,75),-Math.atan2(b[1]-a[1],b[0]-a[0]),Math.floor(rnd()*4));occupied.push([x,z,Math.hypot(w,d)/2]);buildingCount++}
 const roadSegments=roads.flatMap(r=>r.pts.slice(1).map((b,i)=>[r.pts[i],b,r.width]));
 for(let r of roads.filter(r=>r.t.highway==='residential'||r.width>8)){along(r.pts,34,(x,z,dx,dz)=>{for(let side of [-1,1]){let w=14+rnd()*9,d=14+rnd()*12,offset=r.width/2+8+d/2,px=x-dz*offset*side,pz=z+dx*offset*side;if(buildingCount>950||!allowed(px,pz,w,d))continue;if(roadSegments.some(s=>segDist(px,pz,s[0],s[1])<s[2]/2+Math.min(w,d)/2+1))continue;let near=nearestCoast(px,pz),high=rnd()<(near<500?.48:.23);let h=high?24+rnd()*65:5+rnd()*7;structure(px,pz,w,d,h,-Math.atan2(dz,dx),Math.floor(rnd()*4));occupied.push([px,pz,Math.hypot(w,d)/2]);buildingCount++}})}
 function tree(x,z,size=1,parent=scene){instance('cyl','#887453',x,3*size,z,.7*size,6*size,.7*size,0,0,0,parent);instance('ball','#47835b',x,7*size,z,4*size,5*size,4*size,0,0,0,parent);instance('ball','#68a46c',x-1.5*size,8*size,z-1*size,3.5*size,3.5*size,3.5*size,0,0,0,parent)}
 // Sculpted palm leaves, with a raised spine and drooping tips.
 const leaf=new THREE.BufferGeometry();leaf.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0, 3,1.3,1.2, 3,2,0, 0,0,0,3,2,0,3,1.3,-1.2, 3,1.3,1.2,7,-.2,0,3,2,0, 3,2,0,7,-.2,0,3,1.3,-1.2],3));leaf.computeVertexNormals();geoms.leaf=leaf;
 function palm(x,z,size=1,parent=scene){instance('cyl','#a98b60',x,5.2*size,z,.55*size,10.4*size,.55*size,0,0,-.07,parent);for(let i=0;i<7;i++)instance('leaf',i%2?'#348257':'#57a064',x,10.2*size,z,size,size,size,i*Math.PI*2/7,0,0,parent)}
 for(let r of roads.filter(r=>r.width>8)){along(r.pts,42,(x,z,dx,dz)=>{if(inBounds([x,z])){let a=x-dz*(r.width/2+3),b=z+dx*(r.width/2+3);tree(a,b,.9);if(rnd()<.24){box('#5e7077',x+dz*9,5,z-dx*9,.35,10,.35);box('#fff1c7',x+dz*9,10,z-dx*9,2,.3,1)}}})}
 for(let p of green){let xs=p.map(v=>v[0]),zs=p.map(v=>v[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),zmin=Math.min(...zs),zmax=Math.max(...zs);for(let i=0;i<Math.min(250,(xmax-xmin)*(zmax-zmin)/900);i++){let x=xmin+rnd()*(xmax-xmin),z=zmin+rnd()*(zmax-zmin);if(inBounds([x,z])&&inside(x,z,p)&&inside(x,z,landPts)&&nearestCoast(x,z)>40)tree(x,z,1+rnd()*.9)}}
 function car(x,z,rot,color,parent=scene){box(color,x,1.1,z,2.6,1.5,5.3,rot,parent);box('#385365',x,2.1,z,2.3,.9,2.9,rot,parent);for(let sign of [-1,1]){let dx=Math.cos(rot)*1.45,dz=-Math.sin(rot)*1.45;box('#293b42',x+dx*sign,.6,z+dz*sign,.35,1,3.7,rot,parent)}}
 for(let r of roads.filter(r=>r.width>8)){along(r.pts,105,(x,z,dx,dz)=>{if(inBounds([x,z])&&rnd()<.8)car(x-dz*2.5,z+dx*2.5,Math.atan2(dx,dz),pick(['#e8e9df','#eab45a','#d2775d','#507d91']))})}
 for (const p of places.filter(p => p.type === 'bossa')) {
 const [x,z] = world(p.p);
 p.height = (p.id === 'flow' ? 102 : 112) * highlightedMapScale + 4;
 const load = () => addMapFacade(scene,p,x,z);
 load().catch(() => load()).catch(error => console.error('Fachada indisponível:',p.name,error));
 for(let i=0;i<6;i++){let t=i*Math.PI/3;palm(x+Math.cos(t)*42,z+Math.sin(t)*38,.8)}
 let ring=new THREE.Mesh(new THREE.RingGeometry(43,46,64),new THREE.MeshBasicMaterial({color:'#d4ad69',side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(x,.6,z);scene.add(ring)}
 const shadeColors=['#e78367','#3d9eaf','#edbe58','#eeeadd'];
 for(let k=0;k<4;k++){let pos=[];for(let i=0;i<12;i++)if(i%2===0){let a=i*Math.PI/6,b=(i+1)*Math.PI/6;pos.push(0,.5,0,Math.cos(a),0,Math.sin(a),Math.cos(b),0,Math.sin(b))}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();geoms['shade'+k]=g}
 function person(x,z,shirt='#de7957',parent=scene){instance('ball','#e1ae7b',x,2.8,z,.55,.6,.55,0,0,0,parent);instance('cyl',shirt,x,1.7,z,.65,1.5,.55,0,0,0,parent);box('#43566b',x-.28,.55,z,.35,1.2,.45,0,parent);box('#43566b',x+.28,.55,z,.35,1.2,.45,0,parent)}
 let beachStations=[];along(mainBeach,18,(x,z,dx,dz)=>{beachStations.push({x,z,dx,dz});let k=Math.floor(rnd()*4),off=3+rnd()*15,jitter=(rnd()-.5)*8,sx=x-dz*off+dx*jitter,sz=z+dx*off+dz*jitter;instance('cyl','#b69b6d',sx,2.2,sz,.15,4.4,.15);instance('cone',shadeColors[k],sx,4.8,sz,4.1,1.5,4.1);instance('shade'+k,'#fff1d7',sx,4.1,sz,4.12,3.02,4.12);box(pick(shadeColors),sx+5,.35,sz+1,1.5,.3,3.6,-.3);box('#ede9dd',sx+7,.35,sz+1,1.5,.3,3.6,-.3);person(sx+4,sz-3,pick(shadeColors));if(rnd()<.65)person(sx-5,sz+1,'#4499b3');if(rnd()<.4)person(x+dz*9,z-dx*9,'#ecbc5a');});
 along(normals(mainBeach,-31),48,(x,z)=>palm(x,z,1.1));
 along(normals(mainBeach,-36),55,(x,z)=>{palm(x,z,1.2,future);box('#8e8064',x+5,1,z,5,1.6,1.6,0,future);person(x-4,z,'#e8a55e',future)});
 function meshBox(g,c,x,y,z,w,h,d){let m=new THREE.Mesh(geoms.box,material(c));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=true;g.add(m);return m}
 const boats=[];function vessel(type,index){let g=new THREE.Group(),size=type==='jet'?1.2:type==='sail'?2.6:3.2;let hull=new THREE.Shape();hull.moveTo(-1,2);hull.lineTo(1,2);hull.lineTo(1,-1.6);hull.lineTo(0,-3);hull.lineTo(-1,-1.6);hull.closePath();let geom=new THREE.ExtrudeGeometry(hull,{depth:.6,bevelEnabled:true,bevelSize:.15,bevelThickness:.12,bevelSegments:1,steps:1});geom.rotateX(-Math.PI/2);let m=new THREE.Mesh(geom,material(type==='jet'?'#f4bb4d':'#fbf7df'));m.scale.set(size,size,size);g.add(m);
 if(type==='jet'){meshBox(g,'#334e5b',0,1,0,1.7,1.1,3);meshBox(g,'#e79662',0,2,-.3,.7,1.5,.7);let head=new THREE.Mesh(geoms.ball,material('#283b4a'));head.position.set(0,3,-.3);head.scale.setScalar(.48);g.add(head)}else{meshBox(g,'#cda976',0,1.8,0,size*1.6,.3,size*3);meshBox(g,'#f5eee0',0,2.4,-1,size*1.5,1.6,size*1.7);meshBox(g,'#3f7c8a',0,3.4,-1,size*1.2,.7,size*1.3);if(type==='sail'){meshBox(g,'#c4c6b1',0,10,0,.18,20,.18);let sail=new THREE.BufferGeometry();sail.setAttribute('position',new THREE.Float32BufferAttribute([0,3,0,0,20,0,8,4,0],3));sail.computeVertexNormals();let mat=new THREE.MeshStandardMaterial({color:'#fff6d9',side:THREE.DoubleSide,roughness:1});g.add(new THREE.Mesh(sail,mat))}}
 const wakeMat=new THREE.MeshBasicMaterial({color:'#dcfbec',transparent:true,opacity:.58,depthWrite:false,side:THREE.DoubleSide});let wakeG=new THREE.BufferGeometry();wakeG.setAttribute('position',new THREE.Float32BufferAttribute([-size,.1,3*size,size,.1,3*size,-size*2,.1,18*size, size,.1,3*size,size*2,.1,18*size,-size*2,.1,18*size],3));let wake=new THREE.Mesh(wakeG,wakeMat);g.add(wake);
 const t=.06+index*.047,station=sampleBeach(Math.min(.94,t));let distance=type==='jet'?75+index%3*20:160+(index%4)*70;boats.push({g,t,distance,speed:type==='jet'?.006:.0018,phase:rnd()*6,type});scene.add(g)}
 let cumulative=[0];for(let i=1;i<mainBeach.length;i++)cumulative[i]=cumulative[i-1]+Math.hypot(mainBeach[i][0]-mainBeach[i-1][0],mainBeach[i][1]-mainBeach[i-1][1]);const beachLength=cumulative.at(-1);
 function sampleBeach(t){let dist=t*beachLength,i=1;while(i<cumulative.length-1&&cumulative[i]<dist)i++;let a=mainBeach[i-1],b=mainBeach[i],q=(dist-cumulative[i-1])/(cumulative[i]-cumulative[i-1]),dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);return{x:a[0]+dx*q,z:a[1]+dz*q,dx:dx/len,dz:dz/len}}
 for(let i=0;i<18;i++)vessel(i%4===0?'sail':i%3===0?'jet':'boat',i);
 const riverSegments = ['1337604109','1337604107'].map(id => features.find(f => f.id === id).p.map(world));
 const activities = createMasterplan(future,sampleBeach,riverSegments[0].concat(riverSegments[1].slice(1)));
 // Fine, broken wave crests along the shore.
 const waves=[];for(let j=0;j<3;j++){let line=normals(mainBeach,36+j*24),verts=[];for(let i=1;i<line.length;i++){verts.push(line[i-1][0],-.15,line[i-1][1],line[i][0],-.15,line[i][1])}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));let mat=new THREE.LineDashedMaterial({color:'#d7fff0',transparent:true,opacity:.45,dashSize:12,gapSize:9});let l=new THREE.LineSegments(g,mat);l.computeLineDistances();scene.add(l);waves.push(l)}
 for(let b of surfaces.values()){let positions=[],normals=[],indices=[],offset=0;for(let g of b.geometries){positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);let ix=g.index?.array||Array.from({length:g.attributes.position.count},(_,i)=>i);for(let i of ix)indices.push(i+offset);offset+=g.attributes.position.count;g.dispose()}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setIndex(indices);let mat=material(b.color);mat.side=THREE.DoubleSide;let m=new THREE.Mesh(g,mat);m.receiveShadow=true;b.parent.add(m)}
 for(let [key,b] of batches){let mesh=new THREE.InstancedMesh(geoms[b.kind],material(b.color),b.items.length);b.items.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;b.parent.add(mesh)}
 let motion=!matchMedia('(prefers-reduced-motion: reduce)').matches,last=0,elapsed=0,frame=0,flight=null;
 function resize(){let w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);const span=w<700?950:1480;camera.left=-span/2;camera.right=span/2;camera.top=span*h/w/2;camera.bottom=-span*h/w/2;camera.updateProjectionMatrix()}
 function home(){
   const landmarks = places.filter(p=>p.type==='bossa').map(p=>p3(p.p,p.height));
   const beach = sampleBeach(.40);
   landmarks.push(new THREE.Vector3(beach.x+beach.dz*115,0,beach.z-beach.dx*115));
   landmarks.push(p3(places.find(p=>p.id==='pier-oporto').p,16));
   frameNeighborhood(camera,controls,landmarks,innerWidth,innerHeight);
   flight=null;
 }
 function fly(target,level){flight={from:controls.target.clone(),to:target,start:performance.now(),zoomFrom:camera.zoom,zoomTo:level}}
 function focus(p,level=1.55,height=0){const target=p3(p,height);if(innerWidth>=900){const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);target.addScaledVector(right,-110)}fly(target,level)}
 function focusActivity(key){
   const [x,z]=activities.scenes[key];
   const span=camera.right-camera.left;
   const width=key==='marina'?245:key==='lake'?206:147;
   const availableHeight=Math.max(innerHeight*.45,innerHeight-235);
   const zoom=Math.min(controls.maxZoom,span/width,span*availableHeight/innerWidth/(width*.65));
   const view=mapViewDirection.clone().multiplyScalar(camera.position.distanceTo(controls.target));
   flight=null;
   controls.target.set(x,1,z);
   camera.position.copy(controls.target).add(view);
   camera.zoom=zoom;
   camera.updateProjectionMatrix();
   controls.update();
 }
 function update(now){requestAnimationFrame(update);if(document.hidden)return;if(now-last<30)return;const dt=Math.min((now-last)/1000,.1);last=now;frame++;if(motion)elapsed+=dt;
 if(flight){let t=THREE.MathUtils.clamp((now-flight.start)/850,0,1),e=t*t*(3-2*t),next=flight.from.clone().lerp(flight.to,e),delta=next.clone().sub(controls.target);camera.position.add(delta);controls.target.copy(next);camera.zoom=THREE.MathUtils.lerp(flight.zoomFrom,flight.zoomTo,e);camera.updateProjectionMatrix();if(t===1)flight=null}controls.update();
 if(future.visible)activities.update(elapsed);
 for(let b of boats){let t=.04+((b.t+elapsed*b.speed)%.88);let s=sampleBeach(t);b.g.position.set(s.x+s.dz*b.distance,Math.sin(elapsed*1.8+b.phase)*.2-.15,s.z-s.dx*b.distance);b.g.rotation.y=Math.atan2(-s.dx,-s.dz);b.g.rotation.z=Math.sin(elapsed+b.phase)*.025}
 for(let i=0;i<waves.length;i++){waves[i].material.opacity=.25+Math.sin(elapsed*.8+i)*.12;waves[i].position.y=Math.sin(elapsed+i)*.03}renderer.render(scene,camera);onFrame?.();}
 controls.addEventListener('start',()=>flight=null);resize();home();requestAnimationFrame(update);
 return{resize,focus,focusActivity,home,draw:()=>{},project:(p,h=0)=>{let v=p3(p,h).project(camera);return[(v.x+1)*innerWidth/2,(1-v.y)*innerHeight/2,v.z]},setMode:m=>future.visible=m==='future',zoomBy:n=>{camera.zoom=Math.max(.4,Math.min(controls.maxZoom,camera.zoom*n));camera.updateProjectionMatrix()},rotate:()=>{let offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),Math.PI/8);camera.position.copy(controls.target).add(offset);controls.update()},tilt:()=>{let off=camera.position.clone().sub(controls.target),s=new THREE.Spherical().setFromVector3(off);s.phi=s.phi<.9?1.06:.65;off.setFromSpherical(s);camera.position.copy(controls.target).add(off);controls.update()},toggleMotion:()=>{motion=!motion;return motion},beach:()=>focus([-48.5774,-27.1488],2.5),stats:{buildings:buildingCount,umbrellas:beachStations.length,boats:boats.length},renderer,camera};
}
