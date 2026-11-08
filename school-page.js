(() => {
  const copy = {
    ru: {title:'Онлайн-школа | MYSTERION INTERNATIONAL', description:'Онлайн-школа MYSTERION INTERNATIONAL. Четыре прошедших потока: 3, 4, 5 и 6, спикеры и материалы школы.', eyebrow:'MYSTERION INTERNATIONAL · ОНЛАЙН-ШКОЛА', head:'Онлайн-школа.', lead:'Четыре прошедших потока: 3, 4, 5 и 6 — отдельные наборы учеников. Выберите поток, чтобы перейти к его спикерам и материалам.', archive:'АРХИВ ШКОЛЫ', cohorts:'Прошедшие потоки', completed:'Завершён', open:'Открыть поток', back:'Все потоки', speakers:'Спикеры потока', empty:'Информация о спикерах скоро появится', emptyText:'Имена, фотографии и информация о спикерах будут добавлены после подтверждения командой школы.', photo:'Фотография скоро появится', lessons:'Уроки потока', pending:'Материалы потока будут добавлены позже.', nojs:'Для просмотра разделов потоков включите JavaScript.'},
    en: {title:'Online School | MYSTERION INTERNATIONAL', description:'MYSTERION INTERNATIONAL Online School. Four past cohorts: 3, 4, 5 and 6, speakers and school resources.', eyebrow:'MYSTERION INTERNATIONAL · ONLINE SCHOOL', head:'Online school.', lead:'Four past cohorts: 3, 4, 5 and 6 — separate student intakes. Select a cohort to explore its speakers and resources.', archive:'SCHOOL ARCHIVE', cohorts:'Past cohorts', completed:'Completed', open:'Explore cohort', back:'All cohorts', speakers:'Cohort speakers', empty:'Speaker information is coming soon', emptyText:'Speaker names, photographs and information will be added after confirmation by the school team.', photo:'Photograph coming soon', lessons:'Cohort lessons', pending:'Cohort resources will be added later.', nojs:'Enable JavaScript to explore the cohort sections.'}
  };
  Object.assign(copy.ru, {description:'Онлайн-школа MYSTERION INTERNATIONAL. Юбилейный поток 6 — 2027. Разделы потоков 3, 4 и 5.', lead:'Предстоящий юбилейный поток 6 — в 2027 году. Здесь также собраны разделы потоков 3, 4 и 5.', archive:'ОНЛАЙН-ШКОЛА', cohorts:'Потоки школы', upcoming:'Впереди · 2027'});
  Object.assign(copy.en, {description:'MYSTERION INTERNATIONAL Online School. Anniversary cohort 6 — 2027. Cohorts 3, 4 and 5.', lead:'The upcoming anniversary cohort 6 begins in 2027. Explore the sections for cohorts 3, 4 and 5 below.', archive:'ONLINE SCHOOL', cohorts:'School cohorts', upcoming:'Upcoming · 2027'});

  const data = window.MYSTERION_SCHOOL;
  const grid = document.getElementById('school-cohorts');
  const detail = document.getElementById('school-detail');
  const lang = () => copy[document.documentElement.lang] ? document.documentElement.lang : 'ru';
  const localized = value => value?.[lang()] || '';
  const element = (tag, className, text) => {
    const node = document.createElement(tag); node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  function photo(src, alt, className, position) {
    const wrap = element('div', className);
    const fallback = element('span', 'school-photo-placeholder', copy[lang()].photo);
    wrap.append(fallback);
    if (typeof src === 'string' && /^assets\/school\/[\w/.-]+\.(webp|png|jpe?g)$/i.test(src)) {
      const image = element('img', ''); image.src = src; image.alt = alt;
      image.loading = 'lazy'; image.style.objectPosition = position || 'center';
      image.addEventListener('load', () => { fallback.hidden = true; });
      image.addEventListener('error', () => image.remove());
      wrap.append(image);
    }
    return wrap;
  }
  function render(focus = false) {
    const t = copy[lang()];
    document.querySelectorAll('[data-school-text]').forEach(node => { node.textContent = t[node.dataset.schoolText]; });
    document.title = t.title;
    document.querySelector('meta[name="description"]').content = t.description;
    document.querySelector('meta[property="og:title"]').content = t.title;
    document.querySelector('meta[property="og:description"]').content = t.description;
    grid.replaceChildren();
    data.cohorts.forEach(cohort => {
      const card = element('a', 'school-cohort'); card.href = `#${cohort.id}`;
      if (cohort.status === 'upcoming') card.classList.add('school-cohort-upcoming');
      const top = element('div', 'school-card-top');
      top.append(element('span', 'school-cohort-number', String(cohort.number).padStart(2, '0')), element('span', 'school-status', cohort.status === 'upcoming' ? t.upcoming : t.completed));
      card.append(top);
      if (cohort.cover) card.append(photo(cohort.cover, localized(cohort.title), 'school-cover'));
      card.append(element('h3', '', localized(cohort.title)), element('span', 'school-card-link', `${t.open} ↗`));
      grid.append(card);
    });
    const selected = data.cohorts.find(cohort => `#${cohort.id}` === location.hash);
    detail.replaceChildren(); detail.hidden = !selected;
    grid.querySelectorAll('a').forEach(link => {
      if (selected && link.hash === location.hash) link.setAttribute('aria-current', 'location');
    });
    if (!selected) return;
    const back = element('a', 'text-arrow dark-arrow', `← ${t.back}`); back.href = '#cohorts';
    const heading = element('h2', '', localized(selected.title)); heading.id = 'cohort-heading'; heading.tabIndex = -1;
    detail.append(back, element('p', 'eyebrow', selected.status === 'upcoming' ? t.upcoming : t.completed), heading);
    if (selected.status === 'upcoming') {
      const announcement = element('a', 'btn btn-gold', t.open + ' · 2027 ↗'); announcement.href = '#jubilee-2027'; detail.append(announcement);
    }
    if (localized(selected.description)) detail.append(element('p', 'library-lead', localized(selected.description)));
    if (selected.dates.start) {
      const format = value => new Intl.DateTimeFormat(lang(), {dateStyle:'long', timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));
      detail.append(element('p', 'school-dates', format(selected.dates.start) + (selected.dates.end ? ` — ${format(selected.dates.end)}` : '')));
    }
    detail.append(element('h3', 'school-subheading', t.speakers));
    const speakers = selected.speakerIds.map(id => data.speakers.find(s => s.id === id)).filter(Boolean);
    if (!speakers.length) {
      const empty = element('div', 'school-empty');
      empty.append(element('span', 'school-empty-star', '✧'), element('h4', '', t.empty), element('p', '', t.emptyText)); detail.append(empty);
    } else {
      const list = element('div', 'school-speakers');
      speakers.forEach(speaker => {
        const card = element('article', 'school-speaker');
        card.append(photo(speaker.photo, localized(speaker.name), 'school-speaker-photo', speaker.photoPosition), element('h4', '', localized(speaker.name)), element('p', '', localized(speaker.bio))); list.append(card);
      }); detail.append(list);
    }
    detail.append(element('h3', 'school-subheading', t.lessons));
    if (selected.lessons.length) {
      const list = element('ol', 'school-lessons');
      selected.lessons.forEach(lesson => {
        const item = element('li', ''); item.append(element('h4', '', localized(lesson.title)), element('p', '', localized(lesson.description))); list.append(item);
      }); detail.append(list);
    } else detail.append(element('p', 'school-pending', t.pending));
    if (focus) { heading.focus({preventScroll:true}); detail.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block:'start'}); }
  }
  window.addEventListener('hashchange', () => render(true));
  window.addEventListener('mysterion:language', () => render());
  render(Boolean(location.hash && location.hash !== '#cohorts'));
})();
