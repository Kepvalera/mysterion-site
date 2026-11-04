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

  // One full-banner canvas, shared by the home page and the online school.
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.jubilee-banner').forEach(banner => {
    const sky = banner.querySelector('.jubilee-sky');
    if (!sky) return;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    sky.replaceChildren(canvas);
    const ctx = canvas.getContext('2d', {alpha:true});
    if (!ctx) return;
    const colors = ['242,246,255','196,208,229','167,203,245','231,202,144'];
    let width = 0, height = 0, stars = [], visible = false;
    let frame = 0, last = 0, time = 0, pixelRatio = 1, mobile = false;
    const haze = document.createElement('canvas');
    const hazeContext = haze.getContext('2d');
    function prepareHaze() {
      haze.width = 300; haze.height = 200;
      if (!hazeContext) return;
      [[.12,.4,'60,94,166'],[.8,.25,'122,74,160'],[.55,.88,'169,131,66']].forEach(([x,y,color]) => {
        const gradient = hazeContext.createRadialGradient(x*300,y*200,0,x*300,y*200,155);
        gradient.addColorStop(0,`rgba(${color},.22)`); gradient.addColorStop(1,`rgba(${color},0)`);
        hazeContext.fillStyle = gradient; hazeContext.fillRect(0,0,300,200);
      });
    }
    function draw() {
      ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
      ctx.clearRect(0,0,width,height);
      if (hazeContext) {
        ctx.globalAlpha = .85;
        ctx.drawImage(haze,-width*.1+Math.sin(time*.025)*width*.035,-height*.1+Math.cos(time*.02)*height*.025,width*1.2,height*1.2);
      }
      stars.forEach(star => {
        const wave = (1+Math.sin(time*star.speed+star.phase))/2;
        const opacity = star.fade ? Math.pow(wave,2)*.7 : .14+wave*.56;
        const x = ((star.x+time*star.depth*.0008)%1)*width;
        const y = (star.y+Math.sin(time*.04+star.phase)*.003)*height;
        ctx.globalAlpha = opacity;
        ctx.fillStyle = `rgb(${star.color})`;
        ctx.beginPath(); ctx.arc(x,y,star.radius,0,Math.PI*2); ctx.fill();
        if (star.flare) {
          const pulse = Math.pow(Math.max(0,Math.sin(time*.35+star.phase)),16);
          const size = 3+pulse*8;
          ctx.globalAlpha = pulse*.5;
          const glow = ctx.createRadialGradient(x,y,0,x,y,size*2);
          glow.addColorStop(0,`rgba(${star.color},.65)`); glow.addColorStop(1,`rgba(${star.color},0)`);
          ctx.fillStyle = glow; ctx.fillRect(x-size*2,y-size*2,size*4,size*4);
          ctx.fillStyle = `rgb(${star.color})`;
          ctx.beginPath(); ctx.moveTo(x,y-size); ctx.lineTo(x+.65,y-.65); ctx.lineTo(x+size,y); ctx.lineTo(x+.65,y+.65); ctx.lineTo(x,y+size); ctx.lineTo(x-.65,y+.65); ctx.lineTo(x-size,y); ctx.lineTo(x-.65,y-.65); ctx.closePath(); ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
    }
    function tick(now) {
      frame = 0;
      if (!visible || document.hidden || reduced.matches) return;
      const interval = mobile ? 1000/20 : 1000/30;
      if (now-last >= interval) {
        time += Math.min((now-last)/1000,.1); last = now; draw();
      }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0; last = performance.now();
      banner.dataset.skyActive = String(visible && !document.hidden && !reduced.matches);
      if (visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(tick);
      else if (reduced.matches && width) draw();
    }
    function resize() {
      width = banner.clientWidth; height = banner.clientHeight;
      if (!width || !height) return;
      mobile = width <= 640;
      pixelRatio = Math.min(devicePixelRatio || 1,mobile ? 1.25 : 1.5);
      canvas.width = Math.round(width*pixelRatio); canvas.height = Math.round(height*pixelRatio);
      const count = mobile ? 70 : Math.min(190,Math.max(110,Math.round(width*height/4200)));
      stars = Array.from({length:count},(_,index) => ({
        x:((index+.5)*.61803398875)%1, y:((index+.5)*.754877666)%1,
        depth:1+index%3, radius:.35+(index%3)*.32+(index%37===0?.4:0),
        phase:index*2.39996, speed:.28+(index%7)*.13,
        color:colors[index%4], fade:index%5===0, flare:index%47===0
      }));
      draw(); sync();
    }
    prepareHaze(); resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(banner);
    else window.addEventListener('resize',resize,{passive:true});
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); },{threshold:0}).observe(banner);
    } else {
      const check = () => { const rect = banner.getBoundingClientRect(); const next = rect.bottom>0 && rect.top<innerHeight; if (next!==visible) { visible=next; sync(); } };
      window.addEventListener('scroll',check,{passive:true}); window.addEventListener('resize',check,{passive:true}); check();
    }
    document.addEventListener('visibilitychange',sync);
    reduced.addEventListener('change',sync);
    window.addEventListener('pagehide',() => { visible=false; sync(); });
    window.addEventListener('pageshow',() => { const rect=banner.getBoundingClientRect(); visible=rect.bottom>0&&rect.top<innerHeight; sync(); });
  });
})();
