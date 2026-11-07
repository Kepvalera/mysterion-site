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
  if (founders && 'IntersectionObserver' in window) {
    let inView = false;
    const syncFounders = () => { founders.dataset.visible = String(inView && !document.hidden); };
    document.addEventListener('visibilitychange', syncFounders);
    const foundersObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        inView = entry.isIntersecting;
        syncFounders();
        if (entry.isIntersecting) founders.classList.add('founders-revealed');
      });
    }, {threshold:.08});
    foundersObserver.observe(founders);
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('e-revealed'); observer.unobserve(entry.target); } });
  },{threshold:.12});
  document.querySelectorAll('.e-archive').forEach(node => observer.observe(node));
})();
