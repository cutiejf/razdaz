// sound.js – ambient music + pop/result sound effects

const SoundManager = {
  audio: null,
  audioContext: null,
  masterGain: null,
  isInitialized: false,
  musicMuted: false,
  soundEnabled: true,
  effectsVolume: 1,
  musicVolume: 0.08,

  async init() {
    try {
      this.audio = document.getElementById("spaceyMusic");
      if (!this.audio) {
        console.warn("[SoundManager] No external music element found; using synthesized sound effects only.");
      } else {
        this.audio.loop = true;
        this.audio.preload = "auto";
        this.audio.volume = this.musicVolume;

        if (this.musicMuted) {
          this.audio.muted = true;
          this.audio.pause();
        } else {
          this.audio.play().catch(() => {
            console.warn("[SoundManager] Music autoplay was blocked. It will resume on the first user interaction.");
            const resume = () => {
              if (this.audio && this.audio.paused && !this.musicMuted) {
                this.audio.play().catch(() => {});
              }
              document.removeEventListener("click", resume);
            };
            document.addEventListener("click", resume, { once: true });
          });
        }
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!this.audioContext) {
          this.audioContext = new AudioCtx();
        }
        if (!this.masterGain) {
          this.masterGain = this.audioContext.createGain();
          this.masterGain.gain.value = 0.22 * this.effectsVolume;
          this.masterGain.connect(this.audioContext.destination);
        }
      }

      this.isInitialized = true;
      console.log("[SoundManager] initialized ✅");
    } catch (err) {
      console.error("[SoundManager] Init error:", err);
    }
  },

  ensureAudioContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.audioContext = new AudioCtx();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.22 * this.effectsVolume;
      this.masterGain.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === "suspended" || this.audioContext.state === "interrupted") {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  },

  resumeAudio() {
    const ctx = this.ensureAudioContext();
    if (!ctx) return Promise.resolve();
    if (ctx.state === "suspended" || ctx.state === "interrupted") {
      return ctx.resume().catch(() => {});
    }
    return Promise.resolve();
  },

  playTone({ frequency = 440, duration = 0.08, volume = 0.07, type = "triangle", sweep = 100, delay = 0 } = {}) {
    if (!this.soundEnabled) return;
    const ctx = this.ensureAudioContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, frequency + sweep), now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume * 1.45, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.04);
  },

  async playRollPop(delay = 0) {
    if (!this.soundEnabled) return;
    await this.resumeAudio();
    const base = 210 + Math.random() * 150;
    this.playTone({ frequency: base, duration: 0.09, volume: 0.18, type: "triangle", sweep: 200, delay });
    this.playTone({ frequency: base * 1.52, duration: 0.07, volume: 0.15, type: "sine", sweep: 100, delay: delay + 0.02 });
  },

  playDiceReveal(delay = 0) {
    return this.playRollPop(delay);
  },

  playTotalCue() {
    this.playTone({ frequency: 520, duration: 0.11, volume: 0.07, type: 'sine', sweep: 70 });
  },

  playBootPanelThud(index = 0) {
    this.playTone({ frequency: index ? 86 : 108, duration: .24,
      volume: .18, type: 'triangle', sweep: -38 });
    this.playTone({ frequency: index ? 43 : 54, duration: .3,
      volume: .08, type: 'sine', sweep: -12 });
  },

  playSweet16Thud(index = 0, delay = 0) {
    if (!this.soundEnabled) return;
    // One grounded impact per ball, with a deeper final landing.
    const last = index === 7;
    this.playTone({ frequency: last ? 100 : 132 - index * 3, duration: last ? 0.27 : 0.22,
      volume: last ? 0.31 : 0.25, type: 'triangle', sweep: last ? -30 : -45, delay });

    const ctx = this.ensureAudioContext();
    if (!ctx || !this.masterGain || ctx.state !== 'running') return;
    const length = Math.ceil(ctx.sampleRate * 0.065);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const decay = 1 - i / length;
      samples[i] = (Math.random() * 2 - 1) * decay * decay;
    }
    const impact = ctx.createBufferSource();
    const lowPass = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const now = ctx.currentTime + delay;
    impact.buffer = buffer;
    lowPass.type = 'lowpass';
    lowPass.frequency.value = last ? 380 : 470;
    gain.gain.setValueAtTime(last ? 0.17 : 0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
    impact.connect(lowPass);
    lowPass.connect(gain);
    gain.connect(this.masterGain);
    impact.start(now);
    impact.stop(now + 0.07);
  },

  async playRazzleChime() {
    if (!this.soundEnabled) return;
    await this.resumeAudio();
    [523, 784, 1046].forEach((frequency, index) => {
      this.playTone({ frequency, duration: 0.24, volume: 0.17, type: "sine", sweep: -35, delay: index * 0.17 });
      this.playTone({ frequency: frequency * 2, duration: 0.16, volume: 0.045, type: "triangle", sweep: -60, delay: index * 0.17 });
    });
  },

  playTwentyNineCue() {
    if (!this.soundEnabled) return;
    // Two quick bell notes announce the earned bonus before its choice opens.
    this.playTone({ frequency: 659, duration: 0.2, volume: 0.13, type: "sine", sweep: 28 });
    this.playTone({ frequency: 988, duration: 0.24, volume: 0.12, type: "sine", sweep: -24, delay: 0.16 });
  },

  playBonusSelectionTick(step) {
    this.playTone({ frequency: 440 + Math.min(step, 23) * 17, duration: 0.075, volume: 0.065, type: 'triangle', sweep: 90 });
  },

  playBonusSelectionLand() {
    [523, 659, 784].forEach((frequency, index) => {
      this.playTone({ frequency, duration: 0.35, volume: 0.09, type: 'sine', sweep: 35, delay: index * 0.07 });
    });
  },

  playBonusSpinAward() {
    if (!this.soundEnabled) return;
    [660, 880, 1100].forEach((frequency, index) => {
      this.playTone({ frequency, duration: .14, volume: .085, type: 'sine', sweep: 50, delay: index * .19 });
    });
  },

  sayBonusSpinAward() {
    if (!this.soundEnabled || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance('plus one');
    utterance.lang = 'en-US';
    utterance.rate = .9;
    utterance.pitch = .65;
    utterance.volume = .4;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find(voice => /^en/i.test(voice.lang) && /robot|digital|synth/i.test(voice.name))
      || voices.find(voice => /^en/i.test(voice.lang)) || null;
    window.speechSynthesis.speak(utterance);
  },

  playBootFrequencies() {
    if (!this.soundEnabled) return;
    const ctx = this.ensureAudioContext();
    if (!ctx || ctx.state !== 'running') return;
    // The gaps compress as the eight ball sockets fill.
    [0.08, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78].forEach((delay, index) => {
      this.playTone({ frequency: 150 + index * 38, duration: .11,
        volume: .035, type: 'sine', sweep: 54, delay });
    });
  },

  playBootPowerOn() {
    if (!this.soundEnabled) return;
    const ctx = this.ensureAudioContext();
    if (ctx?.state === 'running') {
      [0, .19, .31, .39].forEach((delay, index) => {
        this.playTone({ frequency: 290 + index * 120, duration: .16,
          volume: .065, type: 'triangle', sweep: 180, delay });
      });
    }
  },

  sayRobotRazzleDazzle({ onWord = () => {}, onComplete = () => {}, beforeOn = () => Promise.resolve(), beforeDazzle = () => Promise.resolve(), firstWordHold = 1500 } = {}) {
    if (!this.soundEnabled || this.bootVoiceRequested || !('speechSynthesis' in window)) return false;
    this.bootVoiceRequested = true;
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const voice = voices.find(voice => /^en/i.test(voice.lang) && /robot|digital|synth/i.test(voice.name))
      || voices.find(voice => /^en/i.test(voice.lang)) || null;
    const words = ['RAZZLE', 'DAZZLE', 'ON'];
    let started = false;
    let finished = false;
    let guard;
    const finish = (played) => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      onComplete(played);
    };
    const speakWord = async (index) => {
      if (finished) return;
      if (index === words.length) return finish(true);
      if (index === 1) { await beforeDazzle(); if (finished) return; }
      if (index === 2) { await beforeOn(); if (finished) return; }
      const utterance = new SpeechSynthesisUtterance(words[index].toLowerCase());
      utterance.lang = 'en-US';
      utterance.rate = .95;
      utterance.pitch = .48;
      utterance.volume = .4;
      utterance.voice = voice;
      let wordStartedAt = 0;
      utterance.onstart = () => {
        wordStartedAt = performance.now();
        started = true;
        if (!finished) onWord(words[index]);
      };
      utterance.onend = () => {
        if (finished) return;
        if (index === words.length - 1) return finish(true);
        const remaining = Math.max(0, (index === 0 ? firstWordHold : 850) - (performance.now() - wordStartedAt));
        setTimeout(async () => {
          if (index === 0) await beforeDazzle();
          if (index === 1) await beforeOn();
          if (finished) return;
          onWord('');
          setTimeout(() => speakWord(index + 1), 140);
        }, remaining);
      };
      utterance.onerror = () => finish(started);
      synth.speak(utterance);
    };
    // Some browsers silently block speech before the first interaction.
    guard = setTimeout(() => {
      if (!started) {
        synth.cancel();
        finish(false);
      }
    }, 1600);
    speakWord(0);
    return true;
  },

  playWinSound(mult = 1) {
    const pitches = mult >= 30 ? [620, 780, 980] : mult >= 5 ? [510, 660, 760] : [440, 520];
    pitches.forEach((freq, index) => {
      setTimeout(() => this.playTone({ frequency: freq, duration: 0.09, volume: 0.07, type: "sine", sweep: 60 }), index * 45);
    });
  },

  playLoseSound() {
    this.playTone({ frequency: 220, duration: 0.12, volume: 0.06, type: "sawtooth", sweep: -110 });
    setTimeout(() => this.playTone({ frequency: 180, duration: 0.1, volume: 0.05, type: "triangle", sweep: -80 }), 60);
  },

  setEffectsVolume(value) {
    this.effectsVolume = Math.max(0, Math.min(1, value));
    if (this.masterGain) this.masterGain.gain.value = 0.22 * this.effectsVolume;
  },

  setMusicVolume(value) {
    this.musicVolume = Math.max(0, Math.min(1, value));
    if (this.audio) this.audio.volume = this.musicVolume;
  },

  setMusicMuted(muted) {
    this.musicMuted = muted;
    if (!this.isInitialized || !this.audio) return;
    this.audio.muted = muted;
  },

  isMusicMuted() {
    return this.musicMuted;
  }
};

window.SoundManager = SoundManager;

document.addEventListener("DOMContentLoaded", () => {
  SoundManager.init();
});



