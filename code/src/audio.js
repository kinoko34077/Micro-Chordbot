export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.voices = new Map();
    this.phaseMode = "reset";
    this.phaseState = new Map();
  }

  async ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  setMasterVolume(v) {
    if (!this.master) return;
    this.master.gain.value = Math.max(0, Math.min(1, v));
  }

  setPhaseMode(mode) {
    this.phaseMode = mode === "continue" ? "continue" : "reset";
  }

  normalizeWaveformName(waveform) {
    return waveform === "square" || waveform === "sawtooth" ? waveform : "sine";
  }

  phaseAtTime(freq, time) {
    const cycles = ((Number(freq) || 0) * (Number(time) || 0)) % 1;
    return cycles * Math.PI * 2;
  }

  normalizePhase(value) {
    const tau = Math.PI * 2;
    const phase = Number(value) || 0;
    return ((phase % tau) + tau) % tau;
  }

  randomPhase() {
    return Math.random() * Math.PI * 2;
  }

  phaseKeyForVoice(id, options = {}) {
    return String(options.phaseKey || id || "");
  }

  ensurePhaseState(phaseKey, freq, time) {
    const key = String(phaseKey || "");
    const existing = this.phaseState.get(key);
    if (existing) {
      return this.advancePhaseState(key, time);
    }
    const entry = {
      phase: 0,
      freq: Number(freq) || 0,
      updatedAt: Number(time) || 0
    };
    this.phaseState.set(key, entry);
    return entry;
  }

  advancePhaseState(phaseKey, time, fallbackFreq = null) {
    const key = String(phaseKey || "");
    const entry = this.phaseState.get(key) || {
      phase: 0,
      freq: Number(fallbackFreq) || 0,
      updatedAt: Number(time) || 0
    };
    const now = Number(time) || 0;
    const elapsed = Math.max(0, now - (Number(entry.updatedAt) || 0));
    const nextPhase = this.normalizePhase((Number(entry.phase) || 0) + ((Number(entry.freq) || 0) * elapsed * Math.PI * 2));
    const nextEntry = {
      phase: nextPhase,
      freq: Number(entry.freq) || Number(fallbackFreq) || 0,
      updatedAt: now
    };
    this.phaseState.set(key, nextEntry);
    return nextEntry;
  }

  createPeriodicWaveForPhase(waveform, phase) {
    const harmonics = 32;
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    const writeHarmonic = (index, amplitude) => {
      const shifted = index * phase;
      real[index] = amplitude * Math.sin(shifted);
      imag[index] = amplitude * Math.cos(shifted);
    };

    const kind = this.normalizeWaveformName(waveform);
    if (kind === "square") {
      for (let n = 1; n <= harmonics; n += 2) {
        writeHarmonic(n, 1 / n);
      }
    } else if (kind === "sawtooth") {
      for (let n = 1; n <= harmonics; n += 1) {
        writeHarmonic(n, (n % 2 === 0 ? -1 : 1) / n);
      }
    } else {
      writeHarmonic(1, 1);
    }

    return this.ctx.createPeriodicWave(real, imag);
  }

  applyWaveform(osc, waveform, freq, phaseMode = this.phaseMode, phase = 0) {
    const kind = this.normalizeWaveformName(waveform);
    if (phaseMode === "continue" && this.ctx) {
      osc.setPeriodicWave(this.createPeriodicWaveForPhase(kind, phase));
      return;
    }
    osc.type = kind;
  }

  async startVoice(id, freq, waveform, gain = 0.2, options = {}) {
    await this.ensure();
    const normalizedWaveform = this.normalizeWaveformName(waveform);
    const now = this.ctx.currentTime;
    const phaseKey = this.phaseKeyForVoice(id, options);
    const phaseStartMode = options.phaseStartMode || "stored";
    const existing = this.voices.get(id);
    if (existing) {
      const phaseEntry = this.advancePhaseState(existing.phaseKey || phaseKey, now, existing.freq);
      if (existing.waveform !== normalizedWaveform) {
        this.applyWaveform(existing.osc, normalizedWaveform, freq, this.phaseMode, phaseEntry.phase);
        existing.waveform = normalizedWaveform;
      }
      existing.g.gain.cancelScheduledValues(this.ctx.currentTime);
      existing.g.gain.setValueAtTime(existing.g.gain.value, this.ctx.currentTime);
      existing.g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.02);
      existing.osc.frequency.cancelScheduledValues(this.ctx.currentTime);
      existing.osc.frequency.setValueAtTime(existing.osc.frequency.value, this.ctx.currentTime);
      existing.osc.frequency.linearRampToValueAtTime(freq, this.ctx.currentTime + 0.03);
      existing.freq = Number(freq) || 0;
      existing.phaseKey = phaseKey;
      this.phaseState.set(existing.phaseKey, {
        phase: phaseEntry.phase,
        freq: existing.freq,
        updatedAt: now
      });
      return;
    }

    const phaseEntry = this.phaseMode === "continue"
      ? phaseStartMode === "random"
        ? {
            phase: this.randomPhase(),
            freq: Number(freq) || 0,
            updatedAt: now
          }
        : this.ensurePhaseState(phaseKey, freq, now)
      : { phase: 0, freq: Number(freq) || 0, updatedAt: now };
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    this.applyWaveform(osc, normalizedWaveform, freq, this.phaseMode, phaseEntry.phase);
    osc.frequency.value = freq;
    g.gain.value = 0.0001;
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.02);
    this.voices.set(id, {
      osc,
      g,
      waveform: normalizedWaveform,
      phaseKey,
      freq: Number(freq) || 0
    });
    this.phaseState.set(phaseKey, {
      phase: phaseEntry.phase,
      freq: Number(freq) || 0,
      updatedAt: now
    });
  }

  updateVoice(id, freq, glideSeconds = 0.03) {
    const v = this.voices.get(id);
    if (!v) return;
    const t = this.ctx.currentTime;
    v.osc.frequency.cancelScheduledValues(t);
    v.osc.frequency.setValueAtTime(v.osc.frequency.value, t);
    v.osc.frequency.linearRampToValueAtTime(freq, t + glideSeconds);
  }

  setVoiceGain(id, gain, rampSeconds = 0.02) {
    const v = this.voices.get(id);
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setValueAtTime(v.g.gain.value, t);
    v.g.gain.linearRampToValueAtTime(gain, t + rampSeconds);
  }

  hasVoice(id) {
    return this.voices.has(id);
  }

  stopVoice(id, fadeMs = 15) {
    const v = this.voices.get(id);
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.phaseMode === "continue" && v.phaseKey) {
      const phaseEntry = this.advancePhaseState(v.phaseKey, t, v.freq);
      this.phaseState.set(v.phaseKey, {
        phase: phaseEntry.phase,
        freq: Number(v.freq) || 0,
        updatedAt: t
      });
    }
    const end = t + fadeMs / 1000;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setValueAtTime(v.g.gain.value, t);
    v.g.gain.linearRampToValueAtTime(0.0001, end);
    v.osc.stop(end + 0.005);
    this.voices.delete(id);
  }

  stopAll() {
    for (const id of Array.from(this.voices.keys())) {
      this.stopVoice(id);
    }
  }
}
