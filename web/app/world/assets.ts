// Loads the CC0 Poly Haven assets shipped in public/assets (compressed with glTF-Transform: meshopt + WebP).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

export const MODELS = ["Television_01","boombox","cassette_player","Shelf_01","bar_chair_round_01","Lantern_01","anthurium_botany_01",
  "cardboard_box_01","WetFloorSign_01","street_lamp_01","metal_trash_can","fire_hydrant","utility_box_01",
  "security_light","alarm_clock_01","ceramic_vase_01","can_rusted","pull_chain_light_socket","rollershutter_door"] as const;
export type ModelName = typeof MODELS[number];
export const SURFACES = ["asphalt_02","brick_wall_10","wood_floor","wooden_planks","plastered_wall"] as const;
export type SurfaceName = typeof SURFACES[number];

export type Assets = {
  models: Record<ModelName, THREE.Group>;
  // Static shop and street baked in Blender (blender/build_shop.py), with their indirect-light lightmaps.
  shell: THREE.Group;
  // Rabbit shopkeeper modelled in Blender (blender/build_rabbit.py): named parts with joint pivots and vertex-colour markings.
  rabbit: THREE.Group;
  lightmaps: { shop: THREE.Texture; street: THREE.Texture };
  surface: (name:SurfaceName, repeatX:number, repeatY:number, extra?:Partial<THREE.MeshStandardMaterialParameters>) => THREE.MeshStandardMaterial;
  environment: THREE.Texture;
  dispose: () => void;
};

export async function loadAssets(renderer:THREE.WebGLRenderer, onProgress:(p:number)=>void, base="/assets"):Promise<Assets> {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress(total ? loaded / total : 0);
  const gltf = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  const textureLoader = new THREE.TextureLoader(manager);
  const disposables: { dispose: () => void }[] = [];

  const modelEntries = await Promise.all(MODELS.map(async name => {
    const g = await gltf.loadAsync(`${base}/models/${name}.glb`);
    g.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true; m.receiveShadow = true;
        disposables.push(m.geometry);
        for (const mat of ([] as THREE.Material[]).concat(m.material)) disposables.push(mat);
      }
    });
    return [name, g.scene] as const;
  }));

  // Surface textures are shared; each call clones them so different walls can have their own repeat.
  const surfaceMaps = Object.fromEntries(await Promise.all(SURFACES.map(async name => {
    const [color, normal, orm] = await Promise.all(["color","normal","orm"].map(slot => textureLoader.loadAsync(`${base}/textures/${name}_${slot}.webp`)));
    color.colorSpace = THREE.SRGBColorSpace;
    for (const t of [color, normal, orm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); disposables.push(t); }
    return [name, { color, normal, orm }] as const;
  }))) as Record<SurfaceName, { color: THREE.Texture; normal: THREE.Texture; orm: THREE.Texture }>;

  const surface: Assets["surface"] = (name, rx, ry, extra = {}) => {
    const src = surfaceMaps[name];
    const clone = (t: THREE.Texture) => { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; disposables.push(c); return c; };
    const orm = clone(src.orm);
    const material = new THREE.MeshStandardMaterial({ map: clone(src.color), normalMap: clone(src.normal), roughnessMap: orm, aoMap: orm, metalnessMap: orm, metalness: 1, ...extra });
    disposables.push(material);
    return material;
  };

  const rabbitGltf = await gltf.loadAsync(`${base}/rabbit/rabbit.glb`);
  rabbitGltf.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) disposables.push(m.geometry); });
  const shellGltf = await gltf.loadAsync(`${base}/shop/shop_shell.glb`);
  shellGltf.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { disposables.push(m.geometry); for (const mat of ([] as THREE.Material[]).concat(m.material)) disposables.push(mat); } });
  const lightmaps = Object.fromEntries(await Promise.all((["shop", "street"] as const).map(async g => {
    const t = await textureLoader.loadAsync(`${base}/shop/lm_${g}.webp`);
    // Baked in Blender and addressed through glTF's second UV set: sRGB-encoded, not flipped, channel 1.
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.channel = 1; t.needsUpdate = true; disposables.push(t);
    return [g, t] as const;
  }))) as Assets["lightmaps"];

  // Night street HDRI → prefiltered environment for image-based lighting (reflections on wet asphalt, glass, metal).
  const hdr = await new HDRLoader(manager).loadAsync(`${base}/env/cobblestone_street_night_1k.hdr`);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(hdr).texture;
  hdr.dispose(); pmrem.dispose(); disposables.push(environment);
  onProgress(1);

  return {
    models: Object.fromEntries(modelEntries) as Record<ModelName, THREE.Group>,
    shell: shellGltf.scene, rabbit: rabbitGltf.scene, lightmaps,
    surface, environment,
    dispose: () => { for (const d of disposables) d.dispose(); },
  };
}

// Clone a loaded model for placement. Materials are shared (cheap); geometry is shared.
export function place(source:THREE.Object3D, x:number, y:number, z:number, rotY=0, scale=1):THREE.Object3D {
  const o = source.clone(true);
  o.position.set(x, y, z); o.rotation.y = rotY; o.scale.setScalar(scale);
  return o;
}
// World-space bounding box size of an object (after transforms).
export function sizeOf(o:THREE.Object3D):THREE.Vector3 {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
}
