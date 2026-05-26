export class AudioEngine {
  private static ctx: AudioContext | null = null;
  private static engineOsc: OscillatorNode | null = null;
  private static engineGain: GainNode | null = null;
  private static engineFilter: BiquadFilterNode | null = null;

  static init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    } catch (e) {
      console.warn('Web Audio API not supported by this browser version: ', e);
    }
  }

  static resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Starts or maintains the continuous low-frequency looping engine sound
  static startEngine() {
    this.init();
    this.resume();
    if (!this.ctx) return;
    if (this.engineOsc) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(50, this.ctx.currentTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();

      this.engineOsc = osc;
      this.engineGain = gain;
      this.engineFilter = filter;
    } catch (e) {
      console.warn('Failed starting engine synthesizer: ', e);
    }
  }

  // Modulates pitch and volume of engine sound in accordance with real speed metrics
  static updateEngine(rpmRatio: number) {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.engineFilter) return;
    const now = this.ctx.currentTime;
    try {
      // Scale frequency between 50Hz and 250Hz based on RPM
      this.engineOsc.frequency.setTargetAtTime(50 + rpmRatio * 180, now, 0.1);
      // Keep filter frequency aligned for smooth acceleration
      this.engineFilter.frequency.setTargetAtTime(220 + rpmRatio * 430, now, 0.15);
      // Slightly amplify gain to signify acceleration under load
      this.engineGain.gain.setTargetAtTime(0.03 + rpmRatio * 0.045, now, 0.1);
    } catch (e) {}
  }

  static stopEngine() {
    try {
      if (this.engineOsc) {
        this.engineOsc.stop();
        this.engineOsc.disconnect();
        this.engineOsc = null;
      }
      this.engineGain = null;
      this.engineFilter = null;
    } catch (e) {}
  }

  // Triggers lightning boost sound fx
  static playBoost() {
    this.init();
    this.resume();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(1000, now + 1.2);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 2.5);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 2.5);
    } catch (e) {}
  }

  // Triggers drift tires screech sound
  static playDrift() {
    this.init();
    this.resume();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.linearRampToValueAtTime(240, now + 0.35);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.35);
    } catch (e) {}
  }

  // Triggers golden item picker sound
  static playItemPickup() {
    this.init();
    this.resume();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.setValueAtTime(659.25, now + 0.1); // E5

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, now + 0.15); // G5
      osc2.frequency.setValueAtTime(1046.50, now + 0.25); // C6

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.6);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(now + 0.6);
      osc2.stop(now + 0.6);
    } catch (e) {}
  }

  // Triggers item crash sound
  static playCrash() {
    this.init();
    this.resume();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(20, now + 0.5);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(130, now);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.6);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(now + 0.6);
    } catch (e) {}
  }
}
