"use client";
import {useEffect,useRef,useState} from "react";
import type {WorldState,createShopWorld} from "./shop-world-engine.ts";

type Props=WorldState&{note?:string;panelOpen?:boolean;onEnter:()=>void;onLeave?:()=>void;onPet:()=>void;onObject:(name:string)=>void};
export function shopObject(selected?:string|null){
  if(selected==="music"||selected==="spoken-story")return "radio";
  if(selected?.includes("animation")||selected==="short-video")return "tv";
  if(selected==="micro-game"||selected==="interactive-story")return "task";
  return selected?"book":"idle";
}
type Engine=ReturnType<typeof createShopWorld>;

export default function ImmersiveShop(props:Props){
  const host=useRef<HTMLDivElement>(null),engine=useRef<Engine|null>(null),latest=useRef(props);
  const [progress,setProgress]=useState(0),[ready,setReady]=useState(false),[failed,setFailed]=useState(false);
  const [hover,setHover]=useState<string|null>(null),[locked,setLocked]=useState(false);
  latest.current=props;
  useEffect(()=>{let cancelled=false;
    import("./shop-world-engine.ts").then(({createShopWorld})=>{
      if(cancelled||!host.current)return;
      try{engine.current=createShopWorld(host.current,{
        enter:()=>latest.current.onEnter(),leave:()=>latest.current.onLeave?.(),pet:()=>latest.current.onPet(),object:n=>latest.current.onObject(n),
        error:()=>setFailed(true),progress:p=>setProgress(p),ready:()=>setReady(true),hover:setHover,lock:setLocked});
        engine.current.update(latest.current);
        // ?debug exposes a read-only state snapshot for automated browser checks.
        if(new URLSearchParams(location.search).has("debug"))(window as unknown as {__shop?:Engine}).__shop=engine.current;}catch{setFailed(true);}
    }).catch(()=>setFailed(true));
    return()=>{cancelled=true;engine.current?.dispose();engine.current=null;};
  },[]);
  useEffect(()=>engine.current?.update(props),[props.inside,props.busy,props.device,props.still,props.caption,props.returned,props.muted]);
  useEffect(()=>{engine.current?.setNote(props.note??"");},[props.note,ready]);
  // Opening the chat panel releases the mouse so the visitor can type.
  useEffect(()=>{if(props.panelOpen&&document.pointerLockElement)document.exitPointerLock();},[props.panelOpen]);

  // Virtual joystick (touch): analog movement, released on lift.
  const stick=useRef<{id:number;x:number;y:number}|null>(null),[knob,setKnob]=useState({x:0,y:0});
  const onStickDown=(e:React.PointerEvent<HTMLDivElement>)=>{e.currentTarget.setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect();
    stick.current={id:e.pointerId,x:r.left+r.width/2,y:r.top+r.height/2};onStickMove(e);};
  const onStickMove=(e:React.PointerEvent<HTMLDivElement>)=>{if(!stick.current||stick.current.id!==e.pointerId)return;
    let dx=(e.clientX-stick.current.x)/44,dy=(e.clientY-stick.current.y)/44;const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l;}
    setKnob({x:dx*36,y:dy*36});engine.current?.move(dx,dy);};
  const onStickUp=()=>{stick.current=null;setKnob({x:0,y:0});engine.current?.move(0,0);};

  return <>
    <div className="world-canvas" ref={host}/>
    {!ready&&!failed&&<div className="world-loading" role="status">
      <span className="loading-lantern">灯</span><p>正在加载</p>
      <div className="loading-bar" aria-label={`加载 ${Math.round(progress*100)}%`}><i style={{width:`${Math.round(progress*100)}%`}}/></div>
      <small>模型、贴图和光照 · {Math.round(progress*100)}%</small></div>}
    {failed&&<div className="world-fallback" role="alert"><h2>三维场景没能打开</h2><p>可能是设备或浏览器不支持。可以重新加载，或直接进入简洁体验。</p>
      <button onClick={()=>window.location.reload()}>重新加载</button><button onClick={props.onEnter}>直接开始体验</button></div>}
    {ready&&<>
      {locked&&<div className="crosshair" aria-hidden="true"/>}
      {hover&&<div className="hover-hint" role="status">{hover}<span>{locked?"点击或按 E":""}</span></div>}
      <div className="world-controls">
        <span className="desktop-control-hint">{locked?"鼠标环顾 · W A S D 走动 · Shift 快走 · E 互动 · Esc 释放鼠标":"点击画面开始环顾 · W A S D 走动 · E 互动"}</span>
        <span className="touch-control-hint">左下摇杆走动 · 拖动画面环顾 · 点物件互动</span>
        <button onClick={()=>engine.current?.reset()}>{props.inside?"回到柜台前":"回到街口"}</button>
      </div>
      <div className="joystick" onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp}
        role="slider" aria-label="移动摇杆" aria-valuetext="拖动来走动"><span style={{transform:`translate(${knob.x}px,${knob.y}px)`}}/></div>
      <button className="touch-interact" onClick={()=>engine.current?.interact()} aria-label="互动">互动</button>
    </>}
  </>;
}
