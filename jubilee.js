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
})();
