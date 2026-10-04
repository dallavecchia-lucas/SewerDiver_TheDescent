// Pulls the latest legacy single-file build into web3d and cuts the theatre seams.
//
//   node scripts/sync-legacy.mjs [../sewerdiverdescentcity12.html]
//
// The legacy game stays the source of truth for gameplay: this script extracts its markup,
// the FRGen sprite generator and the game IIFE verbatim, then applies a short list of
// mechanical patches (each must match exactly the expected number of times, or the sync
// aborts so a changed legacy build can't silently lose a seam).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const srcPath = process.argv[2] ? process.argv[2] : here('../../sewerdiverdescentcity12.html');
const html = readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n');   // legacy builds are saved with CRLF
const lines = html.split('\n');

// ---- locate the two <script> blocks and the markup before them
const scriptStarts = [], scriptEnds = [];
lines.forEach((l, i) => { if (l.trim() === '<script>') scriptStarts.push(i); if (l.trim() === '</script>') scriptEnds.push(i); });
if (scriptStarts.length < 2) throw new Error('expected two <script> blocks (FRGen + game)');
const frgen = lines.slice(scriptStarts[0] + 1, scriptEnds[0]).join('\n');
const game0 = lines.slice(scriptStarts[1] + 1, scriptEnds[1]).join('\n');
let markupEnd = scriptStarts[0];
while (markupEnd > 0 && !lines[markupEnd - 1].includes('</div>')) markupEnd--;   // drop the FRGen banner comment
const markup = lines.slice(0, markupEnd).join('\n');

// ---- patches -------------------------------------------------------------------------
let game = game0;
function patch(name, from, to, count = 1) {
  const n = game.split(from).length - 1;
  if (n !== count) throw new Error(`patch "${name}": expected ${count} match(es), found ${n}`);
  game = game.split(from).join(to);
}

patch('ctx is routable',
  "const canvas=document.getElementById('c'), ctx=canvas.getContext('2d');",
  `const canvas=document.getElementById('c'), flatCtx=canvas.getContext('2d'); let ctx=flatCtx;
// ===== THEATRE SEAM (3D build) =====================================================
// The 3D build swaps \`ctx\` between the plastic plates of the flooded theatre (see
// web3d/src/theatre). Every draw function below is untouched: sw(k) just points the
// global ctx at plate k's region of the plate atlas. With no theatre, TH is null and
// every seam below is a no-op, so this file still runs as the flat game.
const TH=(typeof window!=='undefined'&&window.SD_THEATRE&&window.SD_THEATRE.enabled)?window.SD_THEATRE:null;
let GLK=3, TM=0;                  // plate the next glow belongs to · plate bleed in world px (0 = flat)
function sw(k){if(TH){ctx=TH.atlas.use(k);GLK=k;}}
function canvasPt(e){                 // pointer -> game-view px, through the bulb's optics when 3D
  if(TH&&TH.ready)return TH.clientToCard(e.clientX,e.clientY);
  const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)/r.width*VW,(e.clientY-r.top)/r.height*VH];}`);

patch('additive light goes to the emissive plate',
  'function radial(c,x,y,r,c0,c1){if(r<=0)return;',
  "function radial(c,x,y,r,c0,c1){if(r<=0)return;if(c.__em&&c.globalCompositeOperation==='lighter')c=c.__em;");

patch('glows remember their plate (gl)',
  'function gl(x,y,r,col,a){glows.push({x:Math.round(x-RCX),y:Math.round(y-RCY),r,col,a});}',
  'function gl(x,y,r,col,a){glows.push({x:Math.round(x-RCX),y:Math.round(y-RCY),r,col,a,k:GLK});}');
patch('glows remember their plate (glS)',
  'function glS(sx,sy,r,col,a){glows.push({x:Math.round(sx),y:Math.round(sy),r,col,a});}',
  'function glS(sx,sy,r,col,a){glows.push({x:Math.round(sx),y:Math.round(sy),r,col,a,k:GLK});}');

// background bands + tier dividers paint the plate bleed too (the back cloth must be a full plate)
patch('bg bands bleed (rows)',
  'const sy0=Math.max(0,e0-RCY),sy1=Math.min(VH,e1-RCY);',
  'const sy0=Math.max(-TM,e0-RCY),sy1=Math.min(VH+TM,e1-RCY);');
