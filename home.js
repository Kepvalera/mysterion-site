/* Homepage editorial labels and progressive photo entrances. */
(() => {
  const copy = {
    ru:{biography:'История и видение служения',archive2024:'Конференция 2024',archive2025:'Конференция 2025'},
    en:{biography:'Our story and vision',archive2024:'Conference 2024',archive2025:'Conference 2025'},
    de:{biography:'Geschichte und Vision',archive2024:'Konferenz 2024',archive2025:'Konferenz 2025'}
  };
  Object.assign(copy.ru, {storyTitle:'Истории Божьих перемен',storyDescription:'Реальные свидетельства людей о том, как Бог действует в их жизни.',teachingDescription:'Проповеди, духовное наставничество и записи обучения.',gatheringsTitle:'Моменты наших встреч',gatheringsDescription:'Конференции, школы и события международного служения.'});
  Object.assign(copy.en, {storyTitle:'Stories of God’s transforming work',storyDescription:'Real testimonies of how God works in people’s lives.',teachingDescription:'Sermons, spiritual mentorship, and recorded teaching.',gatheringsTitle:'Moments from our gatherings',gatheringsDescription:'Conferences, schools, and events of our international ministry.'});
  Object.assign(copy.de, {storyTitle:'Geschichten von Gottes Wirken',storyDescription:'Echte Zeugnisse darüber, wie Gott im Leben von Menschen wirkt.',teachingDescription:'Predigten, geistliche Begleitung und Lehraufzeichnungen.',gatheringsTitle:'Momente unserer Begegnungen',gatheringsDescription:'Konferenzen, Schulen und Veranstaltungen unseres internationalen Dienstes.'});
  const translate = () => {
    const t = copy[document.documentElement.lang] || copy.ru;
    document.querySelectorAll('[data-editorial]').forEach(node => { node.textContent = t[node.dataset.editorial]; });
  };
  window.addEventListener('mysterion:language',translate); translate();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('e-revealed'); observer.unobserve(entry.target); } });
  },{threshold:.12});
  document.querySelectorAll('.e-founders-visual,.e-archive').forEach(node => observer.observe(node));
})();
