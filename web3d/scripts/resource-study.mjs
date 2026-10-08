// Builds ../resource-identity-study.html: every environment's resource palette and its 4 layers of
// 3 minerals + 3 floating resources, drawn by the game's own code (FRGen, the ore engine and the
// resource-identity planner are cut out of the legacy build, so the sheet can't drift from the game).
//
//   node scripts/resource-study.mjs [../sewerdiverdescentcity12.html]
//
// Each region is located by exact anchors; a missing anchor aborts, like sync-legacy.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const src = process.argv[2] || here('../../sewerdiverdescentcity12.html');
const html = readFileSync(src, 'utf8').replace(/\r\n/g, '\n');
const lines = html.split('\n');
const starts = [], ends = [];
lines.forEach((l, i) => { if (l.trim() === '<script>') starts.push(i); if (l.trim() === '</script>') ends.push(i); });
const frgen = lines.slice(starts[0] + 1, ends[0]).join('\n');
const game = lines.slice(starts[1] + 1, ends[1]).join('\n');

function region(name, from, to, { inclusiveTo = false } = {}) {
  const a = game.indexOf(from);
  if (a < 0) throw new Error(`region "${name}": start anchor not found`);
  const b = game.indexOf(to, a + from.length);
  if (b < 0) throw new Error(`region "${name}": end anchor not found`);
  return game.slice(a, inclusiveTo ? b + to.length : b);
}
const util = region('util + ore engine + icons', '// ============ UTIL ============', 'function iconSVG(');
const arche = region('archetypes + city engine + resource identity', 'const ARCHETYPES={', '/* ---- IN-GAME APPLICATION');
const merge = region('archetype merge', 'Object.assign(ARCHETYPES,ARCHETYPES_EXT);', 'const EXT_BG_ON');

