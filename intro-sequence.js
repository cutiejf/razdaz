/* Isolated prototype: one timeline owns the startup activation cues.
   Times are milliseconds from the first POWER ON frame. Material colors
   belong to the normal component styles; this sequence only activates lights. */
(() => {
  const steps = Object.freeze([
    { at: 0, add: ['boot-power-text'], remove: ['readout-loading'], sound: 'power' },
    { at: 220, add: ['boot-perimeter-lit'] },
    { at: 500, add: ['boot-balls-opening'] },
    { at: 1250, add: ['boot-board-trim-lit', 'boot-29-lit'] },
    { at: 700, add: ['boot-inner-lit', 'boot-rims-lit'] },
    { at: 780, add: ['boot-control-bar-lit'], sound: 'control' },
    { at: 350, add: ['boot-center-lit', 'boot-sides-lit'], remove: ['top-readouts-locked'] },
    { at: 1180, add: ['boot-footer-lit'], sound: 'footer' },
    { at: 1450, add: ['boot-trigger-primed'] },
    { at: 1550, add: ['boot-control-open'] },
    { at: 2000, add: ['boot-opening'], rows: 2 },
    { at: 2550, rows: 3 },
    { at: 3100, rows: 4 },
    { at: 3650, rows: 5 },
    { at: 4200, rows: 6 },
    { at: 5800, add: ['boot-under-glow', 'boot-labels-lit', 'boot-final-ignition'] },
    { at: 6890, add: ['boot-all-on'] },
    { at: 7240, add: ['boot-preflash-dim'], remove: ['boot-power-text'] },
    { at: 7690, add: ['boot-preflash-flicker', 'boot-multis-igniting'], remove: ['boot-preflash-dim'] },
    { at: 8190, add: ['boot-final-charge', 'boot-fully-lit'], remove: ['boot-preflash-flicker'], sound: 'charge' },
    { at: 8140, add: ['boot-multis-ready'] },
    { at: 1550, reveal: '.control-stats-left .control-stat:nth-child(1)' },
    { at: 1650, reveal: '.control-stats-left .control-stat:nth-child(2)' },
    { at: 1750, reveal: '#turboButton' },
    { at: 1850, reveal: '#autoplayButton' },
    { at: 1950, reveal: '.control-stats-right > .control-stat:first-child' },
    { at: 2000, reveal: '#autoGauge' },
    { at: 2050, reveal: '.bet-readout' },
    { at: 2150, reveal: '#increaseBetBtn' },
    { at: 2250, reveal: '#decreaseBetBtn' },
    { at: 2350, reveal: '#muteButton' },
    { at: 1180, reveal: '#onoLogo' },
    { at: 2550, reveal: '#settingsButton' },
    { at: 2650, reveal: '#reloadButtonFooter' },
    { at: 2750, reveal: '#rollButton' },
    { at: 9140, add: [] }
  ].sort((a, b) => a.at - b.at));

  window.RazzleIntro = {
    steps,
    async play({ speed = 1, sound = true } = {}) {
      document.body.style.setProperty('--boot-ball-open-duration', Math.round(650 * speed) + 'ms');
      document.body.style.setProperty('--boot-flow-duration', Math.round(1400 * speed) + 'ms');
      document.body.style.setProperty('--boot-finish-duration', Math.round(950 * speed) + 'ms');
      document.body.style.setProperty('--boot-cue-duration', `${Math.round(1300 * speed)}ms`);
      document.body.style.setProperty('--boot-trace-duration', `${Math.round(1650 * speed)}ms`);
      const header = document.querySelector('.top-header');
      if (header) {
        const center = header.getBoundingClientRect();
        const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
        document.querySelectorAll('.top-header .status-led').forEach(led => {
          const rect = led.getBoundingClientRect();
          led.style.setProperty('--led-start-x', ((center.left + center.width / 2 - rect.left - rect.width / 2) / zoom) + 'px');
        });
      }
      const panels = [
        ['.main-container', 0], ['.status-left', 350], ['.status-center', 600],
        ['.status-right', 850], ['.ball-recess', 1850],
        ['#payoutBoardGrid', 5600], ['.control-bar', 1700], ['.main-footer', 1400]
      ];
      panels.forEach(([selector, at]) => {
        const panel = document.querySelector(selector);
        if (!panel) return;
        panel.style.setProperty('--panel-trace-delay', Math.round(at * speed) + 'ms');
        panel.style.setProperty('--panel-trace-duration', Math.round(950 * speed) + 'ms');
      });
      const holders = Array.from(document.querySelectorAll('#rollResultsDisplay .dice-slot'));
      const holderOrder = holders.map((holder, index) => ({holder, index, order: Math.random()})).sort((a,b) => a.order-b.order);
      holderOrder.forEach(({holder}, rank) => {
        holder.style.setProperty('--preflash-delay', Math.round(Math.random() * 130 * speed) + 'ms');
        holder.style.setProperty('--holder-reveal-delay', Math.round((rank * 63 + Math.random() * 35) * speed) + 'ms');
        holder.style.setProperty('--holder-flicker-duration', Math.round((750 + Math.random() * 700) * speed) + 'ms');
      });
      const featureSelectors = steps.filter(step => step.reveal).map(step => step.reveal);
      document.querySelectorAll(featureSelectors.join(',')).forEach(node => {
        node.style.setProperty('--preflash-delay', Math.round(Math.random() * 130 * speed) + 'ms');
        node.style.setProperty('--feature-flash-delay', Math.round(Math.random() * -430) + 'ms');
        node.classList.add('boot-feature');
        node.classList.remove('boot-feature-visible');
      });
      const board = document.querySelector('#payoutBoardGrid');
      board?.style.setProperty('--boot-visible-rows', '1');
      board?.style.setProperty('--boot-drop-duration', Math.round(350 * speed) + 'ms');
      const dropDuration = Math.round(350 * speed);
      const keys = Array.from(board?.children || []).filter(key => key.dataset.boardRow);
      keys.forEach(key => {
        key.classList.remove('boot-content-visible', 'boot-row-open');
        key.style.setProperty('--preflash-delay', Math.round(Math.random() * 130 * speed) + 'ms');
        key.style.setProperty('--content-wake-delay', Math.round(Math.random() * 2200 * speed) + 'ms');
        key.style.setProperty('--key-number-period', Math.round(490 + Math.random() * 370) + 'ms');
        key.style.setProperty('--key-payout-period', Math.round(440 + Math.random() * 330) + 'ms');
        key.style.setProperty('--key-lamp-period', Math.round(570 + Math.random() * 430) + 'ms');
      });
      const rowStarts = [1250, 2000, 2550, 3100, 3650, 4200];
      const earlyKeys = new Set();
      const numberEvents = [];
      rowStarts.forEach((at, rowIndex) => {
        const shuffled = keys.filter(key => Number(key.dataset.boardRow) === rowIndex + 1)
          .map(key => ({key, order: Math.random()})).sort((a,b) => a.order-b.order);
        shuffled.slice(0, 1 + Math.floor(Math.random() * 2)).forEach(({key}, i) => {
          earlyKeys.add(key);
          numberEvents.push({key, at: at + 25 + i * 45});
        });
      });
      const pending = keys.filter(key => !earlyKeys.has(key));
      let cursor = 1700;
      const spacing = (6350 - cursor) / Math.max(1, pending.length - 1);
      while (pending.length) {
        let eligible = pending.filter(key => rowStarts[Number(key.dataset.boardRow)-1] + 350 <= cursor);
        if (!eligible.length) {
          cursor = Math.min(...pending.map(key => rowStarts[Number(key.dataset.boardRow)-1] + 350));
          eligible = pending.filter(key => rowStarts[Number(key.dataset.boardRow)-1] + 350 <= cursor);
        }
        const key = eligible[Math.floor(Math.random() * eligible.length)];
        while (numberEvents.some(event => Math.abs(event.at-cursor) < 24)) cursor += 27;
        numberEvents.push({key, at: cursor});
        pending.splice(pending.indexOf(key), 1);
        cursor += spacing;
      }
      // Keep every lamp deadline before the shared all-on checkpoint.
      numberEvents.sort((a,b) => a.at-b.at).forEach((event, i, events) => {
        if (event.at > 6400) {
          let at = 6400;
          while (events.some(other => other !== event && Math.abs(other.at-at) < 24)) at -= 27;
          event.at = at;
        }
      });
      numberEvents.forEach(({key, at}) => setTimeout(() => key.classList.add('boot-row-open', 'boot-content-visible'), Math.round(at * speed)));
      const revealRowContents = row => {
        keys.filter(key => key.dataset.boardRow === String(row)).forEach(key => key.classList.add('boot-row-open'));
      };
      // The actual shell transition owns its boundary, not an unrelated timer.
      const openRow = row => {
        if (!board) return;
        let finished = false;
        let fallback;
        const finish = event => {
          if (event && (event.target !== board || event.propertyName !== 'height')) return;
          if (finished) return;
          finished = true;
          clearTimeout(fallback);
          board.removeEventListener('transitionend', finish);
          revealRowContents(row);
        };
        board.addEventListener('transitionend', finish);
        // Reduced motion or an unchanged first-row height has no transitionend.
        fallback = setTimeout(finish, dropDuration + Math.round(40 * speed));
        board.style.setProperty('--boot-visible-rows', String(row));
      };
      const startedAt = performance.now();
      for (const step of steps) {
        const remaining = startedAt + step.at * speed - performance.now();
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
        if (step.add?.includes('boot-final-charge') && board) {
          const origin = board.getBoundingClientRect();
          const lamps = Array.from(document.querySelectorAll('#payoutBoardGrid > .tile, #rollResultsDisplay .dice-slot, .boot-feature, .top-header .status-box'));
          const distances = lamps.map(node => {
            const rect = node.getBoundingClientRect();
            return Math.hypot(rect.left + rect.width / 2 - origin.left - origin.width / 2, rect.top + rect.height / 2 - origin.top - origin.height / 2);
          });
          const farthest = Math.max(1, ...distances);
          lamps.forEach((node, i) => node.style.setProperty('--burst-delay', Math.round(distances[i] / farthest * 280 * speed) + 'ms'));
        }
        if (step.remove?.length) document.body.classList.remove(...step.remove);
        if (step.add?.length) document.body.classList.add(...step.add);
        if (step.rows) openRow(step.rows);
        if (step.add?.includes('boot-29-lit')) openRow(1);
        if (step.reveal) document.querySelector(step.reveal)?.classList.add('boot-feature-visible');
        if (sound) {
          if (step.sound === 'power') window.SoundManager?.playBootFrequencies?.();
          if (step.sound === 'charge') window.SoundManager?.playBootPowerOn?.();
          if (step.sound === 'control') window.SoundManager?.playBootPanelThud?.(0);
          if (step.sound === 'footer') window.SoundManager?.playBootPanelThud?.(1);
        }
      }
    }
  };
})();













