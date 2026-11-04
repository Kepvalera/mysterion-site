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
    document.querySelectorAll('#founders img').forEach(node => { node.alt = t.foundersNames; });
  };
  window.addEventListener('mysterion:language',translate); translate();
  const founders = document.getElementById('founders');
  // Bake volumetric cloud sprites once; only their transform/opacity animate afterwards.
  // Noise is the same lightweight value-noise approach used by heavenly.js.
  function paintFoundersClouds() {
    const smooth = n => n * n * (3 - 2 * n);
    const hash = (x,y) => { const n = Math.sin(x*127.1+y*311.7)*43758.5453; return n-Math.floor(n); };
    const noise = (x,y) => {
      const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);
      return (hash(ix,iy)*(1-fx)+hash(ix+1,iy)*fx)*(1-fy)+(hash(ix,iy+1)*(1-fx)+hash(ix+1,iy+1)*fx)*fy;
    };
    const fbm=(x,y)=>noise(x,y)*.55+noise(x*2,y*2)*.27+noise(x*4,y*4)*.13+noise(x*8,y*8)*.05;
    founders.querySelectorAll('.founders-cloud-depth canvas,.founders-cloud-front').forEach((canvas,seed)=>{
      const ctx=canvas.getContext('2d'); if(!ctx) return;
      const w=canvas.width,h=canvas.height,pixels=ctx.createImageData(w,h);
      const lobes=[[.13,.62,.14,.18],[.26,.48,.15,.25],[.42,.38,.18,.31],[.58,.47,.17,.26],[.73,.56,.17,.22],[.86,.64,.13,.15],[.46,.66,.34,.19]];
      for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
        const nx=x/w,ny=y/h,n=fbm(x/52+seed*11,y/48+seed*7);
        let field=-10,crest=0,weight=0;
        for(const [cx,cy,rx,ry] of lobes) {
          const dx=(nx-cx)/rx,dy=(ny-cy)/ry;
          const distance=dx*dx+dy*dy,value=1-distance;
          field=Math.max(field,value);
          const contribution=Math.exp(-distance*2.5);
          crest+=(cy-ny)/ry*contribution; weight+=contribution;
        }
        crest/=Math.max(.0001,weight);
        const density=field+(n-.5)*.85;
        const edge=Math.sin(Math.PI*nx)**.7*Math.sin(Math.PI*ny)**.5;
        const alpha=smooth(Math.max(0,Math.min(1,density*2.8)))*edge;
        const detail=fbm(x/23+seed*4,y/20);
        const light=Math.max(0,Math.min(1,.48+crest*.38+(n-.5)*.65+(detail-.5)*.25));
        const i=(y*w+x)*4;
        pixels.data[i]=180+75*light;
        pixels.data[i+1]=193+62*light;
        pixels.data[i+2]=222+33*light;
        pixels.data[i+3]=alpha*245;
      }
      ctx.putImageData(pixels,0,0);
      canvas.dataset.ready='true';
    });
  }
  if (founders) {
    paintFoundersClouds();
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
