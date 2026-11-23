import {showFacade} from './facades.js';
import {createWorld} from './scene.js';
import {places,categories,masterplan} from './places.js';
const $=s=>document.querySelector(s);
let activeScene=null;
let world3d,mode='today',selected=null,category='all',tourIndex=-1,galleryIndex=0,activeAttraction=null,railCollapsed=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imagePath=(g,thumb=false)=>`assets/attractions/${g.file}${thumb?'-thumb':''}.webp`;
const iconPaths={sun:'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17m10-10 1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',leaf:'M5 19C2 6 10 3 20 4c1 11-5 16-12 13M5 20 16 8',sea:'M3 17c3-4 5 4 9 0s6 4 9 0M3 21c3-4 5 4 9 0s6 4 9 0M12 3v10H5L12 3Zm2 3 5 7h-5',walk:'m12 9-3 5 4 3-2 5m1-13 4 5h4M9 14l-5 6m10-16a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',food:'M6 2v7m-3-7v5c0 3 6 3 6 0V2M6 9v13M18 2c-4 3-4 10 0 10h2V2h-2Zm2 10v10',play:'m4 20 5-16h6l5 16M7 10h10m-5-6v10m-3 0h6'};
const icon=p=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${iconPaths[p.icon]||iconPaths.leaf}"/></svg>`;
const isService=p=>p.categories?.includes('services');
function filterMatch(p){return category==='all'?!isService(p):p.categories?.includes(category)}
function updateMarkers(){
 if(!world3d)return;
 const boxes=[];
 const sorted=[...places].sort((a,b)=>(b.id===selected?100:b.type==='bossa'?90:b.type===mode?50:10)-(a.id===selected?100:a.type==='bossa'?90:a.type===mode?50:10));
 const railTop=$('footer').getBoundingClientRect().top;
 for(const p of sorted){
  const el=document.getElementById('pin-'+p.id);if(!el)continue;
  const pt=world3d.project(p.p,p.height||3),mobile=innerWidth<900;
  let show=p.id===selected||p.type==='bossa'||((p.type==='today'||mode==='future')&&filterMatch(p));
  if(activeScene && p.type!=='bossa')show=false;
  show=show&&pt[0]>15&&pt[0]<innerWidth-15&&pt[1]>(mobile?150:115)&&pt[1]<railTop-12&&pt[2]<1;
  const w=Math.min(235,p.name.length*(mobile?5.4:6.3)+42),h=mobile?35:41;
  const rect=[pt[0]-w/2-5,pt[1]-h-12,pt[0]+w/2+5,pt[1]+4];
  if(show&&p.type!=='bossa'&&p.id!==selected&&boxes.some(b=>rect[0]<b[2]&&rect[2]>b[0]&&rect[1]<b[3]&&rect[3]>b[1]))show=false;
  if(show)boxes.push(rect);
  el.style.display=show?'flex':'none';el.style.left=pt[0]+'px';el.style.top=(pt[1]-9)+'px';el.classList.toggle('selected',selected===p.id);
 }
}
function draw(){world3d?.draw();updateMarkers()}
function home(){setActiveScene(null);toggleDiscovery(true);world3d?.home()}
function closePanel(){$('#panel').hidden=true;$('#openPanel').hidden=false}
function openPanel(){$('#panel').hidden=false;$('#openPanel').hidden=true}
function intro(){
 selected=null;
 $('#panelBody').innerHTML=`<span class="eyebrow">PEREQUÊ POR BOSSA</span><h1>A vida acontece<br>lá fora.</h1><p>Praia pela manhã. Uma pausa no verde. Amigos à mesa. Descubra os lugares que fazem do Perequê um lugar para viver.</p><div class="introline"></div><span class="eyebrow">SEU LUGAR NESSA HISTÓRIA</span>${places.filter(p=>p.type==='bossa').map(p=>`<button class="minirow" data-place="${p.id}"><img src="assets/${p.img}" alt="Perspectiva do ${p.name}"><span><strong>${p.name}</strong><small>${p.facts[0][0]} do mar · entrega ${p.facts[1][0]}</small></span></button>`).join('')}<button class="primary" data-discover="true">Descobrir as experiências</button><p class="hint">Toque nas fotos ou nos pontos do mapa. Arraste para explorar a maquete e use dois dedos para aproximar e girar.</p>`;
 draw();
}
function renderDiscovery(){
 const filtered=places.filter(p=>p.type===mode&&filterMatch(p));
 $('#discoveryTitle').textContent=mode==='today'?'O que viver no Perequê':'Novos motivos para estar aqui';
 $('#discoveryCount').textContent=filtered.length+(filtered.length===1?' lugar':' lugares');
 $('#categoryFilters').innerHTML=categories.filter(c=>c[0]==='all'||places.some(p=>p.type===mode&&p.categories?.includes(c[0]))).map(([id,label])=>`<button data-category="${id}" aria-pressed="${category===id}" class="${category===id?'active':''}">${label}</button>`).join('');
 $('#attractionRail').innerHTML=filtered.length?filtered.map(p=>`<button class="experience-card ${p.type}" data-place="${p.id}" aria-label="Ver ${p.name}">${p.gallery?`<img src="${imagePath(p.gallery[0],true)}" alt="" loading="lazy">`:'<span class="service-cover">Conveniência no bairro</span>'}<span class="card-status">${p.status|| (p.type==='future'?'PROPOSTA':'JÁ EXISTE')}</span><span class="card-text"><strong>${p.name}</strong><small>${p.short||'Dia a dia no bairro'}</small></span></button>`).join(''):'<div class="empty-state">Explore outra experiência ou veja todas as atrações.</div>';
 $('#attractionRail').scrollLeft=0;
 draw();
}
function setActiveScene(key){
 activeScene=key;
 document.querySelectorAll('[data-activity]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.activity===key)));
}
function visitActivity(key){
 if(!world3d)return;
 setActiveScene(key);selected=null;closePanel();toggleDiscovery(true);world3d.focusActivity(key);draw();
}
function setMode(next,showPanel=false){
 setActiveScene(null);mode=next;
 document.querySelectorAll('[data-activity]').forEach(button=>button.hidden=mode!=='future');
 for(const id of ['pierView','beach','tour'])document.getElementById(id).hidden=mode==='future';
 if(category!=='all'&&!places.some(p=>p.type===mode&&p.categories?.includes(category)))category='all';world3d?.setMode(next);
 document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode))});
 $('#mapNote').textContent=mode==='future'?'Futuro ilustrativo · propostas sem prazo de execução confirmado':'Maquete ilustrativa · fotos reais nas atrações';
 if(showPanel)intro();renderDiscovery();
}
function select(id,move=true){
 const p=places.find(p=>p.id===id);if(!p)return;setActiveScene(null);
 if(p.type==='future'&&mode!=='future')setMode('future');
 if(p.type==='today'&&mode!=='today')setMode('today');
 selected=id;if(move)world3d?.focus(p.p,p.type==='bossa'?1.9:1.4,p.type==='bossa'?(p.height||160)*.48:0);
 if(p.gallery){showAttraction(p);draw();return}
 $('#attraction').close();$('#lightbox').close();openPanel();
 $('#panelBody').innerHTML=`${p.img?`<img class="heroimg" src="assets/${p.img}" alt="Perspectiva ilustrativa do ${p.name}">`:''}<span class="badge">${p.type==='bossa'?'BOSSA · EM OBRA':'CONVENIÊNCIA NO BAIRRO'}</span><h2>${p.name}</h2><p>${p.body}</p>${p.facts?`<div class="facts">${p.facts.map(f=>`<div><b>${f[0]}</b><span>${f[1]}</span></div>`).join('')}</div><div class="address">${p.address}<br>Marcador aproximado · distância divulgada pela Bossa</div><button class="primary" data-facade="${p.id}">Ver fachada em 3D</button><a class="secondary" href="${p.link}" target="_blank" rel="noopener">Conhecer o empreendimento ↗</a><button class="secondary" data-discover="true">Descobrir a vida no entorno</button>`:`<p class="address">Ponto da base OpenStreetMap. Consulte o local para confirmar serviços e funcionamento.</p>`}<button class="secondary" id="backIntro">Voltar à visão geral</button>`;
 $('#panel').scrollTop=0;draw();
}
function showAttraction(p){
 activeAttraction=p;galleryIndex=0;closePanel();
 $('#attractionBody').innerHTML=`<div class="attraction-layout"><div class="attraction-media"><div class="gallery-stage"><button class="enlarge-image" id="enlargeImage" aria-label="Ampliar imagem"><img id="galleryImage" alt=""><span class="zoom-caption">↗ Ampliar imagem</span></button><span id="imageKind" class="image-kind"></span><div class="gallery-arrows" ${p.gallery.length<2?'hidden':''}><button data-gallery-step="-1" aria-label="Imagem anterior">‹</button><span id="galleryCount" aria-live="polite"></span><button data-gallery-step="1" aria-label="Próxima imagem">›</button></div></div><div class="gallery-thumbs" aria-label="Imagens da atração">${p.gallery.map((g,i)=>`<button data-gallery-index="${i}" aria-label="Ver imagem ${i+1}: ${esc(g.alt)}"><img src="${imagePath(g,true)}" alt=""></button>`).join('')}</div><p id="imageCaption" class="image-caption"></p><div class="moment"><span>IMAGINE SEU DIA</span><p>${p.tip}</p></div></div><div class="attraction-copy"><span class="badge ${p.type==='future'?'future':''}">${p.status || (p.type==='future'?'PROPOSTA FUTURA':'JÁ EXISTE')}</span><h2 id="attractionTitle">${p.name}</h2><p class="attraction-tagline">${p.short}</p><p>${p.body}</p><h3>${p.type==='future'?'O que a proposta imagina':'O que fazer por lá'}</h3><div class="activities">${p.activities.map(a=>`<span>${a}</span>`).join('')}</div><p class="place-location">${icon(p)}<span>${p.location}</span></p>${p.type==='future'?'<p class="project-note"><b>Visão de futuro.</b> Implantação, aprovações e prazos dependem dos projetos responsáveis. Os pontos do mapa são indicativos.</p>':''}${p.note?`<p class="detail-note">${p.note}</p>`:''}<div class="attraction-actions"><button class="primary" data-view-map="${p.id}">Ver este lugar no mapa</button>${p.next?`<button class="secondary compare-link" data-place="${p.next}">${p.type==='today'?'Explorar a proposta futura':'Conhecer o lugar hoje'} →</button>`:''}<a class="source-link" href="${p.source}" target="_blank" rel="noopener">${p.type==='future'?'Consultar o projeto divulgado':'Consultar informações do local'} ↗</a></div><div class="bossa-connect"><span>VIVA O PEREQUÊ COM A BOSSA</span><div><button data-place="flow">Flow Aptos →</button><button data-place="alma">Alma Seahouses →</button></div></div></div></div>`;
 updateGallery();if(!$('#attraction').open)$('#attraction').showModal();$('#attraction').scrollTop=0;
 $('#enlargeImage').onclick=()=>{updateLightbox();$('#lightbox').showModal()};
}
function updateGallery(){
 const g=activeAttraction.gallery[galleryIndex],img=$('#galleryImage');
 img.src=imagePath(g);img.alt=g.alt;img.classList.toggle('contain',!!g.contain);
 $('#imageKind').textContent=g.kind;$('#galleryCount').textContent=`${galleryIndex+1} / ${activeAttraction.gallery.length}`;
 $('#imageCaption').innerHTML=`${g.alt}.<br><a href="${g.source}" target="_blank" rel="noopener">${g.credit} ↗</a>`;
 document.querySelectorAll('[data-gallery-index]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.galleryIndex)===galleryIndex)));
 if($('#lightbox').open)updateLightbox();
}
function updateLightbox(){const g=activeAttraction.gallery[galleryIndex];$('#lightboxImage').src=imagePath(g);$('#lightboxImage').alt=g.alt;$('#lightboxCaption').textContent=`${g.kind} · ${g.credit}`;$('#lightboxCount').textContent=`${galleryIndex+1} / ${activeAttraction.gallery.length}`;$('#lightboxPrev').disabled=$('#lightboxNext').disabled=activeAttraction.gallery.length<2}
function stepGallery(n){if(!activeAttraction)return;galleryIndex=(galleryIndex+n+activeAttraction.gallery.length)%activeAttraction.gallery.length;updateGallery()}
function toggleDiscovery(collapsed){railCollapsed=collapsed;$('#discovery').classList.toggle('collapsed',collapsed);$('#toggleDiscovery').textContent=collapsed?'Ver fotos ＋':'Recolher −';$('#toggleDiscovery').setAttribute('aria-expanded',String(!collapsed));draw()}
document.addEventListener('click',e=>{
 const facade=e.target.closest('[data-facade]');if(facade)showFacade(places.find(p=>p.id===facade.dataset.facade));
 const place=e.target.closest('[data-place]');if(place)select(place.dataset.place);
 const activity=e.target.closest('[data-activity]');if(activity)visitActivity(activity.dataset.activity);
 const m=e.target.closest('[data-mode]');if(m && m.dataset.mode!==mode){
   setMode(m.dataset.mode);
   if(mode==='future')visitActivity('beach');
   else {home();intro();closePanel()}
 }
 const c=e.target.closest('[data-category]');if(c){setActiveScene(null);category=c.dataset.category;renderDiscovery();if(category==='pier')world3d?.focus(places.find(p=>p.id==='pier-oporto').p,3.4)}
 const gallery=e.target.closest('[data-gallery-index]');if(gallery){galleryIndex=Number(gallery.dataset.galleryIndex);updateGallery()}
 const step=e.target.closest('[data-gallery-step]');if(step)stepGallery(Number(step.dataset.galleryStep));
 const view=e.target.closest('[data-view-map]');if(view){$('#attraction').close();$('#lightbox').close();toggleDiscovery(true);const key={areia:'beach',esportes:'beach',orla:'beach',rio:'marina',lagoafutura:'lake'}[activeAttraction.id];if(key)visitActivity(key);else world3d?.focus(activeAttraction.p,activeAttraction.categories?.includes('pier')?3.6:2);draw()}
 if(e.target.closest('[data-discover]')){closePanel();toggleDiscovery(false);category='all';renderDiscovery();$('#attractionRail').focus()}
 if(e.target.id==='backIntro'){intro();home()}
});
document.addEventListener('keydown',e=>{if(($('#attraction').open||$('#lightbox').open)&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();stepGallery(e.key==='ArrowLeft'?-1:1)}});
$('#toggleDiscovery').onclick=()=>toggleDiscovery(!railCollapsed);
$('#railPrev').onclick=()=>$('#attractionRail').scrollBy({left:-430,behavior:'smooth'});$('#railNext').onclick=()=>$('#attractionRail').scrollBy({left:430,behavior:'smooth'});
$('#plus').onclick=()=>world3d?.zoomBy(1.3);$('#minus').onclick=()=>world3d?.zoomBy(1/1.3);$('#home').onclick=()=>{home();intro()};$('#rotate').onclick=()=>world3d?.rotate();$('#tilt').onclick=()=>world3d?.tilt();
$('#pierView').onclick=()=>{
 category='pier';setMode('today');closePanel();
 if(!world3d){select('pier-oporto');return}
 selected='pier-oporto';toggleDiscovery(true);
 world3d.focus(places.find(p=>p.id===selected).p,3.8);
};
$('#beach').onclick=()=>{world3d?.beach();closePanel()};$('#motion').onclick=()=>{const moving=world3d?.toggleMotion();$('#motion').textContent=moving?'Pausar movimento':'Ativar movimento';$('#motion').setAttribute('aria-pressed',String(!moving))};
$('#closeFacade').onclick=()=>$('#facadeView').close();
$('#closePanel').onclick=closePanel;$('#openPanel').onclick=openPanel;
for(const s of ['#about','#sources'])$(s).onclick=()=>$('#info').showModal();
$('.dialogclose').onclick=()=>$('#info').close();$('#closeAttraction').onclick=()=>$('#attraction').close();$('#closeLightbox').onclick=()=>$('#lightbox').close();
for(const id of ['info','attraction','lightbox'])$('#'+id).addEventListener('click',e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close()});
const tour=['praia','lagoa','costao','oporto','flow','alma','molhes','orla','playground','esportes','lagoafutura','rio'];
$('#tour').onclick=()=>{tourIndex=(tourIndex+1)%tour.length;select(tour[tourIndex]);$('#tour').textContent=tourIndex===tour.length-1?'Recomeçar passeio':'Próxima parada'};
intro();closePanel();renderDiscovery();
fetch('assets/map.json').then(r=>{if(!r.ok)throw Error('map');return r.json()}).then(data=>{
 world3d=createWorld($('#map'),data,places,updateMarkers);
 for(const p of places){if(p.pin===false)continue;const b=document.createElement('button');b.id='pin-'+p.id;b.className='marker '+p.type;b.dataset.place=p.id;b.innerHTML=p.type==='bossa'?esc(p.name):icon(p)+'<span>'+esc(p.name)+'</span>';b.setAttribute('aria-label','Explorar '+p.name);$('#markers').appendChild(b)}
 home();world3d.setMode(mode);if(mode==='future')visitActivity('beach');$('#loading').remove();draw();if(matchMedia('(prefers-reduced-motion: reduce)').matches)$('#motion').textContent='Ativar movimento';
}).catch(e=>{
 console.warn('Maquete 3D indisponível:',e.message);$('#loading').remove();document.body.classList.add('map-unavailable');$('#mapStatus').hidden=false;$('#mapStatus').textContent='Seu navegador não abriu a maquete 3D. Você pode explorar todas as atrações pelas fotos abaixo.';
});
window.addEventListener('resize',()=>{world3d?.resize();updateMarkers()});
