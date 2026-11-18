// Every asset the 3D world loads must exist in public/assets and be listed in CREDITS.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,statSync} from 'node:fs';
const web=new URL('../',import.meta.url);
const src=readFileSync(new URL('app/world/assets.ts',web),'utf8');
const list=name=>JSON.parse(src.match(new RegExp(`export const ${name} = (\\[[^\\]]+\\])`))[1].replace(/'/g,'"'));
const credits=readFileSync(new URL('public/assets/CREDITS.md',web),'utf8');

test('every model the world loads is shipped and credited',()=>{
  for(const m of list('MODELS')){
    const f=new URL(`public/assets/models/${m}.glb`,web);
    assert.ok(existsSync(f),m);assert.ok(statSync(f).size>1000,`${m} looks empty`);
    assert.ok(credits.includes(`polyhaven.com/a/${m}`),`${m} missing from CREDITS.md`);
  }
});
test('every surface has colour, normal and roughness maps, and the HDRI is present',()=>{
  for(const s of list('SURFACES'))for(const slot of ['color','normal','orm'])
    assert.ok(existsSync(new URL(`public/assets/textures/${s}_${slot}.webp`,web)),`${s}_${slot}`);
  assert.ok(existsSync(new URL('public/assets/env/cobblestone_street_night_1k.hdr',web)));
});
test('the shipped asset bundle stays small enough for phones',()=>{
  let total=0;
  for(const m of list('MODELS'))total+=statSync(new URL(`public/assets/models/${m}.glb`,web)).size;
  for(const s of list('SURFACES'))for(const slot of ['color','normal','orm'])total+=statSync(new URL(`public/assets/textures/${s}_${slot}.webp`,web)).size;
  total+=statSync(new URL('public/assets/env/cobblestone_street_night_1k.hdr',web)).size;
  for(const f of shop)total+=statSync(new URL(`public/assets/shop/${f}`,web)).size;
  total+=statSync(new URL('public/assets/rabbit/rabbit.glb',web)).size;
  assert.ok(total<12*1024*1024,`assets are ${(total/1048576).toFixed(1)} MB`);
});

// The static shell is baked in Blender (blender/build_shop.py) from the same layout the engine reads.
const shop=['shop_shell.glb','lm_shop.webp','lm_street.webp'];
const layout=JSON.parse(readFileSync(new URL('app/world/layout.json',web),'utf8'));
test('the baked shop shell and its lightmaps are shipped',()=>{
  for(const f of shop){const u=new URL(`public/assets/shop/${f}`,web);assert.ok(existsSync(u),f);assert.ok(statSync(u).size>10000,`${f} looks empty`);}
  const glb=readFileSync(new URL('public/assets/shop/shop_shell.glb',web));const gltf=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)));
  const names=gltf.nodes.map(n=>n.name);
  for(const n of ['SHOP','STREET','COL_ground','COL_floor','COL_knee','COL_counter','COL_glass'])assert.ok(names.includes(n),`shell is missing ${n}`);
  // Every material is "<surface>@<shop|street>" so the engine can pick textures and the right lightmap.
  for(const m of gltf.materials)assert.match(m.name,/^[a-z_]+@(shop|street)$/);
});
test('layout props only use models that are loaded',()=>{
  const models=list('MODELS');
  for(const p of layout.props)assert.ok(models.includes(p.model),p.model);
  for(const l of layout.lights)assert.ok(['directional','point','spot'].includes(l.type));
});
test('the rabbit model has every animated part, with markings as vertex colours',()=>{
  const u=new URL('public/assets/rabbit/rabbit.glb',web);assert.ok(existsSync(u));
  const glb=readFileSync(u);const gltf=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)));
  const names=gltf.nodes.map(n=>n.name);
  for(const n of ['body','legs_front','head','ear_L','ear_R','eye_L','eye_R','nose'])assert.ok(names.includes(n),`rabbit is missing ${n}`);
  const head=gltf.nodes.find(n=>n.name==='head');
  for(const n of ['ear_L','ear_R','eye_L','eye_R','nose'])assert.ok(head.children.map(i=>gltf.nodes[i].name).includes(n),`${n} should move with the head`);
  const body=gltf.meshes[gltf.nodes.find(n=>n.name==='body').mesh];assert.ok('COLOR_0' in body.primitives[0].attributes,'body markings are vertex colours');
  assert.ok(statSync(u).size<1024*1024,'rabbit stays under 1 MB');
});
