window.addEventListener('click', async () => {
  try {
    if (window.Tone && Tone.context.state !== 'running') {
      await Tone.start();
      await Tone.context.resume();
      console.log('✅ Tone audio context resumed');
    }
  } catch (err) {
    console.warn('Tone resume failed:', err);
  }
}, { once: true });

/* =========================================================
   RAZZLE DAZZLE – game.js (clean v5)
   Depends on: sound.js (global SoundManager)
   HTML IDs/classes: match the markup you shared.
   ========================================================= */

(() => {
  // -----------------------------
  // 1) CONSTANTS
  // -----------------------------
  const MIN_SUM = 8;
  const MAX_SUM = 48;
  const HISTORY_LIMIT = 100;
  const VISUAL_SETTINGS_KEY = 'razzleUnifiedGridPrototypeSettings';
  const AUDIO_SETTINGS_KEY = 'razzleAudioSettings';
  const VISUAL_SETTINGS_DEFAULTS = Object.freeze({ music: true, background: true, pulse: true, batterySaver: false });
  const AUTOPLAY_STEPS = [10, 25, 50, 100, 200, 500, 1000];
  const AUTOPLAY_INFINITE_ROLLS = 999999;
  const INFINITY_SYMBOL = '\u221E';

  // Roll & autoplay pacing
  const REVEAL_DELAY = 396;
  const FAST_REVEAL_DELAY = 150;
  const SWEET16_REVEAL_DELAYS = [600, 540, 480, 430, 390, 350, 480, 900];
  const SUPER_TURBO_SETTLE_DELAY = 180;
  const SUPER_TURBO_PAYOUT_DELAY = 520;
  const SUPER_TURBO_AUTOPLAY_DELAY = 1280;
  const TURBO_AUTOPLAY_DELAY = 1600;
  const NORMAL_AUTOPLAY_DELAY = 1800;

  // Payout map (8d6)
  const PAYOUT = new Map([
    [8, 5000.0], [9, 710.0], [10, 200.0], [11, 150.0], [12, 63.0], [13, 35.0],
    [14, 20.0], [15, 10.0], [16, 7.3], [17, 5.0], [18, 3.0], [19, 2.5],
    [20, 1.5], [21, 1.2], [22, 1.0], [23, 0.5],
    [24, 0.0], [25, 0.0], [26, 0.0],
    [27, 0.5], [28, 0.5], [29, 2.0],
    [30, 0.0], [31, 0.0], [32, 0.0],
    [33, 0.5], [34, 1.0], [35, 1.2], [36, 1.5], [37, 2.5],
    [38, 3.0], [39, 5.0], [40, 7.3], [41, 10.0], [42, 20.0], [43, 35.0], [44, 63.0],
    [45, 150.0], [46, 200.0], [47, 710.0], [48, 5000.0]
  ]);

  const BETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

  // -----------------------------
  // 2) UTILS
  // -----------------------------
  const $ = (id) => document.getElementById(id);
  const bySel = (sel, root = document) => root.querySelector(sel);
  const bySelAll = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const clamp = (n, a, b) => Math.min(Math.max(n, a), b);
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const fmtMoney = (n) => `$${n.toFixed(2).replace(/\.00$/, '')}`;
  const fmtMult = (m) => `${(m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)).replace(/\.0$/, '')}x`;
  const fmtCenterPayout = (n) => `$${n.toFixed(2)}`;
  const fmtHeaderSum = (n) => String(n);
  const fmtHeaderMult = (m) => fmtMult(m);
  const payoutTone = (mult) => (mult === 1 ? 'push' : mult < 1 ? 'loss' : mult > 1 ? 'win' : 'neutral');

  function pulse(el, cls, turbo = false) {
    if (!el || !window.pulseEffectsEnabled) return;
    const add = turbo ? `${cls}-turbo` : cls;
    el.classList.remove(add);
    requestAnimationFrame(() => {
      if (!window.pulseEffectsEnabled) return;
      el.classList.add(add);
      setTimeout(() => el.classList.remove(add), 700);
    });
  }

  // Dice chip pool (to avoid churn during turbo)
  const CHIP_POOL_MAX = 64;
  const chipPool = [];
  function chipNew(val, turbo) {
    const empty = val === null || val === undefined || val === '';
    const div = document.createElement('div');
    div.className = `dice-chip shadow-md transition ${empty ? 'empty' : `num-${val}`} ${turbo ? 'glow-purple' : 'glow-white'}`;
    div.innerHTML = `<span class="socket-lunar" aria-hidden="true"><i class="socket-lunar-disc"></i></span><span class="chip-number">${empty ? '' : val}</span>`;
    div.style.opacity = '0';
    div.style.transform = 'scale(0.82)';
    return div;
  }
  function chipGet(val, turbo) {
    const empty = val === null || val === undefined || val === '';
    let c = chipPool.pop() || chipNew(val, turbo);
    c.className = `dice-chip shadow-md transition ${empty ? 'empty' : `num-${val}`} ${turbo ? 'glow-purple' : 'glow-white'}`;
    const span = c.querySelector('.chip-number');
    if (span) span.textContent = empty ? '' : String(val);
    c.style.willChange = 'transform, opacity';
    c.style.transform = 'translateZ(0) scale(0.82)';
    c.style.opacity = '0';
    return c;
  }
  function chipRetire(c) {
    if (!c) return;
    c.classList.remove('chip-reveal', 'chip-expand-raise', 'chip-explode');
    c.style.opacity = '0';
    c.style.transform = 'scale(0.82)';
    c.style.willChange = '';
    if (c.parentNode) c.parentNode.removeChild(c);
    if (chipPool.length < CHIP_POOL_MAX) chipPool.push(c);
  }

  // -----------------------------
  // 3) GAME CLASS
  // -----------------------------
  class RazzleGame {
    constructor() {
      // State
      this.budget = 1000;
      this.betIndex = 2; // $10
      this.isRolling = false;
      this.isTurbo = false;
      this.turboLevel = 0;
      this.isAutoplay = false;
      this.autoplayPaused = false;
      this.isMuted = false;

      this.autoplayRemaining = 0;
      this.autoplayInfinite = false;
      this.autoplayStartBalance = 0;
      this.stopOnBigWin = false;
      this.stopOnLoss = false;
      this.lastAutoplayCount = AUTOPLAY_STEPS[0]; // Store the last selected count

      this.history = [];
      this.sessionStats = { bestWin: 0, bestStreak: 0, bestMultiplier: 0, rolls: 0, lastSum: null, sumCounts: {}, ballCounts: {} };
      this.auxStatPage = 0;
      this.streak = 0;
      this.dazzle = null;
      this.razzleRearming = false;
      this.razzleBonusAutoplayOnly = false;
      this.dazzleResumeAutoplay = false;
      this.dazzleAutoStart = false;
      this.autoStartBonus = false;
      this.dazzleTransitioning = false;
      this.razzlePaused = false;
      this.presentationEpoch = 0;
      this.pendingDazzleOffer = null;
      this.dazzleTrigger = null;
      this.colorTiles = false;
      this.visualSettings = { ...VISUAL_SETTINGS_DEFAULTS };
      this.audioSettings = { effects: 1, music: 0.08 };
      this.lastRollValues = Array(8).fill(null);
      this.valueWaveIndex = 0;
      this.valueWaveTimer = null;
      this.idleTitleTimer = null;
      this.idleTitleReturnTimer = null;
      this.idleTitleEpoch = 0;

      // DOM cache
      this.dom = {};
    }

    // ---------- INIT ----------
    async init() {
      console.log('[Razzle] Initializing game...');
      // State
      this.isRolling = false;
      this.isAutoplay = false;

      // DOM
      this.cacheDOM();
      this.loadVisualSettings();

      // Quick DOM check
      if (!this.dom.rollBtn || !this.dom.autoplayBtn) {
        console.error('[Razzle] CRITICAL: Roll or Autoplay button not found in DOM. Aborting init.');
        return;
      }
      console.log('[Razzle] DOM cached successfully.', this.dom);

      // Sound
      console.log('[Razzle] Checking for SoundManager:', window.SoundManager);
      if (window.SoundManager && typeof SoundManager.init === 'function') {
        SoundManager.musicMuted = !this.visualSettings.music;
        SoundManager.setEffectsVolume(this.audioSettings.effects);
        SoundManager.setMusicVolume(this.audioSettings.music);
        await SoundManager.init();
      } else {
        console.error('[Razzle] SoundManager not found or init is not a function!');
      }
      // Fit the actual display font before the first visible boot frame.
      if (document.fonts?.load) {
        try { await document.fonts.load('48px AlarmClock'); } catch (_) {}
      }

      // Board & UI
      this.renderBoard();
      this.applyVisualSettings();
      this.ensureDiceSlots();
      this.updateDiceSlots(Array(8).fill(null), false);
      this.updateMoneyUI();
      this.updateControls();
      this.updateAutoplayBadge();

      // Bind
      this.bindEvents();
      this.setupControlReadoutSizing();
      this.setupSquareBoard();
      this.updateAuxScreens();
      const centerBox = this.dom.rollText?.parentElement;
      if (centerBox && window.ResizeObserver) {
        this.centerReadoutObserver = new ResizeObserver(() => this.fitCenterReadout());
        this.centerReadoutObserver.observe(centerBox);
      }
      window.addEventListener('resize', () => this.fitCenterReadout());
      document.fonts?.ready.then(() => this.fitCenterReadout());
      this.safeSetRollText('POWER ON', true);
      requestAnimationFrame(async () => {
        const bootSpeed = this.visualSettings.batterySaver ? 0.75 : 1;
        const bootWait = (ms) => this.sleep(Math.round(ms * bootSpeed));
        const introPlaying = window.RazzleIntro.play({ speed: bootSpeed, sound: !this.isMuted });
        const finalChargeAt = window.RazzleIntro.steps.find(step => step.add?.includes('boot-final-charge')).at;
        const razzleAt = 1400;
        const dazzleAt = (razzleAt + finalChargeAt) / 2;
        const dazzleCueReady = bootWait(dazzleAt);
        const dazzleVoiceReady = this.sleep(Math.max(0, Math.round(dazzleAt * bootSpeed) - 140));
        const onCueReady = bootWait(finalChargeAt);
        const onVoiceReady = this.sleep(Math.max(0, Math.round(finalChargeAt * bootSpeed) - 140));
        await bootWait(razzleAt); // Let the independent ball strip and first grid drops open before the voice.
        this.cancelIdleTitleSequence();
        const titleEpoch = this.idleTitleEpoch;
        let bootScanStarted = false;
        let bootVisualsReady = false;
        let bootVoiceReady = false;
        const startBootScan = () => {
          if (bootScanStarted || !bootVisualsReady || !bootVoiceReady || titleEpoch !== this.idleTitleEpoch || !this.idleTitleAllowed()) return;
          bootScanStarted = true;
          document.body.classList.remove('top-readouts-locked');
          if (titleEpoch === this.idleTitleEpoch && this.idleTitleAllowed()) this.showIdleTitleSequence(false);
        };
        this.safeSetRollText('RAZZLE', true);
        const voiceStarted = this.visualSettings.music && !this.isMuted &&
          window.SoundManager?.sayRobotRazzleDazzle?.({
            beforeOn: () => onVoiceReady,
            beforeDazzle: () => dazzleVoiceReady,
            firstWordHold: 1000,
            onWord: word => {
              if (titleEpoch !== this.idleTitleEpoch || !this.idleTitleAllowed()) return;
              // Keep the readout alive while the final visual cue completes.
              if (word || !bootVoiceReady) this.safeSetRollText(word === 'ON' ? 'READY' : word, true);
              if (word === 'ON') {
                bootVoiceReady = true;
                startBootScan();
              }
            },
            onComplete: played => {
              if (titleEpoch !== this.idleTitleEpoch || !this.idleTitleAllowed()) return;
              if (!played) {
                dazzleCueReady.then(() => { if (titleEpoch === this.idleTitleEpoch) this.safeSetRollText('DAZZLE', true); });
              }
              onCueReady.then(() => { if (titleEpoch === this.idleTitleEpoch) this.safeSetRollText('READY', true); });
              bootVoiceReady = true;
              startBootScan();
            }
          });
        if (!voiceStarted) {
          bootVoiceReady = true;
          this.safeSetRollText('RAZZLE', true);
          dazzleCueReady.then(() => { if (titleEpoch === this.idleTitleEpoch) this.safeSetRollText('DAZZLE', true); });
          onCueReady.then(() => { if (titleEpoch === this.idleTitleEpoch) this.safeSetRollText('READY', true); });
        }
        await introPlaying;
        // Let the existing glare decay from its current brightness after "On".
        bySelAll('.top-header .status-box').forEach(node => {
          node.style.setProperty('--glare-tail-start', getComputedStyle(node, '::before').opacity);
        });
        const ballScreen = bySel('.roll-screen');
        if (ballScreen) ballScreen.style.setProperty('--glare-tail-start', getComputedStyle(ballScreen, '::after').opacity);
        bySelAll('.tile-sum, .tile-payout, .dice-chip.empty, .boot-feature-visible').forEach(node => {
          const current = getComputedStyle(node);
          node.style.setProperty('--fade-from-filter', current.filter === 'none' ? 'brightness(1)' : current.filter);
          node.style.setProperty('--fade-from-opacity', current.opacity);
          node.style.setProperty('--fade-from-color', current.color);
          node.style.setProperty('--fade-to-color', node.classList.contains('tile-sum') ? '#d5d7de' : current.color);
        });
        bySelAll('.tile', this.dom.payoutGrid).forEach(node => {
          const light = getComputedStyle(node, '::after');
          node.style.setProperty('--edge-fade-filter', light.filter === 'none' ? 'brightness(1)' : light.filter);
        });
        document.body.classList.add('boot-lingering');
        await bootWait(650);
        document.body.classList.remove('booting', 'boot-power-text', 'boot-center-lit', 'boot-perimeter-lit', 'boot-board-trim-lit', 'boot-inner-lit', 'boot-sides-lit', 'boot-opening', 'boot-29-lit', 'boot-under-glow', 'boot-controls-lit', 'boot-labels-lit', 'boot-final-ignition', 'boot-final-charge', 'boot-fully-lit', 'boot-multis-igniting', 'boot-multis-ready', 'boot-word-releasing');
        document.body.classList.remove('boot-control-bar-lit', 'boot-footer-lit', 'boot-trigger-primed', 'boot-rims-lit', 'boot-lingering', 'boot-title-razzle', 'boot-title-dazzle', 'boot-balls-opening', 'boot-all-on', 'boot-control-open', 'boot-preflash-dim', 'boot-preflash-flicker');
        bootVisualsReady = true;
        startBootScan();
        if (this.visualSettings.pulse && !this.visualSettings.batterySaver) {
          const stragglers = [
            ...shuffle(bySelAll('.tile:not([data-sum="29"]) .tile-sum', this.dom.payoutGrid)).slice(0, 6),
            ...shuffle(bySelAll('#rollResultsDisplay .dice-chip.empty')).slice(0, 2),
            ...shuffle(bySelAll('.control-actions button, .main-footer button')).slice(0, 2)
          ];
          stragglers.forEach((node, index) => {
            const delay = index * 55;
            const duration = 650 + Math.round(Math.random() * 600);
            node.style.setProperty('--settle-delay', delay + 'ms');
            node.style.setProperty('--settle-duration', duration + 'ms');
            node.classList.add('boot-settling-pulse');
            setTimeout(() => node.classList.remove('boot-settling-pulse'), duration + delay + 50);
          });
          this.startValueWave();
        }
      });

      // The footer logo is branding, not a scroll control.
      if (this.dom.onoLogo) {
        this.dom.onoLogo.style.cursor = 'default';
        this.dom.onoLogo.draggable = false;
        this.dom.onoLogo.removeAttribute('title');
      }

      // Roll screen glow
      const rollContainer = bySel('.roll-screen') || this.dom.rollResults;
      if (rollContainer) rollContainer.classList.add('lime-trim-glow');
    }

    cacheDOM() {
      this.dom = {
        // Board
        payoutGrid: $('payoutBoardGrid'),

        // Displays
        totalScore: $('totalScore'),
        scoreLabel: $('scoreLabel'),
        autoGauge: $('autoGauge'),
        autoGaugeLabel: $('autoGaugeLabel'),
        budget: $('budgetDisplay'),
        winAmount: $('winAmountDisplay'),
        payoutLabel: $('payoutLabel'),
        payoutMult: $('payoutMultiplierDisplay'),
        betAmount: $('betAmountDisplay'),
        rollText: $('rollTextDisplay'),
        headerSum: $('headerSum'),
        headerMult: $('headerMultiplier'),
        rollResults: $('rollResultsDisplay'),

        // Buttons
        rollBtn: $('rollButton'),
        rollIcon: $('rollButtonIcon'),
        turboBtn: $('turboButton'),
        autoplayBtn: $('autoplayButton'),
        autoplayIcon: $('autoplayIcon'),
        stopIcon: $('stopIcon'),
        incBet: $('increaseBetBtn'),
        decBet: $('decreaseBetBtn'),
        muteBtn: $('muteButton'),
        settingsBtn: $('settingsButton'),
        reloadBtn: $('reloadButtonFooter'),
        autoplayBadge: $('autoplayBadge'),
        autoplayCountdown: $('autoplayCountdown'),
        mainAutoplayPauseIcon: $('mainAutoplayPauseIcon'),

        // Modals & controls
        settingsModal: $('settingsModal'),
        closeSettings: $('closeSettingsButton'),
        autoplayModal: $('autoplayConfirmModal'),
        autoplayYes: $('autoplayConfirmYes'),
        autoplayClose: $('autoplayConfirmClose'),
        autoplaySlider: $('autoplayCount'),
        autoplayCountValue: $('autoplayCountValue'),
        autoStartBonus: $('autoStartBonus'),

        stopLossModal: $('stopLossModal'),
        stopLossOk: $('stopLossOk'),
        bigWinModal: $('bigWinModal'),
        bigWinOk: $('bigWinOk'),
        insufficientModal: $('insufficientModal'),
        insufficientClose: $('insufficientClose'),
        finishedModal: $('autoplayFinishedModal'),
        finishedClose: $('autoplayFinishedClose'),
        autoplayRepeat: $('autoplayRepeat'),

        // Settings toggles
        soundToggle: $('soundToggle'),
        musicToggle: $('musicToggle'),
        effectsVolume: $('effectsVolume'),
        effectsVolumeValue: $('effectsVolumeValue'),
        musicVolume: $('musicVolume'),
        musicVolumeValue: $('musicVolumeValue'),
        animationsToggle: $('animationsToggle'),
        pulseToggle: $('pulseToggle'),
        tileColorsToggle: $('tileColorsToggle'),
        batterySaverToggle: $('batterySaverToggle'),

        // Autoplay stop condition toggles
        stopOnBigWinToggle: $('stopOnBigWinToggle'),
        stopOnLossToggle: $('stopOnLossToggle'),

        // Misc
        historyList: $('historyList'),
        payoutTableContent: $('payoutTableContent'),
        dazzleModal: $('dazzleModal'),
        dazzleOptions: $('dazzleOptions'),
        dazzleContinuePanel: $('dazzleContinuePanel'),
        dazzleContinueAuto: $('dazzleContinueAuto'),
        dazzleTen: $('dazzleTen'),
        dazzleSweet: $('dazzleSweet'),
        dazzleCrazy: $('dazzleCrazy'),
        dazzleSummaryModal: $('dazzleSummaryModal'),
        dazzleSummaryTitle: $('dazzleSummaryTitle'),
        dazzleSummaryText: $('dazzleSummaryText'),
        dazzleSummaryGo: $('dazzleSummaryGo'),
        dazzleSummaryAuto: $('dazzleSummaryAuto'),
        dazzleSummaryStop: $('dazzleSummaryStop'),
        onoLogo: $('onoLogo'),
        backgroundMusic: $('spaceyMusic'),
      };

      // initial labels
      this.dom.betAmount.textContent = fmtMoney(BETS[this.betIndex]);
      this.dom.totalScore.textContent = '0';
      if (this.dom.headerSum) this.dom.headerSum.textContent = '0';
      if (this.dom.headerMult) this.dom.headerMult.textContent = '0x';
      this.setHeaderReadoutState('idle');
    }

    // ---------- BOARD ----------
    ensureDiceSlots() {
      const container = this.dom.rollResults || bySel('#rollResultsDisplay');
      if (!container) return [];

      let slots = Array.from(container.querySelectorAll('.dice-slot'));
      if (slots.length !== 8) {
        container.innerHTML = '';
        slots = [];
        for (let i = 0; i < 8; i++) {
          const slot = document.createElement('div');
          slot.className = 'dice-slot';
          slot.dataset.index = String(i);
          slot.style.setProperty('--lunar-delay', (-i) + 's');
          slot.dataset.initialPhase = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'][i];
          const chip = chipGet(this.lastRollValues[i], false);
          chip.classList.add('stale');
          chip.style.opacity = this.lastRollValues[i] == null ? '0.72' : '0.9';
          slot.appendChild(chip);
          container.appendChild(slot);
          slots.push(slot);
        }
      }

      return slots;
    }

    updateDiceSlots(values, stale = false, bonusLook = false) {
      const slots = this.ensureDiceSlots();
      const hasExplicitAnyValue = Array.isArray(values) && values.some(v => v != null && v !== '');
      const nextValues = Array.from({ length: 8 }, (_, i) => {
        if (Array.isArray(values) && values[i] != null && values[i] !== '') return values[i];
        if (Array.isArray(values) && !hasExplicitAnyValue) return null;
        return this.lastRollValues[i] ?? null;
      });

      slots.forEach((slot, index) => {
        const value = nextValues[index];
        const empty = value === null || value === undefined || value === '';
        let chip = slot.querySelector('.dice-chip');
        if (!chip) {
          chip = chipGet(value, false);
          slot.appendChild(chip);
        }

        chip.className = `dice-chip shadow-md transition ${empty ? 'empty' : `num-${value}`} ${this.isTurbo ? 'glow-purple' : 'glow-white'}`;
        const bonusChip = !empty && (bonusLook || Boolean(this.dazzle));
        chip.classList.toggle('bonus-metal', bonusChip);
        chip.classList.toggle('crazy-lock', slot.classList.contains('crazy-lock'));
        const span = chip.querySelector('.chip-number');
        if (span) span.textContent = empty ? '' : String(value);

        chip.classList.toggle('stale', stale || empty);
        chip.style.opacity = empty ? '0.72' : stale ? '0.92' : '1';
        chip.style.transform = 'scale(1)';
        chip.style.filter = empty ? 'none' : stale
          ? bonusChip ? 'saturate(1.08) brightness(0.96)' : 'saturate(0.72) brightness(0.72)'
          : 'none';
        slot.style.visibility = 'visible';
      });

      this.lastRollValues = nextValues.slice();
      return slots;
    }

    setCrazyLock(index = -1) {
      this.ensureDiceSlots().forEach((slot, slotIndex) => {
        const locked = slotIndex === index;
        slot.classList.toggle('crazy-lock', locked);
        slot.querySelector('.dice-chip')?.classList.toggle('crazy-lock', locked);
      });
    }

    renderBoard() {
      const { payoutGrid } = this.dom;
      if (!payoutGrid) return;

      // Keep the six-column screen and its live dice slots when rebuilding tiles.
      bySelAll(':scope > .tile', payoutGrid).forEach(tile => tile.remove());
      const sums = [];
      for (let s = MIN_SUM; s <= MAX_SUM; s++) if (s !== 29) sums.push(s);

      // Shuffle the board itself. Re-roll the shuffle if matching payouts end
      // up side by side, so high values are not paired or stacked at the top.
      const columns = 7;
      let randomizedBoardSums = [...sums];
      for (let attempt = 0; attempt < 120; attempt++) {
        randomizedBoardSums = shuffle([...sums]);
        const hasAdjacentMatch = randomizedBoardSums.some((sum, index) => {
          const payout = PAYOUT.get(sum) || 0;
          const left = index % columns ? randomizedBoardSums[index - 1] : null;
          const above = index >= columns ? randomizedBoardSums[index - columns] : null;
          return (left !== null && (PAYOUT.get(left) || 0) === payout)
            || (above !== null && (PAYOUT.get(above) || 0) === payout);
        });
        if (!hasAdjacentMatch) break;
      }

      const payoutWaveOrder = [0, 1.5, 0.5, 1, 1.2, 2, 2.5, 3, 5, 7.3, 10, 20, 35, 63, 150, 200, 710, 5000];
      const payoutWaveMap = new Map(
        payoutWaveOrder.map((mult, index) => [Number(mult.toFixed(10)), index])
      );
      const bootActivationOrder = shuffle(Array.from({ length: sums.length + 2 }, (_, index) => index));
      const bootDelayScale = this.visualSettings.batterySaver ? 0.75 : 1;
      [this.dom.headerMult, this.dom.headerSum, this.dom.budget,
        this.dom.winAmount, this.dom.payoutMult]
        .filter(Boolean).forEach((node) => {
          node.style.setProperty('--boot-delay', `${Math.floor(Math.random() * 780 * bootDelayScale)}ms`);
        });

      [29, 29, ...randomizedBoardSums].forEach((sum, index) => {
        const mult = PAYOUT.get(sum) || 0;
        const visual = this.getValueVisual(mult);
        const multText = fmtMult(mult);
        const tile = document.createElement('div');
        tile.classList.add('tile', 'transition');
        const cell = index === 0 ? 0 : index === 1 ? 6 : index <= 6 ? index - 1 : index;
        const row = Math.floor(cell / columns) + 1;
        const column = cell % columns + 1;
        tile.style.setProperty('--board-row', row);
        tile.style.setProperty('--board-column', column);
        tile.dataset.boardRow = String(row);
        if (index < 2) tile.id = index === 0 ? 'tile-29-left' : 'tile-29-right';

        const rawStrength = mult <= 1
          ? Math.max(0.14, 0.18 + (1 - mult) * 0.18)
          : Math.min(1, 0.28 + Math.min(0.72, Math.log2(mult) * 0.18));
        const payoutTierClass = mult > 1 ? 'payout-win' : mult === 1 ? 'payout-push' : mult < 1 ? 'payout-loss' : 'payout-neutral';
        const independentIdleDelay = ((sum * 137) % 4800) / 1000 + (mult > 1 ? Math.min(0.9, Math.log10(mult + 1) * 0.35) : 0);
        const valueBoost = Math.min(1.35, mult > 1 ? Math.log10(mult + 1) / 1.7 : 0.2 + (1 - mult) * 0.2);
        const pressDepth = Math.min(1.3, 0.12 + valueBoost * 0.9);
        const exactWaveGroup = payoutWaveMap.get(Number(mult.toFixed(10))) ?? payoutWaveOrder.length;
        const groupIndex = exactWaveGroup;

        tile.style.setProperty('--idle-strength', rawStrength.toFixed(3));
        tile.style.setProperty('--idle-delay', `${independentIdleDelay.toFixed(2)}s`);
        tile.style.setProperty('--wave-offset', `${(index * 0.18 + groupIndex * 0.28).toFixed(2)}s`);
        tile.style.setProperty('--wave-advance', `${(index % 5 * 0.16 + groupIndex * 0.12).toFixed(2)}s`);
        tile.style.setProperty('--press-depth', pressDepth.toFixed(3));
        tile.style.setProperty('--flash-scale', Math.min(1.6, 1.04 + valueBoost * 0.45).toFixed(3));
        tile.style.setProperty('--flash-intensity', Math.min(1.9, 0.9 + valueBoost).toFixed(3));
        // Randomize only the final lamp test; the physical key never flashes.
        tile.style.setProperty('--boot-delay', `${Math.round(bootActivationOrder[index] * 19 * bootDelayScale)}ms`);

        if (this.colorTiles) {
          tile.classList.add(`payout-${String(mult).replace(/\./g, '_')}`);
        }
        tile.classList.add(payoutTierClass);
        tile.classList.add(mult > 1 ? 'winning-tile' : mult === 1 ? 'push-tile' : 'losing-tile');
        tile.dataset.sum = sum;
        tile.dataset.payout = String(mult);
        if ([10, 11, 45, 46].includes(sum)) tile.classList.add('special-pair-glow');
        tile.style.setProperty('--value-hue', visual.hue);
        tile.style.setProperty('--value-glow', visual.glow);
        tile.classList.add(`value-${visual.tier}`);
        tile.style.animationDelay = `${(index % 5) * 180}ms`;
        const triggerHalo = sum === 29 ? '<span class="trigger-halo" aria-hidden="true"></span>' : '';
        const edgeWord = index === 0 ? 'RAZZLE' : 'DAZZLE';
        const edgePath = `trigger-edge-${index}`;
        const triggerTitle = sum === 29 ? `<svg class="trigger-title" viewBox="0 0 104 100" preserveAspectRatio="none" aria-hidden="true">
          <defs><path id="${edgePath}" d="M 11 6.5 H 93 Q 97.5 6.5 97.5 11 V 89 Q 97.5 93.5 93 93.5 H 11 Q 6.5 93.5 6.5 89 V 11 Q 6.5 6.5 11 6.5 Z M 11 6.5 H 93 Q 97.5 6.5 97.5 11 V 89 Q 97.5 93.5 93 93.5 H 11 Q 6.5 93.5 6.5 89 V 11 Q 6.5 6.5 11 6.5 Z" /></defs>
          <path class="trigger-track" d="M 16 12 H 88 Q 92 12 92 16 V 84 Q 92 88 88 88 H 16 Q 12 88 12 84 V 16 Q 12 12 16 12 Z"/>
          <g class="trigger-title-moving">${[11.5, 36.5, 61.5, 86.5].map(offset => `<text text-anchor="middle"><textPath href="#${edgePath}" startOffset="${offset / 2}%">${edgeWord}<animate attributeName="startOffset" from="${offset / 2}%" to="${(offset + 100) / 2}%" dur="16s" repeatCount="indefinite" /></textPath></text>`).join('')}</g>
          <g class="trigger-title-still">${[11.5, 36.5, 61.5, 86.5].map(offset => `<text text-anchor="middle"><textPath href="#${edgePath}" startOffset="${offset / 2}%">${edgeWord}</textPath></text>`).join('')}</g>
        </svg>` : '';
        tile.innerHTML = `${triggerHalo}${triggerTitle}<span class="tile-sum">${sum}</span><span class="tile-payout">${multText}</span>`;
        payoutGrid.appendChild(tile);
      });
    }

    loadVisualSettings() {
      try {
        const saved = JSON.parse(localStorage.getItem(VISUAL_SETTINGS_KEY) || '{}');
        for (const key of Object.keys(VISUAL_SETTINGS_DEFAULTS)) {
          if (typeof saved[key] === 'boolean') this.visualSettings[key] = saved[key];
        }
        if (typeof saved.tileColors === 'boolean') this.colorTiles = saved.tileColors;
      } catch { /* Keep the defaults if storage is unavailable or invalid. */ }

      try {
        const saved = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY) || '{}');
        for (const key of Object.keys(this.audioSettings)) {
          if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) this.audioSettings[key] = clamp(saved[key], 0, 1);
        }
      } catch { /* Keep the default audio levels. */ }

      const D = this.dom;
      for (const key of ['effects', 'music']) {
        const percent = Math.round(this.audioSettings[key] * 100);
        if (D[`${key}Volume`]) D[`${key}Volume`].value = String(percent);
        if (D[`${key}VolumeValue`]) D[`${key}VolumeValue`].textContent = `${percent}%`;
      }
      if (D.musicToggle) D.musicToggle.checked = this.visualSettings.music;
      if (D.animationsToggle) D.animationsToggle.checked = this.visualSettings.background;
      if (D.pulseToggle) D.pulseToggle.checked = this.visualSettings.pulse;
      if (D.batterySaverToggle) D.batterySaverToggle.checked = this.visualSettings.batterySaver;
      if (D.tileColorsToggle) D.tileColorsToggle.checked = this.colorTiles;
    }

    saveVisualSettings() {
      try {
        // Only user preferences are saved. Bonus, Auto, and Turbo are live modes.
        const settings = Object.fromEntries(
          Object.keys(VISUAL_SETTINGS_DEFAULTS).map(key => [key, Boolean(this.visualSettings[key])])
        );
        settings.tileColors = Boolean(this.colorTiles);
        localStorage.setItem(VISUAL_SETTINGS_KEY, JSON.stringify(settings));
      } catch { /* Settings still work for this session. */ }
    }

    applyVisualSettings() {
      const { background, pulse: pulses, batterySaver } = this.visualSettings;
      document.body.classList.toggle('compact-bg', !background);
      document.body.classList.toggle('battery-saver', batterySaver);
      document.body.classList.toggle('no-pulse-effects', !pulses || batterySaver);
      window.pulseEffectsEnabled = pulses && !batterySaver;
      window.setStarfieldEnabled?.(background && !batterySaver);

      if (!window.pulseEffectsEnabled) {
        this.stopValueWave();
        this.cancelIdleTitleSequence();
        if (!document.body.classList.contains('booting') && !this.isRolling && !this.isAutoplay && !this.dazzle) {
          this.safeSetRollText('READY', true);
        }
        bySelAll('.bass-pulse, .tick-pulse, .center-pop, .bass-pulse-turbo, .tick-pulse-turbo').forEach(el => {
          el.classList.remove('bass-pulse', 'tick-pulse', 'center-pop', 'bass-pulse-turbo', 'tick-pulse-turbo');
        });
      } else if (!document.body.classList.contains('booting') && !this.isRolling && !this.isAutoplay && !this.valueWaveTimer) {
        this.startValueWave();
      }
    }

    getValueVisual(mult) {
      if (mult >= 5000) return { hue: '#e6a0ff', glow: 'rgba(230,160,255,0.70)', tier: 'elite' };
      if (mult >= 150)  return { hue: '#b891e8', glow: 'rgba(184,145,232,0.30)', tier: 'hot' };
      if (mult >= 20)   return { hue: '#a8ff7f', glow: 'rgba(168,255,127,0.38)', tier: 'win' };
      if (mult >= 1)    return { hue: '#d7b6ff', glow: 'rgba(215,182,255,0.28)', tier: 'push' };
      return { hue: '#ff9aa8', glow: 'rgba(255,154,168,0.20)', tier: 'loss' };
    }

    startValueWave() {
      clearTimeout(this.valueWaveTimer);
      this.valueWaveTimer = null;
      this.valueWavePingTimers?.forEach(clearTimeout);
      this.valueWavePingTimers = [];

      if (document.body.classList.contains('booting') || !this.visualSettings.pulse || this.visualSettings.batterySaver || this.razzlePaused) return;

      const run = () => {
        if (this.isRolling || this.isAutoplay || this.razzlePaused || !this.visualSettings.pulse || this.visualSettings.batterySaver) {
          return;
        }

        const tiles = bySelAll('.tile', this.dom.payoutGrid);
        if (!tiles.length) return;

        // No tiles stay raised. A small, scattered cluster simply breathes
        // in its own payout color, then returns before the next slow beat.
        shuffle([...tiles]).slice(0, 3).forEach((tile) => {
          tile.classList.remove('idle-ping');
          void tile.offsetWidth;
          tile.classList.add('idle-ping');
          const clearTimer = setTimeout(() => tile.classList.remove('idle-ping'), 1820);
          this.valueWavePingTimers.push(clearTimer);
        });

        this.valueWaveTimer = setTimeout(run, 3300 + Math.random() * 700);
      };

      // Begin only after ten seconds of uninterrupted idle time.
      this.valueWaveTimer = setTimeout(run, 30000);
    }

    stopValueWave() {
      clearTimeout(this.valueWaveTimer);
      this.valueWaveTimer = null;
      this.valueWavePingTimers?.forEach(clearTimeout);
      this.valueWavePingTimers = [];
      bySelAll('.tile', this.dom.payoutGrid).forEach((tile) => {
        tile.classList.remove(
          'value-release',
          'value-pass',
          'value-pop',
          'value-lock',
          'value-rest-pulse',
          'idle-showcase',
          'idle-feature',
          'idle-feature-settled',
          'idle-ping'
        );
      });
    }

    triggerTurboSpinShine() {
      clearTimeout(this.turboShineTimer);
      const tiles = bySelAll('.tile', this.dom.payoutGrid);
      tiles.forEach((tile) => tile.classList.remove('turbo-spin-shine'));
      // Restart the short under-glow every fast-Turbo spin.
      void this.dom.payoutGrid?.offsetWidth;
      tiles.forEach((tile) => tile.classList.add('turbo-spin-shine'));
      this.turboShineTimer = setTimeout(() => {
        tiles.forEach((tile) => tile.classList.remove('turbo-spin-shine'));
      }, 360);
    }

    // ---------- EVENTS ----------
    bindEvents() {
      const D = this.dom;

      // Bets
      D.incBet?.addEventListener('click', () => {
        if (this.isRolling || this.isAutoplay) return;
        if (this.betIndex < BETS.length - 1) this.betIndex++;
        this.dom.betAmount.textContent = fmtMoney(BETS[this.betIndex]);
        this.updateControls();
      });
      D.decBet?.addEventListener('click', () => {
        if (this.isRolling || this.isAutoplay) return;
        if (this.betIndex > 0) this.betIndex--;
        this.dom.betAmount.textContent = fmtMoney(BETS[this.betIndex]);
        this.updateControls();
      });

      // Roll
      D.rollBtn?.addEventListener('click', async () => {
        if (this.dazzle && this.isAutoplay) {
          this.pauseRazzleAutoplay();
          return;
        }
        if (this.isAutoplay) {
          this.pauseAutoplay();
          return;
        }
        if (this.autoplayPaused) {
          this.resumeAutoplay();
          return;
        }
        if (this.isRolling) return;
        if (typeof SoundManager?.resumeAudio === 'function') {
          await SoundManager.resumeAudio();
        }
        if (this.isAutoplay || this.isRolling) return;
        this.abortRollText();
        this.roll();
      });

      // Turbo
      D.turboBtn?.addEventListener('click', () => {
        if (this.dazzle?.kind === 'sweet-16') return;
        // Bonus rounds must keep the one-by-one reveal, including the pre-locked ball.
        this.turboLevel = this.dazzle ? (this.turboLevel === 0 ? 1 : 0) : (this.turboLevel + 1) % 3;
        // Existing autoplay paths use isTurbo for the all-at-once mode only.
        this.isTurbo = this.turboLevel === 2;
        pulse(D.turboBtn, 'bass-pulse');
        this.updateControls();
        this.updateRollTextVisibility();
      });

      // Autoplay (open modal)
      D.autoplayBtn?.addEventListener('click', () => {
        if (this.dazzle) {
          if (this.isAutoplay) {
            this.pauseRazzleAutoplay();
            return;
          }
          if (this.isRolling || this.dazzleTargetReveal || this.dazzleTransitioning) return;
          this.razzleBonusAutoplayOnly = !this.dazzleResumeAutoplay;
          this.razzleRearming = false;
          this.dom.rollBtn.classList.remove('razzle-reengage');
          this.isAutoplay = true;
          this.updateControls();
          this.updateAutoplayBadge();
          this.roll();
          return;
        }
        if (this.isAutoplay) { this.stopAutoplay(); return; }
        this.openAutoplayModal();
      });

      // Autoplay modal interactions
      D.autoplayYes?.addEventListener('click', () => this.confirmAutoplayStart());
      D.autoplayClose?.addEventListener('click', () => this.closeAutoplayModal());
      D.autoplayModal?.addEventListener('click', (e) => { if (e.target === D.autoplayModal) this.closeAutoplayModal(); });

      D.dazzleContinueAuto?.addEventListener('click', () => this.startSelectedDazzle());
      document.getElementById('sweet16AwardGo')?.addEventListener('click', () => {
        document.getElementById('sweet16AwardModal')?.classList.add('hidden');
        document.body.classList.remove('modal-open');
        this.dazzleTransitioning = false;
        this.updateControls();
        if (this.dazzle && !this.isRolling) this.roll();
      });
      D.dazzleSummaryGo?.addEventListener('click', () => this.startDazzleManual());
      D.dazzleSummaryAuto?.addEventListener('click', () => this.continueDazzleAuto());
      D.dazzleSummaryStop?.addEventListener('click', () => this.stopDazzleAuto());

      // Slider (0..6 indices)
      if (D.autoplaySlider) {
        D.autoplaySlider.min = 0; D.autoplaySlider.max = AUTOPLAY_STEPS.length - 1;
        D.autoplaySlider.step = 1; D.autoplaySlider.value = 0;
        D.autoplaySlider.addEventListener('input', (e) => this.updateAutoplaySlider(parseInt(e.target.value, 10)));
      }
      bySelAll('.autoplay-slider-dots span').forEach(dot => {
        dot.addEventListener('click', (e) => {
          const idx = parseInt(e.target.dataset.index, 10);
          if (!Number.isNaN(idx)) this.updateAutoplaySlider(idx);
        });
      });

      // Stop conditions
      this.dom.stopOnBigWinToggle?.addEventListener('change', (e) => {
        this.stopOnBigWin = e.target.checked;
      });
      this.dom.stopOnLossToggle?.addEventListener('change', (e) => {
        this.stopOnLoss = e.target.checked;
      });

      // Settings modal
      D.settingsBtn?.addEventListener('click', () => this.openSettings());
      D.closeSettings?.addEventListener('click', () => this.closeSettings());
      D.settingsModal?.addEventListener('click', (e) => {
        if (e.target === D.settingsModal) this.closeSettings();
      });

      // Finished / stop-loss / big-win modals
      D.finishedClose?.addEventListener('click', () => this.closeFinished());
      D.autoplayRepeat?.addEventListener('click', () => {
        this.closeFinished();
        this.autoplayRemaining = this.lastAutoplayCount; // Use the stored count
        this.autoplayInfinite = false;
        this.startAutoplay();
      });
      D.stopLossOk?.addEventListener('click', () => this.closeStopLoss());
      D.bigWinOk?.addEventListener('click', () => this.closeBigWin());

      // Insufficient
      D.insufficientClose?.addEventListener('click', () => this.closeInsufficient());

      // Reload
      D.reloadBtn?.addEventListener('click', () => location.reload());

      // Settings toggles
      for (const key of ['effects', 'music']) {
        D[`${key}Volume`]?.addEventListener('input', event => {
          const value = clamp(Number(event.target.value) / 100, 0, 1);
          this.audioSettings[key] = value;
          if (D[`${key}VolumeValue`]) D[`${key}VolumeValue`].textContent = `${Math.round(value * 100)}%`;
          if (key === 'effects') SoundManager?.setEffectsVolume?.(value);
          else SoundManager?.setMusicVolume?.(value);
          try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(this.audioSettings)); } catch { /* Keep the levels for this session. */ }
        });
      }
      if (D.soundToggle) {
        // Sound effects are disabled for now, so hide the toggle.
        D.soundToggle.parentElement.style.display = 'none';
      }
      if (D.musicToggle && D.backgroundMusic) {
        D.musicToggle.addEventListener('change', (e) => {
          this.visualSettings.music = e.target.checked;
          SoundManager?.setMusicMuted?.(!this.visualSettings.music);
          if (e.target.checked) {
            D.backgroundMusic.muted = this.isMuted;
            D.backgroundMusic.play().catch(() => {});
          } else {
            D.backgroundMusic.pause();
          }
          this.saveVisualSettings();
        });
      }
      D.animationsToggle?.addEventListener('change', (e) => {
        this.visualSettings.background = e.target.checked;
        this.applyVisualSettings();
        this.saveVisualSettings();
      });
      D.pulseToggle?.addEventListener('change', (e) => {
        this.visualSettings.pulse = e.target.checked;
        this.applyVisualSettings();
        this.saveVisualSettings();
      });
      D.tileColorsToggle?.addEventListener('change', (e) => {
        this.colorTiles = e.target.checked;
        bySelAll('.tile[data-payout]', this.dom.payoutGrid).forEach(tile => {
          tile.classList.toggle(`payout-${String(tile.dataset.payout).replace(/\./g, '_')}`, this.colorTiles);
        });
        this.saveVisualSettings();
      });
      D.batterySaverToggle?.addEventListener('change', (e) => {
        this.visualSettings.batterySaver = e.target.checked;
        this.applyVisualSettings();
        this.saveVisualSettings();
      });

      // Tabs in settings
      bySelAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
          bySelAll('.tab-button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const target = btn.dataset.tab;
          bySelAll('.tab-content').forEach(c => c.classList.add('hidden'));
          const panel = $(target);
          if (panel) panel.classList.remove('hidden');
          if (target === 'history') this.updateHistoryUI();
          if (target === 'pay-table') this.populatePayTable();
        });
      });

      // Mute (footer)
      D.muteBtn?.addEventListener('click', () => {
        this.isMuted = !this.isMuted;
        if (D.backgroundMusic) {
          D.backgroundMusic.muted = this.isMuted;
        }
        D.muteBtn.textContent = this.isMuted ? '🔇' : '🔊';
      });
    }

    // ---------- UI / TEXT ----------
    idleTitleAllowed() {
      return !this.isRolling && !this.isAutoplay && !this.dazzle && !this.dazzleTransitioning &&
        !this.razzlePaused && !document.body.classList.contains('modal-open');
    }

    cancelIdleTitleSequence() {
      this.idleTitleEpoch++;
      clearTimeout(this.idleTitleTimer);
      clearTimeout(this.idleTitleReturnTimer);
      clearTimeout(this.postBootZipTimer);
      this.dom.rollText?.parentElement?.classList.remove('post-boot-zip');
      document.body.classList.remove('boot-final-scan');
    }

    playPostBootReadoutZip(onFinish, allScreens = false) {
      const screen = this.dom.rollText?.parentElement;
      if (!screen) return onFinish();
      if (this.visualSettings.batterySaver || !this.visualSettings.pulse) return onFinish();
      this.safeSetRollText('', true);
      screen.classList.remove('post-boot-zip');
      void screen.offsetWidth;
      screen.classList.add('post-boot-zip');
      if (allScreens) document.body.classList.add('boot-final-scan');
      this.postBootZipTimer = setTimeout(() => {
        screen.classList.remove('post-boot-zip');
        document.body.classList.remove('boot-final-scan');
        onFinish();
      }, allScreens ? 1170 : 1050); // Let the last surface finish its reflection.
    }

    showIdleTitleSequence(initial = false) {
      this.cancelIdleTitleSequence();
      const titleEpoch = this.idleTitleEpoch;
      const stillIdle = () => titleEpoch === this.idleTitleEpoch && this.idleTitleAllowed() &&
        this.visualSettings.pulse && !this.visualSettings.batterySaver;
      if (!this.idleTitleAllowed()) return;
      if (!this.visualSettings.pulse || this.visualSettings.batterySaver) {
        this.safeSetRollText('READY', true);
        return;
      }
      const titleGap = 650;
      const showWord = (word, delay, next) => {
        if (!stillIdle()) return;
        this.safeSetRollText(word, true);
        this.idleTitleReturnTimer = setTimeout(() => {
          if (!stillIdle()) return;
          this.safeSetRollText('', true);
          this.idleTitleReturnTimer = setTimeout(next, titleGap);
        }, delay);
      };
      const queueInterjection = () => {
        if (!stillIdle()) return;
        this.idleTitleTimer = setTimeout(showPair, 9000 + Math.random() * 3500);
      };
      let needsIntroZip = initial;
      const showPair = () => showWord('RAZZLE', 1600, () =>
        showWord('DAZZLE', 1600, () => {
          if (!stillIdle()) return;
          const showReady = () => {
            if (!stillIdle()) return;
            this.safeSetRollText('READY', true);
            queueInterjection();
          };
          if (needsIntroZip) {
            needsIntroZip = false;
            this.playPostBootReadoutZip(showReady);
          } else showReady();
        }));
      if (initial) showPair();
      else {
        this.safeSetRollText('READY', true);
        queueInterjection();
      }
    }

    setupSquareBoard() {
      const board = this.dom.payoutGrid;
      if (!board) return;
      board.style.setProperty('--board-row-height', '100px');
      this.fitCabinetToViewport = () => {
        const dimensions = selector => getComputedStyle(document.querySelector(selector));
        const px = value => parseFloat(value) || 0;
        const boardStyle = dimensions('.unified-board');
        const main = dimensions('.main-container');
        const game = dimensions('#game-container');
        const normalBoardPadding = parseFloat(getComputedStyle(document.documentElement).fontSize) * .9;
        const fullBoard = 600 + px(boardStyle.rowGap) * 5 + normalBoardPadding * 2 + 6;
        const strip = selector => { const st = dimensions(selector); return px(st.height) + px(st.marginTop) + px(st.marginBottom); };
        const clearance = px(getComputedStyle(document.documentElement).getPropertyValue('--section-clearance')) || 12;
        const panelStyle = dimensions('.control-bar');
        const panelHeight = Math.max(strip('.control-bar'), 190.8 + px(panelStyle.marginTop) + px(panelStyle.marginBottom));
        const height = fullBoard + clearance + 114 + clearance + strip('.top-header') + panelHeight + px(main.paddingTop) + px(main.paddingBottom) + px(main.borderTopWidth) + px(main.borderBottomWidth) + px(game.paddingTop) + px(game.paddingBottom);
        const scale = Math.min(.9, (window.innerWidth - 72) / px(game.width), (window.innerHeight - 72) / height);
        const fittedScale = Math.floor(scale * 1000) / 1000;
        document.body.style.zoom = fittedScale;
        const reset = document.getElementById('reloadButtonFooter');
        if (reset) {
          const desiredX = window.innerWidth / 2 + px(game.width) * fittedScale / 2 + 104 * fittedScale * 1.5;
          reset.style.left = Math.min(window.innerWidth - 52, desiredX) / fittedScale + 'px';
        }
        document.body.style.paddingTop = Math.max(24, (window.innerHeight - height * fittedScale) / 2) / fittedScale + 'px';
      };
      requestAnimationFrame(this.fitCabinetToViewport);
      window.addEventListener('resize', this.fitCabinetToViewport);
    }

    setupControlReadoutSizing() {
      this.controlReadoutNodes = bySelAll('.control-bar .stat-value');
      let queued = false;
      const scheduleFit = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          this.fitControlReadouts();
        });
      };
      if (window.ResizeObserver) {
        this.controlFitObserver = new ResizeObserver(scheduleFit);
        this.controlReadoutNodes.forEach(node => this.controlFitObserver.observe(node.parentElement));
      }
      if (window.MutationObserver) {
        this.controlTextObserver = new MutationObserver(scheduleFit);
        this.controlReadoutNodes.forEach(node => this.controlTextObserver.observe(node, { childList: true, characterData: true, subtree: true }));
      }
      window.addEventListener('resize', scheduleFit);
      document.fonts?.ready.then(scheduleFit);
      scheduleFit();
    }

    fitControlReadouts() {
      const ctx = (this.controlFitCanvas ||= document.createElement('canvas')).getContext('2d');
      if (!ctx) return;
      this.controlReadoutNodes.forEach(node => {
        const box = node.parentElement;
        const boxStyle = getComputedStyle(box);
        const available = box.clientWidth - parseFloat(boxStyle.paddingLeft) - parseFloat(boxStyle.paddingRight) - 3;
        if (available <= 0) return;
        node.style.fontSize = '';
        const style = getComputedStyle(node);
        const maxSize = parseFloat(style.fontSize);
        const text = node.textContent || '';
        let low = 1;
        let high = maxSize;
        for (let i = 0; i < 14; i++) {
          const size = (low + high) / 2;
          ctx.font = style.fontWeight + ' ' + size + 'px ' + style.fontFamily;
          const width = ctx.measureText(text).width + Math.max(0, text.length - 1) * (parseFloat(style.letterSpacing) || 0);
          if (width <= available) low = size;
          else high = size;
        }
        node.style.fontSize = (Math.floor(low * 10) / 10) + 'px';
        node.title = text;
      });
    }

    fitCenterReadout() {
      const el = this.dom.rollText;
      const box = el?.parentElement;
      if (!el || !box) return;
      const text = el.textContent || '';
      if (!text) {
        el.style.fontSize = '';
        el.style.removeProperty('letter-spacing');
        return;
      }

      const style = getComputedStyle(box);
      const width = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 10;
      const height = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 4;
      if (width <= 0 || height <= 0) return;

      const ctx = (this.centerFitCanvas ||= document.createElement('canvas')).getContext('2d');
      const fontFamily = getComputedStyle(el).fontFamily;
      const label = (el.dataset.fitText || text).toUpperCase();
      const ready = label === 'READY';
      const measure = size => {
        ctx.font = `${size}px ${fontFamily}`;
        const letters = ctx.measureText(label).width;
        const tracking = Math.min(2.2, size * .045);
        return { letters, tracking };
      };

      let low = 10;
      let high = Math.min(56, height * .92);
      for (let i = 0; i < 14; i++) {
        const mid = (low + high) / 2;
        const { letters, tracking } = measure(mid);
        if (letters + label.length * tracking + 3 <= width) low = mid;
        else high = mid;
      }
      const fontSize = Math.floor(low * 10) / 10;
      const { letters, tracking } = measure(fontSize);
      const gaps = Math.max(1, label.length);
      const spacing = tracking;
      el.style.fontSize = `${fontSize}px`;
      el.style.setProperty('letter-spacing', `${spacing.toFixed(2)}px`, 'important');
      el.style.textIndent = spacing.toFixed(2) + 'px';
    }

    advanceRollingRazzleLetters(count = 1) {
      // The first ball stays blank; bonus spins spell DAZZLE as the dice land.
      const word = this.dazzle ? 'DAZZLE' : 'RAZZLE';
      this.rollLetterCount = Math.min(6, (this.rollLetterCount ?? -1) + count);
      this.safeSetRollText(word.slice(0, Math.max(0, this.rollLetterCount)), true, word);
    }

    safeSetRollText(text, force = false, fitText = text) {
      const el = this.dom.rollText;
      if (!el) return;
      if (this.razzlePaused && text !== 'PAUSED') return;
      clearTimeout(this.centerPayoutTimer);
      el.style.removeProperty('display');
      el.style.opacity = '1';
      const bootTextChanged = el.textContent !== text;
      el.textContent = text;
      if (bootTextChanged && text && document.body.classList.contains('booting') && !this.visualSettings.batterySaver && !document.body.classList.contains('no-pulse-effects') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.bootTextWake?.cancel();
        this.bootTextWake = el.animate([{opacity:0},{opacity:.12,offset:.2},{opacity:.07,offset:.3},{opacity:.5,offset:.5},{opacity:.35,offset:.65},{opacity:1}], {duration:900,easing:'ease-in-out'});
      }
      if (document.body.classList.contains('booting') && (text === 'RAZZLE' || text === 'DAZZLE')) {
        document.body.classList.toggle('boot-title-razzle', text === 'RAZZLE');
        document.body.classList.toggle('boot-title-dazzle', text === 'DAZZLE');
      }
      el.title = text;
      el.dataset.fitText = fitText;
      el.classList.toggle('roll-payout', /^\$/.test(text));
      el.classList.remove('payout-flash');
      el.classList.remove('bonus-spin-award');
      el.parentElement?.classList.remove('bonus-award-screen');
      el.classList.toggle('ready-idle', text === 'READY');
      el.classList.toggle('idle-title-word', (text === 'RAZZLE' || text === 'DAZZLE') && this.idleTitleAllowed());
      this.fitCenterReadout();
    }

    showCenterPayout(win, returnToReady = true) {
      this.safeSetRollText(fmtCenterPayout(win), true);
      const el = this.dom.rollText;
      if (el) {
        void el.offsetWidth;
        el.classList.add('payout-flash');
      }
      if (returnToReady) {
        const epoch = this.presentationEpoch;
        this.centerPayoutTimer = setTimeout(() => {
          if (epoch !== this.presentationEpoch || this.dazzle || this.razzlePaused ||
              document.body.classList.contains('modal-open')) return;
          // Auto keeps the payout until the next roll starts its letter build.
          if (this.isAutoplay) return;
          this.safeSetRollText('READY', true);
          this.setHeaderReadoutState('idle');
        }, 1050);
      }
    }

    setHeaderReadoutState(mode = 'idle', valueColor = 'neutral') {
      const multBox = this.dom.headerMult?.closest('.status-box');
      const sumBox = this.dom.headerSum?.closest('.status-box');
      const multLabel = multBox?.querySelector('.status-label');
      const sumLabel = sumBox?.querySelector('.status-label');

      if (multLabel) {
        multLabel.style.opacity = '1';
        multLabel.style.transform = 'none';
        multLabel.style.height = '0.9rem';
      }
      if (sumLabel) {
        sumLabel.style.opacity = '1';
        sumLabel.style.transform = 'none';
        sumLabel.style.height = '0.9rem';
      }

      const setValueTone = (node, tone) => {
        if (!node) return;
        node.classList.remove('result-win', 'result-loss', 'result-push', 'result-neutral', 'result-idle');
        node.classList.add(tone === 'win' ? 'result-win' : tone === 'loss' ? 'result-loss' : tone === 'push' ? 'result-push' : 'result-neutral');
      };

      setValueTone(this.dom.headerMult, 'neutral');
      setValueTone(this.dom.headerSum, 'neutral');
    }

    updateLiveHeaderStatus(sum = 0, mult = 0, mode = 'live', tone = 'neutral') {
      if (this.dazzle) {
        if (this.dom.headerSum) this.dom.headerSum.textContent = fmtHeaderSum(sum);
        if (this.dom.headerMult) this.dom.headerMult.textContent = fmtHeaderMult(mult);
        this.setHeaderReadoutState(mode, tone);
        this.setDazzleHeader(false);
        return;
      }
      if (this.dom.headerSum) this.dom.headerSum.textContent = fmtHeaderSum(sum);
      if (this.dom.headerMult) this.dom.headerMult.textContent = fmtHeaderMult(mult);
      this.setHeaderReadoutState(mode, tone);
    }
    updateRollTextVisibility() {
      const el = this.dom.rollText;
      if (!el) return;
      el.style.removeProperty('display');
      el.style.opacity = '1';
    }
    abortRollText() {
      const el = this.dom.rollText;
      if (!el) return;
      clearTimeout(this.centerPayoutTimer);
      el.classList.remove('flash-rolling', 'flash-sum', 'payout-flash');
      this.updateRollTextVisibility();
    }

    updateMoneyUI() {
      this.dom.budget.textContent = fmtMoney(this.budget);
      const baseBet = this.dazzle?.baseBet ?? BETS[this.betIndex];
      this.dom.betAmount.textContent = fmtMoney(baseBet);
    }
    advanceStreak(isWin) {
      this.streak = isWin
        ? (this.streak >= 0 ? this.streak + 1 : 1)
        : (this.streak <= 0 ? this.streak - 1 : -1);
      this.sessionStats.bestStreak = Math.max(this.sessionStats.bestStreak, this.streak);
      this.updateAuxScreens();
      if (!this.dazzle) this.dom.totalScore.textContent = String(this.streak);
    }
    showBonusPayout(total) {
      if (this.dom.payoutLabel) {
        this.dom.payoutLabel.textContent = 'Bonus Payout';
      }
      this.dom.winAmount.textContent = fmtMoney(total);
      this.dom.winAmount.classList.remove('text-win', 'text-loss', 'text-jackpot', 'text-neutral', 'text-push', 'text-white');
      this.dom.winAmount.classList.add('bonus-payout-value');
    }
    clearBonusPayout() {
      if (this.dom.payoutLabel) {
        this.dom.payoutLabel.textContent = 'Payout';
      }
      this.dom.winAmount.classList.remove('bonus-payout-value');
    }
    updateControls() {
      document.body.classList.toggle('moon-rolling', this.isRolling || this.isAutoplay);
      const disable = this.isRolling || this.isAutoplay || this.dazzleTransitioning;
      const bet = BETS[this.betIndex];

      this.dom.decBet.disabled = this.betIndex === 0 || disable || Boolean(this.dazzle);
      this.dom.incBet.disabled = this.betIndex === BETS.length - 1 || disable || Boolean(this.dazzle);

      const razzleAutoPlaying = Boolean(this.dazzle) && this.isAutoplay;
      const spinCost = this.dazzle?.kind === 'free-ten' || this.dazzle?.kind === 'crazy-eight' ? 0 : bet;
      this.dom.rollBtn.disabled = this.dazzleTransitioning || (!this.isAutoplay && (spinCost > this.budget || disable || this.razzleRearming || this.dazzleTargetReveal));
      const razzleReady = Boolean(this.dazzle) && !this.isAutoplay && !this.dom.rollBtn.disabled;
      this.dom.rollBtn.classList.toggle('razzle-launch', Boolean(this.dazzle));
      this.dom.rollBtn.classList.toggle('razzle-ready', razzleReady);
      this.dom.rollBtn.setAttribute('aria-label', razzleReady
        ? `Play Razzle spin. ${this.dazzle.spinsRemaining} remaining.`
        : this.dazzle && this.isAutoplay
          ? `Pause Razzle autoplay. ${this.dazzle.spinsRemaining} spins remaining.`
          : this.dazzle ? 'Razzle spin in progress'
          : this.isAutoplay ? 'Pause autoplay'
          : this.autoplayPaused ? 'Resume autoplay' : 'Roll');


      this.dom.turboBtn.disabled = this.dazzleTransitioning || this.dazzle?.kind === 'sweet-16' || (this.isRolling && !this.isAutoplay);
      this.dom.turboBtn.classList.toggle('active', this.turboLevel > 0);
      this.dom.turboBtn.classList.toggle('turbo-stage-one', this.turboLevel === 1);
      this.dom.turboBtn.classList.toggle('turbo-stage-two', this.turboLevel === 2);
      this.dom.turboBtn.title = this.turboLevel === 1
        ? 'Turbo: fast sequential reveal — click again for Super Turbo'
        : this.turboLevel === 2
          ? 'Super Turbo: all balls together — click again to return to normal'
          : 'Turbo Roll';

      this.dom.autoplayBtn.disabled = this.dazzleTransitioning || (this.isRolling && !this.isAutoplay);
      this.dom.autoplayBtn.classList.toggle('active', this.isAutoplay);
      this.dom.autoplayBtn.title = this.dazzle
        ? this.isAutoplay ? 'Stop automatic Razzle spins' : 'Auto-play remaining Razzle spins'
        : 'Autoplay';
      this.dom.autoplayIcon.classList.toggle('hidden', this.isAutoplay);
      this.dom.stopIcon.classList.toggle('hidden', !this.isAutoplay);
      this.dom.mainAutoplayPauseIcon?.classList.toggle('hidden', !this.isAutoplay);
      this.updateAutoplayCountdown();
      this.dom.rollIcon?.classList.toggle('hidden', this.isAutoplay);
    }

    // ---------- HISTORY / PAYTABLE ----------
    updateAuxScreens() {
      const stats = this.sessionStats;
      if (!stats) return;
      const mostFrequent = counts => Object.entries(counts).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0]?.[0] ?? '—';
      const right = [['TOP BALL', mostFrequent(stats.ballCounts)], ['TOP SUM', mostFrequent(stats.sumCounts)], ['BEST STREAK', String(stats.bestStreak)]][this.auxStatPage % 3];
      const values = ['LAST SUM', stats.lastSum === null ? '—' : String(stats.lastSum), ...right];
      ['auxLeftLabel', 'auxLeftValue', 'auxRightLabel', 'auxRightValue'].forEach((id, index) => {
        const node = document.getElementById(id);
        if (node) { node.textContent = values[index]; node.title = values[index]; }
      });
    }

    recordHistory(entry) {
      this.sessionStats.bestWin = Math.max(this.sessionStats.bestWin, Number(entry.win) || 0);
      this.sessionStats.bestMultiplier = Math.max(this.sessionStats.bestMultiplier, Number(entry.multiplier) || 0);
      this.sessionStats.rolls++;
      this.sessionStats.lastSum = entry.sum;
      this.sessionStats.sumCounts[entry.sum] = (this.sessionStats.sumCounts[entry.sum] || 0) + 1;
      (entry.rolls || []).forEach(face => { this.sessionStats.ballCounts[face] = (this.sessionStats.ballCounts[face] || 0) + 1; });
      this.updateAuxScreens();
      this.history.unshift(entry);
      if (this.history.length > HISTORY_LIMIT) this.history.length = HISTORY_LIMIT;
      this.updateHistoryUI();
    }
    updateHistoryUI() {
      const list = this.dom.historyList;
      if (!list) return;
      if (!this.history.length) {
        list.innerHTML = '<p class="history-placeholder">No rolls yet. Play a round to start tracking.</p>';
        return;
      }
      list.innerHTML = this.history.map(h => {
        const rollsText = h.rolls.join(' • ');
        const multText = h.multiplier % 1 === 0 ? h.multiplier.toFixed(0) : h.multiplier.toFixed(2);
        const winText = fmtMoney(h.win);
        const betText = fmtMoney(h.bet);
        const sumClass = h.multiplier > 1 ? 'text-green-400' : (h.multiplier === 1 ? 'text-purple-400' : 'text-red-400');
        const star = h.multiplier >= 30 ? ' ⭐' : '';
        return `
          <div class="history-item flex justify-between items-center py-2 border-b border-gray-800">
            <div>
              <strong class="${sumClass}" style="font-size:1.2rem;">${h.sum}${star}</strong>
              <small class="block text-gray-500">${rollsText}</small>
            </div>
            <div class="text-right">
              <div class="flex items-center gap-x-4 justify-end">
                <span class="font-bold">${winText}${star}</span>
                <small class="text-gray-500">${h.time}</small>
              </div>
              <div class="text-sm text-gray-400">${multText}x / ${betText}</div>
            </div>
          </div>`;
      }).join('');
    }
    populatePayTable() {
      const el = this.dom.payoutTableContent;
      if (!el) return;

      const groups = new Map();
      for (const [sum, mult] of PAYOUT.entries()) {
        if (!groups.has(mult)) groups.set(mult, []);
        groups.get(mult).push(sum);
      }
      const zeros = groups.get(0.0) || [];
      const halves = groups.get(0.5) || [];
      groups.delete(0.0); groups.delete(0.5);

      const entries = Array.from(groups.entries())
        .map(([m, arr]) => ({ m, sums: arr.sort((a,b)=>a-b).join(' & ') }))
        .sort((a,b)=>b.m-a.m);

      const fmtSums = (arr) => arr.sort((a,b)=>a-b).join(', ');
      entries.push({ m: 0.5, sums: fmtSums(halves) });
      entries.push({ m: 0.0, sums: fmtSums(zeros) });

      const mid = Math.ceil(entries.length / 2);
      const left = entries.slice(0, mid), right = entries.slice(mid);

      let html = `
        <div class="font-bold text-purple-400 text-left">Sum(s)</div>
        <div class="font-bold text-purple-400 text-center">Pay</div>
        <div class="font-bold text-purple-400 text-left">Sum(s)</div>
        <div class="font-bold text-purple-400 text-center">Pay</div>`;
      for (let i = 0; i < mid; i++) {
        const a = left[i];
        html += `<div class="text-left"><strong>${a.sums}</strong></div><div class="text-center">${fmtMult(a.m)}</div>`;
        if (i < right.length) {
          const b = right[i];
          html += `<div class="text-left"><strong>${b.sums}</strong></div><div class="text-center">${fmtMult(b.m)}</div>`;
        } else {
          html += '<div></div><div></div>';
        }
      }
      el.innerHTML = html;
    }

    // ---------- AUTOPLAY UI ----------
    openAutoplayModal() {
      const M = this.dom.autoplayModal;
      if (!M) return this.startAutoplay();
      // reset defaults
      this.autoplayInfinite = false;
      if (this.dom.autoStartBonus) this.dom.autoStartBonus.checked = this.autoStartBonus;
      this.updateAutoplaySlider(parseInt(this.dom.autoplaySlider?.value || '0', 10) || 0);
      M.classList.remove('hidden');
      document.body.classList.add('modal-open');
      this.dom.autoplayYes?.focus();
    }
    closeAutoplayModal() {
      this.dom.autoplayModal?.classList.add('hidden');
      document.body.classList.remove('modal-open');
    }
    confirmAutoplayStart() {
      // set remaining from current slider
      const idx = parseInt(this.dom.autoplaySlider?.value || '0', 10) || 0;
      this.lastAutoplayCount = AUTOPLAY_STEPS[idx]; // Store the selection
      this.autoplayInfinite = false;
      this.autoplayRemaining = this.lastAutoplayCount;
      this.autoStartBonus = Boolean(this.dom.autoStartBonus?.checked);
      this.closeAutoplayModal();
      this.startAutoplay();
    }
    updateAutoplaySlider(idx) {
      idx = clamp(idx, 0, AUTOPLAY_STEPS.length - 1);
      if (this.dom.autoplaySlider) this.dom.autoplaySlider.value = String(idx);
      const val = AUTOPLAY_STEPS[idx];
      if (this.dom.autoplayCountValue) this.dom.autoplayCountValue.textContent = this.autoplayInfinite ? INFINITY_SYMBOL : String(val);
      // dots state
      bySelAll('.autoplay-slider-dots span').forEach((dot, i) => dot.classList.toggle('active', i === idx));
    }
    updateAutoplayBadge() {
      const b = this.dom.autoplayBadge;
      if (!b) return;
      b.textContent = this.isAutoplay ? 'ON' : '';
      b.classList.toggle('hidden', !this.isAutoplay);
      this.dom.autoGauge?.classList.toggle('is-inactive', !this.isAutoplay && !this.dazzle && this.dom.autoGaugeLabel?.textContent === 'Auto');
      if (!this.dazzle && this.dom.autoGaugeLabel?.textContent === 'Auto') {
        this.dom.autoGauge?.setAttribute('aria-label', this.isAutoplay ? 'Autoplay bets remaining' : 'Autoplay off');
        const gauge = document.getElementById('autoGaugeValue');
        if (gauge) gauge.textContent = this.isAutoplay ? (this.autoplayInfinite ? INFINITY_SYMBOL : Math.max(this.autoplayRemaining, 0)) : 'OFF';
      }
    }

    openDazzleModal() {
      if (!this.dom.dazzleModal || this.isAutoplay || this.dazzle || this.dazzleTransitioning) return;
      this.autoplayPaused = false;
      clearTimeout(this.autoBonusStartTimer);
      this.playRazzleCue();
      // The previous result belongs to the standard round; clear it before
      // the bonus palette can recolor the old balls.
      this.setCrazyLock();
      this.updateDiceSlots(Array(8).fill(null), false);
      document.body.classList.add('razzle-active');
      this.pendingDazzleOffer = null;
      this.dazzleTransitioning = true;
      this.updateControls();
      this.dom.dazzleOptions?.classList.remove('hidden');
      this.dom.dazzleOptions?.classList.remove('dazzle-options-locked');
      bySelAll('.dazzle-option.selected, .dazzle-split button.selected', this.dom.dazzleModal)
        .forEach(option => option.classList.remove('selected'));
      this.dom.dazzleContinuePanel?.classList.remove('hidden');
      if (this.dom.dazzleContinueAuto) this.dom.dazzleContinueAuto.disabled = true;
      const offers = [{ type: 'crazy' }, { type: 'free-ten', spins: 8, thresholds: [5] }];
      const selected = Math.floor(Math.random() * offers.length);
      const tiles = [document.getElementById('tile-29-left'), document.getElementById('tile-29-right')];
      const reducedMotion = this.visualSettings.batterySaver || !window.pulseEffectsEnabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const selectionDelays = [180, 160, 140, 120, 110, 100, 100, 100, 110, 110, 120, 130, 140, 150, 170, 190, 220, 260, 310, 370, 440, 520, 620, 750];
      let step = 0;
      const cycle = () => {
        const choice = step < selectionDelays.length && !reducedMotion ? (selected + selectionDelays.length - step) % 2 : selected;
        tiles.forEach((tile, index) => tile?.classList.toggle('bonus-selection-active', index === choice));
        if (step < selectionDelays.length && !reducedMotion) SoundManager?.playBonusSelectionTick?.(step);
        else SoundManager?.playBonusSelectionLand?.();
        if (step < selectionDelays.length && !reducedMotion) this.autoBonusStartTimer = setTimeout(cycle, selectionDelays[step++]);
        else this.autoBonusStartTimer = setTimeout(() => {
          tiles.forEach(tile => tile?.classList.remove('bonus-selection-active'));
          this.selectDazzleOffer(offers[selected]);
          this.dom.dazzleCrazy?.classList.toggle('hidden', selected !== 0);
          this.dom.dazzleTen?.classList.toggle('hidden', selected !== 1);
          const title = this.dom.dazzleModal.querySelector('.modal-title');
          if (title) title.textContent = selected === 0 ? 'Razzle Bonus' : 'Dazzle Bonus';
          this.dazzleTransitioning = false;
          this.dom.dazzleModal.classList.remove('hidden');
          document.body.classList.add('modal-open');
          this.dom.dazzleContinueAuto?.focus();
        }, reducedMotion ? 0 : 1200);
      };
      cycle();
    }

    closeDazzleModal() {
      clearTimeout(this.autoBonusStartTimer);
      this.dom.dazzleModal?.classList.add('hidden');
      document.body.classList.remove('modal-open');
    }

    selectDazzleOffer(offer) {
      // Picking a tile only highlights it. Start confirms it.
      clearTimeout(this.autoBonusStartTimer);
      this.pendingDazzleOffer = offer;
      const D = this.dom;
      bySelAll('.dazzle-option.selected, .dazzle-split button.selected', D.dazzleModal)
        .forEach(option => option.classList.remove('selected'));
      const selected = offer.type === 'sweet' ? D.dazzleSweet
        : offer.type === 'crazy' ? D.dazzleCrazy : D.dazzleTen;
      selected?.classList.add('selected');
      if (D.dazzleContinueAuto) D.dazzleContinueAuto.disabled = false;
    }

    async confirmSelectedDazzle(usePreviousMode) {
      const offer = this.pendingDazzleOffer;
      if (!offer || this.dazzle || this.dazzleTransitioning) return;
      clearTimeout(this.autoBonusStartTimer);
      // Auto start is armed by the auto-run setting, but never confirms a menu choice.
      // The player must click Start before the bonus can begin spinning.
      this.dazzleAutoStart = usePreviousMode && this.dazzleResumeAutoplay && this.autoStartBonus;
      if (!this.dazzleAutoStart) this.dazzleResumeAutoplay = false;
      this.pendingDazzleOffer = null;
      this.dazzleTransitioning = true;
      ++this.presentationEpoch;
      clearTimeout(this.dazzleHeaderTimer);
      this.stopValueWave();
      this.closeDazzleModal();
      this.updateControls();
      // No bonus effects, gold targets, or locked-ball reveal until the offer
      // screen has actually disappeared and the board has held on its own.
      await this.nextFrame();
      await this.nextFrame();
      await this.sleep(650);
      if (offer.type === 'free-ten') this.activateFreeTen(offer.spins, offer.thresholds);
      else if (offer.type === 'sweet') this.activateSweet16();
      else if (offer.type === 'crazy') this.activateCrazyEight();
    }

    startSelectedDazzle() { this.confirmSelectedDazzle(true); }

    async finishDazzleOfferSelection() {
      // Manual play waits for the bottom Play button. Start resumes the
      // previously running Auto mode only after the bonus screen has painted.
      const autoStart = this.dazzleAutoStart;
      this.dazzleAutoStart = false;
      this.dazzleTransitioning = true;
      ++this.presentationEpoch;
      clearTimeout(this.dazzleHeaderTimer);
      this.abortRollText();
      this.stopValueWave();
      this.closeDazzleModal();
      document.body.classList.add('razzle-active');
      this.safeSetRollText('RAZZLE', true);
      this.setDazzleHeader(false);
      this.updateControls();
      // A state update alone is not a visible transition. Give the browser two
      // frames to paint Razzle, then hold that screen before any bonus movement.
      await this.nextFrame();
      await this.nextFrame();
      this.playRazzleCue();
      await this.sleep(500);
      this.dazzleTransitioning = false;
      if (autoStart) {
        this.razzleBonusAutoplayOnly = false;
        this.isAutoplay = true;
        this.updateAutoplayBadge();
      }
      this.updateControls();
      this.roll();
    }

    openDazzleSummary(kind, totalWon = 0, baseBet = 0, totalSpins = 0) {
      const D = this.dom;
      const auto = this.dazzleResumeAutoplay;
      const totalMult = baseBet > 0 ? totalWon / baseBet : 0;
      this.dazzleSummaryKind = kind;
      D.dazzleSummaryModal.classList.toggle('dazzle-big-win', kind === 'complete' && totalMult >= 10);
      D.dazzleSummaryTitle.textContent = kind === 'complete' ? 'Dazzled' : 'Razzle Ready';
      if (kind === 'complete') {
        D.dazzleSummaryText.textContent = '';
        const amount = document.createElement('strong');
        amount.className = 'dazzle-win-amount';
        amount.textContent = fmtCenterPayout(totalWon);
        D.dazzleSummaryText.appendChild(amount);
        const multi = document.createElement('span');
        multi.className = 'dazzle-total-multi';
        multi.textContent = fmtMult(totalMult);
        D.dazzleSummaryText.appendChild(multi);
        const spins = document.createElement('span');
        spins.className = 'dazzle-spin-count';
        spins.textContent = `${totalSpins} spins`;
        D.dazzleSummaryText.appendChild(spins);
      } else {
        D.dazzleSummaryText.textContent = auto
          ? 'Razzle is set. Continue the paused automatic run when you are ready.'
          : 'Razzle is set. Start the bonus round when you are ready.';
      }
      D.dazzleSummaryGo.classList.toggle('hidden', auto);
      D.dazzleSummaryGo.textContent = kind === 'complete' ? 'OK' : 'Start';
      D.dazzleSummaryAuto.classList.toggle('hidden', !auto);
      D.dazzleSummaryStop.classList.toggle('hidden', !auto);
      D.dazzleSummaryModal.classList.remove('hidden');
      document.body.classList.add('modal-open');
    }

    closeDazzleSummary() {
      this.dom.dazzleSummaryModal?.classList.add('hidden');
      document.body.classList.remove('modal-open');
      if (this.dazzleSummaryKind === 'complete') {
        this.clearDazzleBrandStats();
        this.setCrazyLock();
        this.updateDiceSlots(Array(8).fill(null), false);
        // Hold the bonus palette through the result; the player's choice ends it.
        document.body.classList.add('razzle-theme-exit');
        requestAnimationFrame(() => document.body.classList.remove('razzle-active'));
        setTimeout(() => {
          this.markDazzleTargets([]);
          document.body.classList.remove('razzle-theme-exit');
          if (!this.dazzleResumeAutoplay && this.idleTitleAllowed()) this.showIdleTitleSequence(false);
        }, 980);
        this.dazzleSummaryKind = null;
      }
    }

    startDazzleManual() {
      const kind = this.dazzleSummaryKind;
      this.closeDazzleSummary();
      if (kind === 'start' && this.dazzle && !this.isRolling) this.roll();
    }

    continueDazzleAuto() {
      this.closeDazzleModal();
      this.closeDazzleSummary();
      this.resumeAutoplayAfterDazzle();
    }

    stopDazzleAuto() {
      this.dazzleResumeAutoplay = false;
      this.closeDazzleSummary();
      this.updateControls();
      this.updateAutoplayBadge();
    }

    pauseRazzleAutoplay() {
      if (!this.dazzle || !this.isAutoplay) return;
      this.isAutoplay = false;
      this.razzleBonusAutoplayOnly = false;
      this.razzlePaused = true;
      this.dom.rollText?.closest('.header-status-wrap')?.classList.add('razzle-paused');
      this.clearDazzleBrandStats();
      this.stopValueWave();
      this.safeSetRollText('PAUSED', true);
      this.updateControls();
      this.updateAutoplayBadge();
    }

    pauseAutoplayForDazzle() {
      if (!this.isAutoplay) return;
      this.dazzleResumeAutoplay = true;
      this.isAutoplay = false;
      this.isRolling = false;
      this.updateControls();
      this.updateAutoplayBadge();
      this.updateRollTextVisibility();
    }

    resumeAutoplayAfterDazzle() {
      if (!this.dazzleResumeAutoplay) return;
      this.dazzleResumeAutoplay = false;
      this.isAutoplay = true;
      this.updateControls();
      this.updateAutoplayBadge();
      setTimeout(() => { if (this.isAutoplay && !this.isRolling) this.roll(); }, 1100);
    }

    setDazzleHeader(showCenter = true) {
      if (!this.dazzle) return;
      this.updateDazzleBrandStats(this.dazzle);
      if (showCenter && !this.razzlePaused) {
        this.safeSetRollText('DAZZLE', true);
      }
    }

    updateDazzleBrandStats(bonus) {
      if (!bonus) return;
      const displayedTotal = this.displayedDazzleTotal(bonus);
      const round = Math.max(0, bonus.spinsRemaining || 0);
      const sweetPending = bonus.sweetSpinsPending > 0 || bonus.sweetSpinActive;
      const lastRound = round === 1 && !sweetPending;
      this.dom.scoreLabel.textContent = 'Bonus';
      this.dom.autoGaugeLabel.textContent = sweetPending && round === 0 ? 'Sweet 16' : lastRound ? 'Last Spin' : 'Spin';
      this.dom.autoGaugeLabel.classList.toggle('last-round', lastRound);
      this.dom.autoGauge.classList.remove('is-inactive');
      this.dom.autoGauge.setAttribute('aria-label', sweetPending ? `Bonus spins remaining: ${round}, Sweet 16 awarded` : lastRound ? 'Last spin' : `Bonus spins remaining: ${round}`);
      this.dom.totalScore.textContent = fmtMult(bonus.baseBet > 0 ? displayedTotal / bonus.baseBet : 0);
      const gauge = document.getElementById('autoGaugeValue');
      if (gauge) gauge.textContent = lastRound ? '' : String(round);
    }

    createDazzleState(kind, spins, extra = {}) {
      const trigger = this.dazzleTrigger;
      this.dazzleTrigger = null;
      return { kind, spinsRemaining: spins, totalSpins: spins, totalWon: 0, twentyNineCount: 0, sweetSpinsPending: 0,
        triggerWin: trigger?.win || 0, baseBet: trigger?.bet || BETS[this.betIndex], ...extra };
    }

    displayedDazzleTotal(bonus) {
      return (bonus?.triggerWin || 0) + (bonus?.totalWon || 0);
    }

    clearDazzleBrandStats() {
      if (this.dazzle) return;
      this.dom.scoreLabel.textContent = 'Form';
      this.dom.totalScore.textContent = String(this.streak);
      this.dom.autoGaugeLabel.textContent = 'Auto';
      this.dom.autoGaugeLabel.classList.remove('last-round');
      this.dom.autoGauge.setAttribute('aria-label', 'Autoplay bets remaining');
      this.updateAutoplayBadge();
      this.clearBonusPayout();
    }

    playRazzleCue() {
      SoundManager?.playRazzleChime?.();
    }

    setCompletedDazzleHeader(completed, mult, sum) {
      this.updateDazzleBrandStats({ ...completed, spinsRemaining: 0 });
      if (this.dom.headerMult) this.dom.headerMult.textContent = fmtHeaderMult(mult);
      if (this.dom.headerSum) this.dom.headerSum.textContent = fmtHeaderSum(sum);
      this.setHeaderReadoutState('idle', payoutTone(mult));
    }

    showDazzleResult(win, retriggered = false) {
      clearTimeout(this.dazzleHeaderTimer);
      this.showCenterPayout(win, false);
      const epoch = this.presentationEpoch;
      this.dazzleHeaderTimer = setTimeout(() => {
        if (epoch !== this.presentationEpoch || this.isRolling) return;
        if (retriggered && this.dazzle) {
          this.safeSetRollText('+1', true);
          this.dom.rollText?.classList.add('bonus-spin-award');
          this.dom.rollText?.parentElement?.classList.add('bonus-award-screen');
          SoundManager?.playBonusSpinAward?.();
          if (this.visualSettings.music && !this.isMuted) SoundManager?.sayBonusSpinAward?.();
        } else this.setDazzleHeader(!this.isAutoplay);
      }, retriggered ? 650 : 1100);
    }

    restoreStandardHeader() {
      const multLabel = this.dom.headerMult?.closest('.status-box')?.querySelector('.status-label');
      const sumLabel = this.dom.headerSum?.closest('.status-box')?.querySelector('.status-label');
      if (multLabel) multLabel.textContent = 'MULTI';
      if (sumLabel) sumLabel.textContent = 'SUM';
    }

    dazzleTargets(thresholds) {
      const picked = new Set();
      return thresholds.map((threshold) => {
        const candidates = shuffle(Array.from({ length: MAX_SUM - MIN_SUM + 1 }, (_, i) => i + MIN_SUM)
          .filter((sum) => (PAYOUT.get(sum) || 0) > threshold && !picked.has(sum)));
        const sum = candidates[0];
        if (sum != null) picked.add(sum);
        return sum;
      }).filter((sum) => sum != null);
    }

    markDazzleTargets(targets) {
      bySelAll('.tile.dazzle-double-up, .tile.dazzle-target-preview').forEach((tile) => {
        tile.classList.remove('dazzle-double-up', 'dazzle-target-preview', 'dazzle-boost-flash');
        const payout = tile.querySelector('.tile-payout');
        if (payout) payout.textContent = fmtMult(Number(tile.dataset.payout) || 0);
      });
      targets.forEach((sum) => bySelAll(`.tile[data-sum="${sum}"]`).forEach((tile) => tile.classList.add('dazzle-double-up')));
    }

    revealDazzleTargets(targets) {
      this.dazzleTargetReveal = true;
      this.markDazzleTargets([]);
      const order = shuffle([...targets]);
      return new Promise((resolve) => {
        order.forEach((sum, index) => {
          setTimeout(() => {
            const tiles = bySelAll(`.tile[data-sum="${sum}"]`);
            tiles.forEach((tile) => tile.classList.add('dazzle-target-preview'));
            setTimeout(() => {
              tiles.forEach((tile) => {
                tile.classList.replace('dazzle-target-preview', 'dazzle-double-up');
                tile.classList.add('dazzle-boost-flash');
                const payout = tile.querySelector('.tile-payout');
                if (payout) payout.textContent = '+50%';
                setTimeout(() => {
                  if (!tile.classList.contains('dazzle-double-up')) return;
                  if (payout) payout.textContent = `${Number((Number(tile.dataset.payout) * 1.5).toFixed(2))}x`;
                  tile.classList.remove('dazzle-boost-flash');
                }, 900);
              });
              if (index === order.length - 1) {
                setTimeout(() => {
                  this.dazzleTargetReveal = false;
                  resolve();
                }, 900);
              }
            }, 260);
          }, index * 190);
        });
      });
    }

    activateFreeTen(spins, thresholds) {
      const targets = this.dazzleTargets(thresholds);
      this.dazzle = this.createDazzleState('free-ten', spins, { targets });
      this.applyDazzleTurboGuard();
      this.updateMoneyUI();
      if (this.dom.headerSum) this.dom.headerSum.textContent = '0';
      this.showBonusPayout(this.displayedDazzleTotal(this.dazzle));
      this.setDazzleHeader();
      this.revealDazzleTargets(targets).then(() => this.finishDazzleOfferSelection());
    }

    activateSweet16() {
      this.dazzle = this.createDazzleState('sweet-16', 1);
      this.applyDazzleTurboGuard();
      if (this.dom.headerSum) this.dom.headerSum.textContent = '0';
      this.showBonusPayout(this.displayedDazzleTotal(this.dazzle));
      this.setDazzleHeader();
      this.finishDazzleOfferSelection();
    }

    activateCrazyEight() {
      this.dazzle = this.createDazzleState('crazy-eight', 8);
      this.applyDazzleTurboGuard();
      if (this.dom.headerSum) this.dom.headerSum.textContent = '0';
      this.showBonusPayout(this.displayedDazzleTotal(this.dazzle));
      this.setDazzleHeader();
      this.finishDazzleOfferSelection();
    }

    applyDazzleTurboGuard() {
      // Bonus spins always reveal sequentially. Restore Super Turbo afterward.
      if (this.dazzle?.kind === 'sweet-16') {
        this.dazzle.restoreTurboLevel = this.turboLevel;
        this.turboLevel = 0;
        this.isTurbo = false;
      } else if (this.dazzle && this.turboLevel === 2) {
        this.dazzle.restoreTurboLevel = 2;
        this.turboLevel = 1;
        this.isTurbo = false;
      }
      this.updateControls();
    }

    completeDazzleSpin(sum, sweetSpin = false) {
      if (!this.dazzle) return null;
      if (!sweetSpin) this.dazzle.spinsRemaining -= 1;
      if (sum === 29 && ++this.dazzle.twentyNineCount % 3 === 0) this.dazzle.sweetSpinsPending += 1;
      if (this.dazzle.spinsRemaining > 0 || this.dazzle.sweetSpinsPending > 0) return null;
      const completed = this.dazzle;
      this.razzlePaused = false;
      this.dom.rollText?.closest('.header-status-wrap')?.classList.remove('razzle-paused');
      const restoreTurboLevel = this.dazzle.restoreTurboLevel;
      this.dazzle = null;
      this.razzleRearming = false;
      if (Number.isInteger(restoreTurboLevel)) {
        this.turboLevel = restoreTurboLevel;
        this.isTurbo = restoreTurboLevel === 2;
      }
      this.updateControls();
      return completed;
    }
    updateAutoplayCountdown() {
      const c = this.dom.autoplayCountdown, ico = this.dom.rollIcon;
      if (!c || !ico) return;
      c.textContent = '';
      c.classList.remove('razzle-auto-indicator', 'razzle-auto-number');
      c.classList.add('hidden');
      ico.classList.toggle('hidden', this.isAutoplay);
    }

    // ---------- AUTOPLAY CONTROL ----------
    startAutoplay() {
      if (this.isAutoplay) return;
      // Note: Stop conditions are now set directly by their event listeners
      this.autoplayStartBalance = this.budget;
      this.isAutoplay = true;
      this.autoplayPaused = false;
      this.isRolling = false;
      this.updateControls();
      this.updateAutoplayBadge();
      this.updateRollTextVisibility();

      // kick off first roll immediately
      if (typeof SoundManager?.resumeAudio === 'function') {
        SoundManager.resumeAudio();
      }
      this.roll();
      pulse(this.dom.autoplayBtn, 'bass-pulse');
    }

    stopAutoplay(reason) {
      this.isAutoplay = false;
      this.autoplayPaused = false;
      this.autoplayRemaining = 0;
      this.autoplayInfinite = false;
      this.isRolling = false;
      document.body.classList.remove('modal-open');
      this.updateControls();
      this.updateAutoplayBadge();
      this.updateRollTextVisibility();

      // Show modal depending on reason
      if (reason === 'finished') { this.dom.finishedModal?.classList.remove('hidden'); document.body.classList.add('modal-open'); }
      if (reason === 'big_win') { this.dom.bigWinModal?.classList.remove('hidden'); document.body.classList.add('modal-open'); }
      if (reason === 'loss_limit') { this.dom.stopLossModal?.classList.remove('hidden'); document.body.classList.add('modal-open'); }
    }

    pauseAutoplay() {
      if (!this.isAutoplay || this.dazzle) return;
      // A roll already in flight may finish, but no next roll is scheduled.
      this.isAutoplay = false;
      this.autoplayPaused = true;
      this.updateControls();
      this.updateAutoplayBadge();
    }

    resumeAutoplay() {
      if (!this.autoplayPaused || this.dazzle) return;
      this.autoplayPaused = false;
      this.isAutoplay = true;
      this.updateControls();
      this.updateAutoplayBadge();
      if (!this.isRolling) this.roll();
    }

    scheduleNextAutoplay(extraDelay = 0) {
      if (!this.isAutoplay) return;
      const delay = this.turboLevel === 2
        ? SUPER_TURBO_AUTOPLAY_DELAY
        : this.isTurbo ? TURBO_AUTOPLAY_DELAY : NORMAL_AUTOPLAY_DELAY;
      setTimeout(() => { if (this.isAutoplay) this.roll(); }, delay + extraDelay);
    }

    // ---------- MODALS ----------
    closeFinished() { this.dom.finishedModal?.classList.add('hidden'); document.body.classList.remove('modal-open'); }
    closeStopLoss() { this.dom.stopLossModal?.classList.add('hidden'); document.body.classList.remove('modal-open'); }
    closeBigWin() { this.dom.bigWinModal?.classList.add('hidden'); document.body.classList.remove('modal-open'); }
    closeInsufficient() { this.dom.insufficientModal?.classList.add('hidden'); document.body.classList.remove('modal-open'); }
    openSettings() {
      const D = this.dom;
      if (!D.settingsModal) return;

      // Reset to the General tab every time
      bySelAll('.tab-button', D.settingsModal).forEach(btn => btn.classList.remove('active'));
      bySelAll('.tab-content', D.settingsModal).forEach(content => content.classList.add('hidden'));
      const generalTab = bySel('[data-tab="general"]', D.settingsModal);
      const generalContent = D.settingsModal.querySelector('#general');
      if (generalTab) generalTab.classList.add('active');
      if (generalContent) generalContent.classList.remove('hidden');
      
      D.settingsModal?.classList.remove('hidden');
      document.body.classList.add('modal-open');
      this.updateHistoryUI();
      this.populatePayTable();
    }
    closeSettings() {
      this.dom.settingsModal?.classList.add('hidden');
      document.body.classList.remove('modal-open');
      if (this.idleTitleAllowed()) this.showIdleTitleSequence(false);
    }

    // ---------- ROLL ----------
    async roll() {
      console.log(`[Razzle] roll() called. isRolling=${this.isRolling}`);
      if (this.dazzleTargetReveal || this.dazzleTransitioning) return;
      const baseBet = this.dazzle?.baseBet ?? BETS[this.betIndex];
      const freeTen = this.dazzle?.kind === 'free-ten';
      const bonusSweetSpin = Boolean(this.dazzle?.sweetSpinsPending);
      const sweet16 = this.dazzle?.kind === 'sweet-16' || bonusSweetSpin;
      const crazyEight = this.dazzle?.kind === 'crazy-eight' && !bonusSweetSpin;
      const crazyLockIndex = crazyEight ? (this.dazzle.totalSpins - this.dazzle.spinsRemaining) % 8 : -1;
      const crazyLockFace = crazyEight ? (Math.random() < 0.5 ? 1 : 6) : null;
      const revealDuration = this.turboLevel > 0 ? 120 : 320;
      const reducedRevealMotion = document.body.classList.contains('no-pulse-effects') || document.body.classList.contains('battery-saver') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const revealSoundDelay = reducedRevealMotion ? 0 : revealDuration * 0.76 / 1000;
      this.dom.rollResults?.style.setProperty('--result-reveal-duration', `${revealDuration}ms`);
        const wasDazzleSpin = Boolean(this.dazzle);
      const openingDazzleSpin = wasDazzleSpin && this.dazzle.spinsRemaining === this.dazzle.totalSpins;
      const bet = freeTen || crazyEight || bonusSweetSpin || (sweet16 && !openingDazzleSpin) ? 0 : baseBet;
      if (bet > this.budget) {
        if (this.isAutoplay) this.stopAutoplay('insufficient');
        this.dom.insufficientModal?.classList.remove('hidden');
        document.body.classList.add('modal-open');
        return;
      }
      if (this.isRolling) {
        console.warn('[Razzle] Roll blocked: isRolling=true');
        return;
      }
      if (bonusSweetSpin) {
        this.dazzle.sweetSpinsPending -= 1;
        this.dazzle.sweetSpinActive = true;
      }
      const wasAutoplaySpin = this.isAutoplay;

      this.cancelIdleTitleSequence();

      this.razzlePaused = false;
      document.body.classList.remove('top-readouts-locked');
      this.dom.rollText?.closest('.header-status-wrap')?.classList.remove('razzle-paused');

      ++this.presentationEpoch;

      this.stopValueWave();
      if (this.turboLevel === 1) this.triggerTurboSpinShine();
      if (wasDazzleSpin && !this.isAutoplay) {
        this.razzleRearming = true;
        this.dom.rollBtn.classList.remove('razzle-reengage');
      }
      this.isRolling = true;
      if (this.dazzle) {
        this.dazzle.displaySpin = Math.min(this.dazzle.totalSpins, this.dazzle.totalSpins - this.dazzle.spinsRemaining + 1);
        this.updateDazzleBrandStats(this.dazzle);
      }
      document.body.classList.add('game-active');
      this.updateControls();

      try {
        if (wasDazzleSpin && !bonusSweetSpin && this.dazzle.spinsRemaining === 1 && !reducedRevealMotion) {
          this.dom.autoGauge?.classList.add('last-spin-cue');
          await this.sleep(650);
          this.dom.autoGauge?.classList.remove('last-spin-cue');
        }
        if (openingDazzleSpin) {
          // Let the earned bonus register before the dice begin moving.
          document.body.classList.add('razzle-intro');
          this.safeSetRollText('DAZZLE', true);
          await this.sleep(700);
          document.body.classList.remove('razzle-intro');
        }
        this.setCrazyLock();
        if (wasDazzleSpin && this.lastRollValues?.length === 8) {
          // Clear the previous result in two beats instead of wiping all eight at once.
          this.updateDiceSlots([null, ...this.lastRollValues.slice(1)], false, true);
          await this.sleep(180);
        }
        this.updateDiceSlots(Array(8).fill(null), false);
        this.updateLiveHeaderStatus(0, 0, 'live', 'neutral');

        // Ensure Tone is running on first interaction
        // try { if (window.Tone && Tone.context.state !== 'running') await Tone.context.resume(); } catch {}

        // Take the bet
        this.budget -= bet;
        this.updateMoneyUI();

        // Reset UI area
        this.abortRollText();
        if (wasDazzleSpin) this.showBonusPayout(this.displayedDazzleTotal(this.dazzle));
        else {
          this.clearBonusPayout();
          this.dom.winAmount.textContent = '...';
        }
        this.dom.payoutMult.textContent = '...';
        this.dom.winAmount.classList.remove('text-win', 'text-loss', 'text-jackpot', 'text-neutral');
        this.dom.payoutMult.classList.remove('text-win', 'text-loss', 'text-jackpot', 'text-neutral');

        const rollScreen = this.dom.rollResults || bySel('.roll-screen');
        const slots = this.ensureDiceSlots();
        this.setCrazyLock(crazyLockIndex);
        if (rollScreen) {
          rollScreen.style.visibility = 'visible';
        }

        // Roll text
        this.rollLetterCount = -1;
        this.safeSetRollText('', true, wasDazzleSpin ? 'DAZZLE' : 'RAZZLE');
        const rolls = this.roll8d6(sweet16, crazyEight, crazyLockIndex, crazyLockFace);

        if (crazyEight) {
          const lockedSlot = slots[crazyLockIndex];
          if (lockedSlot) {
            const chip = chipGet(crazyLockFace, false);
            lockedSlot.innerHTML = '';
            lockedSlot.appendChild(chip);
            chip.className = `dice-chip shadow-md transition num-${crazyLockFace} ${this.isTurbo ? 'glow-purple' : 'glow-white'}`;
            chip.classList.add('crazy-lock', 'chip-reveal');
            chip.style.opacity = '1';
            chip.style.transform = 'scale(1)';
            chip.style.filter = 'none';
            lockedSlot.classList.add('crazy-lock-enter');
            SoundManager?.playDiceReveal?.(revealSoundDelay);
            this.advanceRollingRazzleLetters();
            await this.sleep(430);
            lockedSlot.classList.remove('crazy-lock-enter');
          }
        }

        // Brief Razzle hold while the board is empty, without changing the readout.
        if (!this.dazzle && (!this.isAutoplay || !this.isTurbo)) {
          await this.sleep(400);
        }

        // Sweet 16 has one cinematic rhythm regardless of the player's Turbo setting.
        if (sweet16) {
          await SoundManager?.resumeAudio?.();
          await this.sleep(380);
        }

        // Reveal
        let total = crazyEight ? crazyLockFace : 0;
        if (crazyEight) this.updateLiveHeaderStatus(total, PAYOUT.get(total) || 0, 'live', 'neutral');
        if (this.turboLevel === 2) {
          total = rolls.reduce((a, b) => a + b, 0);
          this.updateDiceSlots(rolls, false);
          this.updateLiveHeaderStatus(total, PAYOUT.get(total) || 0, 'live', payoutTone(PAYOUT.get(total) || 0));
          slots.forEach(slot => {
            const chip = slot.querySelector('.dice-chip');
            if (chip) {
              chip.classList.add('chip-reveal');
              chip.style.opacity = '1';
              chip.style.filter = 'none';
            }
            SoundManager?.playDiceReveal?.(revealSoundDelay);
          });
          this.advanceRollingRazzleLetters(7);
          // Super Turbo is still immediate, but gets a readable beat before result.
          await this.sleep(SUPER_TURBO_SETTLE_DELAY);
        } else {
          for (let i = 0; i < rolls.length; i++) {
            if (crazyEight && i === crazyLockIndex) continue;
            if (wasDazzleSpin && i === rolls.length - 1) await this.sleep(240);
            const v = rolls[i];
            const slot = slots[i];
            if (slot) {
              const chip = slot.querySelector('.dice-chip') || chipGet(v, false);
              slot.innerHTML = '';
              slot.appendChild(chip);
              chip.className = `dice-chip shadow-md transition num-${v} ${this.isTurbo ? 'glow-purple' : 'glow-white'}`;
              chip.classList.toggle('crazy-lock', slot.classList.contains('crazy-lock'));
              const ment = chip.querySelector('.chip-number');
              if (ment) ment.textContent = String(v);
              chip.style.opacity = '1';
              chip.classList.add('chip-reveal');
              chip.style.filter = 'none';
              if (sweet16) {
                chip.style.transform = 'none';
                chip.classList.add('sweet16-impact');
              }
            }
            if (sweet16) SoundManager?.playSweet16Thud?.(i, revealSoundDelay);
            else SoundManager?.playDiceReveal?.(revealSoundDelay);
            this.advanceRollingRazzleLetters();
            total += v;
            this.updateLiveHeaderStatus(total, PAYOUT.get(total) || 0, 'live', payoutTone(PAYOUT.get(total) || 0));
            this.highlightTiles(total, PAYOUT.get(total) || 0);
            await this.sleep(sweet16 ? SWEET16_REVEAL_DELAYS[i] : this.turboLevel === 1 ? FAST_REVEAL_DELAY : REVEAL_DELAY);
          }
          this.lastRollValues = rolls.slice();
          this.updateDiceSlots(rolls, false);
        }

        // Let the roll lettering clear before the payout appears.
        this.safeSetRollText('', true);

        // Result
        const baseMult = PAYOUT.get(total) || 0;
        const upgradedTotal = freeTen && this.dazzle?.targets?.includes(total);
        const mult = baseMult * (upgradedTotal ? 1.5 : 1);
        const win = baseBet * mult;
        this.budget += win;
        // Normal draws return the bet and count as wins. Bonus spins are
        // evaluated together once the bonus ends, not individually.
        const isWin = mult >= 1;
        if (!wasDazzleSpin) this.advanceStreak(isWin);
        const tone = payoutTone(mult);
        if (this.dazzle) this.dazzle.totalWon += win;
        const sweetAwarded = Boolean(this.dazzle && total === 29 && (this.dazzle.twentyNineCount + 1) % 3 === 0);
        if (bonusSweetSpin) this.dazzle.sweetSpinActive = false;
        const completedDazzle = this.completeDazzleSpin(total, bonusSweetSpin);
        if (wasDazzleSpin && total === 29) SoundManager?.playTwentyNineCue?.();
        if (completedDazzle) {
          const bonusCost = completedDazzle.kind === 'sweet-16' ? completedDazzle.baseBet : 0;
          const netBonusCents = Math.round((completedDazzle.totalWon - bonusCost) * 100);
          if (netBonusCents !== 0) this.advanceStreak(netBonusCents > 0);
        }
        if (completedDazzle && this.isAutoplay) {
          if (this.razzleBonusAutoplayOnly) {
            this.isAutoplay = false;
            this.razzleBonusAutoplayOnly = false;
            this.updateControls();
            this.updateAutoplayBadge();
          } else {
            this.pauseAutoplayForDazzle();
          }
        }
        this.updateMoneyUI();
        if (this.dazzle) this.updateLiveHeaderStatus(total, mult, 'idle', tone);
        else if (completedDazzle) this.setCompletedDazzleHeader(completedDazzle, mult, total);
        else this.updateLiveHeaderStatus(total, mult, 'idle', tone);
        if (total !== 29) SoundManager?.playTotalCue?.();

        // Super Turbo reveals all dice together; show that roll's payout at
        // the same moment, and leave it readable until the next roll starts.
        if (this.isTurbo && this.isAutoplay && !this.dazzle) {
          this.abortRollText();
          this.showCenterPayout(win);
        }

        // Transition ping
        // try { SoundManager?.playTransitionSound?.(); } catch(e) { console.warn('transition sound error', e); }

        // Dice “pop” and sound sync
        this.afterDiceReveal(win, mult, total, rollScreen, crazyEight ? crazyLockIndex : -1, completedDazzle?.kind === 'crazy-eight', (this.dazzle || completedDazzle) ? this.displayedDazzleTotal(this.dazzle || completedDazzle) : null, false);

        // Tile highlight
        this.highlightTiles(total, mult);

        // A 29 interrupts every mode, including Turbo autoplay, so the player
        // always gets the Razzle Dazzle decision instead of skipping past it.
        if (total === 29 && !this.dazzle && !completedDazzle) {
          this.dazzleTrigger = { win, bet };
          SoundManager?.playTwentyNineCue?.();
                // Hold autoplay at the Razzle decision without discarding its
                // remaining spins. The summary decides whether it resumes.
                if (this.isAutoplay) this.pauseAutoplayForDazzle();
          setTimeout(() => this.openDazzleModal(), 520);
        }

        if (completedDazzle) {
          setTimeout(() => {
            const displayedTotal = this.displayedDazzleTotal(completedDazzle);
            this.safeSetRollText(`RAZZLE WON ${fmtCenterPayout(displayedTotal)}`, true);
            this.openDazzleSummary('complete', displayedTotal, completedDazzle.baseBet, completedDazzle.totalSpins);
          }, 820);
        }

        // History
        this.recordHistory({
          sum: total,
          multiplier: mult,
          win,
          bet,
          rolls: rolls.slice(),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        });

        if (sweetAwarded) {
          this.isRolling = false;
          this.dazzleTransitioning = true;
          this.updateControls();
          setTimeout(() => {
            document.getElementById('sweet16AwardModal')?.classList.remove('hidden');
            document.body.classList.add('modal-open');
            document.getElementById('sweet16AwardGo')?.focus();
          }, 1100);
          return;
        }

        // Autoplay flow
        if (wasAutoplaySpin && this.autoplayPaused && !wasDazzleSpin) {
          if (!this.autoplayInfinite && this.autoplayRemaining > 0) this.autoplayRemaining--;
          this.updateAutoplayBadge();
          if (!this.autoplayInfinite && this.autoplayRemaining <= 0) this.autoplayPaused = false;
          if (total !== 29 && !this.autoplayPaused) {
            setTimeout(() => this.stopAutoplay('finished'), 1200);
          }
        }
        if (this.isAutoplay) {
          // Bonus spins are outside the player's automatic-run count and never
          // trigger its win/loss stop conditions.
          if (wasDazzleSpin && this.dazzle) {
            this.isRolling = false;
            this.updateControls();
            this.scheduleNextAutoplay(total === 29 ? 2100 : 0);
            return;
          }
          // stop conditions
          if (this.stopOnBigWin && mult >= 30) { this.stopAutoplay('big_win'); return; }
          if (this.stopOnLoss && this.budget <= this.autoplayStartBalance * 0.5) { this.stopAutoplay('loss_limit'); return; }

          if (!this.autoplayInfinite && this.autoplayRemaining > 0) this.autoplayRemaining--;
          this.updateAutoplayBadge();
          this.updateAutoplayCountdown();

          if ((this.autoplayInfinite || this.autoplayRemaining > 0) && this.budget >= BETS[this.betIndex]) {
            this.isRolling = false; // free to roll again
            this.updateControls();
            this.scheduleNextAutoplay();
          } else if (this.budget < BETS[this.betIndex]) {
            this.stopAutoplay('insufficient');
          } else if (!this.autoplayInfinite && this.autoplayRemaining <= 0) {
            setTimeout(() => this.stopAutoplay('finished'), 1200);
          } else {
            this.isRolling = false;
            this.updateControls();
          }
          return;
        }
      } catch (err) {
          console.error("Error during roll:", err);
          if (this.isAutoplay) {
              this.stopAutoplay('error');
          }
      } finally {
        document.body.classList.remove('razzle-intro');
        if (!this.isAutoplay) {
          this.isRolling = false;
          this.updateControls();
          clearTimeout(this.idleResumeTimer);
          this.idleResumeTimer = setTimeout(() => {
            if (this.isRolling || this.isAutoplay) return;
            document.body.classList.remove('game-active');
            this.startValueWave();
            this.showIdleTitleSequence(false);
          }, 2000);
        }
      }
    }

    roll8d6(sweet16 = false, crazyEight = false, crazyLockIndex = -1, crazyLockFace = null) {
      const r = Array.from({ length: 8 }, () => (Math.random() * 6 | 0) + 1);
      if (sweet16) return r.map(() => Math.random() < 0.5 ? 1 : 6);
      if (crazyEight) r[crazyLockIndex >= 0 ? crazyLockIndex : 0] = crazyLockFace === 6 ? 6 : 1;
      return r;
    }

    afterDiceReveal(win, mult, sum, rollScreen, lockedIndex = -1, clearCrazyLock = false, bonusTotal = null, retriggered = false) {
      const presentationEpoch = this.presentationEpoch;
      // exploding chips (skip in turbo autoplay for clarity)
      const slots = this.ensureDiceSlots();
      const chips = slots.map(slot => slot.querySelector('.dice-chip')).filter(Boolean);
      const movingChips = slots.flatMap((slot, index) => index === lockedIndex ? [] : [slot.querySelector('.dice-chip')].filter(Boolean));
      const isTurboAutoplay = this.isTurbo && this.isAutoplay && !this.dazzle;
      if (!isTurboAutoplay && movingChips.length) {
        movingChips.forEach(c => c.classList.remove('chip-reveal'));
        requestAnimationFrame(() => {
          if (presentationEpoch === this.presentationEpoch) movingChips.forEach(c => c.classList.add('chip-explode'));
        });
      }

      // sound + numbers + cleanup
      const delay = isTurboAutoplay ? SUPER_TURBO_PAYOUT_DELAY : 450;
      setTimeout(() => {
        if (presentationEpoch !== this.presentationEpoch) return;
        if (win > 0) {
          SoundManager?.playWinSound?.(mult);
        } else {
          SoundManager?.playLoseSound?.();
        }

        chips.forEach(chip => {
          chip.classList.add('stale');
          chip.style.filter = bonusTotal !== null ? 'saturate(1.08) brightness(0.96)' : 'saturate(0.72) brightness(0.72)';
          chip.style.opacity = '0.95';
        });

        this.updateDiceSlots(this.lastRollValues, true, bonusTotal !== null);
        if (clearCrazyLock) setTimeout(() => { if (presentationEpoch === this.presentationEpoch && !this.dazzle) this.setCrazyLock(); }, 650);

        // UI
        this.dom.winAmount.textContent = fmtMoney(win);
        this.dom.payoutMult.textContent = fmtMult(mult);

        // color states
        // Payout is white unless the round returned at least the bet.
        this.addResultClasses(mult >= 1 ? 'text-win' : 'text-white');
        if (bonusTotal !== null) this.showBonusPayout(bonusTotal);

        // pulses (lightweight)
        if (this.isAutoplay && this.isTurbo) {
          const r = this.dom.rollBtn, t = this.dom.turboBtn, a = this.dom.autoplayBtn, m = this.dom.muteBtn, s = this.dom.settingsBtn;
          if (mult === 0) pulse(r, 'bass-pulse', true);
          else {
            [r, t, a, m, s].forEach(el => pulse(el, mult >= 35 ? 'bass-pulse' : (mult >= 10 ? 'tick-pulse' : 'center-pop'), true));
          }
        }

        // The Super Turbo payout is already on the middle display. A second
        // flash here used to hide it for much of the result hold.
        if (isTurboAutoplay) return;

        // roll text behavior
        this.abortRollText();
        if (this.dazzle) {
          this.showDazzleResult(win, retriggered);
        } else {
          this.showCenterPayout(win);
        }

        if (this.razzleRearming && this.dazzle && !this.isAutoplay) {
          this.dom.rollBtn.classList.add('razzle-reengage');
          setTimeout(() => {
            this.razzleRearming = false;
            this.dom.rollBtn.classList.remove('razzle-reengage');
            this.updateControls();
          }, 380);
        }
      }, delay);
    }

    addResultClasses(cls) {
      const add = (el) => el && el.classList.add(cls);
      const rm = (el) => el && el.classList.remove('text-win', 'text-loss', 'text-jackpot', 'text-neutral', 'text-push', 'text-white', 'bonus-payout-value');
      [this.dom.winAmount, this.dom.payoutMult].forEach(rm);
      [this.dom.winAmount, this.dom.payoutMult].forEach(add);
    }

    highlightTiles(sum, mult) {
      const tiles = bySelAll('.tile', this.dom.payoutGrid);
      tiles.forEach(t => t.classList.remove('highlight', 'highlight-win', 'highlight-neutral', 'highlight-loss'));
      const results = bySelAll(`.tile[data-sum="${sum}"]`);
      const saver = document.body.classList.contains('battery-saver');

      if (saver) {
        let cls = 'highlight';
        if (mult > 1) cls = 'highlight-win';
        else if (mult === 1) cls = 'highlight-neutral';
        else cls = 'highlight-loss';
        results.forEach(t => t.classList.add(cls));
      } else {
        results.forEach(t => t.classList.add('highlight'));
      }
    }

    // ---------- TIMERS ----------
    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    nextFrame() { return new Promise(r => requestAnimationFrame(r)); }
  }

  // -----------------------------
  // 4) BOOT
  // -----------------------------
  window.addEventListener('load', async () => {
    // global pulse toggle default
    window.pulseEffectsEnabled = true;

    const game = new RazzleGame();
    // short delay to ensure all DOM nodes are ready
    await new Promise(r => setTimeout(r, 50));
    await game.init();
    // expose for debugging if needed
    window.__Razzle = game;
  });
})();














