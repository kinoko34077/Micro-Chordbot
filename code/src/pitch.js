export const OCTAVE_MICROSTEP = 3600;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function centToMicroStep(cent) {
  return Math.round(cent * 3);
}

export function microStepToCent(microStep) {
  return microStep / 3;
}

export function normalizePitch(octave, microStepRaw) {
  let o = Math.trunc(octave);
  let ms = Math.trunc(microStepRaw);
  while (ms >= OCTAVE_MICROSTEP) {
    ms -= OCTAVE_MICROSTEP;
    o += 1;
  }
  while (ms < 0) {
    ms += OCTAVE_MICROSTEP;
    o -= 1;
  }
  return { octave: o, microStepInOctave: ms };
}

export function frequencyFromPitch(a4Hz, octave, microStepInOctave) {
  // C4 from A4 reference, then apply octave + in-octave microStep.
  const semitoneDiffA4ToC4 = -9;
  const c4Hz = a4Hz * Math.pow(2, semitoneDiffA4ToC4 / 12);
  const octaveOffset = octave - 4;
  const octaveRatio = Math.pow(2, octaveOffset);
  const inOctaveRatio = Math.pow(2, microStepInOctave / OCTAVE_MICROSTEP);
  return c4Hz * octaveRatio * inOctaveRatio;
}

export function snapCent(rawCent, snapCentValue) {
  const s = clamp(Number(snapCentValue) || 0, 0, 600);
  if (s <= 0) return rawCent;
  return Math.round(rawCent / s) * s;
}
