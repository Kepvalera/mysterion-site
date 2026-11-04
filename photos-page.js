/* This page is an index of conference photo archives. */
(() => {
  const titles = {
    ru: 'Фотографии | MYSTERION',
    en: 'Photos | MYSTERION',
    de: 'Fotos | MYSTERION'
  };
  function updateTitle() {
    document.title = titles[document.documentElement.lang] || titles.ru;
  }
  window.addEventListener('mysterion:language', updateTitle);
  updateTitle();
})();
