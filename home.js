/* Homepage editorial labels and progressive photo entrances. */
(() => {
  const copy = {
    ru:{foundersTitle:'Основатели служения',foundersNames:'Эдуард и Наталья Хестановы',biography:'История и видение служения',archive2024:'Конференция 2024',archive2025:'Конференция 2025'},
    en:{foundersTitle:'Ministry founders',foundersNames:'Eduard & Natalia Khestanov',biography:'Our story and vision',archive2024:'Conference 2024',archive2025:'Conference 2025'},
    de:{foundersTitle:'Gründer des Dienstes',foundersNames:'Eduard & Natalia Khestanov',biography:'Geschichte und Vision',archive2024:'Konferenz 2024',archive2025:'Konferenz 2025'}
  };
  Object.assign(copy.ru, {storyTitle:'Истории Божьих перемен',storyDescription:'Реальные свидетельства людей о том, как Бог действует в их жизни.',teachingDescription:'Проповеди, духовное наставничество и записи обучения.',gatheringsTitle:'Моменты наших встреч',gatheringsDescription:'Конференции, школы и события международного служения.'});
  Object.assign(copy.en, {storyTitle:'Stories of God’s transforming work',storyDescription:'Real testimonies of how God works in people’s lives.',teachingDescription:'Sermons, spiritual mentorship, and recorded teaching.',gatheringsTitle:'Moments from our gatherings',gatheringsDescription:'Conferences, schools, and events of our international ministry.'});
  Object.assign(copy.de, {storyTitle:'Geschichten von Gottes Wirken',storyDescription:'Echte Zeugnisse darüber, wie Gott im Leben von Menschen wirkt.',teachingDescription:'Predigten, geistliche Begleitung und Lehraufzeichnungen.',gatheringsTitle:'Momente unserer Begegnungen',gatheringsDescription:'Konferenzen, Schulen und Veranstaltungen unseres internationalen Dienstes.'});
  const translate = () => {
    const t = copy[document.documentElement.lang] || copy.ru;
    document.querySelectorAll('[data-editorial]').forEach(node => { node.textContent = t[node.dataset.editorial]; });
    document.querySelectorAll('#founders .founders-cutout').forEach(node => { node.alt = t.foundersNames; });
    const labels = {
      ru:['Корона служения Mysterion','Основная навигация','Мобильная навигация','Основные ценности'],
      en:['Mysterion ministry crown','Main navigation','Mobile navigation','Core values'],
      de:['Krone des Dienstes Mysterion','Hauptnavigation','Mobile Navigation','Grundwerte']
    }[document.documentElement.lang] || ['Корона служения Mysterion','Основная навигация','Мобильная навигация','Основные ценности'];
    document.querySelector('.heavenly-emblem img')?.setAttribute('alt',labels[0]);
    document.querySelector('.desktop-nav')?.setAttribute('aria-label',labels[1]);
    document.querySelector('.mobile-nav')?.setAttribute('aria-label',labels[2]);
    document.querySelector('.about-pillars')?.setAttribute('aria-label',labels[3]);
  };
  window.addEventListener('mysterion:language',translate); translate();
  const founders = document.getElementById('founders');
  if (founders) {
    const stars = founders.querySelector('.founders-stars');
    if (stars && !stars.childElementCount) {
      const positions = [[8,18],[91,13],[15,37],[85,32],[5,58],[94,52],[18,76],[82,73],[11,91],[91,87],[33,7],[73,5],[4,45],[97,65],[28,93],[75,95]];
      positions.forEach(([x,y], i) => {
        const star = document.createElement('span');
        star.className = 'founders-star';
        star.style.cssText = `--x:${x}%;--y:${y}%;--size:${i % 4 === 0 ? 3 : 2}px;--duration:${3.5 + i % 5}s;--delay:${-i * .7}s`;
        stars.append(star);
      });
    }
  }
  const events = document.getElementById('events');
  const scenes = [
    {node:founders,attribute:'visible',entered:'founders-revealed'},
    {node:document.getElementById('about'),attribute:'active'},
    {node:events,attribute:'active',entered:'events-entered'},
    {node:document.querySelector('.e-vision'),attribute:'active'},
    {node:document.getElementById('contacts'),attribute:'active'}
  ].filter(scene => scene.node);
  if (!('IntersectionObserver' in window)) return;
  // One observer and one visibility listener; reduced motion is handled by CSS,
  // so switching that preference later does not leave a section uninitialised.
  const syncScenes = () => scenes.forEach(scene => {
    scene.node.dataset[scene.attribute] = String(Boolean(scene.visible) && !document.hidden);
  });
  document.addEventListener('visibilitychange', syncScenes);
  const sceneObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const scene = scenes.find(item => item.node === entry.target);
      scene.visible = entry.isIntersecting;
      if (entry.isIntersecting && scene.entered) scene.node.classList.add(scene.entered);
    });
    syncScenes();
  }, {threshold:.04});
  scenes.forEach(scene => sceneObserver.observe(scene.node));
  // Reuse one entrance observer for the editorial components. Nothing is hidden
  // before observation, and each entrance runs once rather than on every scroll.
  const entranceObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add(entry.target.closest('#events') ? 'events-revealed' : 'e-revealed');
          entranceObserver.unobserve(entry.target);
        }
      });
    }, {threshold:.12});
  events?.querySelectorAll('.section-topline,.e-archive,.e-event').forEach(node => entranceObserver.observe(node));
  document.querySelectorAll('.e-direction,.e-media-row,.e-vision-content,.e-faq-items details,.e-contact-grid>div').forEach(node => {
    if (node.matches('.e-direction,.e-media-row,.e-faq-items details')) {
      const index = Array.from(node.parentElement.children).indexOf(node);
      node.style.setProperty('--entrance-delay', `${Math.min(index % 3,2) * 75}ms`);
    }
    entranceObserver.observe(node);
  });
})();
