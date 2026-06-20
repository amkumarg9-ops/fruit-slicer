class SoundSynth {
  constructor() {
    this.ctx = null;
    this.masterVolume = null;
    this.initialized = false;
  }

  // Initialize Audio Context on user gesture to comply with browser policies
  init() {
    if (this.initialized) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.masterVolume = this.ctx.createGain();
      this.masterVolume.gain.setValueAtTime(0.4, this.ctx.currentTime); // Master volume at 40%
      this.masterVolume.connect(this.ctx.destination);
      this.initialized = true;
      console.log("🔊 SoundSynth Web Audio context initialized successfully");
    } catch (e) {
      console.warn("⚠️ Web Audio API not supported in this browser:", e);
    }
  }

  // Helper to create a noise buffer for white noise
  createNoiseBuffer() {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 2.0; // 2 seconds buffer
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // 1. Sword Swing (Whoosh) Sound
  playSwing() {
    this.init();
    if (!this.ctx) return;
    
    // Resume context if suspended (browser behavior)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    
    // Create White Noise source
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();

    // Create a Bandpass filter to sweep the noise
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(3.0, now);
    
    // Sweep the frequency down quickly to simulate sword whoosh
    filter.frequency.setValueAtTime(1000, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.18);

    // Create Gain envelope
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.7, now + 0.04); // Quick attack
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18); // Rapid decay

    // Connect nodes
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterVolume);

    noise.start(now);
    noise.stop(now + 0.2);
  }

  // 2. Fruit Splat (Slice) Sound
  playSplat() {
    this.init();
    if (!this.ctx) return;
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;

    // Component A: Pitch-swept sine wave for the squishy impact
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    // Component B: Metallic burst (high-passed noise) to simulate knife strike
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2500, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05); // Tiny crack

    // Connect nodes
    osc.connect(oscGain);
    oscGain.connect(this.masterVolume);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterVolume);

    // Start playback
    osc.start(now);
    osc.stop(now + 0.15);

    noise.start(now);
    noise.stop(now + 0.06);
  }

  // 3. Bomb Explosion Sound
  playExplosion() {
    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;

    // Component A: Deep bass rumble (Low-frequency sine wave sweep)
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(120, now);
    subOsc.frequency.exponentialRampToValueAtTime(20, now + 1.2);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(1.0, now);
    subGain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

    // Component B: Debris/Blast (Low-pass filtered white noise)
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();

    const lpFilter = this.ctx.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.setValueAtTime(600, now);
    lpFilter.frequency.linearRampToValueAtTime(40, now + 1.5);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.9, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);

    // Connect nodes
    subOsc.connect(subGain);
    subGain.connect(this.masterVolume);

    noise.connect(lpFilter);
    lpFilter.connect(noiseGain);
    noiseGain.connect(this.masterVolume);

    // Start playback
    subOsc.start(now);
    subOsc.stop(now + 1.3);

    noise.start(now);
    noise.stop(now + 1.6);
  }

  // 4. Combo Sound (Pentatonic Arpeggio)
  playCombo() {
    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    
    // Cyberpunk pentatonic notes for combo (C5, D5, F5, G5, A5)
    const frequencies = [523.25, 587.33, 698.46, 783.99, 880.00];
    
    // Play notes rapidly one after another
    frequencies.forEach((freq, idx) => {
      const noteDelay = idx * 0.07; // 70ms separation
      const noteTime = now + noteDelay;

      const osc = this.ctx.createOscillator();
      const synthGain = this.ctx.createGain();

      // Custom cyber tone: Triangle + Sine mix
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);
      // Small vibrato
      osc.frequency.linearRampToValueAtTime(freq + 5, noteTime + 0.1);

      synthGain.gain.setValueAtTime(0, noteTime);
      synthGain.gain.linearRampToValueAtTime(0.3, noteTime + 0.01);
      synthGain.gain.exponentialRampToValueAtTime(0.005, noteTime + 0.25);

      // Connect nodes
      osc.connect(synthGain);
      synthGain.connect(this.masterVolume);

      osc.start(noteTime);
      osc.stop(noteTime + 0.3);
    });
  }

  // 5. Game Over (Descending Minor Chord)
  playGameOver() {
    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;

    // Play 3 descending minor notes at once (A3, C4, E4)
    const baseFreqs = [220.00, 261.63, 329.63];

    baseFreqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      
      // Sweep pitch down to sound sad/failed
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 1.5);

      // Lowpass filter to make it sound warm and retro
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 1.5);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

      // Connect nodes
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterVolume);

      osc.start(now);
      osc.stop(now + 1.7);
    });
  }
}

// Export as a global singleton for easy integration in Phaser
const synth = new SoundSynth();
window.synth = synth;
