/* Confirmed announcement copy, shared by the home page and school. */
(() => {
  const copy = {
    ru: {
      nancyName:'Нэнси Коун', nancyCaption:'Нэнси Коун — впервые в Мистерион!',
      school:'ОНЛАЙН-ШКОЛА', upcoming:'ПРЕДСТОЯЩИЙ СЕЗОН', title:'МИСТЕРИОН 6', anniversary:'ЮБИЛЕЙНЫЙ ПОТОК',
      subtitle:'Отец призывает тебя к глубине, зрелости и подлинной духовной силе!', cta:'Узнать о шестом потоке',
      quote:'«Юбилейная труба уже готова прозвучать! Верим, что её звук откроет новые измерения откровения, силы и духовного преображения».',
      description:'Онлайн-школа «Мистерион» — это три месяца глубокого духовного обновления, посвящённые познанию Бога, духовной зрелости и раскрытию призвания.',
      themes:'Основные темы и направления', theme1:'Кристальная ясность призвания и духовная зрелость.', theme2:'Исцеление и обновление физического тела'
    },
    en: {
      nancyName:'Nancy Coen', nancyCaption:'Nancy Coen — for the first time at Mysterion!',
      school:'ONLINE SCHOOL', upcoming:'UPCOMING SEASON', title:'MYSTERION 6', anniversary:'ANNIVERSARY COHORT',
      subtitle:'The Father calls you to depth, maturity, and authentic spiritual strength!', cta:'Discover the sixth cohort',
      quote:'“The jubilee trumpet is ready to sound! We believe its sound will open new dimensions of revelation, power, and spiritual transformation.”',
      description:'Mysterion Online School is three months of deep spiritual renewal dedicated to knowing God, spiritual maturity, and discovering your calling.',
      themes:'Key themes and focus areas', theme1:'Crystal clarity of calling and spiritual maturity.', theme2:'Healing and renewal of the physical body'
    },
    de: {
      nancyName:'Nancy Coen', nancyCaption:'Nancy Coen — zum ersten Mal bei Mysterion!',
      school:'ONLINE-SCHULE', upcoming:'KOMMENDE SAISON', title:'MYSTERION 6', anniversary:'JUBILÄUMSJAHRGANG',
      subtitle:'Der Vater ruft dich zu Tiefe, Reife und wahrer geistlicher Kraft!', cta:'Den sechsten Jahrgang entdecken',
      quote:'„Die Jubiläumstrompete ist bereit zu erklingen! Wir glauben, dass ihr Klang neue Dimensionen der Offenbarung, Kraft und geistlichen Verwandlung eröffnen wird.“',
      description:'Die Online-Schule Mysterion bietet drei Monate tiefer geistlicher Erneuerung, die der Erkenntnis Gottes, geistlicher Reife und der Entdeckung der eigenen Berufung gewidmet sind.',
      themes:'Zentrale Themen und Schwerpunkte', theme1:'Kristallklare Berufung und geistliche Reife.', theme2:'Heilung und Erneuerung des physischen Körpers'
    }
  };
  function translate() {
    const t = copy[document.documentElement.lang] || copy.ru;
    document.querySelectorAll('[data-jubilee]').forEach(node => { node.textContent = t[node.dataset.jubilee]; });
    document.querySelectorAll('[data-jubilee-alt]').forEach(node => { node.alt = t[node.dataset.jubileeAlt]; });
  }
  window.addEventListener('mysterion:language', translate);
  translate();

  // Decorative layers stay behind the unchanged, opaque portrait.
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mouse = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 971px)');
  document.querySelectorAll('.jubilee-speaker-photo').forEach(photo => {
    const stage = document.createElement('div');
    stage.className = 'portrait-stage';
    photo.before(stage);
    const fx = document.createElement('div');
    fx.className = 'portrait-fx'; fx.setAttribute('aria-hidden', 'true');
    for (const name of ['nebula','aura']) {
      const layer = document.createElement('span'); layer.className = `portrait-${name}`; fx.append(layer);
    }
    const positions = [[2,15],[97,23],[6,45],[95,60],[3,80],[98,89],[18,2],[76,1],[26,99],[82,98],[0,65],[99,42]];
    positions.forEach(([x,y],index) => {
      const star = document.createElement('span'); star.className = 'portrait-star';
      star.style.cssText = `--x:${x}%;--y:${y}%;--size:${3 + index % 4 * 2}px;--delay:${-index * 1.7}s;--duration:${4 + index % 4}s`;
      fx.append(star);
    });
    for (let index = 0; index < 6; index++) {
      const particle = document.createElement('span'); particle.className = 'portrait-particle';
      particle.style.cssText = `--x:${index % 2 ? 97 : 2}%;--y:${40 + index * 10}%;--delay:${-index * 2.3}s;--duration:${9 + index % 3}s`;
      fx.append(particle);
    }
    [[7,25],[95,73],[74,1]].forEach(([x,y],index) => {
      const flare = document.createElement('span'); flare.className = 'portrait-flare';
      flare.style.cssText = `--x:${x}%;--y:${y}%;--delay:${-index * 4.7}s;--duration:${13 + index * 2}s`;
      fx.append(flare);
    });
    stage.append(fx,photo);
    let visible = false;
    const update = () => { stage.dataset.active = String(visible && !document.hidden && !motion.matches); };
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; update(); }, {rootMargin:'60px'});
      observer.observe(stage);
    } else { visible = true; update(); }
    document.addEventListener('visibilitychange',update);
    const reset = () => { fx.style.removeProperty('--px'); fx.style.removeProperty('--py'); };
    motion.addEventListener('change',() => { reset(); update(); });
    mouse.addEventListener('change',reset);
    stage.addEventListener('pointermove',event => {
      if (!mouse.matches || motion.matches || !visible || event.pointerType !== 'mouse') return;
      const bounds = stage.getBoundingClientRect();
      const clamp = value => Math.max(-1,Math.min(1,value));
      fx.style.setProperty('--px',`${clamp((event.clientX - bounds.left) / bounds.width * 2 - 1) * 5}px`);
      fx.style.setProperty('--py',`${clamp((event.clientY - bounds.top) / bounds.height * 2 - 1) * 4}px`);
    }, {passive:true});
    stage.addEventListener('pointerleave',reset);
  });
})();
