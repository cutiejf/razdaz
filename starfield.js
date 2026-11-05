// Animated starfield background for Razzle Dazzle
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('starfield-bg');
  if (!canvas) {
    console.error('Starfield canvas not found!');
    return;
  }
    const ctx = canvas.getContext('2d');
    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
    }
    window.addEventListener('resize', resize);

  // Star properties
  const STAR_COUNT = Math.floor((w * h) / 1000);
  const stars = Array.from({length: STAR_COUNT}, () => ({
    baseAngle: Math.random() * Math.PI * 2,
  radius: Math.random() * (Math.max(w, h) / 1.1) + 40,
    r: Math.random() * 0.7 + 0.18, // Larger stars
    alpha: Math.random() * 0.4 + 0.4,
    twinkle: Math.random() * 0.09 + 0.03, // More twinkle
    speed: Math.random() * 0.08 + 0.03 // Slow orbital speed
  }));
  const goldDrops = Array.from({ length: 180 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    speed: 0.35 + Math.random() * 1.1,
    drift: (Math.random() - 0.5) * 0.22,
    size: 0.35 + Math.random() * 1.05,
    alpha: 0.26 + Math.random() * 0.5
  }));
  const goldSplashes = Array.from({ length: 7 }, (_, index) => ({
    x: Math.random() * w,
    y: Math.random() * h,
    age: -index * 38 - Math.random() * 30,
    interval: 170 + Math.random() * 110,
    radius: 24 + Math.random() * 31,
    angles: Array.from({ length: 11 + Math.floor(Math.random() * 7) }, () => Math.random() * Math.PI * 2)
  }));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let globalAngle = 0;
  let running = false;
  let frameId = null;

  function drawStars() {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const bonusSky = document.body.classList.contains('razzle-active');
    if (!bonusSky) globalAngle += 0.002; // Pause orbital drift during the bonus.
    let starDrawn = false;
    for (const star of stars) {
      // Twinkle
      star.alpha += (Math.random() - 0.5) * star.twinkle;
      star.alpha = Math.max(0.2, Math.min(1, star.alpha));
      // Circular motion
      const angle = star.baseAngle + (bonusSky ? 0 : globalAngle * star.speed * 2);
      const x = cx + Math.cos(angle) * star.radius;
      const y = cy + Math.sin(angle) * star.radius;
      ctx.globalAlpha = star.alpha;
      ctx.beginPath();
      ctx.arc(x, y, star.r, 0, Math.PI * 2);
      ctx.fillStyle = bonusSky ? '#f2d39d' : '#fff';
      ctx.shadowColor = bonusSky ? '#d9aa5a' : '#fff';
      ctx.shadowBlur = bonusSky ? 12 : 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      starDrawn = true;
    }
    ctx.globalAlpha = 1;
    if (bonusSky && !document.body.classList.contains('no-pulse-effects') && !document.body.classList.contains('battery-saver') && !reducedMotion.matches) {
      for (const drop of goldDrops) {
        drop.y += drop.speed;
        drop.x += drop.drift;
        if (drop.y > h + 12 || drop.x < -12 || drop.x > w + 12) {
          drop.x = Math.random() * w;
          drop.y = -12 - Math.random() * h * 0.2;
        }
        ctx.globalAlpha = drop.alpha;
        ctx.fillStyle = '#e9bc71';
        ctx.shadowColor = '#e7ae55';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(drop.x, drop.y, drop.size, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const splash of goldSplashes) {
        splash.age++;
        if (splash.age > splash.interval) {
          splash.x = Math.random() * w;
          splash.y = Math.random() * h;
          splash.age = 0;
        }
        if (splash.age < 0 || splash.age > 48) continue;
        const progress = splash.age / 48;
        const fade = Math.sin(Math.PI * progress);
        splash.angles.forEach((angle, index) => {
          const distance = splash.radius * progress * (index % 3 === 0 ? 1 : .65);
          const x = splash.x + Math.cos(angle) * distance;
          const y = splash.y + Math.sin(angle) * distance;
          ctx.globalAlpha = fade * (index % 4 === 0 ? .8 : .48);
          ctx.fillStyle = index % 3 === 0 ? '#fff0c0' : '#dca64e';
          ctx.shadowColor = '#e2ae5d';
          ctx.shadowBlur = index % 4 === 0 ? 12 : 6;
          ctx.beginPath();
          ctx.arc(x, y, index % 4 === 0 ? 1.8 : 1.1, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    if (!starDrawn) {
      console.log('No stars drawn');
    }
  }

  function animate() {
    if (!running) return;
    drawStars();
    frameId = requestAnimationFrame(animate);
  }

  window.setStarfieldEnabled = (enabled) => {
    if (running === enabled) return;
    running = enabled;
    canvas.style.display = enabled ? '' : 'none';
    if (enabled) {
      animate();
    } else {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      ctx.clearRect(0, 0, w, h);
    }
  };
  window.setStarfieldEnabled(true);
});
