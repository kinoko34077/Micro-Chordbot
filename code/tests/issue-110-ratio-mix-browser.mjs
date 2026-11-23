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
      window.__mixStarts=[];window.__mixMasters=[];
      const start=AudioEngine.prototype.startVoice;
      const setMaster=AudioEngine.prototype.setMasterVolume;
      AudioEngine.prototype.startVoice=function(id,freq,wave,gain,...more){
        window.__mixStarts.push({id,freq,wave,gain});
        return start.call(this,id,freq,wave,gain,...more);
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
      const transport=window.__mixStarts.filter(x=>x.id.startsWith("ratio-")).slice(-16);
      const audition=window.__mixStarts.filter(x=>x.id.startsWith("tap-")).slice(-16);
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
      return {transport, audition, master, masters:window.__mixMasters,
        single:await render(transport,1),
        combinedRaw:await render([...transport,...audition],1),
        combinedEffective:await render([...transport,...audition],master)};
    });
    assert.equal(result.transport.length,16);
    assert.equal(result.audition.length,16);
    assert.equal(result.master>0,true);
    assert.ok(result.single.peak>0);
    console.log("AUDIT_110_RATIO_MIX "+JSON.stringify({
      gainTransport:result.transport[0].gain,gainAudition:result.audition[0].gain,
      master:result.master,masters:result.masters,
      single:result.single,combinedRaw:result.combinedRaw,
      combinedEffective:result.combinedEffective
    }));
    await page.locator("#stop").click();
  }finally{await page.close()}
}finally{await browser.close()}
