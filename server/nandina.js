const fs = require("fs");
const path = require("path");
const http = require("http");
const iconv = require("iconv-lite");

const DATA_DIR = process.env.DATA_DIR || "./data";
const ADUANET = "http://www.aduanet.gob.pe/ol-ad-tg/ServletTGConsultaTablas";
const TABLES = ["NANDINA","NANDTASA","MRESTRI","DIMERPRO","TABLIBE"];

let _nandina=[], _restricciones={}, _prohibidas={}, _tlcs={};
let _lastUpdate=null, _lastCheck=null, _source="none";

function httpGet(url) {
  return new Promise((ok,fail) => {
    http.get(url,{timeout:60000},res=>{
      if(res.statusCode>=300&&res.statusCode<400&&res.headers.location) return httpGet(res.headers.location).then(ok).catch(fail);
      const c=[];res.on("data",d=>c.push(d));res.on("end",()=>ok(Buffer.concat(c)));res.on("error",fail);
    }).on("error",fail).on("timeout",function(){this.destroy();fail(new Error("Timeout"));});
  });
}

async function downloadTable(name) {
  try {
    const buf = await httpGet(`${ADUANET}?ptabla=${name}&accion=bajarTablas`);
    if(buf.length<500) return null;
    fs.writeFileSync(path.join(DATA_DIR,name+".TXT"),buf);
    console.log(`  ✓ ${name}: ${(buf.length/1024).toFixed(0)}KB`);
    return buf;
  } catch(e) { console.log(`  ✗ ${name}: ${e.message}`); return null; }
}

const decode = buf => iconv.decode(buf,"latin1");
const readF = name => { const p=path.join(DATA_DIR,name); return fs.existsSync(p)?fs.readFileSync(p):null; };

const AV_CH={"01":0,"02":0,"03":0,"04":0,"05":0,"06":0,"07":0,"08":0,"09":0,"10":0,"11":0,"12":0,"13":0,"14":0,"15":0,"16":6,"17":0,"18":6,"19":6,"20":6,"21":6,"22":6,"23":0,"24":6,"25":0,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0,"32":0,"33":6,"34":6,"35":0,"36":6,"37":6,"38":0,"39":6,"40":6,"41":0,"42":11,"43":11,"44":6,"45":6,"46":6,"47":0,"48":0,"49":0,"50":6,"51":0,"52":0,"53":0,"54":6,"55":6,"56":6,"57":11,"58":6,"59":0,"60":6,"61":11,"62":11,"63":11,"64":11,"65":11,"66":6,"67":6,"68":6,"69":6,"70":6,"71":0,"72":0,"73":6,"74":0,"75":0,"76":0,"78":0,"79":0,"80":0,"81":0,"82":6,"83":6,"84":0,"85":0,"86":0,"87":6,"88":0,"89":0,"90":0,"91":6,"92":6,"93":6,"94":6,"95":6,"96":6,"97":0};
const AV_4D={"1601":6,"1602":6,"2203":0,"2204":6,"2208":6,"8528":6,"8703":6,"8711":6,"4011":6,"9504":0};

function parseNandina(buf) {
  return decode(buf).split("\n").filter(l=>l.includes("99991231")).map(l=>{
    const f=l.split("\t"),p=f[0]?.trim(),d=f[1]?.trim();
    if(!p||p.length<4||!d) return null;
    return {p,d,a:AV_4D[p.substring(0,4)]??AV_CH[p.substring(0,2)]??0,g:16,i:0,s:1.5};
  }).filter(Boolean);
}

function mergeNandtasa(nandina,buf) {
  const m={};
  decode(buf).split("\n").filter(l=>l.includes("99991231")).forEach(l=>{
    const f=l.split("\t"),p=f[0]?.trim();
    if(p&&!m[p]) m[p]={a:parseInt(f[1])||0,g:parseInt(f[2])||0,i:parseInt(f[3])||0,s:parseFloat(f[7])||0};
    if(m[p]&&m[p].i>900) m[p].i=-1;
  });
  return nandina.map(r=>m[r.p]?{...r,...m[r.p]}:r);
}

function parseMrestri(buf) {
  const m={};
  decode(buf).split("\n").slice(1).forEach(l=>{
    const f=l.split("\t"),p=f[0]?.trim(),ent=f[1]?.trim(),reg=f[2]?.trim(),desc=f[3]?.trim();
    if(!p||p.length<4) return;
    if(!m[p]) m[p]=[];
    if(!m[p].find(r=>r.entidad===ent&&r.regimen===reg)) m[p].push({entidad:ent,regimen:reg,desc});
  });
  return m;
}

function parseDimerpro(buf) {
  const m={};
  decode(buf).split("\n").slice(1).forEach(l=>{
    const f=l.split("\t"),p=f[0]?.trim();
    if(p&&p.length>=4) m[p]={desc:f[1]?.trim()||"Prohibida"};
  });
  return m;
}

function parseTablibe(buf) {
  const m={};
  decode(buf).split("\n").slice(1).forEach(l=>{
    const f=l.split("\t"),p=f[0]?.trim(),pais=f[1]?.trim(),pref=parseFloat(f[2])||0,acuerdo=f[3]?.trim();
    const hasta=f[5]?.trim();
    if(!p||!pais||p.length<4) return;
    if(hasta&&hasta!=="99991231"&&parseInt(hasta)<20260101) return;
    const key=`${p}:${pais}`;
    if(!m[key]||pref>m[key].preferencia) m[key]={preferencia:pref,acuerdo,pais};
  });
  return m;
}

