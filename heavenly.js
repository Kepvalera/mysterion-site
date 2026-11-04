/* Heavenly Cinematic Luxury — procedural sky, atmospheric celestial sphere, pearl-lavender clouds & golden stardust. */
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
    return noise(x, y) * 0.53 + noise(x * 2, y * 2) * 0.28 + noise(x * 4, y * 4) * 0.19;
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

  // Texture 1: Billowy Pearl & Azure Cumulus with Sunlit Golden Linings
  const cloudCumulus = texture(480, 240, (x, y) => {
    const nx = x / 480, ny = y / 240;
    const n = fbm(x / 46, y / 34);
    const edge = Math.sin(Math.PI * nx) ** 0.45 * Math.sin(Math.PI * ny) ** 1.35;
    const alpha = Math.max(0, Math.min(1, (n - 0.24) * 3.0)) * edge;
    const sunRim = Math.max(0, Math.min(1, (1 - ny) * 1.8 * (n + 0.2)));
    // Sunlit pearl crest (warm gold/white), azure body, lavender under-depths
    const r = Math.min(255, 195 + n * 35 + sunRim * 45);
    const g = Math.min(255, 215 + n * 28 + sunRim * 35);
    const b = Math.min(255, 242 + n * 12 + (1 - sunRim) * 12);
    return [r, g, b, alpha * 240];
  });

  // Texture 2: High Wispy Pearl-Lavender Cirrus Veil
  const cloudCirrus = texture(480, 200, (x, y) => {
    const nx = x / 480, ny = y / 200;
    const n = fbm(x / 88, y / 28);
    const edge = Math.sin(Math.PI * nx) ** 0.35 * Math.sin(Math.PI * ny) ** 1.5;
    const alpha = Math.max(0, Math.min(1, (n - 0.28) * 2.8)) * edge;
    // Delicate ethereal lavender-white wisps
    return [236 + n * 18, 232 + n * 20, 252, alpha * 210];
  });

  // Texture 3: Soft Horizon Mist bridging gently into section 01 (#about)
  const cloudMist = texture(480, 220, (x, y) => {
    const nx = x / 480, ny = y / 220;
    const n = fbm(x / 62, y / 40);
    const edge = Math.sin(Math.PI * nx) ** 0.3 * Math.sin(Math.PI * ny) ** 1.1;
    const alpha = Math.max(0, Math.min(1, (n - 0.22) * 2.6)) * edge;
    // Pearlescent azure-gold mist
    return [240 + n * 14, 244 + n * 10, 252, alpha * 225];
  });

  // Atmospheric Celestial Sphere with 3D Depth, Swirling Bands and Soft Limb
  const celestialSphere = texture(420, 420, (x, y) => {
    const nx = (x - 210) / 195, ny = (y - 210) / 195, r = nx * nx + ny * ny;
    if (r >= 1) return [0, 0, 0, 0];
    const z = Math.sqrt(1 - r);
    // Dynamic spherical cloud swirls
    const swirls = fbm(nx * 8 + z * 3.5 + 14, ny * 9 + z * 2 + 10);
    const bandNoise = fbm(nx * 15 + swirls * 4 + 7, ny * 14 + swirls * 3 + 12);
    const cloudCover = Math.max(0, Math.min(1, (bandNoise - 0.42) * 3.8));
    // Soft directional celestial light from upper-right
    const light = 0.38 + 0.62 * Math.max(0, Math.min(1, -nx * 0.42 - ny * 0.38 + z * 0.82));
    // Luminous atmospheric rim (Fresnel glow)
    const rim = (1 - z) ** 4.2;
    // Soft outer boundary dissolve so there is NEVER a harsh circular edge
    const softEdge = smooth(Math.max(0, Math.min(1, (1 - r) * 14)));
    const dissolveBottom = 1 - smooth(Math.max(0, Math.min(1, (ny - 0.05) / 0.95)));

    const red = (95 + swirls * 38 + cloudCover * 115) * light + rim * 85;
    const green = (145 + swirls * 30 + cloudCover * 75) * light + rim * 72;
    const blue = (195 + swirls * 28 + cloudCover * 45) * light + rim * 52;
    const alpha = softEdge * dissolveBottom * 245;

    return [
      Math.min(255, red),
      Math.min(255, green),
      Math.min(255, blue),
      alpha
    ];
  });

  // Multi-stop Corona Glow for the Celestial Sphere
  const sphereCorona = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 540;
    const gCtx = c.getContext('2d');
    if (!gCtx) return c;
    const rad = gCtx.createRadialGradient(270, 270, 270 * 0.26, 270, 270, 270 * 0.95);
    rad.addColorStop(0, 'rgba(255, 245, 210, 0.42)');
    rad.addColorStop(0.35, 'rgba(244, 215, 140, 0.24)');
    rad.addColorStop(0.65, 'rgba(175, 212, 245, 0.22)');
    rad.addColorStop(0.85, 'rgba(215, 205, 240, 0.12)');
    rad.addColorStop(1, 'rgba(215, 205, 240, 0)');
    gCtx.fillStyle = rad;
    gCtx.fillRect(0, 0, 540, 540);
    return c;
  })();

  // Multi-tier Atmospheric Heavenly Light Aura behind the Crown
  const divineSunburst = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const gCtx = c.getContext('2d');
    if (!gCtx) return c;
    const rad = gCtx.createRadialGradient(256, 256, 10, 256, 256, 250);
    rad.addColorStop(0, 'rgba(255, 250, 230, 0.7)');
    rad.addColorStop(0.22, 'rgba(248, 222, 148, 0.48)');
    rad.addColorStop(0.48, 'rgba(224, 182, 92, 0.25)');
    rad.addColorStop(0.75, 'rgba(190, 215, 245, 0.12)');
    rad.addColorStop(1, 'rgba(190, 215, 245, 0)');
    gCtx.fillStyle = rad;
    gCtx.fillRect(0, 0, 512, 512);
    return c;
  })();

  // Twinkling Diamond & Gold Stars
  const STAR_COLORS = ['#ffffff', '#f4d27e', '#88c2f5', '#fff4d6', '#dfbe86'];
  const stars = Array.from({ length: 150 }, (_, i) => ({
    x: ((i + 0.5) * 0.6180339) % 1,
    y: ((i + 0.5) * 0.7548776) % 1,
    size: 0.65 + (i % 5) * 0.38,
    phase: i * 2.34,
    speed: 0.6 + (i % 7) * 0.16,
    color: STAR_COLORS[i % 5],
    isFlareStar: i % 24 === 0, // 6 prominent stars with diamond cross-diffraction flares
    flareLength: 7 + (i % 4) * 4
  }));

  // Floating Golden Stardust Particles around the Crown
  const DUST_COUNT = 32;
  const goldenDust = Array.from({ length: DUST_COUNT }, (_, i) => ({
    radiusX: 0.12 + ((i * 1.618) % 1) * 0.38, // relative to width around crown
    radiusY: 0.08 + ((i * 2.718) % 1) * 0.30,
    size: 1.1 + (i % 4) * 0.45,
    speed: 0.35 + (i % 5) * 0.12,
    driftSpeed: 0.2 + (i % 6) * 0.08,
    phase: i * 1.85,
    color: ['#ffea9f', '#fff4ce', '#e6b958', '#ffffff'][i % 4]
  }));

  // 5 Distinct, Living Cloud Streams (Moving in Opposite Directions with Infinite Depth)
  const CLOUD_STREAMS = [
    // [texture, x, y, widthScale, heightScale, speed, parallax, alpha]
    [cloudCirrus,  -0.12,  0.03, 1.45, 0.38,  0.22, 10, 0.70], // High wisps drifting right
    [cloudCumulus,  0.12,  0.16, 1.40, 0.45, -0.32, 22, 0.82], // Pearl-blue cumulus drifting left behind crown
    [cloudCumulus, -0.22,  0.42, 1.55, 0.48,  0.35, 34, 0.88], // Golden-rimmed cumulus drifting right
    [cloudMist,     0.06,  0.64, 1.50, 0.44, -0.26, 46, 0.80], // Lavender mist
    [cloudMist,    -0.12,  0.80, 1.65, 0.50,  0.20, 56, 0.90]  // Base transition cloud flowing into #about
  ];

  let width = 0, height = 0, heroHeight = 0, dpr = 1;
  let time = 0, progress = 0, targetProgress = 0;
  let visible = false, frame = 0, last = 0;
  let scrollScheduled = false;

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const intro = reduced.matches ? 1 : Math.min(1, 0.35 + time / 2.2);
    const isMobile = width < 641;

    // 1. Celestial Sphere & Corona
    const sphereSize = Math.min(width * (isMobile ? 0.92 : 0.85), 680);
    const sphereX = width * (isMobile ? 0.48 : 0.66) - sphereSize / 2;
    const sphereY = -sphereSize * 0.18 - progress * 26;

    // Outer luminous corona halo
    ctx.globalAlpha = intro * 0.85;
    ctx.drawImage(sphereCorona, sphereX - sphereSize * 0.15, sphereY - sphereSize * 0.15, sphereSize * 1.3, sphereSize * 1.3);

    // Living Celestial Sphere with subtle sway
    ctx.globalAlpha = intro * 0.48;
    const sphereWobble = Math.sin(time * 0.03) * 6;
    ctx.drawImage(celestialSphere, sphereX + sphereWobble, sphereY, sphereSize, sphereSize);

    // 2. Divine Sunburst Aura behind the Crown position
    const crownCenterX = width * 0.5;
    const crownCenterY = isMobile ? 140 : 165;
    const sunburstSize = isMobile ? 320 : 440;
    const sunburstPulse = 1 + Math.sin(time * 0.5) * 0.05;
    ctx.globalAlpha = intro * 0.65;
    ctx.drawImage(
      divineSunburst,
      crownCenterX - (sunburstSize * sunburstPulse) / 2,
      crownCenterY - (sunburstSize * sunburstPulse) / 2 - progress * 20,
      sunburstSize * sunburstPulse,
      sunburstSize * sunburstPulse
    );

    // 3. Living Cloud Layers (Pass 1: Background streams 0 and 1)
    for (let i = 0; i < 2; i++) {
      const [cTex, cx, cy, cw, ch, cspeed, cparallax, cAlpha] = CLOUD_STREAMS[i];
      ctx.globalAlpha = cAlpha * intro;
      const drift = Math.sin(time * 0.035 * cspeed + i) * width * 0.05;
      ctx.drawImage(cTex, width * cx + drift, height * cy - progress * cparallax, width * cw, height * ch);
    }

    // 4. Twinkling Diamond & Gold Stars
    const starCount = isMobile ? 85 : 150;
    const starProgressFade = 1 - progress * 0.75;
    for (let i = 0; i < starCount; i++) {
      const s = stars[i];
      const pulse = (Math.sin(time * s.speed + s.phase) + 1) * 0.5;
      const alpha = (0.22 + pulse * 0.58) * intro * starProgressFade * (1 - s.y * 0.65);
      if (alpha <= 0.01) continue;

      const x = s.x * width + Math.sin(time * 0.04 + s.phase) * 2;
      const y = s.y * height - progress * (8 + (i % 3) * 6);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(x, y, s.size * (0.85 + pulse * 0.35), 0, Math.PI * 2);
      ctx.fill();

      // Sharp 4-point cross diffraction flares on prominent stars
      if (s.isFlareStar && pulse > 0.55) {
        const flareAlpha = alpha * ((pulse - 0.55) / 0.45);
        ctx.globalAlpha = flareAlpha * 0.85;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 0.8;
        const len = s.flareLength * pulse;
        ctx.beginPath();
        ctx.moveTo(x - len, y); ctx.lineTo(x + len, y);
        ctx.moveTo(x, y - len); ctx.lineTo(x, y + len);
        ctx.stroke();
      }
    }

    // 5. Floating Golden Stardust Particles around the Crown
    const dustProgress = 1 - progress * 0.85;
    for (let i = 0; i < goldenDust.length; i++) {
      const p = goldenDust[i];
      const pPulse = (Math.sin(time * p.speed + p.phase) + 1) * 0.5;
      const pAlpha = (0.25 + pPulse * 0.65) * intro * dustProgress;
      if (pAlpha <= 0.01) continue;

      const pX = crownCenterX + Math.cos(time * p.driftSpeed + p.phase) * (width * p.radiusX);
      const pY = crownCenterY + Math.sin(time * p.speed + p.phase) * (height * p.radiusY) - progress * 24;

      ctx.globalAlpha = pAlpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(pX, pY, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Living Cloud Layers (Pass 2: Midground and Horizon clouds 2, 3, 4)
    for (let i = 2; i < CLOUD_STREAMS.length; i++) {
      const [cTex, cx, cy, cw, ch, cspeed, cparallax, cAlpha] = CLOUD_STREAMS[i];
      ctx.globalAlpha = cAlpha * intro;
      const drift = Math.sin(time * 0.035 * cspeed + i) * width * 0.05;
      ctx.drawImage(cTex, width * cx + drift, height * cy - progress * cparallax, width * cw, height * ch);
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
