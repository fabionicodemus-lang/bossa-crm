// Reference-calibrated exterior finishes for the supplied Alma R05 facade.
// Material names come from the actual architectural GLB; no triangles, doors,
// glazing locations or facade curves are moved. Existing details stay intact.
// References: the supplied frontal and close-up facade renders in assets/.

const stucco=(tint,roughness=.74,normalStrength=.105)=>({
  type:'plaster',tint,roughness,normalStrength,
  textureScale:[.76,.76],detailScale:[.13,.13],
});
const timber=(tint,roughness=.67,normalStrength=.22)=>({
  type:'oak',tint,roughness,normalStrength,
  textureScale:[.42,2.1],detailScale:[.14,.64],
});

// The upper curtain wall was exported as opaque blue CAD geometry even though
// both original Revit paths identify a System Panel - Glazed. Use the same
// glass pipeline as the actual balcony panes (including environment lighting).
const sourceRoles={
  stone__source_rgb_0080c0:'glass__glass_smoke',
  stone__source_rgb_fff79c:'metal__alma_lettering',
};

function applyGlazing(material){
  material.transparent=true;
  material.depthWrite=false;
  material.forceSinglePass=true;
  material.onBeforeCompile=shader=>{
    // Fresnel already modulates Three's specular response. This controls how
    // much of the background remains visible through an obliquely viewed pane.
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float almaPaneAngle=1.-abs(dot(normalize(normal),normalize(vViewPosition)));
      float almaPaneEdge=almaPaneAngle*almaPaneAngle*almaPaneAngle;
      diffuseColor.a=mix(diffuseColor.a,.83,almaPaneEdge);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey=()=>'alma-angle-glazing';
}

export const FACADE_MATERIAL_PROFILES=Object.freeze({
  // Architectural white ribbons: a warm, smooth mineral finish in the render.
  'stone__solid_neutral':stucco('#DED9CF',.77,.105),
  'stone__plaster_offwhite':stucco('#F0EBE3',.68,.075),
  'stone__plaster_ivory':stucco('#EAE4D9',.72,.09),
  'stone__source_rgb_c0c0c0':stucco('#E9E5DB',.72,.085),
  'stone__source_rgb_d2d2d2':stucco('#EEE9DE',.69,.07),
  'stone__source_rgb_cecece':stucco('#ECE8E0',.72,.085),
  'stone__source_rgb_f4f4f4':stucco('#F5F0E8',.65,.06),
  'stone__source_rgb_eeeeee':stucco('#F1ECE4',.68,.07),
  'stone__source_rgb_f7f7f7':stucco('#F0EBE3',.69,.08),
  'stone__source_rgb_f0eee8':stucco('#ECE7DC',.71,.08),
  'stone__source_rgb_f9f9f9':stucco('#F5F0E7',.67,.07),
  'stone__source_rgb_e6e9ec':stucco('#EAE9E4',.72,.08),
  'stone__source_rgb_b9b9b9':stucco('#DAD8D2',.74,.09),

  // Light and shadow side walls stay graphite, but no longer flat gray.
  'stone__source_rgb_808080':stucco('#686A69',.82,.13),
  'stone__source_rgb_787878':stucco('#626565',.79,.13),
  'stone__source_rgb_7f7f7f':stucco('#65686B',.77,.115),
  'stone__source_rgb_626262':stucco('#555956',.78,.12),
  'stone__source_rgb_404040':stucco('#393D3B',.77,.11),

  // Tall vertical slats and darker inner recesses: warm honey/bronze oak
  // seen in the reference image, with real grain and subtle microrelief.
  'wood__wood_honey':timber('#BA9469',.63,.23),
  'stone__source_rgb_997859':timber('#9F7853',.69,.25),
  'stone__source_rgb_d29f5f':timber('#BD9266',.64,.23),
  'stone__source_rgb_5a453b':timber('#71553F',.73,.18),
  'stone__source_rgb_c9a085':timber('#C3A080',.67,.19),

  // Extruded dark aluminium mullions retain metal instead of faux stone.
  'metal__metal_black':{
    tint:'#33393B',metalness:.70,roughness:.34,metal:true,
  },
  // Illuminated satin champagne lettering is identifiable as Alma2.dxf.
  'metal__alma_lettering':{
    tint:'#D7BD91',metalness:.7,roughness:.31,metal:true,emissive:'#A57D46',
  },
  // Preserve sight lines to the interior while adding coastal-blue highlights.
  'glass__glass_smoke':{
    tint:'#AEBEC2',opacity:.26,metalness:.13,roughness:.055,glass:true,
  },
});

export function refineAlmaFacadeFinishes(group){
  const changed=[],materials=new Set();
  group.traverse(object=>{
    if(!object.isMesh)return;
    const entries=Array.isArray(object.material)?object.material:[object.material];
    for(const material of entries){
      if(!material||materials.has(material))continue;
      materials.add(material);
      if(sourceRoles[material.name]){
        material.userData.almaSourceMaterial=material.name;
        material.name=sourceRoles[material.name];
      }
      const profile=FACADE_MATERIAL_PROFILES[material.name];
      if(!profile)continue;
      material.userData.almaExterior=true;
      material.userData.alma_facade_reference='alma_fachada_render_v9';
      material.userData.alma_profile_id=`alma_exterior_v9_${material.name}`;
      material.color.set(profile.tint);
      material.roughness=profile.roughness;
      if(profile.type){
        material.userData.alma_finish={...profile};
        // The shared metric shader applies fine-scale maps to these surfaces.
      }else{
        material.metalness=profile.metalness;
        if(profile.emissive){
          material.emissive.set(profile.emissive);
          material.emissiveIntensity=.34;
        }
        if(profile.glass){
          applyGlazing(material);
          material.opacity=profile.opacity;
        }
      }
      material.needsUpdate=true;
      changed.push(material.name);
    }
  });
  group.userData.almaExteriorFinishRevision=9;
  group.userData.almaExteriorMaterialCount=changed.length;
  return changed;
}
