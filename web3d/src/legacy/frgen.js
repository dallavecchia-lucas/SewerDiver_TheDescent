// AUTO-SYNCED from the legacy build by scripts/sync-legacy.mjs — edit there, not here.
/* =============================================================================
 * SEWER DIVER — Procedural Floating-Resource Sprite Generator
 * A sprite is fully described by (archetypeKey, variant 0..2, seed).
 *   const spec = FRGen.make('radioactive', 0, someSeed);
 *   FRGen.blit(ctx, spec, ox, oy, scale);
 * Sprites are authored on a 30x34 pixel grid, silhouette centred on x=15.
 * ========================================================================== */
(function (root) {
'use strict';

/* ---- archetype table: 65 entries, one per city environment ------------- */
var ARCH = [
{k:'cybersewer',id:'FR-01',n:'Coolant Canister',env:'CITY SEWERS',f:'canister',h:0},
{k:'swamp',id:'FR-02',n:'Bio-Slime Blob',env:'BIOCYBER SWAMP',f:'jelly',h:137.5},
{k:'radioactive',id:'FR-03',n:'Isotope Barrel',env:'RADIOACTIVE WASTE',f:'barrel',h:275},
{k:'datacentre',id:'FR-04',n:'Cache Core',env:'DEAD DATA CENTRE',f:'core',h:52.5},
{k:'filtration',id:'FR-05',n:'Backwash Canister',env:'FILTRATION STATION',f:'canister',h:190},
{k:'stormdrain',id:'FR-06',n:'Runoff Canister',env:'STORM DRAIN NETWORK',f:'canister',h:327.5},
{k:'metro',id:'FR-07',n:'Third-Rail Cell',env:'FLOODED METRO LINE',f:'cell',h:105},
{k:'foundry',id:'FR-08',n:'Quench Pod',env:'SUNKEN FOUNDRY RUN',f:'pod',h:242.6},
{k:'cryostack',id:'FR-09',n:'Cryo Bulb',env:'CRYO STORAGE STACKS',f:'bulb',h:20.1},
{k:'geothermal',id:'FR-10',n:'Sulfur Pod',env:'GEOTHERMAL EXCHANGE',f:'pod',h:157.6},
{k:'medbay',id:'FR-11',n:'Plasma Vial',env:'DROWNED MED-BAY',f:'vial',h:295.1},
{k:'brewery',id:'FR-12',n:'Wort Blob',env:'VAT BREWERY RUNOFF',f:'jelly',h:72.6},
{k:'fueldepot',id:'FR-13',n:'Octane Barrel',env:'FUEL DEPOT INTERCEPTOR',f:'barrel',h:210.1},
{k:'cryptomine',id:'FR-14',n:'Hash Core',env:'ABANDONED CRYPTO MINE',f:'core',h:347.6},
{k:'neonrunoff',id:'FR-15',n:'Phosphor Bulb',env:'NEON DISTRICT RUNOFF',f:'bulb',h:125.1},
{k:'arcology',id:'FR-16',n:'Greywater Canister',env:'ARCOLOGY GREYWATER CORE',f:'canister',h:262.6},
{k:'chopshop',id:'FR-17',n:'Coolant Pod',env:'CHOP-SHOP UNDERDRAIN',f:'pod',h:40.1},
{k:'vatfarm',id:'FR-18',n:'Protein Sac',env:'PROTEIN VAT FARM',f:'sac',h:177.6},
{k:'dyeworks',id:'FR-19',n:'Dye Wrap',env:'TEXTILE DYE WORKS',f:'cloth',h:315.1},
{k:'printworks',id:'FR-20',n:'Ink Canister',env:'OLD PRINT WORKS',f:'canister',h:92.7},
{k:'ewaste',id:'FR-21',n:'E-Waste Brick',env:'E-WASTE CRUSH PIT',f:'brick',h:230.2},
{k:'batteryfarm',id:'FR-22',n:'Leaky Cell',env:'LEAKING BATTERY FARM',f:'cell',h:7.7},
{k:'desal',id:'FR-23',n:'Halite Shard',env:'DESALINATION GALLERIES',f:'crystal',h:145.2},
{k:'algaefarm',id:'FR-24',n:'Algae Sac',env:'ALGAE BIOREACTOR FARM',f:'sac',h:282.7},
{k:'fungal',id:'FR-25',n:'Spore Blob',env:'MYCO-CELLAR WARREN',f:'jelly',h:60.2},
{k:'rendering',id:'FR-26',n:'Tallow Blob',env:'RENDERING PLANT OUTFALL',f:'jelly',h:197.7},
{k:'chemlab',id:'FR-27',n:'Reagent Vial',env:'CLANDESTINE CHEM-LAB SUMP',f:'vial',h:335.2},
{k:'pigment',id:'FR-28',n:'Pigment Blob',env:'PIGMENT REFINERY',f:'jelly',h:112.7},
{k:'glassworks',id:'FR-29',n:'Cullet Shard',env:'DROWNED GLASSWORKS',f:'crystal',h:250.2},
{k:'polymer',id:'FR-30',n:'Bioplastic Wrap',env:'POLYMER EXTRUSION HALLS',f:'cloth',h:27.7},
{k:'cablevault',id:'FR-31',n:'Cable Coil',env:'CABLE TRUNK VAULTS',f:'coil',h:165.2},
{k:'pneumatic',id:'FR-32',n:'Carrier Pod',env:'PNEUMATIC POST TUBES',f:'pod',h:302.7},
{k:'catacomb',id:'FR-33',n:'Bone-Lime Brick',env:'OLD-CITY CATACOMB GRID',f:'brick',h:80.3},
{k:'mallruin',id:'FR-34',n:'Fountain Canister',env:'FLOODED MEGAMALL SUBLEVEL',f:'canister',h:217.8},
{k:'parkade',id:'FR-35',n:'Sump-Oil Barrel',env:'SUNKEN PARKADE HELIX',f:'barrel',h:355.3},
{k:'substation',id:'FR-36',n:'Arc Cell',env:'DROWNED SUBSTATION',f:'cell',h:132.8},
{k:'tramdepot',id:'FR-37',n:'Overhead Coil',env:'TRAM DEPOT UNDERCROFT',f:'coil',h:270.3},
{k:'gasworks',id:'FR-38',n:'Coal-Tar Pod',env:'LEGACY GASWORKS',f:'pod',h:47.8},
{k:'oiltrap',id:'FR-39',n:'Grease Blob',env:'OIL INTERCEPTOR MAZE',f:'jelly',h:185.3},
{k:'overflow',id:'FR-40',n:'Refuse Sack',env:'COMBINED OVERFLOW CHAMBERS',f:'bag',h:322.8},
{k:'greasetrap',id:'FR-41',n:'Fatberg Sac',env:'FATBERG WARREN',f:'sac',h:100.3},
{k:'incinerator',id:'FR-42',n:'Ash Barrel',env:'INCINERATOR ASH SLUICE',f:'barrel',h:237.8},
{k:'isotope',id:'FR-43',n:'Technetium Vial',env:'MED-ISOTOPE DISPOSAL',f:'vial',h:15.3},
{k:'clonevats',id:'FR-44',n:'Amniotic Sac',env:'DECOMMISSIONED CLONE VATS',f:'sac',h:152.8},
{k:'cryonics',id:'FR-45',n:'Vitrified Bulb',env:'FAILED CRYONICS BANK',f:'bulb',h:290.4},
{k:'neurofarm',id:'FR-46',n:'Neuro-Gel Blob',env:'NEURAL LACE FARM',f:'jelly',h:67.9},
{k:'holograve',id:'FR-47',n:'Emitter Bulb',env:'HOLO-BILLBOARD GRAVEYARD',f:'bulb',h:205.4},
{k:'dronehive',id:'FR-48',n:'Rotor Core',env:'DERELICT DRONE HIVE',f:'core',h:342.9},
{k:'roboline',id:'FR-49',n:'Servo Core',env:'ROBOTICS DISASSEMBLY LINE',f:'core',h:120.4},
{k:'railgun',id:'FR-50',n:'Capacitor Cell',env:'RAIL-GUN TEST DRAIN',f:'cell',h:257.9},
{k:'coolant',id:'FR-51',n:'Glycol Canister',env:'DISTRICT COOLANT EXCHANGE',f:'canister',h:35.4},
{k:'maglev',id:'FR-52',n:'Halbach Coil',env:'MAG-LEV UNDERTRACK',f:'coil',h:172.9},
{k:'fibervault',id:'FR-53',n:'Fiber Coil',env:'DARK FIBER VAULT',f:'coil',h:310.4},
{k:'cistern',id:'FR-54',n:'Spring Shard',env:'ANCIENT CISTERN GRID',f:'crystal',h:87.9},
{k:'brinemine',id:'FR-55',n:'Rock-Salt Shard',env:'BRINE MINE GALLERIES',f:'crystal',h:225.4},
{k:'digester',id:'FR-56',n:'Biogas Sac',env:'METHANE DIGESTER FIELD',f:'sac',h:2.9},
{k:'compost',id:'FR-57',n:'Compost Sack',env:'COMPOST SLURRY BAYS',f:'bag',h:140.4},
{k:'mercury',id:'FR-58',n:'Quicksilver Vial',env:'MERCURY RECLAIM LINE',f:'vial',h:278},
{k:'plating',id:'FR-59',n:'Bright-Dip Bulb',env:'ELECTROPLATING CANALS',f:'bulb',h:55.5},
{k:'smelter',id:'FR-60',n:'Matte Pod',env:'SMELTER QUENCH PITS',f:'pod',h:193},
{k:'turbine',id:'FR-61',n:'Governor Cell',env:'DEAD TURBINE HALL',f:'cell',h:330.5},
{k:'pumpgallery',id:'FR-62',n:'Priming Canister',env:'GRAND PUMP GALLERY',f:'canister',h:108},
{k:'aquarium',id:'FR-63',n:'Exhibit Bulb',env:'RUINED CITY AQUARIUM',f:'bulb',h:245.5},
{k:'archive',id:'FR-64',n:'Vellum Brick',env:'SUNKEN PAPER ARCHIVE',f:'brick',h:23},
{k:'morgue',id:'FR-65',n:'Formalin Vial',env:'CRYO-MORGUE ANNEX',f:'vial',h:160.5}
];
var BY_KEY = {}; for (var i=0;i<ARCH.length;i++) BY_KEY[ARCH[i].k]=ARCH[i];
var FORMS = ['canister','barrel','bulb','jelly','pod','cell','coil','vial','crystal','brick','sac','cloth','bag','core'];

var GRID_W = 30, GRID_H = 34;

/* ---- colour helpers ----------------------------------------------------- */
function hsl(h,s,l){
  h=(((h%360)+360)%360)/360;
  if(s===0){var v=Math.round(l*255);return[v,v,v];}
  var q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
  function cv(t){t=(t+1)%1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p;}
  return [cv(h+1/3),cv(h),cv(h-1/3)].map(function(v){return Math.round(v*255);});
}
function sh(rgb,m){return 'rgb('+rgb.map(function(v){return Math.max(0,Math.min(255,Math.round(v*m)));}).join(',')+')';}
function rs(rgb){return 'rgb('+rgb.join(',')+')';}
function rng(seed){var s=seed>>>0;return function(){s=(s+0x6D2B79F5)>>>0;var t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function hash(str){var h=2166136261>>>0;for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}

function pal(hue,vi){
  var hj=[0,15,-13][vi], h=((hue+hj)%360+360)%360;
  var base=hsl(h,0.62,0.51);
  return { rgb:base, out:'#0a0f14',
    dk:sh(base,0.46), dk2:sh(base,0.70),
    base:rs(base), lt:sh(base,1.42), sp:sh(base,1.9),
    mtl:'#8a96a2', mtlD:'#586570', mtlL:'#c0ccd6',
    glow:hsl(h,0.95,0.62).join(','), haz:'#f2c53d' };
}
// Palette from an explicit resource colour (the game's per-layer colour plan): the colour IS the
// body, highlights mix toward white instead of multiplying, so a light colour keeps its hue.
function palCol(hex){
  hex=hex.replace('#','');
  var base=[parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)];
  function mixW(t){return 'rgb('+base.map(function(v){return Math.round(v+(255-v)*t);}).join(',')+')';}
  return { rgb:base, out:'#0a0f14',
    dk:sh(base,0.46), dk2:sh(base,0.70),
    base:rs(base), lt:mixW(0.32), sp:mixW(0.68),
    mtl:'#8a96a2', mtlD:'#586570', mtlL:'#c0ccd6',
    glow:base.join(','), haz:'#f2c53d' };
}

/* ---- form builders ------------------------------------------------------ */
function makeBuilder(px,P){
  function add(x,y,w,h,c){ if(w>0&&h>0&&c) px.push([x|0,y|0,w|0,h|0,c]); }
  function round(x,y,w,h,c){ add(x+1,y,w-2,1,c); add(x,y+1,w,h-2,c); add(x+1,y+h-1,w-2,1,c); }
  function vessel(x,y,w,h){
    round(x-1,y-1,w+2,h+2,P.out);
    round(x,y,w,h,P.dk);
    round(x+1,y,w-2,h,P.base);
    add(x+1,y+2,1,h-4,P.lt);
    add(x+2,y+2,1,Math.max(3,(h/2)|0),P.sp);
    add(x+1,y+h-4,w-2,1,P.dk2);
  }
  return { add:add, round:round, vessel:vessel };
}

var FORMFN = {
  canister:function(B,P,rng,vi){
    var w=vi===2?9:10, x=15-(w>>1), y=9, h=16;
    B.add(13,6,4,2,P.mtlD);B.add(13,5,4,1,P.mtl);B.add(14,4,2,1,P.mtlL);
    B.vessel(x,y,w,h);
    B.add(x+1,y+5,w-2,1,P.dk2);
    if(vi>=1){B.add(x+2,y+2,1,1,P.mtlL);B.add(x+w-3,y+2,1,1,P.mtlL);B.add(x+2,y+9,w-4,3,P.lt);B.add(x+3,y+10,w-6,1,P.dk);}
    if(vi===2){B.add(x+w-2,y+h,1,3,P.base);B.add(x+w-2,y+h+4,1,1,P.base);B.add(x+2,y+12,1,1,P.dk2);}
  },
  barrel:function(B,P,rng,vi){
    var w=12,x=15-(w>>1),y=8,h=18;
    B.round(x-1,y-1,w+2,h+2,P.out);
    B.round(x,y,w,h,P.dk);
    B.round(x+1,y,w-2,h,P.base);
    B.add(x+1,y+2,1,h-4,P.lt);
    var rows=[y+3,y+8,y+13];for(var r=0;r<3;r++){B.add(x,rows[r],w,1,P.dk2);B.add(x+1,rows[r]+1,w-2,1,P.lt);}
    B.add(x,y-1,w,2,P.mtlD);B.add(x+1,y-1,w-2,1,P.mtl);
    var by=y+9;B.add(x+1,by,w-2,3,'#0c0c0e');
    for(var iz=0;iz<w-2;iz+=2)B.add(x+1+iz,by,1,3,P.haz);
    if(vi>=1){B.add(x+3,y+3,w-6,4,P.dk2);B.add(x+4,y+4,w-8,2,P.haz);}
    if(vi===2){B.add(x+2,y+h,1,3,P.base);B.add(x+w-3,y+5,1,1,P.dk2);B.add(x+3,y+16,1,1,P.dk2);}
  },
  bulb:function(B,P,rng,vi){
    var cx=15,y=8,rr=vi===2?3:4;
    B.round(cx-rr-1,y-1,2*rr+2,2*rr+4,P.out);
    B.round(cx-rr,y,2*rr,2*rr+2,P.dk);
    B.round(cx-rr+1,y,2*rr-2,2*rr+2,P.base);
    B.add(cx-rr+1,y+1,1,2*rr,P.lt);
    B.add(cx-rr+2,y+1,2,2,P.sp);
    B.add(cx-2,y+2*rr+1,4,2,P.mtlD);B.add(cx-1,y+2*rr+3,2,2,P.mtlD);B.add(cx-2,y+2*rr+1,4,1,P.mtl);
    B.add(cx-1,y+rr,2,2,P.sp);
    if(vi>=1){B.add(cx-rr+1,y+rr+1,2*rr-2,1,P.dk2);}
    if(vi===2){B.add(cx+rr-1,y+2*rr+5,1,2,P.base);}
  },
  jelly:function(B,P,rng,vi){
    var cx=15,y=9;
    var rows=[[y,4],[y+1,6],[y+2,8],[y+3,8],[y+4,8],[y+5,7],[y+6,6],[y+7,5],[y+8,3]];
    for(var a=0;a<rows.length;a++)B.add(cx-(rows[a][1]>>1)-1,rows[a][0],rows[a][1]+2,1,P.out);
    for(var b=0;b<rows.length;b++)B.add(cx-(rows[b][1]>>1),rows[b][0],rows[b][1],1,P.dk);
    for(var c=0;c<rows.length;c++)B.add(cx-(rows[c][1]>>1)+1,rows[c][0],Math.max(1,rows[c][1]-2),1,P.base);
    B.add(cx-2,y+1,2,2,P.sp);B.add(cx-3,y+3,1,3,P.lt);
    B.add(cx+1,y+4,1,1,P.sp);B.add(cx,y+6,1,1,P.lt);
    B.add(cx,y+9,1,2,P.dk);B.add(cx,y+12,1,1,P.base);
    if(vi===1){B.add(cx+2,y+5,1,1,P.sp);}
    if(vi===2){B.add(cx-1,y+7,3,1,P.dk2);B.add(cx+2,y+9,1,2,P.base);}
  },
  pod:function(B,P,rng,vi){
    var y=9,h=14,w=5,xl=15-w-1,xr=15+1,xs=[xl,xr];
    for(var s=0;s<2;s++){var x=xs[s];
      B.round(x-1,y-1,w+2,h+2,P.out);
      B.round(x,y,w,h,P.dk);
      B.round(x+1,y,w-2,h,P.base);
      B.add(x+1,y+2,1,h-4,P.lt);
      B.add(x+1,y-2,w-2,2,P.mtlD);
    }
    B.add(14,y-1,3,h+2,P.mtlD);B.add(14,y-1,1,h+2,P.mtl);
    if(vi>=1){B.add(xl+1,y+3,w-2,1,P.dk2);B.add(xr+1,y+3,w-2,1,P.dk2);}
    if(vi===2){B.add(xr+w-2,y+h,1,3,P.base);}
  },
  cell:function(B,P,rng,vi){
    var w=10,x=15-(w>>1),y=8,h=18;
    B.add(x+1,y-2,3,2,P.mtlD);B.add(x+w-4,y-2,3,2,P.mtlD);B.add(x+1,y-2,3,1,P.mtl);
    B.round(x-1,y-1,w+2,h+2,P.out);
    B.round(x,y,w,h,P.dk);
    B.round(x+1,y,w-2,h,P.base);
    B.add(x+1,y+2,1,h-4,P.lt);
    B.add(x,y+6,w,5,P.dk2);B.add(x+1,y+7,w-2,1,P.base);
    B.add(x+2,y+2,1,1,P.sp);B.add(x+w-5,y+2,3,1,P.sp);B.add(x+w-4,y+1,1,3,P.sp);
    if(vi>=1){B.add(x+2,y+13,w-4,1,P.dk2);}
    if(vi===2){B.add(x+2,y-2,1,1,P.dk2);B.add(x+1,y+h,2,3,P.base);}
  },
  coil:function(B,P,rng,vi){
    var cx=15,cy=17,R=vi===2?6:7;
    B.round(cx-R-1,cy-R-1,2*R+2,2*R+2,P.out);
    B.round(cx-R,cy-R,2*R,2*R,P.dk);
    B.round(cx-R+1,cy-R+1,2*R-2,2*R-2,P.base);
    B.round(cx-R+2,cy-R+2,2*R-4,2*R-4,P.dk2);
    B.round(cx-R+3,cy-R+3,2*R-6,2*R-6,P.base);
    B.add(cx-1,cy-1,2,2,P.out);
    B.add(cx-R+2,cy-R+2,2,1,P.sp);
    if(vi>=1){B.add(cx+R-2,cy-1,3,1,P.lt);}
    if(vi===2){B.add(cx-R,cy+R,1,3,P.base);}
  },
  vial:function(B,P,rng,vi){
    var w=6,x=15-(w>>1),y=7,h=17;
    B.add(x,y-2,w,2,P.mtlD);B.add(x,y-3,w,1,P.mtlL);
    B.round(x-1,y-1,w+2,h+2,P.out);
    B.round(x,y,w,h,'#0d1a1f');
    var ly=y+6;B.round(x+1,ly,w-2,h-7,P.dk);B.round(x+1,ly,w-2,h-7,P.base);
    B.add(x+1,ly,w-2,1,P.lt);
    B.add(x+1,y+1,1,h-2,'rgba(255,255,255,0.22)');
    if(vi>=1){B.add(x+2,ly+2,1,1,P.sp);B.add(x+3,ly+4,1,1,P.sp);}
    if(vi===2){B.add(x+w-2,y+h,1,3,P.base);}
  },
  crystal:function(B,P,rng,vi){
    var cx=15,y=8;
    var rows=[[y,2],[y+1,4],[y+2,6],[y+3,8],[y+4,8],[y+5,6],[y+6,6],[y+7,4],[y+8,2]];
    for(var a=0;a<rows.length;a++)B.add(cx-(rows[a][1]>>1)-1,rows[a][0],rows[a][1]+2,1,P.out);
    for(var b=0;b<rows.length;b++)B.add(cx-(rows[b][1]>>1),rows[b][0],rows[b][1],1,P.dk);
    for(var c=0;c<rows.length;c++){var half=Math.max(1,rows[c][1]>>1);B.add(cx-half,rows[c][0],half,1,P.base);}
    B.add(cx-1,y+1,1,7,P.lt);
    B.add(cx-2,y+2,1,3,P.sp);
    if(vi!==2){B.add(cx+2,y+5,3,1,P.out);B.add(cx+3,y+3,2,1,P.dk);B.add(cx+3,y+4,2,3,P.base);B.add(cx+3,y+4,1,3,P.lt);}
    if(vi===2){B.add(cx-5,y+6,3,1,P.out);B.add(cx-4,y+5,1,3,P.base);B.add(cx-4,y+5,1,1,P.lt);}
  },
  brick:function(B,P,rng,vi){
    var w=13,x=15-(w>>1),y=10,h=13;
    B.add(x-1,y-1,w+2,h+2,P.out);
    B.add(x,y,w,h,P.dk);
    B.add(x+1,y+1,w-2,h-2,P.base);
    B.add(x+1,y+1,w-2,1,P.lt);B.add(x+1,y+1,1,h-2,P.lt);
    B.add(x+1,y+h-2,w-2,1,P.dk2);
    for(var iz=0;iz<6;iz++)B.add(x+2+((rng()*(w-4))|0),y+2+((rng()*(h-4))|0),1,1,rng()<0.5?P.dk2:P.sp);
    B.add(x+(w>>1)-1,y-1,2,h+2,P.mtlD);B.add(x+(w>>1)-1,y-1,1,h+2,P.mtl);
    if(vi>=1){B.add(x+2,y+2,w-4,1,P.dk2);}
    if(vi===2){B.add(x,y+3,2,1,P.dk2);B.add(x+w-2,y+h-3,2,1,P.dk2);}
  },
  sac:function(B,P,rng,vi){
    var cx=15,y=9;
    var rows=[[y,3],[y+1,5],[y+2,7],[y+3,9],[y+4,10],[y+5,10],[y+6,10],[y+7,9],[y+8,7],[y+9,4]];
    for(var a=0;a<rows.length;a++)B.add(cx-(rows[a][1]>>1)-1,rows[a][0],rows[a][1]+2,1,P.out);
    for(var b=0;b<rows.length;b++)B.add(cx-(rows[b][1]>>1),rows[b][0],rows[b][1],1,P.dk);
    for(var c=0;c<rows.length;c++)B.add(cx-(rows[c][1]>>1)+1,rows[c][0],Math.max(1,rows[c][1]-2),1,P.base);
    B.add(cx-1,y-2,2,2,P.dk);B.add(cx-1,y-2,1,2,P.mtl);
    B.add(cx-2,y+3,1,4,P.dk2);B.add(cx+2,y+2,1,5,P.dk2);
    B.add(cx-2,y+2,2,2,P.sp);
    if(vi>=1){B.add(cx,y+5,1,3,P.lt);}
    if(vi===2){B.add(cx+2,y+9,1,2,P.base);B.add(cx-3,y+5,1,1,P.dk2);}
  },
  cloth:function(B,P,rng,vi){
    var w=12,x=15-(w>>1),y=8;
    B.add(x-1,y-1,w+2,1,P.out);
    for(var r=0;r<13;r++){B.add(x-1,y+r,1,1,P.out);B.add(x+w,y+r,1,1,P.out);}
    B.add(x,y,w,12,P.base);
    B.add(x,y,w,2,P.dk);B.add(x+1,y,w-2,1,P.lt);
    for(var iz=1;iz<4;iz++){var fx=x+((iz*w/4)|0);B.add(fx,y+2,1,9,P.dk2);B.add(fx+1,y+2,1,9,P.lt);}
    for(var j=0;j<w;j++){var yy=y+12+((j%2)?1:0);B.add(x+j,y+12,1,1,P.out);B.add(x+j,yy,1,1,j%2?P.dk:P.base);}
    B.add(x+1,y+3,2,3,P.sp);
    if(vi===1){B.add(x+w-3,y+5,1,4,P.lt);}
    if(vi===2){B.add(x+2,y+8,3,1,P.dk2);B.add(x+5,y+6,2,1,P.dk2);}
  },
  bag:function(B,P,rng,vi){
    var cx=15,y=9;
    B.add(cx-2,y-2,4,1,P.dk);B.add(cx-1,y-1,2,2,P.dk2);B.add(cx-3,y-2,1,1,P.base);B.add(cx+2,y-2,1,1,P.base);
    var rows=[[y,4],[y+1,7],[y+2,9],[y+3,10],[y+4,11],[y+5,11],[y+6,11],[y+7,10],[y+8,9],[y+9,10],[y+10,8]];
    for(var a=0;a<rows.length;a++)B.add(cx-(rows[a][1]>>1)-1,rows[a][0],rows[a][1]+2,1,P.out);
    for(var b=0;b<rows.length;b++)B.add(cx-(rows[b][1]>>1),rows[b][0],rows[b][1],1,P.dk);
    for(var c=0;c<rows.length;c++)B.add(cx-(rows[c][1]>>1)+1,rows[c][0],Math.max(1,rows[c][1]-2),1,P.base);
    B.add(cx-3,y+3,1,3,P.dk2);B.add(cx+2,y+4,1,4,P.dk2);B.add(cx-1,y+8,1,2,P.dk2);
    B.add(cx-2,y+2,2,2,P.sp);
    if(vi>=1){B.add(cx+1,y+6,2,1,P.lt);}
    if(vi===2){B.add(cx-1,y+11,2,2,P.base);B.add(cx+3,y+7,1,1,P.dk2);}
  },
  core:function(B,P,rng,vi){
    var w=11,x=15-(w>>1),y=10,h=13;
    for(var iz=0;iz<4;iz++){B.add(x-2,y+2+iz*3,2,1,P.mtlD);B.add(x+w,y+2+iz*3,2,1,P.mtlD);}
    B.add(x-1,y-1,w+2,h+2,P.out);
    B.add(x,y,w,h,P.dk);
    B.add(x+1,y+1,w-2,h-2,P.dk2);
    B.add(x+3,y+3,w-6,h-6,P.dk);B.add(x+4,y+4,w-8,h-8,P.base);
    B.add(x+4,y+4,1,h-8,P.lt);
    B.add(x+2,y+2,1,h-4,P.dk2);B.add(x+w-3,y+2,1,h-4,P.dk2);
    B.add(x+2,y+2,1,1,P.sp);
    if(vi>=1){B.add(x+w-4,y+3,1,1,P.sp);B.add(x+4,y+h-4,w-8,1,P.dk2);}
    if(vi===2){B.add(x-2,y+2,1,1,P.dk2);B.add(x+1,y+h,2,2,P.base);}
  }
};

/* ---- public API --------------------------------------------------------- */

// Build the pixel spec for (archetypeKey, variant 0..2, seed).
// look (optional) = {form, col}: the layer's planned shape and '#rrggbb' colour for this
// resource; without it the archetype's own form and hue are used.
function make(key, variant, seed, look){
  var cfg = BY_KEY[key] || ARCH[0];
  var vi = ((variant|0)%3+3)%3;
  if(seed==null) seed = hash(cfg.k) ^ (0x9e3779b9*(vi+1));
  var r = rng(seed>>>0);
  var form = (look && FORMFN[look.form]) ? look.form : cfg.f;
  var P = (look && look.col) ? palCol(look.col) : pal(cfg.h, vi);
  var px = [];
  var B = makeBuilder(px, P);
  (FORMFN[form] || FORMFN.canister)(B, P, r, vi);
  return { px:px, glow:P.glow, w:GRID_W, h:GRID_H,
           phase:r()*6.283, bob:1+r()*0.9,
           name:cfg.n, id:cfg.id, env:cfg.env, form:form };
}

// Blit a spec onto a 2D context. Integer scale. (ox,oy) = top-left of the grid.
function blit(ctx, spec, ox, oy, scale){
  scale = scale||1;
  for(var i=0;i<spec.px.length;i++){
    var p = spec.px[i];
    ctx.fillStyle = p[4];
    ctx.fillRect(ox + p[0]*scale, oy + p[1]*scale, p[2]*scale, p[3]*scale);
  }
}

// Optional: paint the soft coloured glow behind the sprite (screen blend).
function glow(ctx, spec, cx, cy, radius, alpha){
  alpha = (alpha==null?0.6:alpha);
  var g = ctx.createRadialGradient(cx,cy,0,cx,cy,radius);
  g.addColorStop(0,   'rgba('+spec.glow+','+alpha+')');
  g.addColorStop(0.46,'rgba('+spec.glow+','+(alpha*0.24)+')');
  g.addColorStop(1,   'rgba('+spec.glow+',0)');
  var prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx,cy,radius,0,6.2832); ctx.fill();
  ctx.globalCompositeOperation = prev;
}

// Vertical bob offset in device pixels for a floater at time t (seconds).
function bobY(spec, t, scale){
  scale = scale||1;
  return Math.sin(t*2 + spec.phase) * spec.bob * scale * 1.3;
}

var API = { ARCH:ARCH, FORMS:FORMS, BY_KEY:BY_KEY, GRID_W:GRID_W, GRID_H:GRID_H,
            make:make, blit:blit, glow:glow, bobY:bobY,
            _hsl:hsl, _pal:pal, _rng:rng, _hash:hash };

if (typeof module!=='undefined' && module.exports) module.exports = API;
root.FRGen = API;

})(typeof window!=='undefined' ? window : this);
