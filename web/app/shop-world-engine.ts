// First-person rainy alley with a little night shop. Visitors walk with real collisions (Rapier),
// can push loose props around, and the rabbit shopkeeper watches them from the counter.
// Models, surfaces and the night HDRI are CC0 assets from Poly Haven (see public/assets/CREDITS.md).
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { loadAssets, place } from "./world/assets.ts";
import type { Assets, ModelName, SurfaceName } from "./world/assets.ts";
import { createRabbit } from "./world/rabbit.ts";
import type { RabbitPlaces } from "./world/rabbit.ts";
import { createAmbience } from "./world/audio.ts";
import LAYOUT from "./world/layout.json";

export type WorldState={inside:boolean;busy:boolean;device:string;still:boolean;caption:string;returned:boolean;muted?:boolean};
export type WorldCallbacks={enter:()=>void;leave?:()=>void;pet:()=>void;object:(name:string)=>void;error:()=>void;
  progress?:(p:number)=>void;ready?:()=>void;hover?:(label:string|null)=>void;lock?:(locked:boolean)=>void};

// Layout (metres). Shop interior x∈[-4.4,4.4], z∈[-3.5,2.55]; front wall at z=2.7 with the door at x∈[2.2,4.3].
// Shared with the Blender bake through world/layout.json.
const FLOOR=LAYOUT.floor, SIDEWALK=LAYOUT.sidewalk, COUNTER_Z=LAYOUT.counterZ, COUNTER_TOP=LAYOUT.counterTop, EYE=1.58;
// Baked bounce light vs. real-time direct light; the hemisphere fill is lower now that the lightmap carries the bounce.
const LIGHTMAP_INTENSITY=1.0, HEMI_INTENSITY=.22;
const DEVICE_SPOTS:Record<string,{at:[number,number,number];stand:[number,number];rabbit:[number,number]}>={
  tv:{at:[-2.3,COUNTER_TOP+.25,COUNTER_Z],stand:[-2.0,-.15],rabbit:[-1.5,COUNTER_Z-.05]},
  radio:{at:[2.0,COUNTER_TOP+.22,COUNTER_Z],stand:[1.7,-.15],rabbit:[1.4,COUNTER_Z-.05]},
  task:{at:[.75,COUNTER_TOP,COUNTER_Z+.3],stand:[.65,-.05],rabbit:[.4,COUNTER_Z]},
};
// The rabbit's hay basket on the counter and its litter box on the floor beside the counter's right end.
const HAY=new THREE.Vector3(-1.75,COUNTER_TOP,COUNTER_Z-.3), LITTER=new THREE.Vector3(3.95,FLOOR,-2.55);

function qualityTier(){
  const coarse=window.matchMedia("(pointer: coarse)").matches, narrow=window.innerWidth<760;
  const low=coarse||narrow||(navigator.hardwareConcurrency??8)<=4;
  return {low,dpr:Math.min(window.devicePixelRatio,low?1:1.5),shells:low?5:12,rain:low?500:1400,ao:!low,shadow:low?1024:2048};
}

