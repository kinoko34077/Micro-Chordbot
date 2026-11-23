import assert from "node:assert/strict";
import test from "node:test";
import {chordVoiceGain} from "../ratio-mode/loudness.mjs";

const frequencies=[220,277.182631,329.627557,369.994423,415.304698];
const close=(actual,expected,tolerance=1e-9)=>
  assert.ok(Math.abs(actual-expected)<=tolerance,
    "expected "+expected+", got "+actual);

// Synthetic steady-state sine RMS is a proxy, not perceived loudness.
function sineRms(freqs,gain){
  const rate=48000,count=rate/2;
  let sum=0;
  for(let i=0;i<count;i++){
    let value=0;
    for(const freq of freqs)value+=Math.sin(2*Math.PI*freq*i/rate)*gain;
    sum+=value*value;
  }
  return Math.sqrt(sum/count);
}
const db=(x)=>20*Math.log10(x);

test("3- and 5-tone ratios have matched power proxy for distinct pitches",()=>{
  for(const mode of ["transport","audition"]){
    const a=frequencies.slice(0,3),b=frequencies;
    const gain3=chordVoiceGain(a,mode),gain5=chordVoiceGain(b,mode);
    close(gain3*Math.sqrt(3),gain5*Math.sqrt(5));
    // Real samples have finite-window cross-products; keep this empirical.
    const rms3=sineRms(a,gain3),rms5=sineRms(b,gain5);
    assert.ok(Math.abs(db(rms3/rms5))<0.5,
      mode+" 3/5 waveform RMS diverges: "+db(rms3/rms5)+"dB");
    assert.ok(gain3>gain5);
  }
});

test("identical notes are coherent and normalized by summed amplitudes",()=>{
  for(const mode of ["transport","audition"]){
    const gain3=chordVoiceGain([220,220,220],mode);
    const gain5=chordVoiceGain([220,220,220,220,220],mode);
    close(3*gain3,5*gain5);
    const a=sineRms([220,220,220],gain3);
    const b=sineRms([220,220,220,220,220],gain5);
    close(a,b);
    // Two unisons plus one different pitch: group power is 2²+1².
    close(chordVoiceGain([220,220,330],mode),chordVoiceGain([220,330,440],mode)*Math.sqrt(3/5));
  }
});

test("peak-budget remains bounded up to 16 distinct voices without touching master",()=>{
  const dense=Array.from({length:16},(_,i)=>220*Math.pow(2,i/12));
  for(const mode of ["transport","audition"]){
    for(const n of [1,2,3,5,8,12,16]){
      const gain=chordVoiceGain(dense.slice(0,n),mode);
      assert.ok(gain>0&&Number.isFinite(gain));
      assert.ok(n*gain<=.900000001,"potentially clipping unison sum at n="+n);
    }
  }
  assert.ok(chordVoiceGain(dense,"transport")<chordVoiceGain(dense.slice(0,3),"transport"));
});

test("mode contract, nonmutation and invalid frequencies",()=>{
  const original=[220,220,330],snapshot=[...original];
  assert.ok(chordVoiceGain(original,"transport")>chordVoiceGain(original,"audition"));
  assert.deepEqual(original,snapshot);
  assert.equal(chordVoiceGain([]),0);
  assert.throws(()=>chordVoiceGain([0,220]),RangeError);
  assert.throws(()=>chordVoiceGain([Number.NaN]),RangeError);
  assert.throws(()=>chordVoiceGain([220],"unknown"),RangeError);
});
