export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.voices = new Map();
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

  async startVoice(id, freq, waveform, gain = 0.2) {
    await this.ensure();
    const existing = this.voices.get(id);
    if (existing) {
      existing.osc.type = waveform;
      existing.g.gain.cancelScheduledValues(this.ctx.currentTime);
      existing.g.gain.setValueAtTime(existing.g.gain.value, this.ctx.currentTime);
      existing.g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.02);
      existing.osc.frequency.cancelScheduledValues(this.ctx.currentTime);
      existing.osc.frequency.setValueAtTime(existing.osc.frequency.value, this.ctx.currentTime);
      existing.osc.frequency.linearRampToValueAtTime(freq, this.ctx.currentTime + 0.03);
      return;
    }

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = waveform;
    osc.frequency.value = freq;
    g.gain.value = 0.0001;
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.02);
    this.voices.set(id, { osc, g });
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
