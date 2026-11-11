/* Information only: no payment, account or administration requests. */
(() => {
  const copy = {
    ru: {
      sellerHeading:'Информация о продавце',
      sellerStatus:'Самозанятый, плательщик налога на профессиональный доход (НПД)',
      sellerTax:'ИНН: 503825148254',
      paymentLink:'Оплата и условия', contactsLink:'Контакты',
      paymentTitle:'Оплата и условия | MYSTERION INTERNATIONAL',
      paymentDescription:'Стоимость онлайн-школы MYSTERION — 30 000 ₽. Стоимость видеозаписей, информация о продавце и контакты.',
      paymentHeading:'Оплата и условия',
      paymentIntro:'Стоимость обучения и видеоматериалов MYSTERION INTERNATIONAL, информация о продавце и вопросы перед оплатой.',
      schoolHeading:'Онлайн-школа MYSTERION', schoolPrice:'30 000 ₽', schoolPriceLabel:'Стоимость обучения',
      schoolTermsHeading:'Условия обучения',
      schoolTuition:'Стоимость: 30 000 ₽.',
      schoolDuration:'Продолжительность обучения: 3 месяца.',
      schoolRecordingAccess:'Доступ к записям: 6 месяцев после окончания обучения.',
      recordingsHeading:'Записи и отдельные видео',
      recordingsPrice:'Записи конференций, семинаров и отдельные видео — стоимость будет указана при публикации соответствующих материалов.',
      conditionsHeading:'Перед оплатой',
      conditionsText:'Свяжитесь с продавцом, чтобы уточнить выбранный поток или материал, формат участия, даты начала занятий и порядок предоставления обучения или записей, а также условия отмены и возврата.',
      conditionsContact:'Вопросы о стоимости и условиях можно направить по указанным ниже контактам.',
      contactsTitle:'Контакты | MYSTERION INTERNATIONAL',
      contactsDescription:'Контакты MYSTERION INTERNATIONAL, информация о продавце и ссылка на стоимость обучения и условия оплаты.',
      contactsHeading:'Контакты',
      contactsIntro:'Свяжитесь с нами по вопросам онлайн-школы, видеоматериалов, стоимости и условий участия.',
      contactHeading:'Будем на связи', emailLabel:'Электронная почта', phoneLabel:'Телефон',
      costHeading:'Стоимость и условия',
      costText:'Онлайн-школа MYSTERION — 30 000 ₽. Стоимость записей конференций, семинаров и отдельных видео будет указана при публикации соответствующих материалов.',
      writeLink:'Написать нам', contactDetailsLink:'Все контакты и информация о продавце'
    },
    en: {
      sellerHeading:'Seller information',
      sellerStatus:'Self-employed, payer of professional income tax (NPD)',
      sellerTax:'Taxpayer identification number (INN): 503825148254',
      paymentLink:'Payment and terms', contactsLink:'Contact',
      paymentTitle:'Payment and terms | MYSTERION INTERNATIONAL',
      paymentDescription:'MYSTERION Online School tuition: RUB 30,000. Recording prices, seller information and contact details.',
      paymentHeading:'Payment and terms',
      paymentIntro:'MYSTERION INTERNATIONAL tuition and recording prices, seller information and questions before payment.',
      schoolHeading:'MYSTERION Online School', schoolPrice:'RUB 30,000', schoolPriceLabel:'Tuition fee',
      schoolTermsHeading:'School terms',
      schoolTuition:'Tuition fee: RUB 30,000.',
      schoolDuration:'Course duration: 3 months.',
      schoolRecordingAccess:'Access to recordings: 6 months after the course ends.',
      recordingsHeading:'Recordings and individual videos',
      recordingsPrice:'Prices for conference and seminar recordings and individual videos will be listed when the respective materials are published.',
      conditionsHeading:'Before payment',
      conditionsText:'Contact the seller to confirm your chosen cohort or material, participation format, class start dates and delivery of the school or recordings, as well as cancellation and refund terms.',
      conditionsContact:'Please use the contact details below for questions about prices and terms.',
      contactsTitle:'Contact | MYSTERION INTERNATIONAL',
      contactsDescription:'MYSTERION INTERNATIONAL contact details, seller information, tuition prices and payment terms.',
      contactsHeading:'Contact',
      contactsIntro:'Contact us about the online school, video materials, prices and participation terms.',
      contactHeading:'Get in touch', emailLabel:'Email', phoneLabel:'Phone',
      costHeading:'Prices and terms',
      costText:'MYSTERION Online School tuition: RUB 30,000. Prices for conference and seminar recordings and individual videos will be listed when the respective materials are published.',
      writeLink:'Send an email', contactDetailsLink:'All contact details and seller information'
    }
  };
  function translate() {
    const t = copy[document.documentElement.lang] || copy.ru;
    document.querySelectorAll('[data-commerce]').forEach(node => {
      const value = t[node.dataset.commerce];
      if (value !== undefined) node.textContent = value;
    });
    const page = document.body.dataset.commercePage;
    if (!['payment','contacts'].includes(page)) return;
    document.title = t[page+'Title'];
    document.querySelector('meta[name="description"]')?.setAttribute('content',t[page+'Description']);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content',t[page+'Title']);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content',t[page+'Description']);
  }
  window.addEventListener('mysterion:language',translate);
  // The existing catalog changes html.lang using its own language control.
  new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  translate();
})();
