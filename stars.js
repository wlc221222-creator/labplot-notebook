/* A deterministic spiral galaxy. Drawing is limited to the visible header. */
(() => {
  'use strict';
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const header = canvas.parentElement;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let seed = 921938;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const tau = Math.PI * 2;
  const stars = Array.from({length:1900}, (_, i) => {
    const radius = Math.pow(random(), 0.68);
    const spread = (random()+random()+random()-1.5) * (0.12+radius*0.39);
    return {
      radius, angle: (i%3)*tau/3 + 4.8*Math.log(0.25+radius) + spread,
      lift: (random()+random()-1) * (0.017+radius*0.05),
      size: 0.36+random()**3*1.45, glow:0.25+random()*0.73,
      color: Math.floor(random()*5), phase:random()*tau
    };
  });
  const sky=Array.from({length:105},()=>({x:random(),y:random(),r:0.35+random()**3*1.05,a:0.15+random()*.64}));
  const colors=['#a4bcff','#7fe8ff','#d1b2ff','#ffffff','#6a83ff'];
  let width=0,height=0,ratio=1,frame=0,last=0,visible=true,phase=0,px=0,py=0;
  function halo(x,y,rx,ry,stops,tilt=0) {
    ctx.save();ctx.translate(x,y);ctx.rotate(tilt);ctx.scale(rx,ry);
    const grad=ctx.createRadialGradient(0,0,0,0,0,1);
    for(const [position,color] of stops) grad.addColorStop(position,color);
    ctx.fillStyle=grad;ctx.fillRect(-1,-1,2,2);ctx.restore();
  }
  function paint() {
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
    const compact=width<620, cx=width*(compact?.81:.755)+px*5, cy=height*(compact?.60:.53)+py*4;
    const R=compact?Math.min(width*.55,190):Math.min(width*.25,height*1.46,332);
    const tilt=-.22, cos=Math.cos(tilt), sin=Math.sin(tilt);
    ctx.globalAlpha=1;
    halo(cx,cy,R*1.48,R*.60,[[0,'#4254ae5c'],[.45,'#48399d44'],[1,'#35258000']],tilt);
    halo(cx+R*.30,cy-R*.08,R*.93,R*.36,[[0,'#146f9e63'],[.51,'#1857771e'],[1,'#0b305100']],tilt);
    for(const s of sky){
      ctx.globalAlpha=s.a;ctx.fillStyle='#ccd9ff';ctx.fillRect(s.x*width,s.y*height,s.r,s.r);
    }
    const count=compact?1100:stars.length;
    for(let i=0;i<count;i++){
      const s=stars[i],a=s.angle+phase*(.15+.15/(.15+s.radius));
      const rx=Math.cos(a)*s.radius*R, ry=(Math.sin(a)*s.radius*.42+s.lift)*R;
      const x=cx+rx*cos-ry*sin, y=cy+rx*sin+ry*cos;
      ctx.globalAlpha=s.glow*(.85+.15*Math.sin(phase*3+s.phase));
      ctx.fillStyle=colors[s.color];const size=s.size*(compact?.82:1);
      ctx.beginPath();ctx.arc(x,y,size,0,tau);ctx.fill();
      if(s.size>1.77 && i%8===0){ctx.globalAlpha*=.6;ctx.fillRect(x-3.5,y-.4,7,.8);ctx.fillRect(x-.4,y-3.5,.8,7);}
    }
    ctx.globalAlpha=1;
    halo(cx,cy,R*.27,R*.14,[[0,'#e6eaffde'],[.09,'#d5ddffcb'],[.28,'#a09bff7a'],[.65,'#7468ff2c'],[1,'#7161e600']],tilt);
    halo(cx,cy,23,15,[[0,'#fffffff5'],[.13,'#eff6ffcc'],[.5,'#a6baff4a'],[1,'#586eff00']],tilt);
  }
  function resize() {
    width=canvas.clientWidth;height=canvas.clientHeight;if(!width||!height)return;
    ratio=Math.min(devicePixelRatio||1,1.6);
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);paint();
  }
  function tick(time) {
    if(time-last>=40){phase+=Math.min((time-last)/1000,.08)*.14;last=time;paint();}
    frame=requestAnimationFrame(tick);
  }
  function play() {
    cancelAnimationFrame(frame);frame=0;
    if(!document.hidden && visible && !motion.matches){last=performance.now();frame=requestAnimationFrame(tick);}
    else if(width)paint();
  }
  header.addEventListener('pointermove',e=>{
    if(motion.matches || e.pointerType==='touch')return;
    const box=header.getBoundingClientRect();px=(e.clientX-box.left)/box.width-.5;py=(e.clientY-box.top)/box.height-.5;
  });
  header.addEventListener('pointerleave',()=>{px=0;py=0;});
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([item])=>{visible=item.isIntersecting;play();}).observe(header);
  document.addEventListener('visibilitychange',play);motion.addEventListener('change',play);resize();play();
})();
