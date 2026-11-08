/* Photo-only galleries; the original media catalogs and source files are retained. */
(() => {
  const copy = {
    ru: {conference:'Конференция', photos:'Фотографии', collection:'ФОТОАРХИВ', name2024:'«Мистерион».', name2025:'«Величие Царя в славе и изобилии».', lead:year => `Фотографии конференции ${year} года. Нажмите на фотографию, чтобы открыть её в увеличенном виде.`, photo:'Фотография конференции', open:'Увеличить фотографию', close:'Закрыть', viewer:'Просмотр фотографии'},
    en: {conference:'Conference', photos:'Photos', collection:'PHOTO ARCHIVE', name2024:'Mysterion.', name2025:'“The Majesty of the King in Glory and Abundance”.', lead:year => `Photos from the ${year} conference. Select a photo to view it in full size.`, photo:'Conference photo', open:'Enlarge photo', close:'Close', viewer:'Photo viewer'}
  };
  const year = document.body.dataset.conferenceYear;
  const grid = document.getElementById('archive-grid');
  const dialog = document.getElementById('media-viewer');
  const content = document.getElementById('viewer-content');
  const photos = (window[`MYSTERION_${year}`] || []).filter(item => item.type === 'photo');
  const labels = () => copy[document.documentElement.lang] || copy.ru;
  let selected = -1;

  function updateLanguage() {
    const t = labels();
    document.querySelectorAll('[data-archive-link]').forEach(link => {
      const number = link.dataset.archiveLink;
      const name = number === '2025' ? ` · ${t.name2025.replace(/\.$/, '')}` : '';
      link.textContent = `${t.conference} ${number}${name} · ${t.photos} ↗`;
    });
    if (!grid || !year) return;
    const text = {heading:`${t.conference} ${year}`, name:t[`name${year}`], lead:t.lead(year), collection:t.collection};
    document.querySelectorAll('[data-archive-text]').forEach(node => { node.textContent = text[node.dataset.archiveText]; });
    document.title = `${text.heading} · ${t.photos} | MYSTERION INTERNATIONAL`;
    for (const selector of ['meta[name="description"]','meta[property="og:description"]']) document.querySelector(selector)?.setAttribute('content',text.lead);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content',document.title);
    dialog.setAttribute('aria-label',t.viewer);
    dialog.querySelector('.viewer-close').setAttribute('aria-label',t.close);
    grid.querySelectorAll('.archive-item').forEach((button,index) => {
      button.setAttribute('aria-label',`${t.open} · ${year} · ${index + 1}`);
      button.querySelector('img').alt = `${t.photo} ${year} · ${index + 1}`;
    });
    const full = content.querySelector('img');
    if (full) full.alt = `${t.photo} ${year} · ${selected + 1}`;
  }

  if (grid && dialog && content && year) {
    photos.forEach((photo,index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'archive-item';
      button.setAttribute('aria-haspopup','dialog');
      const image = document.createElement('img');
      image.src = photo.src; image.loading = 'lazy'; image.decoding = 'async';
      button.append(image);
      button.addEventListener('click',() => {
        selected = index;
        const full = document.createElement('img');
        full.src = photo.src; full.alt = image.alt;
        content.replaceChildren(full);
        dialog.showModal();
      });
      grid.append(button);
    });
    dialog.querySelector('.viewer-close').addEventListener('click',() => dialog.close());
    dialog.addEventListener('click',event => {
      const bounds = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
    });
    dialog.addEventListener('close',() => { content.replaceChildren(); selected = -1; });
  }
  window.addEventListener('mysterion:language',updateLanguage);
  updateLanguage();
})();