patch('bg bands bleed (clip)',
  'ctx.save();ctx.beginPath();ctx.rect(0,sy0,VW,sy1-sy0);ctx.clip();',
  'ctx.save();ctx.beginPath();ctx.rect(-TM,sy0,VW+2*TM,sy1-sy0);ctx.clip();');
patch('tier dividers bleed',
  "ctx.fillStyle='#0a1118';ctx.fillRect(0,y-3,VW,6);ctx.fillStyle='#1c2c38';ctx.fillRect(0,y-3,VW,1);ctx.fillStyle='#05080c';ctx.fillRect(0,y+2,VW,1);}",
  "ctx.fillStyle='#0a1118';ctx.fillRect(-TM,y-3,VW+2*TM,6);ctx.fillStyle='#1c2c38';ctx.fillRect(-TM,y-3,VW+2*TM,1);ctx.fillStyle='#05080c';ctx.fillRect(-TM,y+2,VW+2*TM,1);}");

// ---- render(): world -> plates
patch('render: frame kind',
  "function render(){\n  if(state.mode==='mine'){renderMine();return;}",
  "function render(){\n  if(TH)TH.frameKind='flat';\n  if(state.mode==='mine'){renderMine();return;}");
patch('render: sub mode routes too',
  "  if(state.mode==='sub'){renderSub();return;}\n",
  "  if(state.mode==='sub'){if(TH){TH.frameKind='sub';glows.length=0;}renderSub();if(TH){TH.atlas.end();ctx=flatCtx;TH.subFrame();}return;}\n  if(TH)TH.frameKind='world';\n");
patch('render: back cloth + scenery',
  "  ctx.fillStyle=w[2];ctx.fillRect(0,0,VW,VH);\n  drawBgWall();\n  drawScenery();\n",
  "  if(TH){TH.atlas.ensure(VW,VH);TH.atlas.beginWorld();TM=TH.margin;}\n" +
  "  sw(0);ctx.fillStyle=w[2];ctx.fillRect(-TM,-TM,VW+2*TM,VH+2*TM);\n  drawBgWall();\n" +
  "  if(TH){ctx=TH.atlas.em();drawBgGlow();}\n  sw(1);drawScenery();\n  sw(2);\n");
patch('render: rock bands bleed',
  'if(ey<0||sy>VH)continue;ctx.drawImage(getBandCanvas(i),-RCX,sy);}',
  'if(ey<-TM||sy>VH+TM)continue;ctx.drawImage(getBandCanvas(i),-RCX,sy);}');
patch('render: actors plate',
  '  for(const b of bulkheads)if(!b.open)drawBulkhead(b);\n',
  '  for(const b of bulkheads)if(!b.open)drawBulkhead(b);\n  sw(3);\n');
patch('render: bubbles + motes live in the real water',
  '  for(const q of particles)drawParticle(q);\n',
  "  for(const q of particles){if(TH&&q.type!=='spark')continue;drawParticle(q);}\n");
patch('render: real lights replace the murk',
  "  mctx.globalCompositeOperation='source-over';const mw=hex2rgb(w[2]);mctx.fillStyle='rgba('+(mw[0]*0.55|0)+','+(mw[1]*0.55|0)+','+(mw[2]*0.55|0)+',0.66)';mctx.fillRect(0,0,VW,VH);\n" +
  "  mctx.globalCompositeOperation='destination-out';\n" +
  "  const pgx=player.x+4-RCX,pgy=player.y+4-RCY;\n" +
  "  const lx=player.lookX||1,ly=player.lookY||0,LR=lanternRadius();\n" +
  "  const flick=1+Math.sin(state.tick*0.5)*0.015+Math.sin(state.tick*0.21)*0.02;  // subtle lantern flicker\n",
  "  const pgx=player.x+4-RCX,pgy=player.y+4-RCY;\n" +
  "  const lx=player.lookX||1,ly=player.lookY||0,LR=lanternRadius();\n" +
  "  const flick=1+Math.sin(state.tick*0.5)*0.015+Math.sin(state.tick*0.21)*0.02;  // subtle lantern flicker\n" +
  "  if(TH){sw(4);TH.drawForeground(ctx);TH.atlas.end();ctx=flatCtx;\n" +
  "    TH.lantern={x:pgx,y:pgy,lx,ly,R:LR*flick,half:LANT_HALF,self:SELF_R,mech:!!(mech&&mech.piloted)};}\n" +
  "  else{\n" +
  "  mctx.globalCompositeOperation='source-over';const mw=hex2rgb(w[2]);mctx.fillStyle='rgba('+(mw[0]*0.55|0)+','+(mw[1]*0.55|0)+','+(mw[2]*0.55|0)+',0.66)';mctx.fillRect(0,0,VW,VH);\n" +
  "  mctx.globalCompositeOperation='destination-out';\n");
