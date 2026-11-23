// Ratio-mode-only playback balance. This is a power/peak proxy, NOT
// BS.1770 LUFS, ISO 226 equal-loudness or an ISO 532 psychoacoustic model.
// Both transport and audition must use the same rules with their own levels.
const TARGET_LEVEL = Object.freeze({transport:0.24,audition:0.185});
const PEAK_CEILING = 0.9;

// Add the squares of coherent (essentially equal-frequency) voice counts.
// Distinct oscillators are treated as approximately power-uncorrelated.
// Counting equal-frequency oscillators independently would overstate the
// denominator's loudness safety when their phases start together.
export function chordVoiceGain(freqs,mode="transport"){
  if(!Array.isArray(freqs)||freqs.length===0)return 0;
  if(!(mode in TARGET_LEVEL))throw new RangeError("未知の再生モードです");
  const groups=new Map();
  for(const freq of freqs){
    if(!Number.isFinite(freq)||freq<=0)throw new RangeError("発音周波数が不正です");
    // 0.001-cent buckets tolerate negligible floating-point differences.
    const key=Math.round(1200000*Math.log2(freq/440));
    groups.set(key,(groups.get(key)||0)+1);
  }
  let power=0;
  for(const count of groups.values())power+=count*count;
  // The peak cap is intentionally conservative for 16 voices at master=1.
  // Overlapping independent audition and transport are a separate mix case.
  return Math.min(TARGET_LEVEL[mode]/Math.sqrt(power),PEAK_CEILING/freqs.length);
}