export function createShopWorld(host:HTMLDivElement,callbacks:WorldCallbacks){
  const tier=qualityTier();
  const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:"high-performance"});
  renderer.setPixelRatio(tier.dpr);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
  host.appendChild(renderer.domElement);
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute("role","img");
  canvas.setAttribute("aria-label","可以自由走动的三维雨夜小巷和便利店。点击画面后用鼠标环顾，W A S D 移动，E 互动，Esc 释放鼠标。");

  const scene=new THREE.Scene();scene.background=new THREE.Color("#0b1620");scene.fog=new THREE.FogExp2("#0e1c25",.035);
  const camera=new THREE.PerspectiveCamera(70,1,.05,120);scene.add(camera);
  const composer=new EffectComposer(renderer,new THREE.WebGLRenderTarget(1,1,{samples:4,type:THREE.HalfFloatType}));
  composer.addPass(new RenderPass(scene,camera));
  let gtao:GTAOPass|null=null;
  if(tier.ao){gtao=new GTAOPass(scene,camera,1,1);gtao.blendIntensity=.85;composer.addPass(gtao);}
  const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.38,.55,.82);composer.addPass(bloom);
  // Vignette + fine film grain: makes the frame read as a photographed night rather than a CG render.
  const grade=new ShaderPass({uniforms:{tDiffuse:{value:null},uTime:{value:0},uStrength:{value:tier.low?.025:.04}},
    vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader:`uniform sampler2D tDiffuse;uniform float uTime;uniform float uStrength;varying vec2 vUv;
      float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+uTime)*43758.5453);}
      void main(){vec4 c=texture2D(tDiffuse,vUv);float v=smoothstep(.95,.25,distance(vUv,vec2(.5)));
        c.rgb*=mix(.62,1.,v);c.rgb+=(h(vUv*vec2(1920.,1080.))-.5)*uStrength;gl_FragColor=c;}`});
  composer.addPass(grade);composer.addPass(new OutputPass());

  const ambience=createAmbience();
  const disposables:{dispose:()=>void}[]=[];
  const track=<T extends {dispose:()=>void}>(x:T)=>{disposables.push(x);return x;};
  const interactive:THREE.Object3D[]=[];
  const tag=(o:THREE.Object3D,id:string)=>{o.userData.action=id;interactive.push(o);return o;};

  // ---------- state ----------
  let state:WorldState={inside:false,busy:false,device:"idle",still:false,caption:"",returned:false};
  let disposed=false,frame=0,previous=performance.now(),elapsed=0,ready=false,insideNow=false,petTime=-10,lastHover:string|null=null,lastHoverLabel:string|null=null;
  let lastManualMove=-10,yaw=0,pitch=-.04,locked=false,dragging=false,lastX=0,lastY=0,dragMoved=0,stepTimer=0;
  const keys=new Set<string>(),moveInput={x:0,z:0};
  let autopilot:{points:THREE.Vector2[];look:THREE.Vector3|null;then?:()=>void}|null=null;
  // After arriving, keep turning toward the look target until aligned (or the visitor takes over).
  let lookHold:{target:THREE.Vector3;until:number}|null=null;
  const playerStart=new THREE.Vector3(.8,.9,13.2);

  // ---------- physics ----------
  let world:RAPIER.World|null=null,character:RAPIER.KinematicCharacterController|null=null,playerBody:RAPIER.RigidBody|null=null,playerCollider:RAPIER.Collider|null=null;
  let doorBody:RAPIER.RigidBody|null=null;
  const dynamics:{mesh:THREE.Object3D;body:RAPIER.RigidBody}[]=[];
  let verticalSpeed=0;
  function fixed(x:number,y:number,z:number,hx:number,hy:number,hz:number,rotY=0){
    if(!world)return;const b=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,y,z).setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,rotY,0))));
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx,hy,hz).setFriction(.8),b);
  }
  function fixedBox(o:THREE.Object3D,pad=0){const box=new THREE.Box3().setFromObject(o),c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3());
    fixed(c.x,c.y,c.z,s.x/2+pad,s.y/2+pad,s.z/2+pad);}
  function dynamicFrom(o:THREE.Object3D,shape:"box"|"cylinder",density:number){
    if(!world)return;scene.add(o);o.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(o),c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3());
    // Re-centre the visual on the body so physics and mesh rotate together.
    const holder=new THREE.Group();holder.position.copy(c);holder.rotation.copy(o.rotation);scene.add(holder);
    o.position.sub(c);o.rotation.set(0,0,0);o.position.applyEuler(new THREE.Euler(0,-holder.rotation.y,0));holder.add(o);
    const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(c.x,c.y,c.z)
      .setRotation(holder.quaternion).setLinearDamping(.4).setAngularDamping(.5).setCcdEnabled(true));
    const desc=shape==="box"?RAPIER.ColliderDesc.cuboid(s.x/2,s.y/2,s.z/2):RAPIER.ColliderDesc.cylinder(s.y/2,Math.max(s.x,s.z)/2);
    world.createCollider(desc.setDensity(density).setFriction(.6).setRestitution(.2),body);
    dynamics.push({mesh:holder,body});
  }

  // ---------- helpers ----------
  const std=(color:string,roughness=.7,extra:Partial<THREE.MeshStandardMaterialParameters>={})=>track(new THREE.MeshStandardMaterial({color,roughness,...extra}));
  const boxMesh=(w:number,h:number,d:number,m:THREE.Material,x:number,y:number,z:number,parent:THREE.Object3D=scene)=>{
    const g=track(new THREE.BoxGeometry(w,h,d));
    // Second UV set is not needed: three r15x+ reads aoMap from the first UV channel.
    const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  // Text on canvas, sized from the plane's aspect ratio so long, thin signs stay sharp and never overlap.
  function canvasLabel(text:string,w:number,h:number,opts:{bg:string;fg:string;size:number;sub?:string;glow?:number}){
    const c=document.createElement("canvas");c.width=2048;c.height=Math.max(160,Math.round(2048*h/w));const g=c.getContext("2d")!;
    g.fillStyle=opts.bg;g.fillRect(0,0,c.width,c.height);g.strokeStyle=opts.fg;g.globalAlpha=.35;g.lineWidth=4;g.strokeRect(10,10,c.width-20,c.height-20);g.globalAlpha=1;
    g.fillStyle=opts.fg;g.textAlign="center";g.textBaseline="middle";
    const main=Math.min(opts.size*2,c.height*(opts.sub?.46:.62));
    g.font=`600 ${main}px "Microsoft YaHei","PingFang SC",sans-serif`;g.fillText(text,1024,c.height*(opts.sub?.4:.52),c.width*.92);
    if(opts.sub){g.font=`${Math.round(c.height*.13)}px Georgia,serif`;g.globalAlpha=.75;g.fillText(opts.sub,1024,c.height*.8,c.width*.92);g.globalAlpha=1;}
    const t=track(new THREE.CanvasTexture(c));t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;
    const m=std("#ffffff",.6,{map:t,emissiveMap:t,emissive:"#ffffff",emissiveIntensity:opts.glow??.4});
    return new THREE.Mesh(track(new THREE.PlaneGeometry(w,h)),m);
  }

  // A plane with a canvas drawing on it (1024 px wide, height from the aspect ratio).
  function paintedPlane(w:number,h:number,draw:(g:CanvasRenderingContext2D,W:number,H:number)=>void,glow=.2){
    const c=document.createElement("canvas");c.width=1024;c.height=Math.round(1024*h/w);draw(c.getContext("2d")!,c.width,c.height);
    const tex=track(new THREE.CanvasTexture(c));tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;
    return new THREE.Mesh(track(new THREE.PlaneGeometry(w,h)),std("#ffffff",.75,{map:tex,emissiveMap:tex,emissive:"#ffffff",emissiveIntensity:glow}));
  }
  // TV screen texture (system-chosen content title).
  const tvCanvas=document.createElement("canvas");tvCanvas.width=512;tvCanvas.height=384;const tvCtx=tvCanvas.getContext("2d")!;
  const tvTex=track(new THREE.CanvasTexture(tvCanvas));tvTex.colorSpace=THREE.SRGBColorSpace;
  type TvMode="off"|"rain"|"breath"|"content";let tvMode:TvMode="off",tvText="",tvDrawn=-1;
  function drawTv(t:number){
    const g=tvCtx,W=512,H=384;tvDrawn=t;
    const corner=(s:string)=>{g.fillStyle="rgba(255,255,255,.55)";g.font="18px 'Microsoft YaHei',sans-serif";g.textAlign="left";g.fillText(s,20,H-20);};
    if(tvMode==="off"){const grd=g.createRadialGradient(256,192,40,256,192,300);grd.addColorStop(0,"#14222a");grd.addColorStop(1,"#0a1216");g.fillStyle=grd;g.fillRect(0,0,W,H);}
    else if(tvMode==="content"){
      const grd=g.createRadialGradient(256,192,40,256,192,300);grd.addColorStop(0,"#3d6f73");grd.addColorStop(1,"#183338");g.fillStyle=grd;g.fillRect(0,0,W,H);
      g.fillStyle="#f6e2b4";g.textAlign="center";g.font="600 30px 'Microsoft YaHei',sans-serif";
      const chars=[...(tvText||"正在准备")].slice(0,42);for(let i=0;i<chars.length;i+=14)g.fillText(chars.slice(i,i+14).join(""),256,170+(i/14)*40);
      corner("点一下观看");
    }else if(tvMode==="rain"){
      g.fillStyle="#0c1822";g.fillRect(0,0,W,H);
      for(let i=0;i<16;i++){const x=(i*97+t*5)%(W+60)-30,y=140+((i*53)%170),r=12+(i%5)*7;const grd=g.createRadialGradient(x,y,0,x,y,r);
        grd.addColorStop(0,i%3?"rgba(255,186,118,.5)":"rgba(140,190,255,.42)");grd.addColorStop(1,"rgba(0,0,0,0)");g.fillStyle=grd;g.fillRect(x-r,y-r,r*2,r*2);}
      g.strokeStyle="rgba(190,215,235,.32)";g.lineWidth=1.2;
      for(let i=0;i<70;i++){const x=(i*61)%W,y=((i*113)+t*240)%(H+40)-40;g.beginPath();g.moveTo(x,y);g.lineTo(x-4,y+22);g.stroke();}
      corner("CH 1  雨夜");
    }else{
      // 4 s in, 2 s hold, 6 s out — a slow exhale is the calming part.
      const c=t%12,k=c<4?c/4:c<6?1:1-(c-6)/6,ease=.5-.5*Math.cos(k*Math.PI);
      g.fillStyle="#12252a";g.fillRect(0,0,W,H);
      const r=48+ease*100,grd=g.createRadialGradient(256,178,r*.15,256,178,r);grd.addColorStop(0,"rgba(176,228,212,.85)");grd.addColorStop(1,"rgba(90,160,150,.12)");
      g.fillStyle=grd;g.beginPath();g.arc(256,178,r,0,Math.PI*2);g.fill();
      g.fillStyle="#eef3ea";g.font="600 32px 'Microsoft YaHei',sans-serif";g.textAlign="center";g.fillText(c<4?"吸气":c<6?"停一下":"呼气",256,190);
      corner("CH 2  呼吸 4 · 2 · 6");
    }
    for(let y=0;y<H;y+=3){g.fillStyle="rgba(0,0,0,.08)";g.fillRect(0,y,W,1);}
    tvTex.needsUpdate=true;
  }
  drawTv(0);
  // Note pad on the counter: a line for the visitor's next visit, or tonight's exercise when the shop chose one.
  const cardCanvas=document.createElement("canvas");cardCanvas.width=720;cardCanvas.height=480;const cardCtx=cardCanvas.getContext("2d")!;
  const cardTex=track(new THREE.CanvasTexture(cardCanvas));cardTex.colorSpace=THREE.SRGBColorSpace;cardTex.anisotropy=8;let note="";
  function drawCard(){
    const g=cardCtx,W=720,H=480,task=state.device==="task";
    g.fillStyle="#efe6cf";g.fillRect(0,0,W,H);g.strokeStyle="rgba(70,110,140,.22)";g.lineWidth=2;for(let y=150;y<H;y+=78){g.beginPath();g.moveTo(40,y);g.lineTo(W-40,y);g.stroke();}
    g.fillStyle="#9a3b32";g.fillRect(0,0,W,14);
    g.fillStyle="#2b3a36";g.textAlign="left";g.font="600 44px 'Microsoft YaHei',sans-serif";g.fillText(task?"今晚的小练习":"便签",44,88);
    const body=task?(state.caption||"正在准备"):(note||"给下次来的自己留一句");
    g.fillStyle=task||note?"#2b3a36":"rgba(43,58,54,.42)";g.font="40px 'Microsoft YaHei',sans-serif";
    const chars=[...body].slice(0,45);for(let i=0;i<chars.length;i+=15)g.fillText(chars.slice(i,i+15).join(""),44,140+(i/15)*78);
    cardTex.needsUpdate=true;
  }
  // Small clock display: the real time, or a quiet countdown after a tap.
  const clockCanvas=document.createElement("canvas");clockCanvas.width=256;clockCanvas.height=112;const clockCtx=clockCanvas.getContext("2d")!;
  const clockTex=track(new THREE.CanvasTexture(clockCanvas));clockTex.colorSpace=THREE.SRGBColorSpace;let clockEnd:number|null=null,clockShown="";
  const pad2=(n:number)=>String(Math.floor(n)).padStart(2,"0");
  function drawClock(){
    const now=new Date(),left=clockEnd===null?0:Math.max(0,clockEnd-elapsed);
    const txt=clockEnd===null?`${pad2(now.getHours())}:${pad2(now.getMinutes())}`:`${pad2(left/60)}:${pad2(left%60)}`;if(txt===clockShown)return;clockShown=txt;
    const g=clockCtx;g.fillStyle="#0d1215";g.fillRect(0,0,256,112);g.fillStyle=clockEnd===null?"#9fd8cf":"#ffb45c";
    g.font="600 70px Consolas,'Courier New',monospace";g.textAlign="center";g.textBaseline="middle";g.fillText(txt,128,60);clockTex.needsUpdate=true;
  }
  let musicOn=false;
  // Text shown at the centre of the screen for whatever the visitor is looking at.
  const hoverLabel=(id:string)=>({door:insideNow?"门 · 出去":"门 · 进店",pet:"摸摸它（E）",
    tv:state.device==="tv"?"电视 · 为你准备的内容":tvMode==="off"?"电视 · 点一下打开":"电视 · 点一下换台",
    radio:state.device==="radio"?"收音机 · 为你准备的内容":musicOn?"收音机 · 点一下关掉":"收音机 · 点一下放点音乐",
    task:state.device==="task"?"今晚的小练习":"便签 · 给下次来的自己留一句",
    clock:clockEnd!==null?"计时中 · 再点一下取消":"计时器 · 安静 3 分钟",
    chalk:"今晚的菜单",hay:"干草 · 它的晚饭",litter:"它的厕所"} as Record<string,string>)[id]??null;

  // Rain streaks, wrapped around the camera so it always surrounds the visitor.
  const rainCount=tier.rain,rainPos=new Float32Array(rainCount*6);let seed=7;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<rainCount;i++){const x=(rnd()-.5)*30,y=rnd()*12,z=(rnd()-.5)*30;rainPos.set([x,y,z,x-.02,y+.42,z],i*6);}
  const rainGeo=track(new THREE.BufferGeometry());rainGeo.setAttribute("position",new THREE.BufferAttribute(rainPos,3));
  const rainMat=track(new THREE.LineBasicMaterial({color:"#a9c4d0",transparent:true,opacity:.28,depthWrite:false}));
  const rain=new THREE.LineSegments(rainGeo,rainMat);rain.frustumCulled=false;scene.add(rain);
  const splashMat=track(new THREE.MeshBasicMaterial({color:"#cfe3ea",transparent:true,opacity:.35,depthWrite:false}));
  const splashGeo=track(new THREE.RingGeometry(.03,.045,16));
  const splashes=new THREE.InstancedMesh(splashGeo,splashMat,tier.low?40:120);splashes.frustumCulled=false;scene.add(splashes);
  const splashData=Array.from({length:splashes.count},()=>({x:0,z:0,y:0,age:rnd()}));

  // ---------- world construction (after assets load) ----------
  let rabbit:ReturnType<typeof createRabbit>|null=null;
  let door:THREE.Group|null=null;let doorOpen=0;
  const tvGlow=new THREE.PointLight("#9fe0dc",0,3,2),radioGlow=new THREE.PointLight("#ffc77a",0,2.5,2);
  let radioLamp:THREE.MeshStandardMaterial|null=null;
  const deviceRefs:Record<string,THREE.Object3D>={};
  const highlight=track(new THREE.MeshBasicMaterial({color:"#ffd58a",transparent:true,opacity:0,depthWrite:false,side:THREE.BackSide}));
  const halos:Record<string,THREE.Mesh>={};

  function build(assets:Assets){
    const M=assets.models;
    const pick=(name:ModelName,node?:string)=>{const src=node?M[name].getObjectByName(node)!:M[name];const o=src.clone(true);
      if(node){const b=new THREE.Box3().setFromObject(o);const c=b.getCenter(new THREE.Vector3());o.position.x-=c.x;o.position.z-=c.z;}
      const g=new THREE.Group();g.add(o);return g;};
    const v3=(p:number[])=>p as [number,number,number];
    scene.environment=assets.environment;scene.environmentIntensity=LAYOUT.environment.intensity;
    scene.add(new THREE.HemisphereLight("#5f84a3","#12181d",HEMI_INTENSITY));

    // ---- Static shell baked in Blender (blender/build_shop.py): real surfaces + indirect-light lightmap + colliders. ----
    // The shell's first UV set is in metres, so a surface repeats once per physical tile size.
    const tile=(n:SurfaceName,size:number,extra:Partial<THREE.MeshStandardMaterialParameters>)=>assets.surface(n,1/size,1/size,extra);
    const SHELL_MATERIALS:Record<string,()=>THREE.MeshStandardMaterial>={
      brick:()=>tile("brick_wall_10",1.91,{color:"#9a948f"}),plaster:()=>tile("plastered_wall",2,{color:"#d8d8cf"}),
      wood_floor:()=>tile("wood_floor",1.7,{color:"#c8a27a"}),planks_green:()=>tile("wooden_planks",2.04,{color:"#5a8c7d"}),
      counter_front:()=>tile("wooden_planks",1.4,{color:"#8fa595"}),counter_top:()=>tile("wood_floor",1.2,{color:"#a37b55"}),
      asphalt:()=>tile("asphalt_02",3,{roughness:.38,color:"#3e4a54"}),sidewalk:()=>tile("asphalt_02",2.2,{roughness:.62,color:"#76838a"}),
      curb:()=>std("#7b807a",.8),roof:()=>std("#2a3a38",.8),ceiling:()=>std("#cfc8b8",.9),frame:()=>std("#2f5b51",.45,{metalness:.2}),
      brass:()=>std("#c49b62",.35,{metalness:.5}),awning_mint:()=>std("#3f7c6f",.85),awning_cream:()=>std("#efe2c2",.85),
      window_off:()=>std("#1f2c33",.2,{metalness:.3}),window_on:()=>std("#ffd59a",.5,{emissive:"#f3b86c",emissiveIntensity:1.6}),
    };
    const materialCache=new Map<string,THREE.MeshStandardMaterial>();
    const shell=assets.shell;const colliders:THREE.Object3D[]=[];
    shell.updateMatrixWorld(true);
    shell.traverse(o=>{
      if(/^COL_/.test(o.name)){colliders.push(o);return;}
      const mesh=o as THREE.Mesh;if(!mesh.isMesh||colliders.some(c=>c===mesh.parent))return;
      const name=(mesh.material as THREE.Material).name;const [base,group]=name.split("@");
      let mat=materialCache.get(name);
      if(!mat){mat=SHELL_MATERIALS[base]?.()??std("#808080");
        if(group==="shop"||group==="street"){mat.lightMap=assets.lightmaps[group];mat.lightMapIntensity=LIGHTMAP_INTENSITY;mat.envMapIntensity=.35;}
        materialCache.set(name,mat);}
      mesh.material=mat;mesh.receiveShadow=true;mesh.castShadow=group==="shop";});
    for(const c of colliders){const b=new THREE.Box3().setFromObject(c),ctr=b.getCenter(new THREE.Vector3()),s=b.getSize(new THREE.Vector3());
      fixed(ctr.x,ctr.y,ctr.z,s.x/2,s.y/2,s.z/2);c.removeFromParent();}
    scene.add(shell);

    // ---- Real-time lights: the same list the bake used, so direct light and bounce light agree. ----
    for(const l of LAYOUT.lights){
      if(l.type==="directional"){const d=new THREE.DirectionalLight(l.color,l.intensity);d.position.set(...v3(l.pos));d.castShadow=true;
        d.shadow.mapSize.set(tier.shadow,tier.shadow);Object.assign(d.shadow.camera,{left:-14,right:14,top:12,bottom:-10,near:1,far:40});d.shadow.normalBias=.03;scene.add(d);continue;}
      const light=l.type==="spot"?new THREE.SpotLight(l.color,l.intensity,l.distance,l.angle,l.penumbra,l.decay):new THREE.PointLight(l.color,l.intensity,l.distance,l.decay);
      light.position.set(...v3(l.pos));
      if(light instanceof THREE.SpotLight&&l.target){light.target.position.set(...v3(l.target));scene.add(light.target);}
      if(l.shadow==="high"&&!tier.low){light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.bias=-.0015;}
      scene.add(light);
    }
    const bulbMat=std("#fff2cf",.2,{emissive:"#ffcf8a",emissiveIntensity:6}),lampMat=std("#e9f2ff",.2,{emissive:"#d7e8ff",emissiveIntensity:5}),cordMat=std("#222",.6);
    for(const p of LAYOUT.bulbs){const b=new THREE.Mesh(track(new THREE.SphereGeometry(.05,16,12)),bulbMat);b.position.set(...v3(p));scene.add(b);
      boxMesh(.01,.5,.01,cordMat,p[0],p[1]+.45,p[2]).castShadow=false;}
    for(const p of LAYOUT.lampGlows){const g=new THREE.Mesh(track(new THREE.SphereGeometry(.09,16,12)),lampMat);g.position.set(...v3(p));scene.add(g);}

    // ---- Props from the shared layout. ----
    const shelves:THREE.Object3D[]=[];const clockAt=new THREE.Vector3();
    for(const p of LAYOUT.props){
      const model=p.model as ModelName;const o=p.node?pick(model,p.node):place(M[model],0,0,0);
      o.position.set(...v3(p.pos));o.rotation.y=p.rotY??0;o.scale.setScalar(p.scale??1);scene.add(o);o.updateMatrixWorld(true);
      if(p.collider==="box")fixedBox(o,p.pad??0);
      if(p.collider==="pole")fixed(p.pos[0],2,p.pos[2],.12,2,.12);
      if(p.role==="shelf")shelves.push(o);
      if(p.role==="tv"||p.role==="radio"){deviceRefs[p.role]=o;tag(o,p.role);}
      if(p.role==="clock"){tag(o,"clock");clockAt.copy(o.position);}
    }
    // Shelves stocked by ray-casting onto each shelf board.
    const stock:ModelName[]=["ceramic_vase_01","can_rusted","Lantern_01","alarm_clock_01","can_rusted","cassette_player","ceramic_vase_01","can_rusted"];
    const ray=new THREE.Raycaster();let k=0;scene.updateMatrixWorld(true);
    for(const s of shelves)for(const dx of [-.3,0,.3]){
      ray.set(new THREE.Vector3(s.position.x+dx,FLOOR+3,-3.38),new THREE.Vector3(0,-1,0));
      for(const hit of ray.intersectObject(s,true)){if(hit.face&&hit.face.normal.y<.5)continue;if(((k++)%3)===1)continue;
        scene.add(place(M[stock[k%stock.length]],s.position.x+dx,hit.point.y+.002,-3.37,(k%5)*.6));}
    }

    // ---- Not baked: puddles, glass, the sliding door, signs, devices, the rabbit and loose props. ----
    const puddle=std("#11181c",.03,{metalness:0,envMapIntensity:1.6});
    for(let i=0;i<10;i++){const p=new THREE.Mesh(track(new THREE.CircleGeometry(1,32)),puddle);p.rotation.x=-Math.PI/2;
      p.position.set(Math.sin(i*2.1)*11,.006,8+(i*1.73)%9);p.scale.set(.7+(i%3)*.6,.35+(i%4)*.2,1);p.receiveShadow=true;scene.add(p);}
    const glass=track(new THREE.MeshPhysicalMaterial({color:"#9fc3c0",roughness:.04,metalness:0,transparent:true,opacity:.14,envMapIntensity:1.4,depthWrite:false}));
    boxMesh(6.5,2.66,.03,glass,-1.15,FLOOR+2.4,2.72).castShadow=false;
    const frameMat=std("#2f5b51",.45,{metalness:.2});
    door=new THREE.Group();door.position.set(3.2,FLOOR,2.72);scene.add(door);
    boxMesh(2.1,3.05,.04,glass,0,1.52,0,door).castShadow=false;
    for(const [w,h,x,y] of [[.08,3.1,-1.02,1.55],[.08,3.1,1.02,1.55],[2.1,.08,0,3.06],[2.1,.1,0,.05]] as const)boxMesh(w,h,.08,frameMat,x,y,0,door);
    boxMesh(.06,.5,.06,std("#c49b62",.3,{metalness:.8}),-.85,1.25,.06,door);
    const openSign=canvasLabel("营业中",.55,.3,{bg:"#20403a",fg:"#f2d79d",size:150,glow:.9});openSign.position.set(0,1.9,.03);door.add(openSign);
    tag(door,"door");
    if(world){doorBody=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(3.2,FLOOR+1.55,2.72));
      world.createCollider(RAPIER.ColliderDesc.cuboid(1.05,1.55,.05),doorBody);}
    const sign=canvasLabel("深 夜 情 绪 便 利 店",8.2,.62,{bg:"#1d3a35",fg:"#f2d79d",size:92,sub:"LATE NIGHT STORE  ·  22:00 — 06:00",glow:.55});
    sign.position.set(0,FLOOR+4.32,2.87);scene.add(sign);
    // Framed print on the right wall: a moon over rain. No slogans.
    const print=paintedPlane(1.0,1.3,(g,W,H)=>{
      g.fillStyle="#1b2831";g.fillRect(0,0,W,H);
      const grd=g.createRadialGradient(W*.62,H*.33,0,W*.62,H*.33,W*.22);grd.addColorStop(0,"#f4dfb4");grd.addColorStop(1,"#d39f60");
      g.fillStyle=grd;g.beginPath();g.arc(W*.62,H*.33,W*.19,0,Math.PI*2);g.fill();
      g.strokeStyle="rgba(200,220,232,.3)";g.lineWidth=W*.003;for(let i=0;i<90;i++){const x=(i*137)%W,y=(i*263)%(H*.8);g.beginPath();g.moveTo(x,y);g.lineTo(x-W*.015,y+H*.06);g.stroke();}
      g.fillStyle="#2a3a44";g.fillRect(0,H*.7,W,H*.3);
      g.fillStyle="#e8dcc4";g.textAlign="left";g.font=`600 ${W*.055}px Georgia,serif`;g.fillText("NIGHT STORE",W*.08,H*.86);
      g.font=`${W*.034}px Georgia,serif`;g.globalAlpha=.65;g.fillText("No. 24 — RAIN, LATE",W*.08,H*.92);g.globalAlpha=1;
    },.1);
    print.position.set(4.355,FLOOR+2.45,-1.4);print.rotation.y=-Math.PI/2;scene.add(print);
    boxMesh(.03,1.42,1.12,std("#151515",.5),4.38,FLOOR+2.45,-1.4).castShadow=false;
    // A-frame menu board on the sidewalk: two hinged chalkboards on a wooden frame. It can be knocked over.
    const menu=paintedPlane(.54,.76,(g,W,H)=>{
      g.fillStyle="#1f2a27";g.fillRect(0,0,W,H);g.fillStyle="rgba(255,255,255,.035)";for(let i=0;i<500;i++)g.fillRect((i*97)%W,(i*61)%H,3,3);
      g.fillStyle="#efe6cf";g.textAlign="left";g.font=`600 ${W*.11}px "Microsoft YaHei","PingFang SC",sans-serif`;g.fillText("今晚",W*.1,H*.15);
      g.font=`${W*.045}px Georgia,serif`;g.globalAlpha=.6;g.fillText("TONIGHT",W*.1,H*.21);g.globalAlpha=1;
      const rows=[["热可可","15"],["大麦茶","8"],["姜茶","12"],["借伞","免费"],["充电","免费"]];
      g.font=`${W*.07}px "Microsoft YaHei","PingFang SC",sans-serif`;
      rows.forEach(([a,b],i)=>{const y=H*(.35+i*.11);g.textAlign="left";g.fillText(a,W*.1,y);g.textAlign="right";g.fillText(b,W*.9,y);
        g.globalAlpha=.25;g.fillRect(W*.1,y+W*.03,W*.8,2);g.globalAlpha=1;});
      g.textAlign="center";g.font=`${W*.05}px Georgia,serif`;g.globalAlpha=.7;g.fillText("22:00 — 06:00",W*.5,H*.93);g.globalAlpha=1;
    },.28);
    const aframe=new THREE.Group();aframe.position.set(5.0,SIDEWALK,4.1);aframe.rotation.y=-.35;const frameWood=std("#5b4330",.7);
    for(const side of [1,-1]){const leaf=new THREE.Group();leaf.position.set(0,.93,0);leaf.rotation.x=-side*.2;aframe.add(leaf);
      const board=new THREE.Group();board.position.set(0,-.46,0);leaf.add(board);
      boxMesh(.64,.92,.028,frameWood,0,0,0,board);
      const face=side===1?menu:menu.clone();face.position.set(0,.01,side*.016);if(side<0)face.rotation.y=Math.PI;board.add(face);}
    boxMesh(.5,.025,.025,std("#2b2b2b",.5,{metalness:.6}),0,.93,0,aframe);
    dynamicFrom(aframe,"box",.35);tag(aframe,"chalk");
    // A plain street bench: wooden slats on two black steel frames.
    const bench=new THREE.Group();bench.position.set(-9,SIDEWALK,3.4);scene.add(bench);
    const slat=assets.surface("wooden_planks",.7,.12,{color:"#8a6a4a"}),steel=std("#1c1f21",.45,{metalness:.7});
    for(let i=0;i<3;i++)boxMesh(1.8,.035,.11,slat,0,.44,-.13+i*.13,bench);
    for(let i=0;i<2;i++)boxMesh(1.8,.1,.03,slat,0,.6+i*.14,-.25,bench).rotation.x=-.12;
    for(const x of [-.75,.75]){boxMesh(.05,.42,.05,steel,x,.21,.1,bench);boxMesh(.05,.82,.05,steel,x,.41,-.24,bench);boxMesh(.05,.04,.4,steel,x,.41,-.06,bench);}
    bench.updateMatrixWorld(true);fixedBox(bench,-.03);
    // Devices: TV screen, radio lamp, task card, highlight halos.
    const screen=new THREE.Mesh(track(new THREE.PlaneGeometry(.4,.3)),std("#ffffff",.3,{map:tvTex,emissiveMap:tvTex,emissive:"#ffffff",emissiveIntensity:.5}));
    screen.position.set(-2.3,COUNTER_TOP+.25,COUNTER_Z+.245);scene.add(screen);
    tvGlow.position.set(-2.3,COUNTER_TOP+.3,COUNTER_Z+.8);radioGlow.position.set(2.0,COUNTER_TOP+.3,COUNTER_Z+.6);scene.add(tvGlow,radioGlow);
    // Warm LED strip under the counter-top lip (its light is the two "under-counter" points in layout.json).
    boxMesh(5.8,.015,.02,std("#ffe2b8",.4,{emissive:"#ffc27a",emissiveIntensity:3}),-.2,COUNTER_TOP-.08,COUNTER_Z+.52).castShadow=false;
    radioLamp=std("#ffb55c",.3,{emissive:"#ff9b3a",emissiveIntensity:0});boxMesh(.08,.03,.02,radioLamp,2.24,COUNTER_TOP+.36,COUNTER_Z+.11);
    const card=new THREE.Mesh(track(new THREE.PlaneGeometry(.48,.32)),std("#ffffff",.8,{map:cardTex,emissiveMap:cardTex,emissive:"#ffffff",emissiveIntensity:.05}));
    card.rotation.set(-Math.PI/2,0,.08);card.position.set(.75,COUNTER_TOP+.009,COUNTER_Z+.3);scene.add(card);deviceRefs.task=card;tag(card,"task");drawCard();
    const pen=new THREE.Mesh(track(new THREE.CylinderGeometry(.005,.005,.14,10)),std("#1d2b3a",.4,{metalness:.3}));
    pen.rotation.set(0,0,Math.PI/2);pen.rotation.y=.5;pen.position.set(1.0,COUNTER_TOP+.011,COUNTER_Z+.36);scene.add(pen);
    // Clock display: a small LED box in front of the alarm clock.
    const clockBox=boxMesh(.15,.065,.045,std("#14191c",.4),clockAt.x-.02,COUNTER_TOP+.033,clockAt.z+.13);clockBox.rotation.y=-.35;
    const clockFace=new THREE.Mesh(track(new THREE.PlaneGeometry(.13,.055)),std("#000000",.3,{map:clockTex,emissiveMap:clockTex,emissive:"#ffffff",emissiveIntensity:1.2}));
    clockFace.position.set(0,0,.0235);clockBox.add(clockFace);tag(clockBox,"clock");drawClock();
    for(const [id,ref] of Object.entries(deviceRefs)){const b=new THREE.Box3().setFromObject(ref),s=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());
      const h=new THREE.Mesh(track(new THREE.BoxGeometry(s.x+.08,Math.max(s.y,.02)+.08,s.z+.08)),highlight.clone());h.position.copy(c);h.visible=false;scene.add(h);halos[id]=h;}
    // The rabbit's things: a hay basket on the counter and a litter box on the floor.
    const strawGeo=track(new THREE.CylinderGeometry(.0018,.0018,1,4));strawGeo.rotateZ(Math.PI/2);const strawMat=std("#ffffff",.85);
    function straws(n:number,c:THREE.Vector3,rx:number,rz:number,h:number,len:number){
      const m=new THREE.InstancedMesh(strawGeo,strawMat,n),o=new THREE.Object3D(),col=new THREE.Color();
      for(let i=0;i<n;i++){o.position.set(c.x+(rnd()-.5)*2*rx,c.y+rnd()*h,c.z+(rnd()-.5)*2*rz);o.rotation.set((rnd()-.5)*.8,rnd()*Math.PI*2,(rnd()-.5)*.6);
        o.scale.set(len*(.6+rnd()*.8),1,1);o.updateMatrix();m.setMatrixAt(i,o.matrix);m.setColorAt(i,col.setHSL(.12+rnd()*.07,.42+rnd()*.15,.42+rnd()*.16));}
      m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;}
    const basket=new THREE.Mesh(track(new THREE.CylinderGeometry(.11,.09,.07,28,1,true)),std("#8a6a45",.85,{side:THREE.DoubleSide}));
    basket.position.set(HAY.x,COUNTER_TOP+.035,HAY.z);basket.castShadow=true;scene.add(basket);tag(basket,"hay");
    const basketBottom=new THREE.Mesh(track(new THREE.CircleGeometry(.09,28)),std("#6f5233",.9));basketBottom.rotation.x=-Math.PI/2;basketBottom.position.set(HAY.x,COUNTER_TOP+.003,HAY.z);scene.add(basketBottom);
    straws(170,new THREE.Vector3(HAY.x,COUNTER_TOP+.02,HAY.z),.075,.075,.07,.12);
    const tray=new THREE.Group();tray.position.copy(LITTER);scene.add(tray);const plastic=std("#a9bcc0",.45);
    boxMesh(.36,.02,.5,plastic,0,.01,0,tray);
    for(const [w,d,x,z] of [[.36,.02,0,.24],[.36,.02,0,-.24],[.02,.5,.17,0],[.02,.5,-.17,0]] as const)boxMesh(w,.13,d,plastic,x,.065,z,tray);
    straws(110,new THREE.Vector3(LITTER.x,FLOOR+.02,LITTER.z),.15,.21,.035,.09);tag(tray,"litter");
    fixed(LITTER.x,FLOOR+.4,LITTER.z,.2,.4,.27);
    // Rabbit shopkeeper.
    const places:RabbitPlaces={counterY:COUNTER_TOP,floorY:FLOOR,lane:{z:COUNTER_Z-.32,minX:-1.45,maxX:2.6},
      home:new THREE.Vector3(-.35,COUNTER_TOP,COUNTER_Z+.05),hay:HAY.clone(),
      dropFrom:new THREE.Vector3(2.7,COUNTER_TOP,COUNTER_Z-.32),dropTo:new THREE.Vector3(3.3,FLOOR,COUNTER_Z-.32),
      litter:new THREE.Vector3(LITTER.x,FLOOR+.022,LITTER.z)};
    rabbit=createRabbit(assets.rabbit,places,{shells:tier.shells});scene.add(rabbit.group);tag(rabbit.group,"pet");
    // Loose props you can push: delivery boxes by the wall, a wet-floor sign inside.
    for(const [x,z,r] of [[-4.6,3.4,.3],[-4.3,4.1,1.1],[-4.55,3.45,.3]] as const){const b=place(M.cardboard_box_01,x,SIDEWALK+(z===3.45?.35:0),z,r);dynamicFrom(b,"box",.25);}
    dynamicFrom(place(M.WetFloorSign_01,1.9,FLOOR,1.8,.6),"box",.3);
  }

  // ---------- player ----------
  function setupPlayer(){
    if(!world)return;
    playerBody=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(playerStart.x,playerStart.y,playerStart.z));
    playerCollider=world.createCollider(RAPIER.ColliderDesc.capsule(.55,.28),playerBody);
    character=world.createCharacterController(.02);character.enableAutostep(.32,.2,false);character.enableSnapToGround(.3);
    character.setMaxSlopeClimbAngle(.8);character.setApplyImpulsesToDynamicBodies(true);character.setCharacterMass(55);
    yaw=0;pitch=.06;
  }
  const playerPos=()=>playerBody?new THREE.Vector3().copy(playerBody.translation() as THREE.Vector3Like):playerStart.clone();
  function teleport(x:number,z:number,faceYaw?:number){if(!playerBody)return;const y=(Math.abs(x)<4.4&&z<2.6?FLOOR:SIDEWALK)+.9;
    playerBody.setTranslation({x,y,z},true);playerBody.setNextKinematicTranslation({x,y,z});prevPlayer.set(x,y,z);if(faceYaw!==undefined){yaw=faceYaw;pitch=-.12;}}
  function yawToward(from:THREE.Vector3,to:THREE.Vector3){return Math.atan2(-(to.x-from.x),-(to.z-from.z));}
  function walkTo(points:[number,number][],look:THREE.Vector3|null,then?:()=>void){
    if(state.still){const last=points[points.length-1];teleport(last[0],last[1]);if(look){const p=playerPos();yaw=yawToward(p,look);pitch=Math.atan2(look.y-(p.y+EYE-.9),Math.hypot(look.x-p.x,look.z-p.z));}then?.();return;}
    autopilot={points:points.map(([x,z])=>new THREE.Vector2(x,z)),look,then};
  }
  const COUNTER_VIEW:[number,number]=[-.3,.5];
  function goInside(){const p=playerPos();const path:[number,number][]=p.z>2.6?[[3.2,4.3],[3.2,1.6],COUNTER_VIEW]:[COUNTER_VIEW];
    walkTo(path,new THREE.Vector3(-.35,COUNTER_TOP+.45,COUNTER_Z));}
  function goOutside(){walkTo([[3.2,1.4],[3.2,4.6],[3.2,6.6]],new THREE.Vector3(0,2.2,0));}
  function focusDevice(name:string){const spot=DEVICE_SPOTS[name];if(!spot)return;walkTo([spot.stand],new THREE.Vector3(...spot.at));}

  // ---------- input ----------
  const interactAt=(ndcX:number,ndcY:number)=>{
    const r=new THREE.Raycaster();r.setFromCamera(new THREE.Vector2(ndcX,ndcY),camera);r.far=4.5;
    const hit=r.intersectObjects(interactive,true)[0];if(!hit)return null;let o:THREE.Object3D|null=hit.object;while(o&&!o.userData.action)o=o.parent;return o?.userData.action as string|undefined??null;};
  function act(id:string|null){
    if(!id)return;ambience.start();
    if(id==="door"){if(!insideNow)goInside();else goOutside();return;}
    if(id==="pet"){petTime=elapsed;callbacks.pet();return;}
    if(id==="chalk"){if(!insideNow)goInside();return;}
    if(id==="hay"||id==="litter")return;
    if(id==="tv"){if(state.device==="tv"){callbacks.object("tv");return;}tvMode=tvMode==="off"?"rain":tvMode==="rain"?"breath":"off";drawTv(elapsed);return;}
    if(id==="radio"){if(state.device==="radio"){callbacks.object("radio");return;}musicOn=!musicOn;ambience.music(musicOn);return;}
    if(id==="clock"){clockEnd=clockEnd===null?elapsed+180:null;drawClock();return;}
    if(id==="task"){callbacks.object(state.device==="task"?"task":"note");return;}
    callbacks.object(id);
  }
  const onPointerDown=(e:PointerEvent)=>{ambience.start();
    if(e.pointerType==="mouse"&&!locked&&!tier.low){canvas.requestPointerLock?.();return;}
    dragging=true;dragMoved=0;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);};
  const onPointerMove=(e:PointerEvent)=>{
    if(locked){yaw-=e.movementX*.0022;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0022,-1.2,1.1);lookHold=null;return;}
    if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;dragMoved+=Math.abs(dx)+Math.abs(dy);lastX=e.clientX;lastY=e.clientY;
    yaw+=dx*.0045;pitch=THREE.MathUtils.clamp(pitch+dy*.0035,-1.2,1.1);autopilot=null;lookHold=null;};
  const onPointerUp=(e:PointerEvent)=>{if(locked){act(interactAt(0,0));return;}
    if(dragging&&dragMoved<8){const rect=canvas.getBoundingClientRect();act(interactAt((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1));}
    dragging=false;};
  const onLockChange=()=>{locked=document.pointerLockElement===canvas;callbacks.lock?.(locked);};
  const typing=(e:KeyboardEvent)=>e.target instanceof HTMLElement&&!!e.target.closest("input,textarea,select,[contenteditable]");
  const onKeyDown=(e:KeyboardEvent)=>{if(typing(e))return;const k=e.key.toLowerCase();
    if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright","shift"].includes(k)){if(k.startsWith("arrow")&&!(e.target===canvas||locked))return;e.preventDefault();keys.add(k);autopilot=null;ambience.start();}
    if(k==="e"&&(locked||e.target===canvas||e.target===document.body)){e.preventDefault();act(lastHover??(insideNow?"pet":"door"));}};
  const onKeyUp=(e:KeyboardEvent)=>keys.delete(e.key.toLowerCase());
  const onBlur=()=>{keys.clear();moveInput.x=moveInput.z=0;dragging=false;};
  canvas.addEventListener("pointerdown",onPointerDown);canvas.addEventListener("pointermove",onPointerMove);canvas.addEventListener("pointerup",onPointerUp);
  canvas.addEventListener("pointercancel",onBlur);document.addEventListener("pointerlockchange",onLockChange);
  window.addEventListener("keydown",onKeyDown);window.addEventListener("keyup",onKeyUp);window.addEventListener("blur",onBlur);
  const onLost=(e:Event)=>{e.preventDefault();callbacks.error();};canvas.addEventListener("webglcontextlost",onLost);

  function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.fov=w/h<.8?78:68;camera.updateProjectionMatrix();
    renderer.setSize(w,h);composer.setSize(w,h);bloom.setSize(w,h);gtao?.setSize(w,h);}
  const ro=new ResizeObserver(resize);ro.observe(host);resize();

  // ---------- frame loop ----------
  const forward=new THREE.Vector3(),right=new THREE.Vector3(),desired=new THREE.Vector3(),fixedDt=1/60;let acc=0,bob=0;
  // Physics runs at a fixed 60 Hz; the camera is interpolated between the last two steps so motion stays smooth on any refresh rate.
  const prevPlayer=new THREE.Vector3().copy(playerStart),renderPlayer=new THREE.Vector3();
  function stepPlayer(dt:number){
    if(!world||!character||!playerBody||!playerCollider)return;
    let mx=(keys.has("d")||keys.has("arrowright")?1:0)-(keys.has("a")||keys.has("arrowleft")?1:0)+moveInput.x;
    let mz=(keys.has("s")||keys.has("arrowdown")?1:0)-(keys.has("w")||keys.has("arrowup")?1:0)+moveInput.z;
    const pos=playerPos();
    if(autopilot&&!mx&&!mz){const next=autopilot.points[0];const d=new THREE.Vector2(next.x-pos.x,next.y-pos.z);
      if(d.length()<.18){autopilot.points.shift();if(!autopilot.points.length){const a=autopilot;autopilot=null;if(a.look)lookHold={target:a.look,until:elapsed+4};a.then?.();}}
      else{const targetYaw=Math.atan2(-d.x,-d.y);yaw+=Math.atan2(Math.sin(targetYaw-yaw),Math.cos(targetYaw-yaw))*(1-Math.exp(-dt*5));mz=-1;mx=0;}
      if(!autopilot||!autopilot.points.length){/* arrived */}}
    if(autopilot?.look&&autopilot.points.length<=1){const look=autopilot.look,eye=pos.clone().add(new THREE.Vector3(0,EYE-.9,0));
      const ty=yawToward(eye,look),tp=Math.atan2(look.y-eye.y,Math.hypot(look.x-eye.x,look.z-eye.z));
      if(autopilot.points.length===0||new THREE.Vector2(autopilot.points[0].x-pos.x,autopilot.points[0].y-pos.z).length()<1.2){
        yaw+=Math.atan2(Math.sin(ty-yaw),Math.cos(ty-yaw))*(1-Math.exp(-dt*4));pitch+= (tp-pitch)*(1-Math.exp(-dt*4));}}
    if(mx||mz){lookHold=null;if(!autopilot)lastManualMove=elapsed;}
    if(lookHold&&!autopilot){const eye=pos.clone().add(new THREE.Vector3(0,EYE-.9,0)),ty=yawToward(eye,lookHold.target),
        tp=Math.atan2(lookHold.target.y-eye.y,Math.hypot(lookHold.target.x-eye.x,lookHold.target.z-eye.z));
      const dy=Math.atan2(Math.sin(ty-yaw),Math.cos(ty-yaw));yaw+=dy*(1-Math.exp(-dt*5));pitch+=(tp-pitch)*(1-Math.exp(-dt*5));
      if((Math.abs(dy)<.01&&Math.abs(tp-pitch)<.01)||elapsed>lookHold.until)lookHold=null;}
    const len=Math.hypot(mx,mz);if(len>1){mx/=len;mz/=len;}
    const speed=(keys.has("shift")?3.6:2.1)*(autopilot?.85:1);
    forward.set(-Math.sin(yaw),0,-Math.cos(yaw));right.set(Math.cos(yaw),0,-Math.sin(yaw));
    desired.copy(right).multiplyScalar(mx*speed*dt).addScaledVector(forward,-mz*speed*dt);
    verticalSpeed=character.computedGrounded()?-.5:verticalSpeed-9.8*dt;desired.y=verticalSpeed*dt;
    character.computeColliderMovement(playerCollider,desired);
    const m=character.computedMovement();playerBody.setNextKinematicTranslation({x:pos.x+m.x,y:pos.y+m.y,z:pos.z+m.z});
    const moving=Math.hypot(m.x,m.z)/dt>.4;
    if(moving&&!state.still){bob+=dt*9;stepTimer-=dt;if(stepTimer<=0){ambience.step();stepTimer=keys.has("shift")?.32:.46;}}else bob*=.9;
    // Safety net: anyone who falls off the world comes back to the sidewalk.
    if(pos.y<-3)teleport(playerStart.x,playerStart.z);
  }
  function animate(now:number){
    if(disposed)return;frame=requestAnimationFrame(animate);
    const dt=Math.min((now-previous)/1000,.05);previous=now;elapsed+=dt;
    if(!ready){composer.render();return;}
    const t=elapsed,still=state.still;
    acc+=dt;let steps=0;
    while(acc>=fixedDt&&steps<4){prevPlayer.copy(playerPos());stepPlayer(fixedDt);world!.step();acc-=fixedDt;steps++;}
    if(steps===4)acc=0;
    for(const d of dynamics){const p=d.body.translation(),q=d.body.rotation();d.mesh.position.set(p.x,p.y,p.z);d.mesh.quaternion.set(q.x,q.y,q.z,q.w);}
    // Camera rides the capsule.
    const pos=renderPlayer.lerpVectors(prevPlayer,playerPos(),acc/fixedDt);camera.position.set(pos.x,pos.y+EYE-.9+(still?0:Math.sin(bob)*.025),pos.z);
    camera.rotation.set(pitch,yaw,0,"YXZ");
    // Inside / outside transitions.
    const nowInside=Math.abs(pos.x)<4.4&&pos.z<2.55&&pos.z>-3.5;
    if(nowInside!==insideNow){insideNow=nowInside;ambience.setInside(nowInside);if(nowInside){ambience.chime();if(!state.inside)callbacks.enter();}else if(state.inside)callbacks.leave?.();}
    // Automatic door slides open when someone is near it.
    const nearDoor=Math.hypot(pos.x-3.2,pos.z-2.72)<2.1||!!autopilot;doorOpen=THREE.MathUtils.lerp(doorOpen,nearDoor?1:0,1-Math.exp(-dt*(still?60:5)));
    if(door){door.position.x=3.2+doorOpen*2.05;doorBody?.setNextKinematicTranslation({x:3.2+doorOpen*2.05,y:FLOOR+1.55,z:2.72});}
    // Rabbit looks at the visitor when they are close.
    const eye=camera.position,spot=DEVICE_SPOTS[state.device];
    if(rabbit)rabbit.update(dt,t,{look:eye.distanceTo(rabbit.group.position)<6?eye.clone():null,busy:state.busy,petAge:elapsed-petTime,still,
      focus:spot&&!state.busy?new THREE.Vector3(spot.rabbit[0],COUNTER_TOP,spot.rabbit[1]):null});
    // Devices.
    const active=state.device,radioOn=active==="radio"||musicOn;
    tvGlow.intensity=tvMode==="content"?1.4:tvMode==="off"?0:.8;radioGlow.intensity=radioOn?1.6+Math.sin(t*3)*.3:0;
    if(radioLamp)radioLamp.emissiveIntensity=radioOn?3:0;
    if((tvMode==="rain"||tvMode==="breath")&&!still&&elapsed-tvDrawn>1/24)drawTv(elapsed);
    drawClock();if(clockEnd!==null&&elapsed>=clockEnd){clockEnd=null;ambience.timerDone();drawClock();}
    for(const [id,h] of Object.entries(halos)){h.visible=active===id;(h.material as THREE.MeshBasicMaterial).opacity=.06+Math.sin(t*2.4)*.03;}
    // Hover hint from the screen centre (pointer lock) — the UI shows it.
    const hover=locked?interactAt(0,0):null,label=hover?hoverLabel(hover):null;lastHover=hover;
    if(label!==lastHoverLabel){lastHoverLabel=label;callbacks.hover?.(label);}
    // Rain follows the camera; splashes pop on the ground.
    if(!still){for(let i=0;i<rainCount;i++){const k=i*6;rainPos[k+1]-=dt*9;rainPos[k+4]-=dt*9;if(rainPos[k+1]<0){rainPos[k+1]+=12;rainPos[k+4]+=12;}}rainGeo.attributes.position.needsUpdate=true;}
    rain.position.set(Math.round(eye.x/30)*30,0,Math.round(eye.z/30)*30);
    const mtx=new THREE.Matrix4(),sq=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0));
    for(let i=0;i<splashData.length;i++){const s=splashData[i];s.age+=still?0:dt*1.8;
      if(s.age>=1){s.age=0;s.x=eye.x+(Math.random()-.5)*14;s.z=eye.z+(Math.random()-.5)*14;if(Math.abs(s.x)<4.6&&s.z<2.9&&s.z>-3.7)s.z=3.2+Math.random()*6;s.y=s.z>2.7&&s.z<6?SIDEWALK+.005:s.z>18?SIDEWALK+.005:.008;}
      const sc=.4+s.age*1.6;mtx.compose(new THREE.Vector3(s.x,s.y,s.z),sq,new THREE.Vector3(sc,sc,sc));splashes.setMatrixAt(i,mtx);}
    splashes.instanceMatrix.needsUpdate=true;splashMat.opacity=still?0:.32;
    grade.uniforms.uTime.value=still?0:t%100;
    composer.render();
  }
  frame=requestAnimationFrame(animate);

  // ---------- async setup ----------
  (async()=>{
    try{
      await RAPIER.init();if(disposed)return;
      world=new RAPIER.World({x:0,y:-9.81,z:0});
      const assets=await loadAssets(renderer,p=>callbacks.progress?.(p*.95));if(disposed){assets.dispose();return;}
      disposables.push(assets);build(assets);setupPlayer();
      // Compile shaders up front so the first frames do not stutter.
      renderer.compile(scene,camera);ready=true;callbacks.progress?.(1);callbacks.ready?.();
      if(state.inside)goInside();
    }catch(e){console.error(e);callbacks.error();}
  })();

  function update(next:WorldState){
    const prev=state;state=next;
    if(next.device!==prev.device||next.caption!==prev.caption){
      tvText=next.caption;if(next.device==="tv")tvMode="content";else if(prev.device==="tv")tvMode="off";drawTv(elapsed);drawCard();}
    // Walk the visitor to the chosen device only if they are not exploring on their own; otherwise it just lights up.
    if(next.device!==prev.device){ambience.radio(next.device==="radio");if(ready&&insideNow&&DEVICE_SPOTS[next.device]&&elapsed-lastManualMove>4)focusDevice(next.device);}
    if(next.muted!==prev.muted)ambience.setMuted(!!next.muted);
    if(!ready)return;
    if(next.inside&&!prev.inside&&!insideNow)goInside();
    if(!next.inside&&prev.inside&&insideNow)goOutside();
  }
  return {
    update,
    move:(x:number,z:number)=>{moveInput.x=x;moveInput.z=z;if(x||z){autopilot=null;ambience.start();}},
    look:(dx:number,dy:number)=>{yaw+=dx*.0045;pitch=THREE.MathUtils.clamp(pitch+dy*.0035,-1.2,1.1);autopilot=null;},
    interact:()=>act(lastHover??(insideNow?"pet":"door")),
    // Read-only snapshot for automated checks (player position, inside flag, loose props).
    debug:()=>({ready,inside:insideNow,rabbit:rabbit?{at:rabbit.group.position.toArray().map(v=>+v.toFixed(2)),doing:rabbit.activity()}:null,tv:tvMode,music:musicOn,clock:clockShown,player:playerPos().toArray().map(v=>+v.toFixed(2)),
      props:dynamics.map(d=>{const p=d.body.translation();return [+p.x.toFixed(2),+p.y.toFixed(2),+p.z.toFixed(2)];}),autopilot:!!autopilot}),
    // Test hook (used with ?debug): put the visitor somewhere without walking.
    place:(x:number,z:number,faceYaw=0)=>{autopilot=null;lookHold=null;teleport(x,z,faceYaw);},
    setNote:(text:string)=>{note=text;drawCard();},
    // Test hook (?debug): make the rabbit do one of its routines now.
    rabbitDo:(kind:"potty"|"eat"|"wander"|"groom"|"home")=>rabbit?.perform(kind),
    reset:()=>{autopilot=null;if(insideNow)goInside();else{teleport(playerStart.x,playerStart.z,0);pitch=.06;}},
    dispose:()=>{
      disposed=true;cancelAnimationFrame(frame);ro.disconnect();
      canvas.removeEventListener("pointerdown",onPointerDown);canvas.removeEventListener("pointermove",onPointerMove);canvas.removeEventListener("pointerup",onPointerUp);
      canvas.removeEventListener("pointercancel",onBlur);canvas.removeEventListener("webglcontextlost",onLost);document.removeEventListener("pointerlockchange",onLockChange);
      window.removeEventListener("keydown",onKeyDown);window.removeEventListener("keyup",onKeyUp);window.removeEventListener("blur",onBlur);
      if(document.pointerLockElement===canvas)document.exitPointerLock();
      ambience.dispose();rabbit?.dispose();for(const d of disposables)d.dispose();world?.free();
      composer.dispose();renderer.dispose();canvas.remove();
    },
  };
}