patch('render: close the murk branch',
  "  radial(ctx,pgx,pgy,26,'rgba(120,175,235,0.10)','rgba(120,175,235,0)');\n  ctx.globalCompositeOperation='source-over';\n",
  "  radial(ctx,pgx,pgy,26,'rgba(120,175,235,0.10)','rgba(120,175,235,0)');\n  ctx.globalCompositeOperation='source-over';\n  }\n");
patch('render: prompt through the optics',
  "    const cw=canvas.clientWidth,ch=canvas.clientHeight;\n    const sx=(ptx-camera.x)/VW*cw+canvas.offsetLeft;\n    const sy=(pty-camera.y)/VH*ch+canvas.offsetTop;\n",
  "    let sx,sy;\n    if(TH&&TH.ready){const q=TH.viewToStage(3,ptx-RCX,pty-RCY);sx=q[0];sy=q[1];}\n" +
  "    else{const cw=canvas.clientWidth,ch=canvas.clientHeight;\n    sx=(ptx-camera.x)/VW*cw+canvas.offsetLeft;\n    sy=(pty-camera.y)/VH*ch+canvas.offsetTop;}\n");
patch('render: HUD printed on the glass',
  "  if(player.tint>0&&player.tintCol){ctx.fillStyle='rgba('+player.tintCol+','+(player.tint*0.22).toFixed(3)+')';ctx.fillRect(0,0,VW,VH);}\n  drawHUD(tier);\n}",
  "  if(TH)ctx=TH.atlas.beginHud();\n" +
  "  if(player.tint>0&&player.tintCol){ctx.fillStyle='rgba('+player.tintCol+','+(player.tint*0.22).toFixed(3)+')';ctx.fillRect(0,0,VW,VH);}\n  drawHUD(tier);\n" +
  "  if(TH){ctx=flatCtx;TH.worldFrame();}\n}");

// ---- renderSub(): the pipe run -> plates
patch('sub: back cloth',
  "  const T=subBandTop(), B=subBandBot();\n  // ---- the water in the main",
  "  const T=subBandTop(), B=subBandBot();\n  if(TH){TH.atlas.ensure(VW,VH);TH.atlas.beginWorld();TM=TH.margin;}\n  sw(0);\n  // ---- the water in the main");
patch('sub: water fill bleeds',
  "g.addColorStop(0,'#061218');g.addColorStop(0.55,'#0b2028');g.addColorStop(1,'#12211a');\n  ctx.fillStyle=g;ctx.fillRect(0,0,VW,VH);",
  "g.addColorStop(0,'#061218');g.addColorStop(0.55,'#0b2028');g.addColorStop(1,'#12211a');\n  ctx.fillStyle=g;ctx.fillRect(-TM,-TM,VW+2*TM,VH+2*TM);");
patch('sub: painted silt is replaced by real silt',
  '  for(let i=0;i<38;i++){\n    const sx=((i*97+subS.dist*1.6)%(VW+40))-20',
  '  for(let i=0;i<(TH?0:38);i++){\n    const sx=((i*97+subS.dist*1.6)%(VW+40))-20');
patch('sub: bore on the rock plate',
  '  for(let x=0;x<VW;x+=2){\n    const bo=subBoreAt(x+shx), wx=subScreenToWorld(x);',
  '  sw(2);\n  for(let x=-TM;x<VW+TM;x+=2){\n    const bo=subBoreAt(x+shx), wx=subScreenToWorld(x);');
