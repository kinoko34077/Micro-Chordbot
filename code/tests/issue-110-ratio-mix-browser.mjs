import assert from "node:assert/strict";
import {chromium} from "playwright";

// Audit #110 A2: use the real ratio-mode UI for gain selection and an actual
// OfflineAudioContext for a reproducible phase-aligned worst-case mix. This is
// a signal-peak bound, not a claim that real-time starts are phase aligned.
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  try{
    await page.goto("http://127.0.0.1:4173/ratio-mode/",{waitUntil:"domcontentloaded"});
    const ratios=Array.from({length:16},(_,i)=>4*i+1);
    const fixture=await page.evaluate(expr=>{
      const project=JSON.parse(localStorage.getItem("muChordbot.ratioMode.v1"));
      project.settings.loop=false;project.settings.wave="sine";
      const section=project.sections[0];
      section.repeat=1;
      section.steps=[{id:"mix-test",expr,pitch:"C2",beats:4,beatUnit:4}];
      project.sections=[section];
      return JSON.stringify(project);
    },ratios.join(","));
    await page.locator("#openIO").click();
    await page.locator("#ioText").fill(fixture);
    await page.locator("#ioImport").click();
    assert.match(await page.locator("#ioStatus").innerText(),/読み込みました/);
    await page.locator("#ioClose").click();
    await page.locator("#masterVolume").evaluate(el=>{
      el.value="1";el.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await page.evaluate(async()=>{
      const {AudioEngine}=await import("../src/audio.js");
      window.__mixStarts=[];window.__mixMasters=[];window.__mixEvents=[];
      const start=AudioEngine.prototype.startVoice;
      const setMaster=AudioEngine.prototype.setMasterVolume;
      const setGain=AudioEngine.prototype.setVoiceGain;
      AudioEngine.prototype.startVoice=function(id,freq,wave,gain,...more){
        window.__mixStarts.push({id,freq,wave,gain});
        window.__mixEvents.push({kind:"start",id,freq,wave,gain});
        return start.call(this,id,freq,wave,gain,...more);
      };
      AudioEngine.prototype.setVoiceGain=function(id,gain,...more){
        window.__mixEvents.push({kind:"gain",id,gain});
        return setGain.call(this,id,gain,...more);
      };
      AudioEngine.prototype.setMasterVolume=function(value){
        window.__mixMasters.push(value);
        return setMaster.call(this,value);
      };
    });
    await page.locator("#play").click();
    await page.waitForFunction(()=>window.__mixStarts.filter(x=>x.id.startsWith("ratio-")).length>=16);
    await page.locator("#preview").click();
    await page.waitForFunction(()=>window.__mixStarts.filter(x=>x.id.startsWith("tap-")).length>=16);
    const result=await page.evaluate(async()=>{
      const initialTransport=window.__mixStarts.filter(x=>x.id.startsWith("ratio-")).slice(-16);
      const initialAudition=window.__mixStarts.filter(x=>x.id.startsWith("tap-")).slice(-16);
      const {chordVoiceGain}=await import("./loudness.mjs");
      const nominalAudition=chordVoiceGain(initialAudition.map(x=>x.freq),"audition");
      const active=new Map();
      for(const event of window.__mixEvents){
        if(event.kind==="start")active.set(event.id,{...event});
        if(event.kind==="gain"&&active.has(event.id))
          active.get(event.id).gain=event.gain;
      }
      const transport=initialTransport.map(x=>active.get(x.id));
      const audition=initialAudition.map(x=>active.get(x.id));
      const master=window.__mixMasters.at(-1);
      const render=async(specs,volume)=>{
        const rate=48000,length=rate/3,ctx=new OfflineAudioContext(1,length,rate);
        for(const voice of specs){
          const osc=ctx.createOscillator(),amp=ctx.createGain();
          osc.type=voice.wave;osc.frequency.value=voice.freq;
          amp.gain.value=voice.gain*volume;
          osc.connect(amp);amp.connect(ctx.destination);osc.start(0);osc.stop(length/rate);
        }
        const data=(await ctx.startRendering()).getChannelData(0);
        let peak=0,power=0;
        for(let i=2400;i<data.length;i++){
          peak=Math.max(peak,Math.abs(data[i]));power+=data[i]*data[i];
        }
        return {peak,rms:Math.sqrt(power/(data.length-2400))};
      };
      return {transport, audition, initialTransport, initialAudition,
        master, masters:window.__mixMasters,
        single:await render(initialTransport,1),
        combinedRaw:await render([...initialTransport,
          ...initialAudition.map(x=>({...x,gain:nominalAudition}))],1),
        combinedEffective:await render([...transport,...audition],master)};
    });
    assert.equal(result.transport.length,16);
    assert.equal(result.audition.length,16);
    assert.equal(result.master>0,true);
    assert.ok(result.single.peak>.85&&result.single.peak<.901);
    assert.ok(result.combinedRaw.peak>1.4,"baseline must reproduce unsafe unbalanced mix");
    assert.ok(result.combinedEffective.peak<=.901,
      "actual UI mix must stay under 0.9: "+JSON.stringify(result.combinedEffective));
    assert.ok(result.transport.every(x=>x.gain>0&&x.gain<result.initialTransport[0].gain),
      "existing transport voices were not lowered during overlap");
    assert.ok(result.audition.every(x=>x.gain>0&&x.gain<result.initialAudition[0].gain),
      "audition was not given a reduced start gain");
    console.log("AUDIT_110_RATIO_MIX "+JSON.stringify({
      gainTransport:result.transport[0].gain,gainAudition:result.audition[0].gain,
      originalTransport:result.initialTransport[0].gain,
      master:result.master,masters:result.masters,
      single:result.single,combinedRaw:result.combinedRaw,
      combinedEffective:result.combinedEffective
    }));
    // Tap audition expires after at most 850 ms. Transport must recover its
    // original stand-alone gain while playback itself stays running.
    await page.waitForTimeout(950);
    const afterTap=await page.evaluate(()=>{
      const starters=window.__mixStarts.filter(x=>x.id.startsWith("ratio-")).slice(-16);
      const gains=new Map(starters.map(x=>[x.id,x.gain]));
      for(const event of window.__mixEvents){
        if(event.kind==="gain"&&gains.has(event.id))gains.set(event.id,event.gain);
      }
      return [...gains.values()];
    });
    assert.equal(afterTap.length,16);
    assert.ok(afterTap.every(x=>Math.abs(x-result.initialTransport[0].gain)<1e-8),
      "stopping audition did not restore transport loudness");
    assert.ok(await page.locator("#play").evaluate(x=>x.classList.contains("playing")),
      "tap expiry should not stop transport");
    // A new stand-alone replay must still receive the old per-voice gain.
    await page.locator("#stop").click();
    await page.locator("#play").click();
    await page.waitForFunction(()=>window.__mixStarts.filter(x=>x.id.startsWith("ratio-")).length>=32);
    const restarted=await page.evaluate(()=>window.__mixStarts.filter(x=>x.id.startsWith("ratio-")).slice(-16));
    assert.ok(restarted.every(x=>Math.abs(x.gain-result.initialTransport[0].gain)<1e-8));
    await page.locator("#stop").click();
  }finally{await page.close()}
}finally{await browser.close()}