const study = String.raw`
const RES={}; let CITY_ID=0;
const sheet=document.getElementById('sheet');
const ORE_SCALE=4, FLT_SCALE=2;
// the environments a player meets: city 1's five, then each new one in the city it is introduced
const envs=[];
cityEnvList(1).forEach((k,i)=>envs.push({arch:k,city:1,pos:'city 1 · env '+(i+1)}));
introOrder().forEach((k,i)=>envs.push({arch:k,city:i+2,pos:'city '+(i+2)+' (new)'}));
let tierN=0;
window.__study={plans:[],riDist,riLab,RI_DISTINCT,RI_ORE_FAM,RI_FLOAT_FAM};   // for scripted audits
function groups(items){   // colour groups: items closer than RI_DISTINCT share a letter
  const lab=items.map(it=>riLab(it.col)), g=items.map(()=>-1); let n=0;
  for(let i=0;i<items.length;i++){if(g[i]>=0)continue;g[i]=n;
    for(let j=i+1;j<items.length;j++)if(g[j]<0&&riDist(lab[i],lab[j])<RI_DISTINCT)g[j]=n;n++;}
  return g.map(x=>String.fromCharCode(65+x));
}
function cell(canvas,label,sub,grp){
  const d=document.createElement('figure');d.className='it';d.appendChild(canvas);
  const c=document.createElement('figcaption');c.innerHTML='<b>'+grp+'</b> '+label+'<br><span>'+sub+'</span>';d.appendChild(c);return d;}
for(const e of envs){
  WORLD_SEED=0x53574452; CITY=e.city;   // the founding world seed (citySeed(0))
  const mod=variantFor(e.arch,e.city), a=ARCHETYPES[e.arch];
  const plan=riPlanEnv(e.arch,mod,(cvHash('ri:'+e.arch+':'+mod.key+':0')^0x5eed)>>>0,4);
  window.__study.plans.push({arch:e.arch,mod:mod.key,plan});
  const water=cvShift(a.water[1],mod.hue,mod.sat,mod.lit);
  const sec=document.createElement('section');sec.className='env';sec.style.setProperty('--water',water);
  sec.innerHTML='<h2>'+mod.tag+' '+a.name+' <small>'+e.pos+' · '+e.arch+'</small></h2>';
  const pal=document.createElement('div');pal.className='pal';
  for(const s of plan.palette){const w=document.createElement('i');w.style.background=s.hex;w.title=s.hex+' '+s.tier;
    w.dataset.t=s.tier[0];pal.appendChild(w);}
  sec.appendChild(pal);
  const gr=groups(plan.layers.flatMap(L=>L.raw)), gf=groups(plan.layers.flatMap(L=>L.mix));
  plan.layers.forEach((L,li)=>{
    const row=document.createElement('div');row.className='row';
    row.innerHTML='<div class="ln">L'+(li+1)+'</div>';
    const t=tierN++;THEME[t]={key:e.arch,oreShapes:{},floatForms:{}};
    const ore=document.createElement('div');ore.className='grp';
    L.raw.forEach((r,j)=>{const s='abc'[j],id='t'+(t+1)+'r'+s;RES[id]={col:r.col,kind:'raw'};THEME[t].oreShapes[s]=r.shape;
      const src=buildOreCanvas(id,0,'up'),cv=document.createElement('canvas');cv.width=16*ORE_SCALE;cv.height=16*ORE_SCALE;
      const c=cv.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(src,0,0,cv.width,cv.height);
      ore.appendChild(cell(cv,r.shape,r.col,gr[li*3+j]));});
    const flt=document.createElement('div');flt.className='grp';
    L.mix.forEach((m,j)=>{const s='abc'[j],id='t'+(t+1)+'m'+s;RES[id]={col:m.col,kind:'mix'};THEME[t].floatForms[s]=m.form;
      const spec=FRGen.make(e.arch,j,FRGen._hash(e.arch+':'+j),{form:m.form,col:m.col});
      const cv=document.createElement('canvas');cv.width=spec.w*FLT_SCALE;cv.height=spec.h*FLT_SCALE;
      const c=cv.getContext('2d');FRGen.blit(c,spec,0,0,FLT_SCALE);
      const f=cell(cv,m.form,m.col,gf[li*3+j]);
      const ico=document.createElement('div');ico.className='ico';ico.innerHTML=floatSVG(id,20);ico.title='pack icon';f.prepend(ico);
      flt.appendChild(f);});
    row.appendChild(ore);row.appendChild(flt);sec.appendChild(row);
  });
  sheet.appendChild(sec);
}
`;

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resource Identity Study</title>
<style>
:root{--bg:#0b1016;--fg:#d8e2ea;--mute:#7f93a3;--line:#22303c;}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#eef2f5;--fg:#16212b;--mute:#566877;--line:#c9d3db;}}
:root[data-theme="light"]{--bg:#eef2f5;--fg:#16212b;--mute:#566877;--line:#c9d3db;}
body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.4 system-ui,sans-serif;padding:16px;}
header{max-width:1100px;margin:0 auto 18px}
h1{font-size:20px;margin:0 0 6px}
header p{margin:4px 0;color:var(--mute);max-width:820px}
#sheet{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr));gap:14px;max-width:1700px;margin:0 auto}
.env{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:color-mix(in srgb,var(--water) 70%,var(--bg));color:#e4edf3}
.env h2{font-size:13px;margin:0 0 8px;letter-spacing:.04em}
.env h2 small{font-weight:400;color:#9db3c2;margin-left:6px;letter-spacing:0}
.pal{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px}
.pal i{width:18px;height:18px;border-radius:3px;position:relative}
.pal i::after{content:attr(data-t);position:absolute;inset:auto 0 -1px auto;font:9px monospace;color:#0008;padding:0 2px}
.row{display:flex;align-items:flex-start;gap:10px;margin-top:4px}
.ln{width:22px;color:#9db3c2;font:600 11px monospace;padding-top:26px}
.grp{display:flex;gap:6px;background:var(--water);padding:6px;border-radius:6px;flex:1;justify-content:space-around}
.it{margin:0;text-align:center;font:10px monospace;color:#c9d6df}
.it canvas{display:block;margin:0 auto;image-rendering:pixelated;height:64px;width:auto}
.it b{display:inline-block;min-width:13px;background:#ffffff22;border-radius:3px}
.it span{color:#8fa3b1}
.it{position:relative}
.it .ico{position:absolute;top:0;right:-4px;background:#0006;border-radius:4px;padding:1px;line-height:0}
</style></head><body>
<header><h1>Resource identity study</h1>
<p>Every environment's resource palette (swatch letters: <b>b</b>right, <b>d</b>eep, <b>p</b>ale, <b>n</b>eutral) and its four layers: three minerals (left, as the in-world ore tile) and three floating resources (right, as the FRGen sprite), each on the environment's water. The small badge on a float is its pack icon.</p>
<p>The letter before each name is its colour group within the environment, counted separately for minerals and floats. Items that share a letter look like the same colour, so their silhouettes must belong to different shape families.</p>
<p>Drawn by the game's own code from <code>sewerdiverdescentcity12.html</code>. One fixed seed: each new dive re-rolls the jitter, but the rules stay the same.</p></header>
<main id="sheet"></main>
<script>
${frgen}
</script>
<script>
(function(){
"use strict";
${util}
${arche}
${merge}
${study}
})();
</script>
</body></html>
`;
const out = here('../../resource-identity-study.html');
writeFileSync(out, page);
console.log('wrote', out, (page.length / 1024).toFixed(0) + ' KB');
