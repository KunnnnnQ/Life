// The shopkeeper: a rabbit modelled in Blender (blender/build_rabbit.py) after the user's pet — grey saddle, white face,
// chest and paws, a dark patch around the left eye, a white left ear and a grey right ear with a white tip.
// Fur uses shell rendering: thin offset copies of each part keep only scattered strand tips, so the silhouette is soft.
// Behaviour is a small planner: it hops around the counter, eats hay, grooms, and now and then jumps down to its litter
// box beside the counter. While the shop prepares something it runs back and forth; it hops to the chosen device.
import * as THREE from "three";

export type RabbitPlaces = {
  counterY: number; floorY: number;
  lane: { z: number; minX: number; maxX: number };   // walking line along the back of the counter
  home: THREE.Vector3;                                // usual seat, facing the visitor
  hay: THREE.Vector3;                                 // hay basket on the counter
  dropFrom: THREE.Vector3; dropTo: THREE.Vector3;     // where it jumps down (counter end) and lands (floor)
  litter: THREE.Vector3;                              // litter box on the floor
};
export type RabbitContext = { look: THREE.Vector3 | null; busy: boolean; petAge: number; still: boolean; focus: THREE.Vector3 | null };
export type Routine = "potty" | "eat" | "wander" | "groom" | "home";
export type Rabbit = { group: THREE.Group; update: (dt:number, t:number, ctx:RabbitContext) => void; activity: () => string; perform: (r:Routine) => void; dispose: () => void };

