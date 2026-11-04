/* Procedural opening scene: optimized 60fps canvas, zero layout-thrashing, smooth parallax. */
(() => {
  const hero = document.querySelector('.heavenly-hero');
  if (!hero) return;
  const art = hero.querySelector('.heavenly-art');
  const canvas = hero.querySelector('canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const emblem = hero.querySelector('.heavenly-emblem');
  const crown = emblem ? emblem.querySelector('img') : null;
  if (crown) {
    if (crown.complete && crown.naturalWidth > 0) emblem.hidden = false;
    crown.addEventListener('load', () => { emblem.hidden = false; });
    crown.addEventListener('error', () => { emblem.hidden = true; });
  }

  const smooth = n => n * n * (3 - 2 * n);
  const hash = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    return (hash(ix, iy) * (1 - fx) + hash(ix + 1, iy) * fx) * (1 - fy) +
           (hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx) * fy;
  }
  function fbm(x, y) {
    return noise(x, y) * 0.55 + noise(x * 2, y * 2) * 0.28 + noise(x * 4, y * 4) * 0.17;
  }
  function texture(w, h, pixel) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const painter = c.getContext('2d'), image = painter.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const rgba = pixel(x, y), i = (y * w + x) * 4;
        image.data[i] = rgba[0];
        image.data[i + 1] = rgba[1];
        image.data[i + 2] = rgba[2];
        image.data[i + 3] = rgba[3];
      }
    }
    painter.putImageData(image, 0, 0);
    return c;
  }

  // Pre-rendered procedural cloud texture
  const cloud = texture(384, 192, (x, y) => {
    const n = fbm(x / 43, y / 32), edge = Math.sin(Math.PI * x / 384) ** 0.4 * Math.sin(Math.PI * y / 192) ** 1.5;
    const alpha = Math.max(0, Math.min(1, (n - 0.26) * 2.8)) * edge;
    return [251 + n * 4, 251 + n * 4, 255, alpha * 225];
  });

  // Pre-rendered celestial sphere/planet texture
  const planet = texture(360, 360, (x, y) => {
    const nx = (x - 180) / 170, ny = (y - 180) / 170, r = nx * nx + ny * ny;
    if (r >= 1) return [0, 0, 0, 0];
    const z = Math.sqrt(1 - r), n = fbm(nx * 6 + z * 4 + 12, ny * 7 + z * 2 + 9);
    const swirls = fbm(nx * 14 + n * 4 + 8, ny * 13 + n * 3 + 11);
    const cloudCover = Math.max(0, Math.min(1, (swirls - 0.44) * 4));
    const light = 0.4 + 0.6 * Math.max(0, Math.min(1, -nx * 0.45 - ny * 0.42 + z * 0.78));
    const rim = (1 - z) ** 5;
    const dissolve = 1 - smooth(Math.max(0, Math.min(1, (ny - 0.1) / 0.9)));
    return [
      (99 + n * 32 + cloudCover * 105) * light + rim * 64,
      (149 + n * 25 + cloudCover * 65) * light + rim * 58,
      (189 + n * 25 + cloudCover * 30) * light + rim * 40,
      Math.min(1, (1 - r) * 80) * dissolve * 255
    ];
  });

  // Pre-rendered atmosphere glow to avoid recreating radial gradient every frame
  const atmosphereGlow = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const gCtx = c.getContext('2d');
    if (!gCtx) return c;
    const rad = gCtx.createRadialGradient(256, 256, 256 * 0.28, 256, 256, 256 * 0.92);
    rad.addColorStop(0, 'rgba(160,197,228,0)');
    rad.addColorStop(0.65, 'rgba(244,220,162,.16)');
    rad.addColorStop(0.8, 'rgba(145,195,230,.24)');
    rad.addColorStop(1, 'rgba(145,195,230,0)');
    gCtx.fillStyle = rad;
    gCtx.fillRect(0, 0, 512, 512);
    return c;
  })();

  const STAR_COLORS = ['#6281a6', '#ab8850', '#ffffff', '#8591b1'];
  const stars = Array.from({ length: 150 }, (_, i) => ({
    x: ((i + 0.5) * 0.6180339) % 1,
    y: ((i + 0.5) * 0.7548776) % 1,
    size: 0.55 + (i % 4) * 0.35,
    phase: i * 2.4,
    speed: 0.5 + (i % 6) * 0.18,
    color: STAR_COLORS[i % 4],
    hasCross: i % 37 === 0
  }));

  const CLOUD_LAYERS = [
    [-0.3,  0.03, 1.5,  0.5,   0.7, 12],
    [ 0.15, 0.22, 1.35, 0.38, -0.45, 24],
    [-0.22, 0.58, 1.6,  0.48,  0.9, 36],
    [ 0.05, 0.76, 1.4,  0.38, -0.7, 48]
  ];

  let width = 0, height = 0, heroHeight = 0, dpr = 1;
  let time = 0, progress = 0, targetProgress = 0;
  let visible = false, frame = 0, last = 0;
  let scrollScheduled = false;

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const intro = reduced.matches ? 1 : Math.min(1, 0.3 + time / 2.3);
    const size = Math.min(width * 0.9, 720);
    const px = width * (width < 641 ? 0.48 : 0.68) - size / 2;
    const py = -size * 0.23 - progress * 28;

    // Fast atmosphere glow from pre-rendered sprite
    ctx.globalAlpha = intro * 0.8;
    ctx.drawImage(atmosphereGlow, px - size * 0.2, py - size * 0.2, size * 1.4, size * 1.4);

    // Planet
    ctx.globalAlpha = intro * 0.38;
    ctx.drawImage(planet, px + Math.sin(time * 0.025) * 7, py, size, size);

    // Stars - zero allocation loop
    const starCount = width < 641 ? 80 : 150;
    const starProgressFade = 1 - progress * 0.75;
    for (let i = 0; i < starCount; i++) {
      const s = stars[i];
      const alpha = (0.18 + (Math.sin(time * s.speed + s.phase) + 1) * 0.23) * intro * starProgressFade * (1 - s.y * 0.7);
      if (alpha <= 0.01) continue;
      const x = s.x * width + Math.sin(time * 0.05 + s.phase) * 2;
      const y = s.y * height - progress * (8 + (i % 3) * 5);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(x, y, s.size, 0, Math.PI * 2);
      ctx.fill();

      if (s.hasCross) {
        const glow = (Math.sin(time * 0.4 + s.phase) + 1) * 0.5;
        ctx.globalAlpha = alpha * glow;
        ctx.strokeStyle = '#aa8750';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x + 6, y);
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y + 6);
        ctx.stroke();
      }
    }

    // Clouds - smooth layered drift and parallax
    for (let i = 0; i < CLOUD_LAYERS.length; i++) {
      const [cx, cy, cw, ch, cspeed, cparallax] = CLOUD_LAYERS[i];
      ctx.globalAlpha = (i < 2 ? 0.7 : 0.9) * intro;
      const drift = Math.sin(time * 0.03 * cspeed + i) * width * 0.04;
      ctx.drawImage(cloud, width * cx + drift, height * cy - progress * cparallax, width * cw, height * ch);
    }

    ctx.globalAlpha = 1;
  }

  function tick(now) {
    frame = 0;
    if (!visible || document.hidden || reduced.matches) {
      hero.dataset.active = 'false';
      return;
    }
    // Regulate to ~60 FPS max so high-refresh displays (90Hz/120Hz/144Hz) don't waste battery/GPU
    if (last && (now - last) < 14) {
      frame = requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;
    time += dt;

    // Smoothly catch up progress during scroll without desync
    if (Math.abs(targetProgress - progress) > 0.001) {
      progress += (targetProgress - progress) * 0.35;
      if (Math.abs(targetProgress - progress) < 0.001) progress = targetProgress;
    }

    draw();
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    last = performance.now();
    const active = visible && !document.hidden && !reduced.matches;
    hero.dataset.active = String(active);
    if (active) {
      frame = requestAnimationFrame(tick);
    } else if (reduced.matches) {
      draw();
    }
  }

  function resize() {
    width = hero.clientWidth;
    height = hero.clientHeight;
    heroHeight = height;
    dpr = Math.min(window.devicePixelRatio || 1, width < 641 ? 1.25 : 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    draw();
    sync();
  }

  function updateScrollState() {
    scrollScheduled = false;
    const y = window.scrollY || window.pageYOffset || 0;
    if (reduced.matches) {
      targetProgress = 0;
      progress = 0;
    } else {
      targetProgress = Math.min(1, Math.max(0, y / Math.max(1, heroHeight)));
    }
    // Update opacity directly on the art layer without forced reflow
    const fade = (1 - targetProgress * 0.55).toFixed(3);
    if (art) {
      art.style.setProperty('--heavenly-fade', fade);
    }
  }

  let wasPastHero = false;
  function onScroll() {
    const y = window.scrollY || window.pageYOffset || 0;
    if (y > heroHeight + 60) {
      if (!wasPastHero) {
        wasPastHero = true;
        targetProgress = 1;
        progress = 1;
        if (art) art.style.setProperty('--heavenly-fade', '0.450');
      }
      return;
    }
    wasPastHero = false;
    if (!scrollScheduled) {
      scrollScheduled = true;
      requestAnimationFrame(updateScrollState);
    }
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }, { threshold: 0 }).observe(hero);
  } else {
    visible = true;
  }

  if ('ResizeObserver' in window) {
    new ResizeObserver(resize).observe(hero);
  } else {
    window.addEventListener('resize', resize, { passive: true });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', () => {
    targetProgress = 0;
    progress = 0;
    draw();
    sync();
  });

  const about = document.getElementById('about');
  if (about && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        about.querySelectorAll('.section-heading,.e-about-copy').forEach(n => n.classList.add('heavenly-about-revealed'));
        observer.disconnect();
      }
    }, { threshold: 0.12 });
    observer.observe(about);
  }

  resize();
  updateScrollState();
})();
