/* Procedural opening scene: no photograph, video, libraries, or runtime asset downloads. */
(() => {
  const hero = document.querySelector('.heavenly-hero');
  if (!hero) return;
  const canvas = hero.querySelector('canvas'), ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const emblem = hero.querySelector('.heavenly-emblem');
  // Approved crown cutout, with responsive image sources supplied by the HTML.
  const crown = emblem.querySelector('img');
  crown.addEventListener('load',() => { emblem.hidden=false; });
  crown.addEventListener('error',() => { emblem.hidden=true; });
  if (!ctx) return;
  const smooth = n => n*n*(3-2*n);
  const hash = (x,y) => { const n=Math.sin(x*127.1+y*311.7)*43758.5453; return n-Math.floor(n); };
  function noise(x,y) {
    const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);
    return (hash(ix,iy)*(1-fx)+hash(ix+1,iy)*fx)*(1-fy)+(hash(ix,iy+1)*(1-fx)+hash(ix+1,iy+1)*fx)*fy;
  }
  function fbm(x,y) { return noise(x,y)*.55+noise(x*2,y*2)*.28+noise(x*4,y*4)*.17; }
  function texture(w,h,pixel) {
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const painter=c.getContext('2d'),image=painter.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const rgba=pixel(x,y),i=(y*w+x)*4;
      image.data[i]=rgba[0];image.data[i+1]=rgba[1];image.data[i+2]=rgba[2];image.data[i+3]=rgba[3];
    }
    painter.putImageData(image,0,0);return c;
  }
  // Cloud opacity comes from layered continuous noise, not drawn oval shapes.
  const cloud = texture(384,192,(x,y) => {
    const n=fbm(x/43,y/32),edge=Math.sin(Math.PI*x/384)**.4*Math.sin(Math.PI*y/192)**1.5;
    const alpha=Math.max(0,Math.min(1,(n-.26)*2.8))*edge;
    return [251+n*4,251+n*4,255,alpha*225];
  });
  const planet = texture(360,360,(x,y) => {
    const nx=(x-180)/170,ny=(y-180)/170,r=nx*nx+ny*ny;
    if(r>=1)return [0,0,0,0];
    const z=Math.sqrt(1-r),n=fbm(nx*6+z*4+12,ny*7+z*2+9);
    const swirls=fbm(nx*14+n*4+8,ny*13+n*3+11);
    const cloudCover=Math.max(0,Math.min(1,(swirls-.44)*4));
    const light=.4+.6*Math.max(0,Math.min(1,-nx*.45-ny*.42+z*.78));
    const rim=(1-z)**5;
    const dissolve=1-smooth(Math.max(0,Math.min(1,(ny-.1)/.9)));
    return [(99+n*32+cloudCover*105)*light+rim*64,(149+n*25+cloudCover*65)*light+rim*58,(189+n*25+cloudCover*30)*light+rim*40,Math.min(1,(1-r)*80)*dissolve*255];
  });
  const stars=Array.from({length:150},(_,i)=>({x:((i+.5)*.6180339)%1,y:((i+.5)*.7548776)%1,size:.55+(i%4)*.35,phase:i*2.4,speed:.5+(i%6)*.18}));
  let width=0,height=0,dpr=1,time=0,progress=0,visible=false,frame=0,last=0;
  function draw() {
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const intro=reduced.matches?1:Math.min(1,.3+time/2.3);
    const size=Math.min(width*.9,720),px=width*(width<641?.48:.68)-size/2,py=-size*.23-progress*28;
    const atmosphere=ctx.createRadialGradient(px+size/2,py+size/2,size*.2,px+size/2,py+size/2,size*.64);
    atmosphere.addColorStop(0,'rgba(160,197,228,0)');atmosphere.addColorStop(.65,'rgba(244,220,162,.16)');atmosphere.addColorStop(.8,'rgba(145,195,230,.24)');atmosphere.addColorStop(1,'rgba(145,195,230,0)');
    ctx.globalAlpha=intro*.8;ctx.fillStyle=atmosphere;ctx.fillRect(px-size*.2,py-size*.2,size*1.4,size*1.4);
    ctx.globalAlpha=intro*.38;ctx.drawImage(planet,px+Math.sin(time*.025)*7,py,size,size);
    const count=width<641?80:150;
    stars.slice(0,count).forEach((s,i)=>{
      const alpha=(.18+(Math.sin(time*s.speed+s.phase)+1)*.23)*intro*(1-progress*.75)*(1-s.y*.7);
      const x=s.x*width+Math.sin(time*.05+s.phase)*2,y=s.y*height-progress*(8+i%3*5);
      ctx.globalAlpha=alpha;ctx.fillStyle=['#6281a6','#ab8850','#ffffff','#8591b1'][i%4];ctx.beginPath();ctx.arc(x,y,s.size,0,Math.PI*2);ctx.fill();
      if(i%37===0){const glow=(Math.sin(time*.4+s.phase)+1)*.5;ctx.globalAlpha=alpha*glow;ctx.strokeStyle='#aa8750';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x-6,y);ctx.lineTo(x+6,y);ctx.moveTo(x,y-6);ctx.lineTo(x,y+6);ctx.stroke();}
    });
    // Depth layers overlap; all cloud edges dissolve through their generated alpha.
    [[-.3,.03,1.5,.5,.7],[.15,.22,1.35,.38,-.45],[-.22,.58,1.6,.48,.9],[.05,.76,1.4,.38,-.7]].forEach(([x,y,w,h,speed],i)=>{
      ctx.globalAlpha=(i<2?.7:.9)*intro;
      ctx.drawImage(cloud,width*x+Math.sin(time*.03*speed+i)*width*.04,height*y-progress*(i+1)*12,width*w,height*h);
    });
    ctx.globalAlpha=1;
  }
  function tick(now) {
    frame=0;if(!visible||document.hidden||reduced.matches){hero.dataset.active='false';return;}
    if(now-last>1000/(width<641?16:24)){time+=Math.min((now-last)/1000,.1);last=now;draw();}
    frame=requestAnimationFrame(tick);
  }
  function sync() {
    if(frame)cancelAnimationFrame(frame);frame=0;last=performance.now();
    const active=visible&&!document.hidden&&!reduced.matches;hero.dataset.active=String(active);
    if(active)frame=requestAnimationFrame(tick);else if(reduced.matches)draw();
  }
  function resize() {
    width=hero.clientWidth;height=hero.clientHeight;dpr=Math.min(devicePixelRatio||1,width<641?1.25:1.5);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);draw();sync();
  }
  function scroll() {
    const r=hero.getBoundingClientRect();progress=reduced.matches?0:Math.max(0,Math.min(1,-r.top/Math.max(1,height)));
    hero.style.setProperty('--heavenly-fade',String(1-progress*.6));
    if(!('IntersectionObserver' in window)){visible=r.bottom>0&&r.top<innerHeight;sync();}
  }
  if('IntersectionObserver' in window){new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();}).observe(hero);}else{visible=true;}
  if('ResizeObserver' in window)new ResizeObserver(resize).observe(hero);else window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('scroll',scroll,{passive:true});document.addEventListener('visibilitychange',sync);
  reduced.addEventListener('change',()=>{scroll();draw();sync();});
  const about=document.getElementById('about');
  if(about&&'IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{if(entries[0].isIntersecting){about.querySelectorAll('.section-heading,.e-about-copy').forEach(n=>n.classList.add('heavenly-about-revealed'));observer.disconnect();}},{threshold:.12});observer.observe(about);}
  resize();scroll();
})();
