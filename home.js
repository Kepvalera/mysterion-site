/* Homepage editorial labels and progressive photo entrances. */
(() => {
  const copy = {
    ru:{biography:'История и видение служения',archive2024:'Конференция 2024',archive2025:'Конференция 2025'},
    en:{biography:'Our story and vision',archive2024:'Conference 2024',archive2025:'Conference 2025'},
    de:{biography:'Geschichte und Vision',archive2024:'Konferenz 2024',archive2025:'Konferenz 2025'}
  };
  const translate = () => {
    const t = copy[document.documentElement.lang] || copy.ru;
    document.querySelectorAll('[data-editorial]').forEach(node => { node.textContent = t[node.dataset.editorial]; });
  };
  window.addEventListener('mysterion:language',translate); translate();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('e-revealed'); observer.unobserve(entry.target); } });
  },{threshold:.12});
  document.querySelectorAll('.e-founders-visual,.e-archive,.e-media-image').forEach(node => observer.observe(node));
})();