patch('sub: lamps are real lights',
  "    radial(ctx,sx,bo.top+6,26,'rgba(255,186,90,'+(0.13*fl).toFixed(3)+')','rgba(255,186,90,0)');\n",
  "    radial(ctx,sx,bo.top+6,26,'rgba(255,186,90,'+(0.13*fl).toFixed(3)+')','rgba(255,186,90,0)');\n    if(TH)glS(sx,bo.top+6,40,'255,186,90',0.55*fl);\n");
patch('sub: actors plate',
  '  // ---- salvage\n',
  '  sw(3);\n  // ---- salvage\n');
patch('sub: bubbles live in the real water',
  '  for(const q of subS.bub){const a=clamp(q.life*2,0,1);',
  '  for(const q of (TH?[]:subS.bub)){const a=clamp(q.life*2,0,1);');
patch('sub: blasts are real lights',
  "    if(q.blast){const k=1-q.life/q.max;radial(",
  "    if(q.blast&&TH){const k=1-q.life/q.max;glS(q.x,q.y,q.r*(1+k*2),'255,180,90',1.2*(1-k));}\n    if(q.blast){const k=1-q.life/q.max;radial(");
patch('sub: no painted depth murk',
  "  ctx.globalCompositeOperation='multiply';\n  const vg=ctx.createLinearGradient(0,0,VW,0);",
  "  if(!TH){\n  ctx.globalCompositeOperation='multiply';\n  const vg=ctx.createLinearGradient(0,0,VW,0);");
patch('sub: close murk branch + HUD on glass',
  "  ctx.fillStyle=vg;ctx.fillRect(0,T,VW,B-T);\n  ctx.globalCompositeOperation='source-over';\n",
  "  ctx.fillStyle=vg;ctx.fillRect(0,T,VW,B-T);\n  ctx.globalCompositeOperation='source-over';\n  }\n  if(TH){TH.atlas.end();ctx=TH.atlas.beginHud();}\n");

// a node-only validation path the bundler would try to resolve (ARCH_ORDER always exists in-game)
patch('node-only require',
  "return require('./archetypes-60.js').ARCH_ORDER;",
  "throw new Error('ARCH_ORDER missing');   // (node-only validation path removed in the 3D build)");

// ---- pointer input goes back through the glass
patch('mine taps through optics',
  'const r=canvas.getBoundingClientRect();mineTapPx((e.clientX-r.left)/r.width*VW,(e.clientY-r.top)/r.height*VH);',
  'const q=canvasPt(e);mineTapPx(q[0],q[1]);');
patch('hack/flame aim through optics',
  'r=canvas.getBoundingClientRect(),mx=(e.clientX-r.left)/r.width*VW,my=(e.clientY-r.top)/r.height*VH',
  '_q=canvasPt(e),mx=_q[0],my=_q[1]', 2);

// ---- bridge: the theatre reads live game state (getters, because the game reassigns these)
patch('theatre bridge',
  '\ninit();\n})();',
  `
if(TH)TH.bind({
  get state(){return state;}, get player(){return player;}, get camera(){return camera;},
  get particles(){return particles;}, get glows(){return glows;}, get creatures(){return creatures;},
  get mech(){return mech;}, get subS(){return subS;}, get VW(){return VW;}, get VH(){return VH;},
  get RCX(){return RCX;}, get RCY(){return RCY;}, get map(){return map;}, get MW(){return MW;}, get MH(){return MH;},
  get floodFx(){return floodFx;}, get tierDry(){return tierDry;}, get THEME(){return THEME;}, get TIERS(){return TIERS;},
  get shake(){return shake;}, get tierTop(){return tierTop;},
  TS, SLUDGE, THERMAL, EMPTY, tAt, ambientAt, envOfTier, tileTypePx, solidPx, subBandTop, subBandBot,
  canvas, flatCtx,
});
init();
})();`);

writeFileSync(here('../src/legacy/frgen.js'), '// AUTO-SYNCED from the legacy build by scripts/sync-legacy.mjs — edit there, not here.\n' + frgen + '\n');
writeFileSync(here('../src/legacy/game.js'), '// AUTO-SYNCED from the legacy build by scripts/sync-legacy.mjs — edit the seams there, not here.\n' + game + '\n');
writeFileSync(here('../index.html'), markup + '\n<script type="module" src="./src/main.js"></script>\n</body>\n</html>\n');
console.log('synced', srcPath, '→ web3d (game', game.length, 'chars)');
