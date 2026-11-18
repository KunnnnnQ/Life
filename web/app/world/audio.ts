// Procedural ambience with the Web Audio API (no audio files): rain bed, door chime, radio hiss, footsteps,
// and a slow generative piece the radio can play (soft chords with a few sparse notes on top).
// Starts only after a user gesture, as browsers require.
export type Ambience = { start:()=>void; chime:()=>void; step:()=>void; radio:(on:boolean)=>void; music:(on:boolean)=>void; timerDone:()=>void; setMuted:(m:boolean)=>void; setInside:(inside:boolean)=>void; dispose:()=>void };

export function createAmbience():Ambience {
  let ctx:AudioContext|null = null, master:GainNode|null = null, rainGain:GainNode|null = null, rainFilter:BiquadFilterNode|null = null;
  let radioGain:GainNode|null = null, muted = false;
  let musicGain:GainNode|null = null, musicTimer:number|undefined, nextBar = 0, bar = 0;
  // Fmaj7 – Em7 – Dm7 – Cmaj7, voiced low and close; melody notes from C major pentatonic.
  const CHORDS = [[174.6,220,261.6,329.6],[164.8,196,246.9,293.7],[146.8,174.6,220,261.6],[130.8,164.8,196,246.9]];
  const MELODY = [523.3,587.3,659.3,784,880,1046.5];
  function noiseBuffer(c:AudioContext, seconds:number, brown=false){
    const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate), d = b.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return b;
  }
  function start(){
    if (ctx) { void ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : .8; master.connect(ctx.destination);
    // Rain: brown noise for body plus filtered white noise for the hiss of drops.
    rainGain = ctx.createGain(); rainGain.gain.value = .35; rainFilter = ctx.createBiquadFilter(); rainFilter.type = "lowpass"; rainFilter.frequency.value = 4200;
    rainFilter.connect(rainGain); rainGain.connect(master);
    for (const [brown, gain] of [[true, .9], [false, .12]] as const) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 4, brown); src.loop = true;
      const g = ctx.createGain(); g.gain.value = gain; src.connect(g); g.connect(rainFilter); src.start();
    }
    radioGain = ctx.createGain(); radioGain.gain.value = 0;
    const hiss = ctx.createBufferSource(); hiss.buffer = noiseBuffer(ctx, 2); hiss.loop = true;
    const band = ctx.createBiquadFilter(); band.type = "bandpass"; band.frequency.value = 2200; band.Q.value = .8;
    hiss.connect(band); band.connect(radioGain); radioGain.connect(master); hiss.start();
    // Music goes through a warm low-pass, like a small speaker.
    musicGain = ctx.createGain(); musicGain.gain.value = 0; const warm = ctx.createBiquadFilter(); warm.type = "lowpass"; warm.frequency.value = 1800;
    musicGain.connect(warm); warm.connect(master);
  }
  function tone(freq:number, at:number, dur:number, vol:number, out:AudioNode|null = master, attack = .01, type:OscillatorType = "sine"){
    if (!ctx || !out) return;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + attack); g.gain.exponentialRampToValueAtTime(.0001, at + dur);
    o.connect(g); g.connect(out); o.start(at); o.stop(at + dur + .05);
  }
  // Schedules bars a little ahead of time so the music never stutters.
  function scheduleMusic(){
    if (!ctx || !musicGain) return;
    while (nextBar < ctx.currentTime + 1) {
      const chord = CHORDS[bar % CHORDS.length], len = 4.8;
      for (const f of chord) tone(f, nextBar, len + 1.2, .05, musicGain, 1.4, "triangle");
      tone(chord[0] / 2, nextBar, len + .8, .07, musicGain, .8);
      for (let i = 0; i < 3; i++) if (Math.random() < .55) tone(MELODY[Math.floor(Math.random() * MELODY.length)], nextBar + .6 + i * 1.4 + Math.random() * .3, 2.4, .045, musicGain, .02);
      nextBar += len; bar++;
    }
  }
  return {
    start,
    chime(){ if (!ctx) return; const t = ctx.currentTime; tone(1318.5, t, 1.4, .12); tone(987.8, t + .18, 1.6, .1); },
    step(){ if (!ctx || !master) return; const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, .08); const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700;
      const g = ctx.createGain(); g.gain.setValueAtTime(.18, t); g.gain.exponentialRampToValueAtTime(.001, t + .08); s.connect(f); f.connect(g); g.connect(master); s.start(t); },
    radio(on){ if (ctx && radioGain) radioGain.gain.setTargetAtTime(on ? .035 : 0, ctx.currentTime, .3); },
    music(on){
      if (!ctx || !musicGain) return;
      musicGain.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, on ? .8 : .4);
      if (on && musicTimer === undefined) { nextBar = ctx.currentTime + .1; scheduleMusic(); musicTimer = window.setInterval(scheduleMusic, 400); }
      if (!on && musicTimer !== undefined) { window.clearInterval(musicTimer); musicTimer = undefined; }
    },
    // Three soft descending notes at the end of a quiet timer.
    timerDone(){ if (!ctx) return; const t = ctx.currentTime; tone(784, t, 1.6, .09); tone(659.3, t + .35, 1.6, .08); tone(523.3, t + .7, 2.2, .08); },
    setMuted(m){ muted = m; if (ctx && master) master.gain.setTargetAtTime(m ? 0 : .8, ctx.currentTime, .1); },
    // Indoors the rain is muffled.
    setInside(inside){ if (ctx && rainFilter && rainGain) { rainFilter.frequency.setTargetAtTime(inside ? 900 : 4200, ctx.currentTime, .4); rainGain.gain.setTargetAtTime(inside ? .22 : .35, ctx.currentTime, .4); } },
    dispose(){ if (musicTimer !== undefined) window.clearInterval(musicTimer); void ctx?.close(); ctx = null; },
  };
}