function furMaterial(shell:number, length:number, density:number){
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: .95, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uShell = { value: shell };
    shader.uniforms.uLength = { value: length };
    shader.uniforms.uDensity = { value: density };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uShell;\nuniform float uLength;\nvarying vec3 vBasePos;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vBasePos = position;
        transformed += normalize(objectNormal) * uShell * uLength;
        transformed.y -= uShell * uShell * uLength * .35;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uShell; uniform float uDensity; varying vec3 vBasePos;
        float furHash(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
        vec3 cell = vBasePos * uDensity;
        float h = furHash(floor(cell));
        float r = length(fract(cell) - .5);
        if (uShell > 0.0 && (r > (1.0 - uShell) * .62 || h < uShell * .8)) discard;`)
      // Strand roots are darker than tips: cheap self-shadowing.
      .replace("#include <color_fragment>", "#include <color_fragment>\n diffuseColor.rgb *= mix(.66, 1.04, uShell);");
  };
  m.customProgramCacheKey = () => `fur-${shell.toFixed(3)}-${length}`;
  return m;
}

type Act =
  | { k: "sit" | "eat" | "groom" | "potty"; dur: number; face?: THREE.Vector3 }
  | { k: "hop"; to: THREE.Vector3 }
  | { k: "jump"; to: THREE.Vector3 }
  | { k: "binky" };

const FUR_LENGTH:Record<string,number> = { body: .012, head: .008, legs_front: .006, ear_L: .004, ear_R: .004 };
const EAR_REST = { ear_L: new THREE.Euler(-.38, 0, .2), ear_R: new THREE.Euler(-.3, 0, -.24) };

export function createRabbit(source:THREE.Object3D, places:RabbitPlaces, opts:{ shells:number }):Rabbit {
  const group = new THREE.Group();
  const model = source.clone(true); group.add(model);
  const materials:THREE.Material[] = [], geometries:THREE.BufferGeometry[] = [];
  const part = (name:string) => model.getObjectByName(name) as THREE.Mesh;
  const body = part("body"), head = part("head"), legs = part("legs_front"), nose = part("nose");
  const ears = { ear_L: part("ear_L"), ear_R: part("ear_R") }, eyes = [part("eye_L"), part("eye_R")];

  // Fur on the furry parts: base skin plus shells.
  for (const [name, length] of Object.entries(FUR_LENGTH)) {
    const mesh = part(name); if (!mesh) continue;
    const base = furMaterial(0, length, 150); materials.push(base); mesh.material = base; mesh.castShadow = mesh.receiveShadow = true;
    for (let s = 1; s <= opts.shells; s++) {
      const mat = furMaterial(s / opts.shells, length, 150); materials.push(mat);
      const shell = new THREE.Mesh(mesh.geometry, mat); shell.castShadow = false; shell.receiveShadow = true; shell.raycast = () => {};
      mesh.add(shell);
    }
  }
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: "#0b1013", roughness: .05, clearcoat: 1, clearcoatRoughness: .03 }); materials.push(eyeMat);
  for (const e of eyes) e.material = eyeMat;
  const noseMat = new THREE.MeshStandardMaterial({ color: "#c98b8b", roughness: .45 }); materials.push(noseMat); nose.material = noseMat;
  for (const [n, e] of Object.entries(EAR_REST)) ears[n as keyof typeof ears].rotation.copy(e);
  // Whiskers.
  const whiskerMat = new THREE.LineBasicMaterial({ color: "#f3f1ea", transparent: true, opacity: .55 }); materials.push(whiskerMat);
  const muzzle = new THREE.Vector3(0, .195 - .17, .262 - .12);   // in head space (head pivot at 0,.17,.12)
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const g = new THREE.BufferGeometry().setFromPoints([muzzle.clone().add(new THREE.Vector3(side * .02, 0, 0)),
      muzzle.clone().add(new THREE.Vector3(side * .11, -.012 + i * .012, -.01 + i * .004))]);
    geometries.push(g); head.add(new THREE.Line(g, whiskerMat));
  }
  const headRest = head.quaternion.clone(), bodyRest = body.position.clone();

  // ---------- behaviour ----------
  const pos = places.home.clone(); let heading = 0, onCounter = true;
  group.position.copy(pos);
  const queue:Act[] = []; let act:Act | null = null, actT = 0;
  let hop:{ from:THREE.Vector3; to:THREE.Vector3; t:number; dur:number; height:number } | null = null, pause = 0;
  let interrupted = false, lastPotty = -40, lastPetAge = 99, busyLeg = 0, blink = 0, nextBlink = 2, earTwitch = 0, mood = "sit";
  const rnd = (a:number, b:number) => a + Math.random() * (b - a);
  const onLane = (x:number) => new THREE.Vector3(THREE.MathUtils.clamp(x, places.lane.minX, places.lane.maxX), places.counterY, places.lane.z);

  function returnToCounter(){ if (onCounter) return; queue.push({ k: "hop", to: places.dropTo.clone() }, { k: "jump", to: places.dropFrom.clone() }); }
  let forced:Routine | null = null;
  function plan(ctx:RabbitContext, t:number){
    if (forced && onCounter) { const f = forced; forced = null; routine(f, t); return; }
    if (ctx.focus) { returnToCounter(); queue.push({ k: "hop", to: onLane(ctx.focus.x) }, { k: "hop", to: ctx.focus.clone() }, { k: "sit", dur: 4 }); return; }
    if (ctx.busy) { returnToCounter(); busyLeg = 1 - busyLeg; queue.push({ k: "hop", to: onLane(busyLeg ? 1.2 : -.9) }, { k: "sit", dur: rnd(.2, .6) }); return; }
    if (!onCounter) { returnToCounter(); return; }
    const r = Math.random();
    routine(t - lastPotty > 50 && r < .14 ? "potty" : r < .38 ? "eat" : r < .62 ? "wander" : r < .74 ? "groom" : "home", t);
  }
  function routine(kind:Routine, t:number){
    if (kind === "potty") {                        // litter box beside the counter
      lastPotty = t;
      queue.push({ k: "hop", to: onLane(places.dropFrom.x) }, { k: "hop", to: places.dropFrom.clone() }, { k: "jump", to: places.dropTo.clone() },
        { k: "hop", to: places.litter.clone() }, { k: "potty", dur: rnd(5, 8) }, { k: "hop", to: places.dropTo.clone() },
        { k: "jump", to: places.dropFrom.clone() }, { k: "hop", to: onLane(places.home.x) }, { k: "hop", to: places.home.clone() }, { k: "sit", dur: 3 });
    } else if (kind === "eat") {                   // eat some hay
      const at = onLane(places.hay.x + .2);
      queue.push({ k: "hop", to: at }, { k: "eat", dur: rnd(7, 12), face: places.hay.clone() });
    } else if (kind === "wander") {                // wander along the counter, then sit for a while
      const x = rnd(places.lane.minX + .2, places.lane.maxX - .3);
      queue.push({ k: "hop", to: onLane(x) }, { k: "sit", dur: rnd(3, 6) });
    } else if (kind === "groom") {
      queue.push({ k: "groom", dur: rnd(3, 5) });
    } else {                                       // back to the usual seat, facing the visitor
      queue.push({ k: "hop", to: onLane(places.home.x) }, { k: "hop", to: places.home.clone() }, { k: "sit", dur: rnd(6, 12) });
    }
  }

  function turnToward(target:THREE.Vector3, dt:number, rate=6){
    const want = Math.atan2(target.x - pos.x, target.z - pos.z);
    const d = Math.atan2(Math.sin(want - heading), Math.cos(want - heading));
    heading += d * (1 - Math.exp(-dt * rate)); return Math.abs(d);
  }

  function update(dt:number, t:number, ctx:RabbitContext){
    const still = ctx.still;
    // Interruptions: a new focus or busy state, or being petted.
    if (ctx.petAge < lastPetAge && ctx.petAge < .2 && onCounter && !ctx.busy && !still && !hop) { queue.length = 0; act = { k: "binky" }; actT = 0; }
    lastPetAge = ctx.petAge;
    const wantsMode = ctx.focus ? `focus${ctx.focus.x.toFixed(2)}` : ctx.busy ? "busy" : "free";
    if (wantsMode !== mood) { mood = wantsMode; queue.length = 0; if (!hop && act?.k !== "jump") act = null; else interrupted = true; }

    if (still) {
      // Reduced motion: sit at home facing the visitor.
      pos.copy(places.home); heading = 0; onCounter = true; hop = null; act = null; queue.length = 0;
    } else {
      if (!act && !hop) { if (!queue.length) plan(ctx, t); act = queue.shift() ?? { k: "sit", dur: 2 }; actT = 0; }
      actT += dt;
      let squash = 0, lift = 0;
      if (hop) {
        hop.t += dt; const p = Math.min(1, hop.t / hop.dur);
        pos.lerpVectors(hop.from, hop.to, p);
        if (act?.k === "jump") {
          const apex = Math.max(hop.from.y, hop.to.y) + hop.height;   // quadratic Bezier through the apex height
          pos.y = (1 - p) * (1 - p) * hop.from.y + 2 * p * (1 - p) * apex + p * p * hop.to.y;
        } else pos.y += 4 * hop.height * p * (1 - p);
        squash = Math.sin(p * Math.PI); lift = p;
        if (p >= 1) { hop = null; pause = act?.k === "jump" ? .25 : rnd(.04, .12); if (act?.k === "jump") { onCounter = pos.y > (places.counterY + places.floorY) / 2; act = null; }
          if (interrupted) { interrupted = false; act = null; } }
      } else if (act) {
        switch (act.k) {
          case "hop": {
            const d = new THREE.Vector3(act.to.x - pos.x, 0, act.to.z - pos.z), len = d.length();
            if (len < .03) { pos.x = act.to.x; pos.z = act.to.z; act = null; break; }
            if (turnToward(act.to, dt, 10) > .35) break;          // turn first, then hop
            if ((pause -= dt) > 0) break;
            const step = Math.min(len, .17), dur = .2 + step * .5;
            const to = pos.clone().add(d.multiplyScalar(step / len)); to.y = act.to.y;
            hop = { from: pos.clone(), to, t: 0, dur, height: .03 + step * .25 }; break;
          }
          case "jump": {
            if (turnToward(act.to, dt, 10) > .2) break;
            if ((pause -= dt) > 0) break;
            hop = { from: pos.clone(), to: act.to.clone(), t: 0, dur: .55, height: .18 }; break;
          }
          case "binky": {
            const p = Math.min(1, actT / .7); pos.y = places.counterY + Math.sin(p * Math.PI) * .16;
            heading += dt * 9 * Math.sin(p * Math.PI); squash = Math.sin(p * Math.PI);
            if (p >= 1) { pos.y = places.counterY; act = null; }
            break;
          }
          default: {
            const face = act.face ?? (act.k === "sit" && ctx.look && onCounter ? ctx.look : null);
            if (face) turnToward(face, dt, act.k === "sit" ? 2 : 6); else if (act.k === "sit" && onCounter) turnToward(pos.clone().add(new THREE.Vector3(0, 0, 1)), dt, 2);
            if (actT > act.dur) act = null;
          }
        }
      }
      // Body pose from the movement.
      // Whole rabbit pitches nose-up on take-off and nose-down on landing, and stretches in the air.
      model.rotation.x = hop ? -.14 * Math.sin(lift * Math.PI * 2) - squash * .05 : 0;
      model.scale.set(1, 1 - squash * .05, 1 + squash * .08);
      body.scale.set(1, 1 + Math.sin(t * 2.4) * .012, 1);
      legs.rotation.x = hop ? -.7 * squash : 0;
    }
    group.position.copy(pos); group.rotation.y = heading;

    // Head: eat (down, chewing), groom (paws to face), otherwise look at the visitor or glance around.
    const kind = act?.k ?? (hop ? "hop" : "sit"), time = still ? 0 : t;
    const targetQ = new THREE.Quaternion();
    if (!still && kind === "eat") targetQ.setFromEuler(new THREE.Euler(.55 + Math.sin(t * 16) * .04, 0, 0)).premultiply(headRest);
    else if (!still && kind === "groom") targetQ.setFromEuler(new THREE.Euler(.35, Math.sin(t * 5) * .25, Math.sin(t * 5) * .1)).premultiply(headRest);
    else if (ctx.look && !hop && onCounter) {
      const headWorld = head.getWorldPosition(new THREE.Vector3()), local = ctx.look.clone();
      group.worldToLocal(local); local.sub(group.worldToLocal(headWorld.clone()));
      const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -.9, .9), pitch = THREE.MathUtils.clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -.35, .3);
      targetQ.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ")).premultiply(headRest);
    } else targetQ.setFromEuler(new THREE.Euler(0, Math.sin(time * .45) * .2, 0)).premultiply(headRest);
    head.quaternion.slerp(targetQ, 1 - Math.exp(-dt * 6));
    if (!still && kind === "groom") legs.rotation.x = -1.1 + Math.sin(t * 10) * .12;
    // Nose wiggles, faster when eating or sniffing.
    nose.scale.y = 1 + (still ? 0 : Math.max(0, Math.sin(t * (kind === "eat" ? 22 : 12))) * .35);
    // Ears: rest pose, twitches, flattened back when petted, alert while hopping.
    if (!still && (earTwitch -= dt) < 0) earTwitch = rnd(2, 6);
    const pet = ctx.petAge < 1.6 ? 1 - ctx.petAge / 1.6 : 0;
    for (const [n, e] of Object.entries(EAR_REST)) {
      const ear = ears[n as keyof typeof ears], side = n === "ear_L" ? 1 : -1;
      const twitch = !still && earTwitch < .25 && n === "ear_R" ? Math.sin(earTwitch * 40) * .15 : 0;
      ear.rotation.set(e.x - pet * .8 + (hop ? .15 : 0) + Math.sin(time * 1.2 + side) * .04, twitch, e.z + side * pet * .25);
    }
    // Blinking.
    if (!still) { nextBlink -= dt; if (nextBlink < 0) { blink = .14; nextBlink = rnd(2.5, 6); } }
    blink = Math.max(0, blink - dt); for (const e of eyes) e.scale.y = blink > 0 ? .15 : 1;
    if (still) { body.scale.set(1, 1, 1); model.rotation.x = 0; model.scale.set(1, 1, 1); legs.rotation.x = 0; body.position.copy(bodyRest); }
  }
  const perform = (r:Routine) => { forced = r; queue.length = 0; if (!hop && act?.k !== "jump") act = null; };
  return { group, update, perform, activity: () => (act?.k ?? (hop ? "hop" : "sit")) + (onCounter ? "" : "@floor"),
    dispose: () => { for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); } };
}
