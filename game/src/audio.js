// audio.js — every sound in Gilded Shadow, synthesized live with WebAudio.
// No audio files, no network: oscillators and filtered noise only. The
// context is created on the first user gesture (browsers demand that), and
// every cue is quiet on purpose — a stealth game should whisper.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambientNodes = null;
    this.enabled = true;
    this.lastStepAt = 0;
  }

  // Call from any keydown / pointerdown handler.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startAmbient();
    } catch {
      this.ctx = null;
    }
  }

  // A low, slow night-time pad: two detuned sines breathing through a gain
  // LFO. Starts once, stays under everything else.
  startAmbient() {
    if (!this.ctx || this.ambientNodes) return;
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    gain.connect(this.master);
    const oscA = this.ctx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.value = 55;
    const oscB = this.ctx.createOscillator();
    oscB.type = 'sine';
    oscB.frequency.value = 55.7;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    oscA.connect(gain);
    oscB.connect(gain);
    oscA.start(t);
    oscB.start(t);
    lfo.start(t);
    gain.gain.linearRampToValueAtTime(0.035, t + 4);
    this.ambientNodes = { oscA, oscB, lfo, gain };
  }

  tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.15, vol = 0.2, when = 0, pan = 0 }) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = gain;
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner);
      out = panner;
    }
    osc.connect(gain);
    out.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // Short burst of filtered noise — a footstep. `pan` places it left/right
  // of the player, `vol` falls off with distance, so footsteps tell you
  // where a warden is.
  footstep(pan = 0, vol = 0.12) {
    if (!this.ctx || !this.enabled) return;
    const now = performance.now();
    if (now - this.lastStepAt < 90) return;
    this.lastStepAt = now;
    const t = this.ctx.currentTime;
    const dur = 0.07;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    let out = gain;
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner);
      out = panner;
    }
    src.connect(filter);
    filter.connect(gain);
    out.connect(this.master);
    src.start(t);
  }

  pickup() {
    // A bright little chime, rising.
    this.tone({ freq: 660, dur: 0.12, vol: 0.16, type: 'triangle' });
    this.tone({ freq: 990, dur: 0.18, vol: 0.14, type: 'triangle', when: 0.07 });
    this.tone({ freq: 1320, dur: 0.22, vol: 0.1, type: 'triangle', when: 0.14 });
  }

  unlockDoor() {
    this.tone({ freq: 392, dur: 0.2, vol: 0.16, type: 'triangle' });
    this.tone({ freq: 523, dur: 0.3, vol: 0.16, type: 'triangle', when: 0.1 });
    this.tone({ freq: 784, dur: 0.4, vol: 0.12, type: 'sine', when: 0.2 });
  }

  // The alarm sting: two sharp rising notes when a warden fully spots you.
  alertSting() {
    this.tone({ freq: 220, freqEnd: 440, dur: 0.25, vol: 0.22, type: 'sawtooth' });
    this.tone({ freq: 233, freqEnd: 466, dur: 0.25, vol: 0.22, type: 'sawtooth', when: 0.02 });
    this.tone({ freq: 880, dur: 0.35, vol: 0.12, type: 'square', when: 0.22 });
  }

  // A short questioning blip when a warden grows suspicious.
  suspiciousBlip() {
    this.tone({ freq: 520, freqEnd: 700, dur: 0.12, vol: 0.1, type: 'triangle' });
  }

  levelClear() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.3, vol: 0.15, type: 'triangle', when: i * 0.11 }),
    );
  }

  winFanfare() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.45, vol: 0.15, type: 'triangle', when: i * 0.13 }),
    );
  }

  caughtDrone() {
    this.tone({ freq: 110, freqEnd: 55, dur: 0.9, vol: 0.25, type: 'sawtooth' });
    this.tone({ freq: 116, freqEnd: 58, dur: 0.9, vol: 0.18, type: 'sawtooth', when: 0.05 });
  }
}