function detectChanges(oldD,newD) {
  const om={};oldD.forEach(r=>{om[r.p]=r;});const ch=[];
  newD.forEach(r=>{const o=om[r.p];if(!o)ch.push({type:"added",hs:r.p,desc:r.d});
  else{if(o.a!==r.a)ch.push({type:"av_changed",hs:r.p,desc:r.d,from:o.a,to:r.a});
  if(o.i!==r.i)ch.push({type:"isc_changed",hs:r.p,desc:r.d,from:o.i,to:r.i});}delete om[r.p];});
  Object.values(om).forEach(r=>ch.push({type:"removed",hs:r.p,desc:r.d}));return ch;
}

function buildFromFiles() {
  const nb=readF("NANDINA.TXT"); if(!nb) return 0;
  _nandina=parseNandina(nb);
  const tb=readF("NANDTASA.TXT"); if(tb) _nandina=mergeNandtasa(_nandina,tb);
  const mb=readF("MRESTRI.TXT"); if(mb) _restricciones=parseMrestri(mb);
  const db=readF("DIMERPRO.TXT"); if(db) _prohibidas=parseDimerpro(db);
  const lb=readF("TABLIBE.TXT"); if(lb) _tlcs=parseTablibe(lb);

  const out={nandina:_nandina,restricciones:_restricciones,prohibidas:_prohibidas,tlcs:_tlcs,buildDate:new Date().toISOString()};
  fs.writeFileSync(path.join(DATA_DIR,"nandina.json"),JSON.stringify(_nandina));
  fs.writeFileSync(path.join(DATA_DIR,"aduanet-full.json"),JSON.stringify(out));
  _lastUpdate=out.buildDate;

  console.log(`  [BUILD] ${_nandina.length} partidas · ${Object.keys(_restricciones).length} restricciones · ${Object.keys(_prohibidas).length} prohibidas · ${Object.keys(_tlcs).length} TLCs`);
  return _nandina.length;
}

module.exports = {
  getData:()=>_nandina, getRestricciones:()=>_restricciones, getProhibidas:()=>_prohibidas,
  getTLCs:()=>_tlcs, getLastUpdate:()=>_lastUpdate, getLastCheck:()=>_lastCheck, getSource:()=>_source,

  getRestriccion(hs) {
    const c=hs.replace(/\./g,"");
    for(const len of[10,8,6,4]){const k=c.substring(0,len).padEnd(10,"0");if(_restricciones[k])return _restricciones[k];}
    return null;
  },
  isProhibida(hs) {
    const c=hs.replace(/\./g,"");
    return _prohibidas[c]||_prohibidas[c.substring(0,8)+"00"]||null;
  },
  getTLCPreference(hs,country) {
    const c=hs.replace(/\./g,"");
    for(const len of[10,8,6,4]){const k=`${c.substring(0,len).padEnd(10,"0")}:${country}`;if(_tlcs[k])return _tlcs[k];}
    return null;
  },

  async init() {
    fs.mkdirSync(DATA_DIR,{recursive:true});
    // 1. Try full consolidated JSON
    try {
      const fp=path.join(DATA_DIR,"aduanet-full.json");
      if(fs.existsSync(fp)){const r=JSON.parse(fs.readFileSync(fp,"utf8"));
        if(r.nandina?.length>100){_nandina=r.nandina;_restricciones=r.restricciones||{};_prohibidas=r.prohibidas||{};_tlcs=r.tlcs||{};
        _lastUpdate=r.buildDate;_source="json-full";
        console.log(`[ADUANET] ✓ ${_nandina.length} partidas · ${Object.keys(_restricciones).length} restricciones · ${Object.keys(_tlcs).length} TLCs`);return;}}
    }catch(e){}
    // 2. Try simple nandina.json
    try {
      const sp=path.join(DATA_DIR,"nandina.json");
      if(fs.existsSync(sp)){const d=JSON.parse(fs.readFileSync(sp,"utf8"));
        if(Array.isArray(d)&&d.length>100){_nandina=d;_lastUpdate=new Date(fs.statSync(sp).mtime).toISOString();_source="json";
        console.log(`[ADUANET] ✓ ${_nandina.length} partidas (simple json)`);
        if(readF("MRESTRI.TXT")||readF("TABLIBE.TXT")){buildFromFiles();_source="json+txt";}return;}}
    }catch(e){}
    // 3. Try TXT files
    if(readF("NANDINA.TXT")){console.log("[ADUANET] Building from TXT...");buildFromFiles();_source="txt";if(_nandina.length>0)return;}
    // 4. Auto-download
    console.log("[ADUANET] No local data. Downloading from Aduanet...");
    await this.downloadAll();
  },

  async downloadAll() {
    let ok=0;
    for(const t of TABLES){if(await downloadTable(t))ok++;await new Promise(r=>setTimeout(r,2000));}
    if(ok>0){buildFromFiles();_source="auto-download";}
    console.log(`[ADUANET] Downloaded ${ok}/${TABLES.length} tables`);
    return ok;
  },

  async checkForUpdates() {
    _lastCheck=new Date().toISOString();
    const oldData=[..._nandina];
    let ok=0;
    for(const t of TABLES){if(await downloadTable(t))ok++;await new Promise(r=>setTimeout(r,2000));}
    if(ok===0) return{updated:false,reason:"download failed"};
    buildFromFiles();
    const changes=detectChanges(oldData,_nandina);
    return changes.length>0?{updated:true,count:_nandina.length,changes}:{updated:false};
  },
};
