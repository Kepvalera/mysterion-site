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
    let awakened = false;
    let buttonReady = false;
    function revealButton() {
      if (!buttonReady && (time >= 1.8 || reduced.matches)) {
        buttonReady = true;
        banner.dataset.ctaReady = 'true';
      }
    }
    const glowSprites = colors.map(color => {
      const sprite = document.createElement('canvas'); sprite.width = sprite.height = 48;
      const painter = sprite.getContext('2d');
      const gradient = painter.createRadialGradient(24,24,0,24,24,24);
      gradient.addColorStop(0,`rgba(${color},.8)`); gradient.addColorStop(.18,`rgba(${color},.3)`); gradient.addColorStop(1,`rgba(${color},0)`);
      painter.fillStyle = gradient; painter.fillRect(0,0,48,48); return sprite;
    });
    const haze = document.createElement('canvas');
    const hazeContext = haze.getContext('2d');
    function prepareHaze() {
      haze.width = 300; haze.height = 200;
      if (!hazeContext) return;
      [[.12,.4,'60,94,166'],[.8,.25,'122,74,160'],[.55,.88,'169,131,66']].forEach(([x,y,color]) => {
        const gradient = hazeContext.createRadialGradient(x*300,y*200,0,x*300,y*200,155);
        gradient.addColorStop(0,`rgba(${color},.4)`); gradient.addColorStop(1,`rgba(${color},0)`);
        hazeContext.fillStyle = gradient; hazeContext.fillRect(0,0,300,200);
      });
    }
    function flare(x,y,strength,size,color) {
      ctx.globalAlpha = strength;
      ctx.drawImage(glowSprites[color],x-size*2,y-size*2,size*4,size*4);
      ctx.fillStyle = `rgb(${colors[color]})`;
      ctx.beginPath(); ctx.moveTo(x,y-size); ctx.lineTo(x+1,y-1); ctx.lineTo(x+size*.7,y); ctx.lineTo(x+1,y+1); ctx.lineTo(x,y+size); ctx.lineTo(x-1,y+1); ctx.lineTo(x-size*.7,y); ctx.lineTo(x-1,y-1); ctx.closePath(); ctx.fill();
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
        const entrance = reduced.matches ? 1 : Math.min(1,Math.max(0,(time-star.delay)/.65));
        const opacity = (star.fade ? .08+Math.pow(wave,2)*.92 : .28+wave*.72)*entrance;
        const x = ((star.x+time*star.depth*.0008)%1)*width;
        const y = (star.y+Math.sin(time*.04+star.phase)*.003)*height;
        ctx.globalAlpha = opacity;
        if (star.radius > 1.2) ctx.drawImage(glowSprites[star.colorIndex],x-6,y-6,12,12);
        ctx.fillStyle = `rgb(${star.color})`;
        ctx.beginPath(); ctx.arc(x,y,star.radius,0,Math.PI*2); ctx.fill();
      });
      if (!reduced.matches && awakened) {
        // A single 1.8-second awakening wave, never restarted by scroll or resize.
        if (time < 1.8) {
          const progress = time/1.8, center = width*(-.25+progress*1.5);
          const wave = ctx.createLinearGradient(center-width*.22,0,center+width*.22,height*.15);
          wave.addColorStop(0,'rgba(236,203,133,0)'); wave.addColorStop(.5,'rgba(248,219,157,.3)'); wave.addColorStop(1,'rgba(236,203,133,0)');
          ctx.globalAlpha = Math.sin(Math.PI*progress); ctx.fillStyle = wave; ctx.fillRect(0,0,width,height);
          [.25,.7,1.05].forEach((start,index) => {
            const age=(time-start)/.7;
            if(age>0&&age<1)flare(width*(.12+index*.31),height*(.18+index*.25),Math.sin(Math.PI*age)*.85,12+index*3,index%2?0:3);
          });
        }
        // One soft flare every three seconds, with a new position each cycle.
        const cycle=Math.floor(Math.max(0,time-2)/3), age=(time-2)%3;
        if(time>=2&&age<1.25)flare(((cycle*.618+.16)%1)*width,((cycle*.754+.22)%1)*height,Math.sin(Math.PI*age/1.25)*.88,mobile?14:19,cycle%2?0:3);
        // Rare, short meteors. The entire trail stays behind the foreground.
        const meteorAge=(time-6)%12, meteorCycle=Math.floor((time-6)/12);
        if(time>=6&&meteorAge<1.15){
          const progress=meteorAge/1.15,x=width*(.2+(meteorCycle*.27)% .5)+progress*width*.24,y=height*.08+progress*height*.22;
          const length=mobile?55:100,tailX=x-length,tailY=y-length*.45;
          const trail=ctx.createLinearGradient(tailX,tailY,x,y);trail.addColorStop(0,'rgba(230,195,118,0)');trail.addColorStop(1,'rgba(255,235,189,.9)');
          ctx.globalAlpha=Math.sin(Math.PI*progress)*.85;ctx.strokeStyle=trail;ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(tailX,tailY);ctx.lineTo(x,y);ctx.stroke();
          ctx.fillStyle='#fff5df';ctx.beginPath();ctx.arc(x,y,1.5,0,Math.PI*2);ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    function tick(now) {
      frame = 0;
      if (!visible || document.hidden || reduced.matches) return;
      const interval = mobile ? 1000/20 : 1000/30;
      if (now-last >= interval) {
        time += Math.min((now-last)/1000,.1); last = now; draw(); revealButton();
      }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0; last = performance.now();
      banner.dataset.skyActive = String(visible && !document.hidden && !reduced.matches);
      revealButton();
      if (visible && !document.hidden && !awakened) {
        awakened = true;
        banner.dataset.skyAwake = 'true';
      }
      if (visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(tick);
      else if (reduced.matches && width) draw();
    }
    function resize() {
      width = banner.clientWidth; height = banner.clientHeight;
      if (!width || !height) return;
      mobile = width <= 640;
      pixelRatio = Math.min(devicePixelRatio || 1,mobile ? 1.25 : 1.5);
      canvas.width = Math.round(width*pixelRatio); canvas.height = Math.round(height*pixelRatio);
      const count = mobile ? 220 : Math.min(420,Math.max(300,Math.round(width*height/1900)));
      stars = Array.from({length:count},(_,index) => ({
        x:((index+.5)*.61803398875)%1, y:((index+.5)*.754877666)%1,
        depth:1+index%3, radius:.65+(index%4)*.3+(index%37===0?.35:0),
        phase:index*2.39996, speed:.65+(index%7)*.2, delay:(index%17)/17*1.1,
        color:colors[index%4],colorIndex:index%4,fade:index%5===0
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
