/* ============================================================
   Pflanzenkenntnis · Prüfungslisten der grünen Berufe (BW)
   14 Profile (7 Fachrichtungen × Gärtner/Fachwerker), je eigene Liste,
   Schema und Notenschlüssel. Hinterlegte Seeds + Browser-Speicher
   (localStorage), Excel-Import (SheetJS). Offline, ohne Datenbank-Engine.
   ============================================================ */
"use strict";

/* ---------- kleine Helfer ---------- */
const $ = s => document.querySelector(s);
const el = (t,c) => { const e=document.createElement(t); if(c) e.className=c; return e; };
const esc = s => (s==null?"":String(s)).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
const norm = s => (s==null?"":String(s)).replace(/\s+/g," ").trim();
const KAT_ORDER = ["Gemüsepflanzen","Gewürzkräuter","Bei-, Wild- oder Unkräuter","Gründüngungspflanzen","Gehölze","Stauden","Zierpflanzen","Obstgehölze"];

/* ---- Bewertungsfelder (Spalten des Prüfungsbogens) ---- */
const FIELD_LABEL = { gattung:"Gattung", art:"Art", familie:"Familie", deutscher_name:"Deutscher Name" };
const FIELD_ORDER = ["gattung","art","familie","deutscher_name"];
/* Punkte hübsch: Dezimalkomma, keine überflüssige ,0 (z. B. 0,5 · 2 · 1,5) */
const fmtPts = n => (Math.round((+n||0)*100)/100).toString().replace(".",",");
/* dynamisch aus aktivem Prüfungsschema (profile-abhängig) */
function activeCols(){ return (schema&&schema.cols||[]).filter(c=>c.pts>0); }
function ptsPer(){ return activeCols().reduce((s,c)=>s+(c.pts||0),0); }
function drawTarget(){ return (schema&&schema.anzahl)||20; }

/* ---- Notenstufen (Label/Farbe) + IHK-Referenzwerte ----
   Die aktive Skala ist die lineare BW-Skala (scaleCfg); die IHK-Werte dienen
   nur dem optionalen Vergleichsmodus. */
const GRADE = [
  {stufe:1, min:92, hi:100, label:"sehr gut",     color:"#2b5138"},
  {stufe:2, min:81, hi:91,  label:"gut",          color:"#3d6b4d"},
  {stufe:3, min:67, hi:80,  label:"befriedigend", color:"#a9842b"},
  {stufe:4, min:50, hi:66,  label:"ausreichend",  color:"#b5762a"},
  {stufe:5, min:30, hi:49,  label:"mangelhaft",   color:"#c96a5a"},
  {stufe:6, min:0,  hi:29,  label:"ungenügend",   color:"#9c3b2e"}
];
const gradeFor = pct => GRADE.find(g=>pct>=g.min);
const thresholdPts = (min,max) => Math.ceil(min*max/100);
const clamp100 = v => Math.max(0,Math.min(100,v));
/* Offizielle IHK-Dezimalnote je Punktwert 0–100 (nur Vergleichsmodus) */
const DEZ = (()=>{
  const t={100:"1,0",99:"1,1",98:"1,1",97:"1,2",96:"1,2",95:"1,3",94:"1,3",93:"1,4",92:"1,4",91:"1,5",
    90:"1,6",89:"1,7",88:"1,8",87:"1,9",86:"2,0",85:"2,0",84:"2,1",83:"2,2",82:"2,3",81:"2,4",
    80:"2,5",79:"2,5",78:"2,6",77:"2,7",76:"2,8",75:"2,8",74:"2,9",73:"3,0",72:"3,0",71:"3,1",
    70:"3,2",69:"3,3",68:"3,3",67:"3,4",66:"3,5",65:"3,5",64:"3,6",63:"3,6",62:"3,7",61:"3,8",
    60:"3,8",59:"3,9",58:"3,9",57:"4,0",56:"4,0",55:"4,1",54:"4,2",53:"4,2",52:"4,3",51:"4,3",
    50:"4,4",49:"4,5",48:"4,5",47:"4,6",46:"4,6",45:"4,7",44:"4,7",43:"4,8",42:"4,8",41:"4,9",
    40:"4,9",39:"5,0",38:"5,0",37:"5,1",36:"5,1",35:"5,2",34:"5,2",33:"5,3",32:"5,3",31:"5,4",30:"5,4"};
  const a=new Array(101);
  for(let p=30;p<=100;p++) a[p]=t[p];
  for(let p=25;p<=29;p++) a[p]="5,5"; for(let p=20;p<=24;p++) a[p]="5,6";
  for(let p=15;p<=19;p++) a[p]="5,7"; for(let p=10;p<=14;p++) a[p]="5,8";
  for(let p=5;p<=9;p++) a[p]="5,9";   for(let p=0;p<=4;p++) a[p]="6,0";
  return a;
})();

/* ---- Prüfungsschema & Profile ----
   scaleCfg zeigt immer auf schema.scale des aktiven Profils. */
let schema = null;             // {anzahl, cols:[{key,pts}], scale:{mode,lin}}
let scaleCfg = { mode:"linear", lin:[90,70,50,30,10] };
let schemaOrder = null;        // Editor-Reihenfolge der Bewertungsfelder (Spaltenfolge)
function saveCfg(){ markDirty(); }

/* Standard-Prüfungsschema (Pflanzenkenntnis grüne Berufe, BW) */
function stdSchema(anzahl){
  return { anzahl, cols:[
    {key:"gattung",pts:3},{key:"art",pts:3},{key:"familie",pts:1},{key:"deutscher_name",pts:3}
  ], scale:{mode:"linear",lin:[90,70,50,30,10]} };
}
function cloneSchema(s){ return JSON.parse(JSON.stringify(s)); }

/* Die 7 Gärtner-Fachrichtungen (Baden-Württemberg) */
const FR_LIST = ["Baumschule","Friedhofsgärtnerei","Garten- und Landschaftsbau",
                 "Gemüsebau","Obstbau","Staudengärtnerei","Zierpflanzenbau"];
const NIVEAUS = [
  {key:"gaertner",   label:"Gärtner/in",    anzahl:20},
  {key:"fachwerker", label:"Fachwerker/in", anzahl:15}
];
function slug(s){ return s.toLowerCase()
  .replace(/[äöü]/g,m=>({"ä":"ae","ö":"oe","ü":"ue"}[m])).replace(/ß/g,"ss")
  .replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,""); }

/* Profil-Definitionen: id → {id, fr, niveauKey, niveau, anzahl, schema, seed} */
const PROFILE_DEFS = {};
FR_LIST.forEach(fr=>NIVEAUS.forEach(nv=>{
  const id=slug(fr)+"_"+nv.key;
  PROFILE_DEFS[id]={ id, fr, niveauKey:nv.key, niveau:nv.label, anzahl:nv.anzahl,
    schema:stdSchema(nv.anzahl), seed:(typeof SEEDS!=="undefined"&&SEEDS[id])||[] };
}));

/* ---- Profil-spezifische Schema-Overrides (Vorgabe der zuständigen Stelle) ----
   Greifen für frische Browser bzw. nach »Standardliste«; ein bereits im Browser
   gespeichertes Schema behält seine Kopie. Reihenfolge der cols = Spaltenreihenfolge
   auf dem Bogen.

   Bewertungsregeln (BW, zuständige Stelle):
   - Fachwerker/in (alle 7 Fachrichtungen): Deutscher Name 3, Gattung 0,5, Art 0,5
     = 4 P./Pflanze · 15 Pflanzen = 60 Punkte, Deutscher Name zuerst.
   - Gärtner/in Garten- und Landschaftsbau: Gattung 1, Art 1, Deutscher Name 2
     = 4 P./Pflanze · 20 Pflanzen = 80 Punkte.
   - Gärtner/in Produktionsfachrichtungen (Baumschule, Friedhofsgärtnerei,
     Gemüsebau, Obstbau, Staudengärtnerei, Zierpflanzenbau): Gattung 3, Art 3,
     Familie 1, Deutscher Name 3 = 10 P./Pflanze · 20 Pflanzen = 200 Punkte.
     Das ist bereits das Standardschema (stdSchema) – kein Override nötig. */
const LIN_SCALE = {mode:"linear",lin:[90,70,50,30,10]};
// Fachwerker/in – für alle sieben Fachrichtungen identisch
FR_LIST.forEach(fr=>{
  PROFILE_DEFS[slug(fr)+"_fachwerker"].schema = {
    anzahl:15, cols:[{key:"deutscher_name",pts:3},{key:"gattung",pts:0.5},{key:"art",pts:0.5}],
    scale:{mode:"linear",lin:LIN_SCALE.lin.slice()}
  };
});
// Gärtner/in · Garten- und Landschaftsbau
PROFILE_DEFS["garten_und_landschaftsbau_gaertner"].schema = {
  anzahl:20, cols:[{key:"gattung",pts:1},{key:"art",pts:1},{key:"deutscher_name",pts:2}],
  scale:{mode:"linear",lin:LIN_SCALE.lin.slice()}
};

let profileId="gemuesebau_gaertner";
/* lineare Notenbänder (Prozentbereiche je Stufe) aus den 5 Grenzen */
function linBands(G){
  const lo=[G[0],G[1],G[2],G[3],G[4],0], hi=[100,G[0],G[1],G[2],G[3],G[4]];
  return GRADE.map((g,i)=>({stufe:g.stufe,label:g.label,color:g.color,lo:lo[i],hi:hi[i]}));
}
/* stückweise lineare Dezimalnote (bei Standardgrenzen exakt die Gerade 6−5·%) */
function linDez(pct,G){
  const lo=[G[0],G[1],G[2],G[3],G[4],0], hi=[100,G[0],G[1],G[2],G[3],G[4]];
  for(let i=0;i<6;i++){ if(pct>=lo[i]){
    const span=(hi[i]-lo[i])||1; let dTop=(i+1)-0.5, dBot=(i+1)+0.5;
    if(i===0) dTop=1.0; if(i===5) dBot=6.0;
    return Math.max(1,Math.min(6, dBot-(dBot-dTop)*(pct-lo[i])/span));
  }}
  return 6.0;
}
const dez1 = d => d.toFixed(1).replace(".",",");
/* Note für erreichte Punkte je aktivem Modus */
function computeGrade(raw,max){
  const p=Math.max(0,Math.min(raw,max)), pct=max>0?p/max*100:0;
  if(scaleCfg.mode==="ihk"){
    const g=gradeFor(pct); let pr=Math.round(pct); while(pr>0 && gradeFor(pr).stufe<g.stufe) pr--;
    return {p,pct,stufe:g.stufe,label:g.label,color:g.color,dez:DEZ[clamp100(pr)]};
  }
  const b=linBands(scaleCfg.lin).find(x=>pct>=x.lo)||GRADE[5];
  return {p,pct,stufe:b.stufe,label:b.label,color:b.color,dez:dez1(linDez(pct,scaleCfg.lin))};
}

/* ---------- Zustand ---------- */
let cache=[];                 // alle Arten (Array von Objekten)
let nextId=1;                 // laufende ID-Vergabe
let selection=[];             // ids in Reihenfolge
let editId=null, pendingImport=null;
let exams=[];                 // gespeicherte Prüfungen (nach Prüfungsdatum), snapshot-basiert
let loadedExamId=null;        // aktuell in die Auswahl geladene Prüfung (für »Aktualisieren«)
let settings=null;            // globale Einstellungen (zuständige Stelle, Bogen-Titel …)

/* ---------- Toast ---------- */
let toastT=null;
function toast(msg, isErr){
  const t=$("#toast"); t.textContent=msg; t.classList.toggle("err",!!isErr); t.classList.add("show");
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"), 2600);
}

/* ============================================================
   Daten (reines JS-Array, im Browser gespeichert)
   ============================================================ */
function sortCache(){
  cache.sort((a,b)=> (a.gattung||"").localeCompare(b.gattung||"","de",{sensitivity:"base"})
                  || (a.art||"").localeCompare(b.art||"","de",{sensitivity:"base"}));
}
function syncSelection(){ const ids=new Set(cache.map(p=>p.id)); selection=selection.filter(id=>ids.has(id)); }
function refresh(){ sortCache(); syncSelection(); }

function markDirty(){ setStatus("dirty"); persist(); }

/* ---------- Browser-Speicher (localStorage, je Profil) ----------
   In Kiosk-/Sandbox-Umgebungen kann localStorage fehlen oder werfen. Dann greift
   ein flüchtiger In-Memory-Speicher, damit Änderungen wenigstens für die laufende
   Sitzung erhalten bleiben (statt eines harten Speicherfehlers). */
const LS_PREFIX="pflanzenkenntnis.";
const dataKey = id => LS_PREFIX+"data."+id;
const store = (()=>{
  let ok=false;
  try{ const k=LS_PREFIX+"__probe"; localStorage.setItem(k,"1"); localStorage.removeItem(k); ok=true; }catch(e){ ok=false; }
  const mem=new Map();
  return {
    get persistent(){ return ok; },
    get(k){ if(ok){ try{ return localStorage.getItem(k); }catch(e){ ok=false; } } return mem.has(k)?mem.get(k):null; },
    set(k,v){ v=String(v); if(ok){ try{ localStorage.setItem(k,v); return true; }catch(e){ ok=false; } } mem.set(k,v); return false; },
    remove(k){ if(ok){ try{ localStorage.removeItem(k); }catch(e){ ok=false; } } mem.delete(k); }
  };
})();
let persistTimer=null, isSeed=true;
function persist(){
  clearTimeout(persistTimer);
  persistTimer=setTimeout(()=>{
    const saved=store.set(dataKey(profileId), JSON.stringify({v:2,plants:cache,schema,nextId}));
    store.set(LS_PREFIX+"profile", profileId);
    isSeed=false; setStatus(saved?"saved":"session");
  },300);
}
function normPlant(p){
  return {id:p.id,gattung:p.gattung||"",art:p.art||"",familie:p.familie||"",
    deutscher_name:p.deutscher_name||"",kategorie:p.kategorie||"",zp:p.zp?1:0,
    synonyme:p.synonyme||"",bemerkungen:p.bemerkungen||""};
}
function seedInto(def){
  cache=def.seed.map((r,i)=>({id:i+1,gattung:r[0],art:r[1],familie:r[2],
    deutscher_name:r[3],kategorie:r[4],zp:r[5]?1:0,synonyme:r[6]||"",bemerkungen:""}));
  schema=cloneSchema(def.schema); scaleCfg=schema.scale; nextId=cache.length+1;
}
/* Profil laden (aus Browser-Speicher oder hinterlegtem Seed) */
function loadProfile(id){
  if(!PROFILE_DEFS[id]) id="gemuesebau_gaertner";
  profileId=id; const def=PROFILE_DEFS[id];
  selection=[]; schemaOrder=null; loadedExamId=null;
  let raw=store.get(dataKey(id));
  if(raw){
    try{
      const d=JSON.parse(raw);
      cache=(d.plants||[]).map(normPlant);
      schema=(d.schema&&Array.isArray(d.schema.cols))?d.schema:cloneSchema(def.schema);
      if(!schema.scale) schema.scale=cloneSchema(def.schema).scale;
      scaleCfg=schema.scale;
      nextId=d.nextId || (cache.reduce((m,p)=>Math.max(m,p.id),0)+1);
      isSeed=false; setStatus(store.persistent?"saved":"session");
    }catch(e){ seedInto(def); isSeed=true; setStatus("seed"); }
  }else{
    seedInto(def); isSeed=true; setStatus(cache.length?"seed":"empty");
  }
}
function switchProfile(id){
  loadProfile(id);
  store.set(LS_PREFIX+"profile", id);
  applyDrawDefault();
  refresh(); renderAll();
}

function resetToDefault(){
  const def=PROFILE_DEFS[profileId];
  const label=def.fr+" · "+def.niveau;
  if(!confirm(`Alle im Browser gespeicherten Änderungen für „${label}“ verwerfen und zur hinterlegten Liste zurückkehren?`)) return;
  store.remove(dataKey(profileId));
  seedInto(def); selection=[]; isSeed=true; schemaOrder=null;
  setStatus(cache.length?"seed":"empty"); refresh(); renderAll();
  toast(cache.length?"Standardliste wiederhergestellt":"Liste geleert (keine hinterlegten Daten)");
}

/* ---------- Backup als JSON-Datei ---------- */
function downloadText(text,name,mime){
  const url=URL.createObjectURL(new Blob([text],{type:mime||"application/json"}));
  const a=el("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
/* Sicherung enthält die aktuelle Profilliste UND die geräteweiten Daten:
   gespeicherte Prüfungen und Einstellungen (zuständige Stelle etc.). */
function backupData(){
  return { v:3, profile:profileId, exported:new Date().toISOString(),
    plants:cache, schema, nextId, exams, settings };
}
function applyBackup(d){
  if(!d||!Array.isArray(d.plants)) throw new Error("Format");
  cache=d.plants.map(normPlant);
  if(d.schema&&Array.isArray(d.schema.cols)){ schema=d.schema; if(!schema.scale) schema.scale=cloneSchema(PROFILE_DEFS[profileId].schema).scale; scaleCfg=schema.scale; }
  else if(d.scale&&d.scale.mode){ schema.scale=d.scale; scaleCfg=schema.scale; }
  nextId=d.nextId || (cache.reduce((m,p)=>Math.max(m,p.id),0)+1);
  // Geräteweite Daten wiederherstellen (rückwärtskompatibel: fehlt der Schlüssel
  // in älteren Sicherungen, bleibt der Bestand unangetastet).
  let exN=null;
  if(Array.isArray(d.exams)){ exams=d.exams; saveExams(); exN=d.exams.length; }
  if(d.settings&&typeof d.settings==="object"){ settings=Object.assign(defaultSettings(),d.settings); saveSettings(); }
  selection=[]; loadedExamId=null; markDirty(); refresh(); renderAll();
  return { plants:cache.length, exams:exN };
}
function exportBackup(){
  const d=new Date().toISOString().slice(0,10);
  downloadText(JSON.stringify(backupData(),null,0), `pflanzenliste_${profileId}_${d}.json`);
  toast(`Sicherung erstellt (${cache.length} Arten, ${exams.length} Prüfungen)`);
}
/* ---------- JSON laden: Sicherung ODER einzelne Prüfung, automatisch erkannt ----------
   Eine Prüfungs-JSON (aus »JSON« im Prüfungen-Panel) hat plants+date+schema, aber
   weder v noch profile – eine Gesamt-Sicherung hat v/profile. Früher fiel die
   Prüfungs-JSON fälschlich in applyBackup und ERSETZTE die Pflanzenliste. */
function isExamJson(d){
  return !!(d && Array.isArray(d.plants) && typeof d.date==="string"
    && d.schema && Array.isArray(d.schema.cols)
    && (d.profileId||d.fr) && d.v===undefined && d.profile===undefined);
}
/* Einzelne Prüfung in die gespeicherten Prüfungen übernehmen (Liste bleibt unberührt).
   Gleiche id bereits vorhanden → kein Duplikat, nur Hinweis. */
function importExamData(d){
  if(typeof d.id==="string" && exams.some(e=>e.id===d.id))
    return { dupe:true, count:d.plants.length, id:d.id };
  const plants=d.plants.map(p=>({gattung:norm(p.gattung||""),art:norm(p.art||""),familie:norm(p.familie||""),
    deutscher_name:norm(p.deutscher_name||""),kategorie:norm(p.kategorie||""),zp:p.zp?1:0}))
    .filter(p=>p.gattung||p.deutscher_name);
  if(!plants.length) throw new Error("leer");
  const def=PROFILE_DEFS[d.profileId]||PROFILE_DEFS[profileId];
  const ex={ id:(typeof d.id==="string"&&d.id)?d.id:"ex"+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36),
    savedAt:new Date().toISOString(),
    date:/^\d{4}-\d{2}-\d{2}$/.test(d.date)?d.date:todayISO(),
    profileId:PROFILE_DEFS[d.profileId]?d.profileId:profileId,
    fr:norm(d.fr||def.fr), niveau:norm(d.niveau||def.niveau), label:norm(d.label||""),
    plants, schema:(d.schema&&Array.isArray(d.schema.cols))?d.schema:cloneSchema(schema) };
  exams.unshift(ex); saveExams(); renderExams(); syncExamControls();
  return { dupe:false, count:plants.length, id:ex.id, date:ex.date };
}
function importJsonData(d){
  if(isExamJson(d)) return Object.assign({type:"exam"}, importExamData(d));
  if(d && Array.isArray(d.plants)){
    // Gesamt-Sicherung: erst zum gesicherten Profil wechseln, dann anwenden –
    // sonst würde still die Liste des gerade aktiven Profils überschrieben.
    if(d.profile && d.profile!==profileId && PROFILE_DEFS[d.profile]){
      switchProfile(d.profile);
      $("#frSelect").value=slug(PROFILE_DEFS[d.profile].fr);
      $("#nivSelect").value=PROFILE_DEFS[d.profile].niveauKey;
    }
    return Object.assign({type:"backup"}, applyBackup(d));
  }
  throw new Error("Format");
}
function importJsonFile(){
  const inp=el("input"); inp.type="file"; inp.accept=".json,application/json";
  inp.onchange=async()=>{
    const f=inp.files[0]; if(!f) return;
    try{
      const r=importJsonData(JSON.parse(await f.text()));
      if(r.type==="exam"){
        if($("#examsPanel").hasAttribute("hidden")) toggleExams();
        toast(r.dupe
          ? `Diese Prüfung ist bereits gespeichert (${r.count} Pflanzen)`
          : `Prüfung importiert (${r.count} Pflanzen · ${fmtDate(r.date)}) – unten »Laden« drücken`);
      }else{
        toast(`Sicherung geladen: ${r.plants} Arten`+(r.exams!=null?`, ${r.exams} Prüfungen`:""));
      }
    }catch(e){ toast("Keine gültige .json-Datei (weder Sicherung noch Prüfung)",true); }
  };
  inp.click();
}

/* ---------- Status ---------- */
function setStatus(s){
  const dot=$("#dbdot"), name=$("#dbname");
  const map={
    seed:   ["dot",       "Standardliste · hinterlegte Daten"],
    empty:  ["dot",       "Keine hinterlegte Liste · Excel importieren"],
    dirty:  ["dot dirty", "Browser-Speicher · sichert …"],
    saved:  ["dot saved", "Im Browser gespeichert"],
    session:["dot dirty", "Nur diese Sitzung · Browser-Speicher nicht verfügbar"],
    err:    ["dot dirty", "Speichern fehlgeschlagen"]
  };
  const [cls,txt]=map[s]||map.seed;
  dot.className=cls; name.textContent=txt;
}

/* ============================================================
   Excel-Import (intelligent)
   ============================================================ */
const HEAD = {
  botanisch:/(botan|wissensch|lateinisch|bot\.?\s*name|artname)/i,
  deutsch:/(deutsch|trivial|dt\.?\s*name)/i,
  familie:/(familie|family)/i,
  zp:/^zp\.?$|^p$|^fw$|pr(ü|ue)fung|zwischenpr|fachwerk/i,
  synonyme:/(synonym)/i,
  gattung:/^gattung$|genus/i,
  art:/^art$|epitheton|species/i,
  sorte:/^sorte$|^sorten|kultivar|cultivar/i,
  kategorie:/^kategorie$|^verwendung$/i
};
// Titel-/Fuß-/Quellzeilen, die weder Datenzeile noch Kategorie sind
const isNoise = s => /^(https?:|stand[:\s]|quelle|pflanzenliste)/i.test(norm(s));
function tidyName(s){ s=norm(s); s=s.replace(/\b(var|subsp|ssp|f|cv|convar)\.(?=\S)/g,"$1. "); return norm(s); }
function splitBinomial(bot){ bot=tidyName(bot); if(!bot) return {gattung:"",art:""}; const p=bot.split(" ");
  // Nothogattung (Hybrid-Gattung): führendes ×/x an die Gattung binden
  if(p.length>=2 && /^[x×]$/i.test(p[0])) return {gattung:"×"+p[1], art:p.slice(2).join(" ")};
  return {gattung:p.shift(), art:p.join(" ")}; }
function findHeaderRow(rows){
  for(let i=0;i<Math.min(rows.length,15);i++){
    const c=rows[i].map(norm);
    const hasBot=c.some(x=>HEAD.botanisch.test(x)) || (c.some(x=>HEAD.gattung.test(x))&&c.some(x=>HEAD.art.test(x)));
    const hasFam=c.some(x=>HEAD.familie.test(x));
    if(hasBot&&hasFam) return i;
  }
  return -1;
}
function mapCols(h){ const m={}; h.forEach((c,i)=>{ const v=norm(c); for(const k of Object.keys(HEAD)){ if(HEAD[k].test(v)&&m[k]==null) m[k]=i; } }); return m; }
function parseWorkbook(buf){
  const wb=XLSX.read(buf,{type:"array"});
  const out=[];
  for(const name of wb.SheetNames){
    const ws=wb.Sheets[name];
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:""});
    if(!rows.length) continue;
    const hr=findHeaderRow(rows); if(hr<0) continue;
    const m=mapCols(rows[hr]);
    const hasBot=m.botanisch!=null, hasGA=(m.gattung!=null&&m.art!=null);
    if((!hasBot&&!hasGA)||m.familie==null) continue;
    // Fallback: unbeschriftete Marker-Spalte (überwiegend Werte AP/ZP) als ZP-Spalte
    // erkennen (manche Listen lassen die Kopfzelle der ZP-Spalte leer).
    if(m.zp==null){
      const used=new Set(Object.values(m));
      let ncols=0; for(let i=hr+1;i<rows.length;i++) ncols=Math.max(ncols,rows[i].length);
      let best=-1,bestHits=0;
      for(let ci=0;ci<ncols;ci++){
        if(used.has(ci)) continue;
        let hits=0,nonEmpty=0;
        for(let i=hr+1;i<rows.length;i++){ const v=norm(rows[i][ci]); if(!v) continue; nonEmpty++; if(/^(zp|ap)$/i.test(v)) hits++; }
        if(nonEmpty>=5 && hits>=nonEmpty*0.6 && hits>bestHits){ best=ci; bestHits=hits; }
      }
      if(best>=0) m.zp=best;
    }
    const maxIdx=Math.max(...Object.values(m));
    let kat="";
    // Anfangs-Kategorie: eine allein stehende Rubrik knapp oberhalb der Kopfzeile
    for(let i=hr-1;i>=Math.max(0,hr-4);i--){
      const c=rows[i].map(norm);
      if(c[0] && !c.slice(1).join("") && !isNoise(c[0]) && !/^nr/i.test(c[0])){
        kat=c[0].replace(/^\d+[\.\)]?\s*/,""); break;
      }
    }
    for(let i=hr+1;i<rows.length;i++){
      const cells=rows[i].map(x=>x==null?"":x);
      while(cells.length<=maxIdx) cells.push("");
      const joined=cells.map(norm).join(""); if(!joined) continue;
      const bot=hasBot?norm(cells[m.botanisch]):"";
      const fam=norm(cells[m.familie]);
      const a0=norm(cells[0]);
      // Fußzeilen / URLs / Stand-Angaben überspringen (vor der Kategorie-Erkennung)
      if(isNoise(bot) || isNoise(a0)) continue;
      // Kategorie-Überschrift: Text in Spalte A, aber kein bot. Name/Familie
      if(!bot && !fam && !(hasGA&&norm(cells[m.gattung])) && a0 && !/^nr/i.test(a0)){
        kat = a0.replace(/^\d+[\.\)]?\s*/,""); continue;
      }
      let g,ar;
      if(hasGA && norm(cells[m.gattung])){
        g=norm(cells[m.gattung]); ar=tidyName(cells[m.art]);
        if(m.sorte!=null){ const sv=tidyName(cells[m.sorte]); if(sv) ar=norm(ar+" "+sv); }
      }
      else { if(!bot) continue; ({gattung:g,art:ar}=splitBinomial(bot)); }
      if(!g) continue;
      // Kategorie aus einer Verwendungs-/Kategorie-Spalte hat Vorrang vor der Rubrik
      let rowKat=kat;
      if(m.kategorie!=null){ const kv=norm(cells[m.kategorie]); if(kv) rowKat=kv; }
      out.push({
        gattung:g, art:ar, familie:fam,
        deutscher_name:m.deutsch!=null?norm(cells[m.deutsch]):"",
        kategorie:rowKat,
        zp:(m.zp!=null && /zp|x|ja|1|✓/i.test(norm(cells[m.zp])))?1:0,
        synonyme:m.synonyme!=null?norm(cells[m.synonyme]):"",
        bemerkungen:""
      });
    }
  }
  return out;
}
function pickExcel(){
  const inp=el("input"); inp.type="file"; inp.accept=".xlsx,.xls,.xlsm";
  inp.onchange=async()=>{
    const f=inp.files[0]; if(!f) return;
    try{
      const recs=parseWorkbook(await f.arrayBuffer());
      if(!recs.length){ toast("Keine Arten erkannt – Spalten prüfen (Botanischer Name + Familie)",true); return; }
      pendingImport=recs; openImportDialog(recs,f.name);
    }catch(e){ toast("Import fehlgeschlagen: "+e.message,true); }
  };
  inp.click();
}
function openImportDialog(recs,fname){
  const kats={}; recs.forEach(r=>kats[r.kategorie||"—"]=(kats[r.kategorie||"—"]||0)+1);
  const zp=recs.filter(r=>r.zp).length;
  $("#importSummary").innerHTML = `<b>${recs.length} Arten</b> aus „${esc(fname)}“ erkannt · ${zp} ZP-relevant`;
  $("#importHint").innerHTML = "Kategorien: "+Object.entries(kats).map(([k,n])=>`${esc(k)} (${n})`).join(" · ");
  $("#importScrim").classList.add("open");
}
function doImport(){
  const mode=document.querySelector('input[name="impmode"]:checked').value;
  if(mode==="replace"){ cache=[]; nextId=1; }
  const existing=new Set(cache.map(p=>(p.gattung+"|"+p.art+"|"+p.deutscher_name).toLowerCase()));
  let added=0,skipped=0;
  for(const r of pendingImport){
    if(mode==="append"){ const key=(r.gattung+"|"+r.art+"|"+r.deutscher_name).toLowerCase(); if(existing.has(key)){skipped++;continue;} existing.add(key); }
    cache.push({id:nextId++,gattung:r.gattung,art:r.art,familie:r.familie,deutscher_name:r.deutscher_name,
      kategorie:r.kategorie,zp:r.zp?1:0,synonyme:r.synonyme,bemerkungen:r.bemerkungen||""}); added++;
  }
  markDirty(); refresh(); renderAll();
  $("#importScrim").classList.remove("open"); pendingImport=null;
  toast(mode==="replace"?`${added} Arten importiert`:`${added} ergänzt, ${skipped} Dubletten übersprungen`);
}

/* ============================================================
   Filter & Rendering
   ============================================================ */
function currentFilter(){
  const q=norm($("#q").value).toLowerCase();
  const cat=$("#cat").value;
  const zp=$("#onlyzp").checked;
  return cache.filter(p=>{
    if(cat && p.kategorie!==cat) return false;
    if(zp && !p.zp) return false;
    if(q){ const hay=(p.gattung+" "+p.art+" "+p.familie+" "+p.deutscher_name+" "+p.synonyme).toLowerCase(); if(!hay.includes(q)) return false; }
    return true;
  });
}
function katRank(k){ const i=KAT_ORDER.indexOf(k); return i<0?99:i; }

function renderList(){
  const host=$("#list"); host.innerHTML="";
  if(!cache.length){ host.appendChild(emptyState()); return; }
  const items=currentFilter();
  if(!items.length){
    const e=el("div","empty"); e.innerHTML="<h2>Keine Treffer</h2><p>Für diese Filter gibt es keine Arten. Suche anpassen oder Kategorie zurücksetzen.</p>";
    host.appendChild(e); return;
  }
  const groups={};
  items.forEach(p=>{ (groups[p.kategorie||"—"] ||= []).push(p); });
  Object.keys(groups).sort((a,b)=>katRank(a)-katRank(b)||a.localeCompare(b)).forEach(kat=>{
    const head=el("div","cathead");
    head.innerHTML=`<span>${esc(kat)}</span><span class="cnt">${groups[kat].length} Arten</span>`;
    host.appendChild(head);
    const ledger=el("div","ledger");
    groups[kat].forEach(p=>ledger.appendChild(rowEl(p)));
    host.appendChild(ledger);
  });
}
function rowEl(p){
  const on=selection.includes(p.id);
  const row=el("div","row"+(on?" on":"")); row.dataset.id=p.id;
  const cb=el("input","chk"); cb.type="checkbox"; cb.checked=on; cb.setAttribute("aria-label","Auswählen: "+p.gattung+" "+p.art);
  cb.addEventListener("change",()=>toggleSel(p.id));
  const name=el("div","namecell");
  name.innerHTML=`<div class="binom"><span class="g">${esc(p.gattung)}</span> <span class="a">${esc(p.art)}</span></div>
    <div class="meta">
      <span class="fam">${esc(p.familie)}</span>
      ${p.deutscher_name?`<span class="de">${esc(p.deutscher_name)}</span>`:""}
      ${p.zp?`<span class="tag zp">ZP</span>`:""}
      ${p.bemerkungen?`<span class="tag bem" title="${esc(p.bemerkungen)}">Bemerkung</span>`:""}
    </div>`;
  const acts=el("div","rowacts");
  const ed=el("button","iconbtn"); ed.title="Bearbeiten"; ed.innerHTML=`<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L18 10l-4-4L4 16zM14 6l4 4"/></svg>`;
  ed.addEventListener("click",()=>openEdit(p.id));
  const dl=el("button","iconbtn del"); dl.title="Löschen"; dl.innerHTML=`<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`;
  dl.addEventListener("click",()=>delPlant(p.id,p));
  acts.append(ed,dl);
  row.append(cb,name,acts);
  return row;
}
function emptyState(){
  const def=PROFILE_DEFS[profileId];
  const e=el("div","empty");
  e.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22V8M12 8C12 8 7 3 4 4c-1 3 4 8 8 8zM12 8c0 0 5-5 8-4 1 3-4 8-8 8z"/></svg>
    <h2>Noch keine Liste für ${esc(def.fr)} · ${esc(def.niveau)}</h2>
    <p>Für dieses Profil ist noch keine Pflanzenliste hinterlegt. Importiere eine Excel-Liste – Gattung, Art, Familie und deutscher Name werden automatisch erkannt und getrennt. Die Liste bleibt im Browser gespeichert.</p>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      <button class="btn primary" onclick="pickExcel()">Excel importieren</button>
    </div>
    <div class="fmt">Erkannt: Botanischer Name · Deutscher Name · Familie · (ZP)</div>`;
  return e;
}

/* ---------- Auswahl ---------- */
function toggleSel(id){
  const i=selection.indexOf(id);
  if(i>=0) selection.splice(i,1); else selection.push(id);
  syncSelUI();
}
function drawRandom(){
  const pool=currentFilter().map(p=>p.id);
  const want=parseInt($("#drawCount").value)||drawTarget();
  const n=Math.min(want, pool.length);
  if(!pool.length){ toast("Keine Arten im aktuellen Filter",true); return; }
  for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
  selection=pool.slice(0,n);
  renderList(); syncSelUI();
  toast(n+" Arten gezogen"+(n<want?" (Pool erschöpft)":""));
}
function shuffleSel(){
  for(let i=selection.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [selection[i],selection[j]]=[selection[j],selection[i]]; }
  toast("Reihenfolge neu gemischt");
}
function clearSel(){ selection=[]; renderList(); syncSelUI(); }
function syncSelUI(){
  $("#selN").textContent=selection.length;
  $("#selTarget").textContent=$("#drawCount").value||drawTarget();
  $("#ptsPill").textContent="max. "+fmtPts(selection.length*ptsPer())+" P.";
  document.querySelectorAll(".row").forEach(r=>{
    const on=selection.includes(+r.dataset.id);
    r.classList.toggle("on",on);
    const cb=r.querySelector(".chk"); if(cb) cb.checked=on;
  });
  const has=selection.length>0;
  $("#btnPrint").disabled=!has; $("#btnClear").disabled=!has; $("#btnShuffle").disabled=selection.length<2;
  const sync=$("#gSync"); if(sync) sync.textContent="= "+fmtPts((selection.length||drawTarget())*ptsPer())+" P.";
  const gr=$("#grader");
  if(gr && !gr.hasAttribute("hidden")){
    if(!$("#gMax").dataset.touched){ $("#gMax").value=(selection.length||drawTarget())*ptsPer(); }
    renderGrader();
  }
  if(!$("#previewPanel").hasAttribute("hidden")) renderPreview();
}

/* ---------- Bearbeiten / Hinzufügen / Löschen ---------- */
function refreshKatList(){
  const set=[...new Set(cache.map(p=>p.kategorie).filter(Boolean))];
  $("#katlist").innerHTML=set.map(k=>`<option value="${esc(k)}">`).join("");
  const cur=$("#cat").value;
  $("#cat").innerHTML='<option value="">alle Kategorien</option>'+
    KAT_ORDER.concat(set.filter(k=>!KAT_ORDER.includes(k))).filter(k=>set.includes(k))
      .map(k=>`<option value="${esc(k)}">${esc(k)}</option>`).join("");
  $("#cat").value=cur;
}
function openEdit(id){
  editId=id;
  const p = id!=null ? cache.find(x=>x.id===id) : {gattung:"",art:"",familie:"",deutscher_name:"",kategorie:"",zp:0,synonyme:"",bemerkungen:""};
  $("#editTitle").textContent = id!=null ? "Art bearbeiten" : "Neue Art";
  $("#fGattung").value=p.gattung; $("#fArt").value=p.art; $("#fFamilie").value=p.familie;
  $("#fKat").value=p.kategorie; $("#fDe").value=p.deutscher_name; $("#fSyn").value=p.synonyme;
  $("#fZp").value=String(p.zp||0); $("#fBem").value=p.bemerkungen;
  $("#editScrim").classList.add("open"); setTimeout(()=>$("#fGattung").focus(),50);
}
function saveEdit(){
  const obj={ gattung:norm($("#fGattung").value), art:tidyName($("#fArt").value), familie:norm($("#fFamilie").value),
    deutscher_name:norm($("#fDe").value), kategorie:norm($("#fKat").value), zp:parseInt($("#fZp").value)||0,
    synonyme:norm($("#fSyn").value), bemerkungen:$("#fBem").value.trim() };
  if(!obj.gattung){ toast("Gattung darf nicht leer sein",true); return; }
  const wasNew=editId==null;
  if(!wasNew){ const p=cache.find(x=>x.id===editId); if(p) Object.assign(p,obj); }
  else{ const nid=nextId++; cache.push({id:nid,...obj}); if(selectNewAfterSave) selection.push(nid); }
  selectNewAfterSave=false;
  markDirty(); refresh(); refreshKatList(); renderList(); syncSelUI();
  $("#editScrim").classList.remove("open");
  toast(wasNew?"Art hinzugefügt":"Gespeichert");
}
function delPlant(id,p){
  if(!confirm(`„${p.gattung} ${p.art}“ löschen?`)) return;
  cache=cache.filter(x=>x.id!==id);
  selection=selection.filter(x=>x!==id);
  markDirty(); refresh(); refreshKatList(); renderList(); syncSelUI();
  toast("Gelöscht");
}

/* ============================================================
   Druckbogen
   ============================================================ */
function selectedPlants(){ return selection.map(id=>cache.find(p=>p.id===id)).filter(Boolean); }

function buildSheet(mode,ctx){ // mode: 'blank' | 'solution'; ctx optional (gespeicherte Prüfung)
  ctx=ctx||{};
  const plants=ctx.plants||selectedPlants();
  const sch=ctx.schema||schema;
  const scale=sch.scale||scaleCfg;
  const def=ctx.def||PROFILE_DEFS[profileId];
  const cols=(sch.cols||[]).filter(c=>c.pts>0);
  const dateStr=ctx.date?new Date(ctx.date+"T00:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"}):null;
  const today=dateStr||new Date().toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"});
  const sol = mode==="solution";
  const per=cols.reduce((s,c)=>s+(c.pts||0),0), maxP=plants.length*per;

  const rows=plants.map((p,i)=>{
    const num=`<td class="num">${i+1}</td>`;
    const cells=cols.map(c=> sol
      ? `<td class="sol">${c.key==="gattung"?`<span class="gg">${esc(p[c.key]||"")}</span>`:esc(p[c.key]||"")}</td>`
      : `<td></td>`).join("");
    const score = sol ? `<td class="score"></td>` : "";
    return `<tr>${num}${cells}${score}</tr>`;
  }).join("");

  let key, keyLabel;
  if(scale.mode==="ihk"){
    key=GRADE.map(g=>g.stufe===6?`6 unter ${thresholdPts(GRADE[4].min,maxP)}`:`${g.stufe} ab ${thresholdPts(g.min,maxP)}`).join(" · ");
    keyLabel="100-Punkte-Schlüssel";
  }else{
    const B=linBands(scale.lin);
    key=B.map(b=>b.stufe===6?`6 unter ${thresholdPts(B[4].lo,maxP)}`:`${b.stufe} ab ${thresholdPts(b.lo,maxP)}`).join(" · ");
    keyLabel="linear, Baden-Württemberg";
  }
  const colgroup=`<colgroup><col class="c-num">`+
    cols.map(c=>`<col${c.key==="familie"?' class="c-fam"':''}>`).join("")+
    (sol?`<col class="c-score">`:``)+`</colgroup>`;
  const heads=cols.map(c=>`<th>${esc(FIELD_LABEL[c.key]||c.key)}<span class="p">${fmtPts(c.pts)} P.</span></th>`).join("");
  const scoreHead = sol ? `<th>Punkte<span class="p">${fmtPts(per)}</span></th>` : "";
  const feldText = cols.map(c=>FIELD_LABEL[c.key]||c.key).join(", ").replace(/,([^,]*)$/," und$1");

  $("#sheet").innerHTML=`
    <div class="sheet-head">
      <div class="title">
        <h1>${esc((settings&&settings.sheetTitle)||"Pflanzenkenntnisse")}${sol?" — Musterlösung":""}</h1>
        <div class="st">Abschlussprüfung ${esc(def.niveau)} · Fachrichtung ${esc(def.fr)}</div>
      </div>
      <div class="brand">
        ${[settings&&settings.stelle1, settings&&settings.stelle2].filter(x=>norm(x)).map(esc).join("<br>")}
        ${sol&&norm(settings&&settings.pruefendeNote)?`<br><span class="solution-note">${esc(settings.pruefendeNote)}</span>`:""}
      </div>
    </div>
    <div class="sheet-meta">
      <div class="mrow"><span class="k">Prüfling</span><span class="val"></span></div>
      <div class="mrow"><span class="k">Prüflings-Nr.</span><span class="val"></span></div>
      <div class="mrow"><span class="k">Datum</span><span class="val">${(ctx.date||!sol)?today:""}</span></div>
      <div class="mrow"><span class="k">Prüfungsort</span><span class="val"></span></div>
      <div class="mrow"><span class="k">Ausschuss</span><span class="val"></span></div>
      <div class="mrow"><span class="k">Bearbeitungszeit</span><span class="val"></span></div>
    </div>
    <div class="scheme">
      <span>Je Pflanze werden ${esc(feldText)} getrennt bewertet.</span>
      <span class="pts">${plants.length} Pflanzen · max. ${fmtPts(maxP)} Punkte</span>
    </div>
    <table class="exam">
      ${colgroup}
      <thead><tr><th>Nr.</th>${heads}${scoreHead}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sheet-scale">Bewertungsschlüssel (${keyLabel}): ${key}</div>
    <div class="sheet-foot">
      <div class="sig">Datum, Unterschrift Prüfende</div>
      <div class="sum">Erreicht: <b>&nbsp;&nbsp;&nbsp;&nbsp;</b> / ${fmtPts(maxP)} Punkte</div>
    </div>`;
}
function printSheet(mode){
  if(!selection.length){ toast("Erst Arten auswählen",true); return; }
  buildSheet(mode);
  window.print();
}

/* ============================================================
   Gespeicherte Prüfungen (nach Prüfungsdatum)
   Eine Prüfung ist ein Snapshot der gezogenen Liste samt Schema – so bleibt sie
   auch dann exakt reproduzierbar, wenn die Profil-Liste später geändert wird.
   ============================================================ */
const EXAMS_KEY = LS_PREFIX+"exams";
function loadExams(){
  try{ const raw=store.get(EXAMS_KEY); exams=raw?JSON.parse(raw):[]; if(!Array.isArray(exams)) exams=[]; }
  catch(e){ exams=[]; }
}
function saveExams(){ store.set(EXAMS_KEY, JSON.stringify(exams)); }
function todayISO(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function fmtDate(iso){ if(!iso) return ""; const d=new Date(iso+"T00:00:00"); return isNaN(d)?iso:d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"}); }

function saveExam(){
  if(!selection.length){ toast("Erst Arten auswählen oder ziehen",true); return; }
  const date=$("#exDate").value || todayISO();
  const label=norm($("#exLabel").value);
  const def=PROFILE_DEFS[profileId];
  const plants=selectedPlants().map(p=>({gattung:p.gattung,art:p.art,familie:p.familie,
    deutscher_name:p.deutscher_name,kategorie:p.kategorie,zp:p.zp?1:0}));
  const exam={ id:"ex"+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36),
    savedAt:new Date().toISOString(), date, profileId, fr:def.fr, niveau:def.niveau,
    label, plants, schema:cloneSchema(schema) };
  exams.unshift(exam); saveExams(); loadedExamId=exam.id; renderExams(); syncExamControls();
  toast(`Prüfung gespeichert (${plants.length} Pflanzen · ${fmtDate(date)})`);
}
function copyExam(id){
  const ex=exams.find(e=>e.id===id); if(!ex) return;
  const copy=JSON.parse(JSON.stringify(ex));
  copy.id="ex"+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);
  copy.savedAt=new Date().toISOString();
  copy.date=todayISO();
  copy.label=(ex.label?ex.label+" ":"")+"(Kopie)";
  exams.unshift(copy); saveExams(); renderExams();
  toast("Prüfung kopiert – mit heutigem Datum, jetzt bearbeitbar (»Laden«)");
}
function updateLoadedExam(){
  const ex=exams.find(e=>e.id===loadedExamId);
  if(!ex){ toast("Keine geladene Prüfung zum Aktualisieren",true); return; }
  if(!selection.length){ toast("Auswahl ist leer",true); return; }
  const def=PROFILE_DEFS[profileId];
  ex.date=$("#exDate").value||ex.date;
  ex.label=norm($("#exLabel").value);
  ex.profileId=profileId; ex.fr=def.fr; ex.niveau=def.niveau;
  ex.plants=selectedPlants().map(p=>({gattung:p.gattung,art:p.art,familie:p.familie,
    deutscher_name:p.deutscher_name,kategorie:p.kategorie,zp:p.zp?1:0}));
  ex.schema=cloneSchema(schema); ex.savedAt=new Date().toISOString();
  saveExams(); renderExams(); syncExamControls();
  toast(`Prüfung aktualisiert (${ex.plants.length} Pflanzen · ${fmtDate(ex.date)})`);
}
function syncExamControls(){
  const btn=$("#exUpdate"); if(!btn) return;
  const ex=exams.find(e=>e.id===loadedExamId);
  if(ex){ btn.hidden=false; btn.textContent="„"+fmtDate(ex.date)+"“ aktualisieren"; }
  else{ btn.hidden=true; if(loadedExamId&&!ex) loadedExamId=null; }
}
function examCtx(ex){ return { plants:ex.plants, schema:ex.schema, def:{fr:ex.fr,niveau:ex.niveau}, date:ex.date }; }
function printExam(id){
  const ex=exams.find(e=>e.id===id); if(!ex) return;
  askPrintMode(m=>{ buildSheet(m, examCtx(ex)); window.print(); });
}
function loadExam(id){
  const ex=exams.find(e=>e.id===id); if(!ex) return;
  if(ex.profileId && ex.profileId!==profileId && PROFILE_DEFS[ex.profileId]){
    switchProfile(ex.profileId);
    $("#frSelect").value=slug(PROFILE_DEFS[ex.profileId].fr); $("#nivSelect").value=PROFILE_DEFS[ex.profileId].niveauKey;
  }
  // Snapshot-Pflanzen den aktuellen Arten zuordnen (nach Gattung+Art+dt. Name).
  // Fehlt eine Art (z. B. nach Import auf einem anderen Gerät oder weil die
  // Profil-Liste geändert wurde), wird sie automatisch in die Liste übernommen –
  // so ist eine geladene Prüfung immer vollständig aus- und abwählbar.
  const key=p=>(p.gattung+"|"+p.art+"|"+p.deutscher_name).toLowerCase();
  const byKey=new Map(cache.map(p=>[key(p),p.id]));
  const ids=[]; let neu=0;
  ex.plants.forEach(p=>{
    let id=byKey.get(key(p));
    if(id==null){
      const np=normPlant(Object.assign({},p,{id:nextId++}));
      cache.push(np); byKey.set(key(np),np.id); id=np.id; neu++;
    }
    ids.push(id);
  });
  selection=ids; loadedExamId=ex.id;
  if(neu){ refresh(); markDirty(); }
  if(!$("#examsPanel").hasAttribute("hidden")){ $("#exDate").value=ex.date||todayISO(); $("#exLabel").value=ex.label||""; }
  renderList(); syncSelUI(); syncExamControls();
  if(neu) toast(`${ids.length} Arten geladen – ${neu} davon neu in die Liste übernommen`);
  else toast(`${ids.length} Arten geladen – jetzt bearbeitbar, dann »Aktualisieren« oder neu speichern`);
}
function downloadExam(id){
  const ex=exams.find(e=>e.id===id); if(!ex) return;
  downloadText(JSON.stringify(ex,null,2), `pruefung_${ex.profileId}_${ex.date}.json`);
  toast("Prüfung als JSON gesichert");
}
function delExam(id){
  const ex=exams.find(e=>e.id===id); if(!ex) return;
  if(!confirm(`Gespeicherte Prüfung „${ex.fr} · ${fmtDate(ex.date)}“ löschen?`)) return;
  if(id===loadedExamId) loadedExamId=null;
  exams=exams.filter(e=>e.id!==id); saveExams(); renderExams(); syncExamControls();
  toast("Prüfung gelöscht");
}
function toggleExams(){
  const s=$("#examsPanel");
  if(s.hasAttribute("hidden")){ s.removeAttribute("hidden"); if(!$("#exDate").value) $("#exDate").value=todayISO(); renderExams(); syncExamControls(); }
  else s.setAttribute("hidden","");
  syncPanelButtons();
}
function renderExams(){
  const host=$("#examList"); host.innerHTML="";
  if(!exams.length){ host.innerHTML='<div class="exempty">Noch keine Prüfung gespeichert. Ziehe eine Liste, wähle das Prüfungsdatum und speichere sie hier.</div>'; return; }
  exams.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.savedAt||"").localeCompare(a.savedAt||"")).forEach(ex=>{
    const row=el("div","exrow"+(ex.id===loadedExamId?" active":""));
    row.innerHTML=`<div class="exmeta">
        <span class="exdate">${esc(fmtDate(ex.date))}</span>
        <span class="exprof">${esc(ex.fr)} · ${esc(ex.niveau)}</span>
        <span class="excount">${ex.plants.length} Pflanzen</span>
        ${ex.label?`<span class="exlabel">${esc(ex.label)}</span>`:""}
        ${ex.id===loadedExamId?'<span class="tag zp">geladen</span>':""}
      </div>
      <div class="exacts">
        <button class="btn small" data-act="load" title="Diese Prüfung in die Auswahl laden (zum Ansehen, Bearbeiten oder erneuten Drucken)">Laden</button>
        <button class="btn small" data-act="copy" title="Als neue Prüfung mit heutigem Datum kopieren – z. B. für den nächsten Prüfungstag, dann frei editierbar">Kopieren</button>
        <button class="btn small" data-act="print" title="Prüfungsbogen oder Musterlösung dieser Prüfung drucken (Variante im Dialog)">Drucken</button>
        <button class="btn small ghost" data-act="dl" title="Diese Prüfung als .json-Datei herunterladen (Sicherung/Weitergabe)">JSON</button>
        <button class="btn small ghost del" data-act="del" title="Diese gespeicherte Prüfung löschen">Löschen</button>
      </div>`;
    row.querySelector('[data-act="load"]').onclick=()=>loadExam(ex.id);
    row.querySelector('[data-act="copy"]').onclick=()=>copyExam(ex.id);
    row.querySelector('[data-act="print"]').onclick=()=>printExam(ex.id);
    row.querySelector('[data-act="dl"]').onclick=()=>downloadExam(ex.id);
    row.querySelector('[data-act="del"]').onclick=()=>delExam(ex.id);
    host.appendChild(row);
  });
}

/* ============================================================
   Auswahl-/Bogen-Vorschau (aktuelle Auswahl bearbeiten)
   Reihenfolge ändern, Arten bearbeiten (Änderungen gehen in die Liste/DB),
   ergänzen und entfernen – eine Vorschau dessen, was auf den Bogen kommt.
   ============================================================ */
let selectNewAfterSave=false;
function togglePreview(){
  const s=$("#previewPanel");
  if(s.hasAttribute("hidden")){ s.removeAttribute("hidden"); renderPreview(); s.scrollIntoView({block:"nearest"}); }
  else s.setAttribute("hidden","");
  syncPanelButtons();
}
function movePreview(idx,dir){
  const j=idx+dir; if(j<0||j>=selection.length) return;
  [selection[idx],selection[j]]=[selection[j],selection[idx]];
  renderList(); syncSelUI();
}
function pvRemove(id){ selection=selection.filter(x=>x!==id); renderList(); syncSelUI(); }
function pvAddExisting(){
  const v=norm($("#pvAdd").value); if(!v){ return; }
  const lv=v.toLowerCase();
  const found=cache.find(p=>!selection.includes(p.id) && (
    (p.gattung+" "+p.art).toLowerCase()===lv ||
    (p.gattung+" "+p.art+(p.deutscher_name?" — "+p.deutscher_name:"")).toLowerCase()===lv ||
    (p.deutscher_name||"").toLowerCase()===lv));
  if(!found){ toast("Art nicht gefunden – bitte aus der Vorschlagsliste wählen",true); return; }
  selection.push(found.id); $("#pvAdd").value=""; renderList(); syncSelUI();
  toast(`„${found.gattung} ${found.art}“ zur Auswahl hinzugefügt`);
}
function pvAddNew(){ selectNewAfterSave=true; openEdit(null); }
function renderPreview(){
  const plants=selectedPlants();
  $("#pvCount").textContent=plants.length;
  $("#pvPts").textContent=fmtPts(plants.length*ptsPer());
  // Vorschlagsliste (noch nicht gewählte Arten)
  $("#pvAddList").innerHTML=cache.filter(p=>!selection.includes(p.id))
    .map(p=>`<option value="${esc(p.gattung+" "+p.art+(p.deutscher_name?" — "+p.deutscher_name:""))}">`).join("");
  const host=$("#previewList"); host.innerHTML="";
  if(!plants.length){ host.innerHTML='<div class="exempty">Noch nichts ausgewählt. Ziehe eine Liste oder füge unten Arten hinzu.</div>'; return; }
  plants.forEach((p,idx)=>{
    const row=el("div","pvrow");
    row.innerHTML=`<span class="pvnum">${idx+1}</span>
      <div class="pvname">
        <div class="binom"><span class="g">${esc(p.gattung)}</span> <span class="a">${esc(p.art)}</span></div>
        <div class="meta">
          <span class="fam">${esc(p.familie)}</span>
          ${p.deutscher_name?`<span class="de">${esc(p.deutscher_name)}</span>`:""}
          ${p.zp?`<span class="tag zp">ZP</span>`:""}
          ${p.synonyme?`<span class="tag" title="${esc(p.synonyme)}">Syn.</span>`:""}
          ${p.bemerkungen?`<span class="tag bem" title="${esc(p.bemerkungen)}">Bem.</span>`:""}
        </div>
      </div>
      <div class="pvacts">
        <button class="iconbtn" data-a="up" title="nach oben" aria-label="nach oben"${idx===0?" disabled":""}><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 15l6-6 6 6"/></svg></button>
        <button class="iconbtn" data-a="down" title="nach unten" aria-label="nach unten"${idx===plants.length-1?" disabled":""}><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>
        <button class="iconbtn" data-a="edit" title="Bearbeiten (wird in die Liste übernommen)" aria-label="Bearbeiten"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L18 10l-4-4L4 16zM14 6l4 4"/></svg></button>
        <button class="iconbtn del" data-a="rm" title="Aus Auswahl entfernen" aria-label="Entfernen"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>`;
    const id=p.id;
    row.querySelector('[data-a="up"]').onclick=()=>movePreview(idx,-1);
    row.querySelector('[data-a="down"]').onclick=()=>movePreview(idx,1);
    row.querySelector('[data-a="edit"]').onclick=()=>openEdit(id);
    row.querySelector('[data-a="rm"]').onclick=()=>pvRemove(id);
    host.appendChild(row);
  });
}

/* ============================================================
   Einstellungen (global, nicht profilgebunden)
   Damit auch andere zuständige Stellen als das RP Freiburg das Werkzeug nutzen.
   ============================================================ */
const SETTINGS_KEY = LS_PREFIX+"settings";
function defaultSettings(){ return {
  stelle1:"Regierungspräsidium Freiburg",
  stelle2:"Zuständige Stelle Grüne Berufe",
  pruefendeNote:"Nur für Prüfende",
  sheetTitle:"Pflanzenkenntnisse"
}; }
function loadSettings(){
  let s=null; try{ const raw=store.get(SETTINGS_KEY); if(raw) s=JSON.parse(raw); }catch(e){}
  settings=Object.assign(defaultSettings(), (s&&typeof s==="object")?s:{});
}
function saveSettings(){ store.set(SETTINGS_KEY, JSON.stringify(settings)); }
const SETTINGS_FIELDS=[
  {key:"sheetTitle",   label:"Titel des Bogens",              ph:"Pflanzenkenntnisse"},
  {key:"stelle1",      label:"Zuständige Stelle (Zeile 1)",   ph:"z. B. Regierungspräsidium …"},
  {key:"stelle2",      label:"Zuständige Stelle (Zeile 2)",   ph:"z. B. Zuständige Stelle Grüne Berufe"},
  {key:"pruefendeNote",label:"Vermerk auf der Musterlösung",  ph:"z. B. Nur für Prüfende"}
];
function toggleSettings(){
  const s=$("#settingsPanel");
  if(s.hasAttribute("hidden")){ s.removeAttribute("hidden"); renderSettings(); }
  else s.setAttribute("hidden","");
  syncPanelButtons();
}
function renderSettings(){
  const host=$("#setFields"); host.innerHTML="";
  SETTINGS_FIELDS.forEach(f=>{
    const row=el("div","setrow");
    row.innerHTML=`<label for="set_${f.key}">${esc(f.label)}</label>
      <input id="set_${f.key}" type="text" value="${esc(settings[f.key]||"")}" placeholder="${esc(f.ph)}" data-k="${f.key}">`;
    host.appendChild(row);
  });
  host.querySelectorAll("input[data-k]").forEach(inp=>inp.onchange=updateSettings);
}
function updateSettings(){
  $("#setFields").querySelectorAll("input[data-k]").forEach(inp=>{ settings[inp.dataset.k]=norm(inp.value); });
  if(!norm(settings.sheetTitle)) settings.sheetTitle=defaultSettings().sheetTitle;
  saveSettings();
  toast("Einstellungen gespeichert");
}
function resetSettings(){
  if(!confirm("Alle Einstellungen auf die Standardwerte (Regierungspräsidium Freiburg) zurücksetzen?")) return;
  settings=defaultSettings(); saveSettings(); renderSettings();
  toast("Einstellungen zurückgesetzt");
}

/* ============================================================
   Notenrechner
   ============================================================ */
function toggleGrader(){
  const g=$("#grader");
  const show=g.hasAttribute("hidden");
  if(show){
    g.removeAttribute("hidden");
    if(!$("#gMax").dataset.touched) $("#gMax").value=(selection.length||drawTarget())*ptsPer();
    renderGrader(); setTimeout(()=>$("#gPts").focus(),50);
  }else g.setAttribute("hidden","");
  syncPanelButtons();
}
function renderGrader(){
  const max=Math.max(1, Math.round(parseFloat($("#gMax").value)||0));
  $("#gScaleMax").textContent="· "+max+" P.";
  const lin=scaleCfg.mode!=="ihk";

  // Modus-Umschalter
  $("#gMode").innerHTML=
    `<button class="segbtn ${lin?'on':''}" data-m="linear">linear · Baden-Württemberg</button>`+
    `<button class="segbtn ${!lin?'on':''}" data-m="ihk">IHK gestuft</button>`;
  $("#gMode").querySelectorAll(".segbtn").forEach(b=>b.onclick=()=>{
    scaleCfg.mode=b.dataset.m; saveCfg(); renderGrader();
  });

  // Bänder je Modus
  const bands = lin ? linBands(scaleCfg.lin)
                    : GRADE.map(g=>({stufe:g.stufe,label:g.label,color:g.color,lo:g.min,hi:g.hi}));
  // Skalenleiste
  const bar=$("#gBar"); bar.innerHTML="";
  [...bands].reverse().forEach(b=>{ const s=el("div","seg"); s.style.flexGrow=Math.max(1,b.hi-b.lo); s.style.background=b.color; s.textContent=b.stufe; bar.appendChild(s); });

  // Ergebnis
  const raw=parseFloat($("#gPts").value);
  const res=$("#gRes"), mark=$("#gMark");
  let hitStufe=null;
  if(isNaN(raw)){ res.innerHTML='<div class="gempty">Punkte eingeben …</div>'; mark.innerHTML=""; }
  else{
    const r=computeGrade(raw,max); hitStufe=r.stufe;
    const over = raw>max ? ` <span style="color:var(--madder)">(auf ${max} begrenzt)</span>`:"";
    res.innerHTML=`<div class="badge" style="background:${r.color}"><span class="num">${r.stufe}</span><span class="z">NOTE</span></div>
      <div class="txt"><div class="word" style="color:${r.color}">${r.label}</div>
        <div class="detail">${(r.p%1?r.p.toFixed(1).replace('.',','):r.p)} / ${max} P.${over}</div>
        <div class="detail">${r.pct.toFixed(1).replace('.',',')} % · dezimal ${lin?'':'≈ '}${r.dez}</div></div>`;
    mark.innerHTML=`<div class="pin" style="left:${r.pct}%" data-pct="${r.pct.toFixed(0)} %"></div>`;
  }

  // Schwellen-Tabelle (linear: Grenzen editierbar)
  const rows=bands.map(b=>{
    const lo=thresholdPts(b.lo,max);
    const hi=b.stufe===1?max:(thresholdPts(bands[b.stufe-2].lo,max)-1);
    const range=b.stufe===6?`0 – ${thresholdPts(bands[4].lo,max)-1}`:`${lo} – ${hi}`;
    const pctCell = (lin && b.stufe<=5)
      ? `ab <input class="gedge" type="number" min="1" max="99" step="1" value="${b.lo}" data-i="${b.stufe-1}"> %`
      : (b.stufe===6?`0–${bands[4].lo-1} %`:`${b.lo}–${b.hi} %`);
    return `<tr class="${b.stufe===hitStufe?'hit':''}">
      <td class="g"><span class="swatch" style="background:${b.color}"></span>${b.stufe}</td>
      <td>${b.label}</td><td>${pctCell}</td><td class="pts">${range}</td></tr>`;
  }).join("");
  $("#gTable").innerHTML=`<thead><tr><th>Note</th><th></th><th>Prozent</th><th style="text-align:right">Punkte (${max})</th></tr></thead><tbody>${rows}</tbody>`;
  $("#gTable").querySelectorAll(".gedge").forEach(inp=>inp.onchange=()=>{
    let v=Math.round(parseFloat(inp.value)); const i=+inp.dataset.i;
    if(isNaN(v)) return;
    // Monotonie sichern: g1>g2>…>g5
    const G=scaleCfg.lin.slice(); G[i]=Math.max(1,Math.min(99,v));
    for(let k=1;k<5;k++) if(G[k]>=G[k-1]) G[k]=G[k-1]-1;
    for(let k=3;k>=0;k--) if(G[k]<=G[k+1]) G[k]=G[k+1]+1;
    scaleCfg.lin=G.map(x=>Math.max(1,Math.min(99,x))); saveCfg(); renderGrader();
  });

  $("#gNote").textContent = lin
    ? "Gleichmäßige (lineare) Skala – jede Note gleiche Spannweite, Grenzen anpassbar (VGH BW, Urt. 24.1.1979). Dezimalnote linear."
    : "Bundeseinheitlicher 100-Punkte-Schlüssel (ungleichmäßige Notenstufen).";
}

/* ============================================================
   Verdrahtung
   ============================================================ */
function wire(){
  $("#btnImport").onclick=pickExcel;
  $("#btnAdd").onclick=()=>openEdit(null);
  $("#btnGrade").onclick=toggleGrader;
  $("#gPts").addEventListener("input",renderGrader);
  $("#gMax").addEventListener("input",()=>{ $("#gMax").dataset.touched="1"; renderGrader(); });
  $("#gSync").onclick=()=>{ $("#gMax").value=(selection.length||drawTarget())*ptsPer(); delete $("#gMax").dataset.touched; renderGrader(); };
  $("#btnOpen").onclick=importJsonFile;
  $("#btnSave").onclick=exportBackup;
  $("#btnReset").onclick=resetToDefault;
  $("#q").addEventListener("input",()=>{ renderList(); syncSelUI(); });
  $("#cat").addEventListener("change",()=>{ renderList(); syncSelUI(); });
  $("#onlyzp").addEventListener("change",()=>{ renderList(); syncSelUI(); });
  $("#drawCount").addEventListener("input",()=>{ $("#selTarget").textContent=$("#drawCount").value||drawTarget(); });
  $("#btnDraw").onclick=drawRandom;
  $("#btnShuffle").onclick=shuffleSel;
  $("#btnClear").onclick=clearSel;
  $("#btnPrint").onclick=()=>askPrintMode();
  // Auswahl-/Bogen-Vorschau
  $("#btnPreview").onclick=togglePreview;
  $("#pvAddBtn").onclick=pvAddExisting;
  $("#pvAdd").addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); pvAddExisting(); } });
  $("#pvAddNew").onclick=pvAddNew;
  $("#pvPrint").onclick=()=>askPrintMode();
  // Gespeicherte Prüfungen
  $("#btnExams").onclick=toggleExams;
  $("#exSave").onclick=saveExam;
  $("#exUpdate").onclick=updateLoadedExam;
  $("#exImport").onclick=importJsonFile;
  // Einstellungen
  $("#btnSettings").onclick=toggleSettings;
  $("#setReset").onclick=resetSettings;
  // Hilfe
  $("#btnHelp").onclick=toggleHelp;
  // Profil-Auswahl
  $("#frSelect").addEventListener("change",()=>applyProfileSelect());
  $("#nivSelect").addEventListener("change",()=>applyProfileSelect());
  $("#btnSchema").onclick=toggleSchema;

  // Import-Dialog
  $("#importCancel").onclick=()=>{ $("#importScrim").classList.remove("open"); pendingImport=null; };
  $("#importConfirm").onclick=doImport;
  document.querySelectorAll('input[name="impmode"]').forEach(r=>r.addEventListener("change",e=>{
    document.querySelectorAll("#importChoice .rcard").forEach(c=>c.classList.remove("sel"));
    e.target.closest(".rcard").classList.add("sel");
  }));
  // Druck-Dialog
  $("#printBlank").onclick=()=>{ $("#printScrim").classList.remove("open"); if(printChoose) printChoose("blank"); };
  $("#printSolution").onclick=()=>{ $("#printScrim").classList.remove("open"); if(printChoose) printChoose("solution"); };
  $("#printCancel").onclick=()=>$("#printScrim").classList.remove("open");
  // Edit-Dialog
  $("#editCancel").onclick=()=>{ selectNewAfterSave=false; $("#editScrim").classList.remove("open"); };
  $("#editSave").onclick=saveEdit;
  // Scrim-Klick schließt
  document.querySelectorAll(".scrim").forEach(s=>s.addEventListener("mousedown",e=>{ if(e.target===s) s.classList.remove("open"); }));
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") document.querySelectorAll(".scrim.open").forEach(s=>s.classList.remove("open")); });
}

/* Druck-Dialog (Prüfungsbogen / Musterlösung) mit Callback statt window.prompt */
let printChoose=null;
function askPrintMode(cb){
  printChoose = cb || ((m)=>printSheet(m));
  $("#printScrim").classList.add("open");
}

/* Sichtbares Feedback: welche Modul-Panels gerade geöffnet sind */
const PANEL_BUTTONS=[
  ["#btnHelp","#helpPanel"],["#btnGrade","#grader"],["#btnSchema","#schemaPanel"],
  ["#btnExams","#examsPanel"],["#btnSettings","#settingsPanel"],["#btnPreview","#previewPanel"]
];
function toggleHelp(){
  const s=$("#helpPanel");
  if(s.hasAttribute("hidden")){ s.removeAttribute("hidden"); s.scrollIntoView({block:"nearest"}); }
  else s.setAttribute("hidden","");
  syncPanelButtons();
}
function syncPanelButtons(){
  PANEL_BUTTONS.forEach(([b,p])=>{
    const btn=$(b), pan=$(p); if(!btn||!pan) return;
    const open=!pan.hasAttribute("hidden");
    btn.classList.toggle("active",open);
    btn.setAttribute("aria-pressed",open?"true":"false");
  });
}
function renderAll(){
  syncProfileUI(); refreshKatList(); renderList(); syncSelUI();
  if(!$("#grader").hasAttribute("hidden")) renderGrader();
  if(!$("#schemaPanel").hasAttribute("hidden")) renderSchema();
  if(!$("#examsPanel").hasAttribute("hidden")){ renderExams(); syncExamControls(); }
  if(!$("#settingsPanel").hasAttribute("hidden")) renderSettings();
  if(!$("#previewPanel").hasAttribute("hidden")) renderPreview();
  syncPanelButtons();
}

/* ---------- Fachrichtungs-/Profil-Auswahl ---------- */
function populateSelectors(){
  $("#frSelect").innerHTML=FR_LIST.map(f=>`<option value="${slug(f)}">${esc(f)}</option>`).join("");
  $("#nivSelect").innerHTML=NIVEAUS.map(n=>`<option value="${n.key}">${esc(n.label)}</option>`).join("");
}
function syncProfileUI(){
  const def=PROFILE_DEFS[profileId];
  $("#frSelect").value=slug(def.fr); $("#nivSelect").value=def.niveauKey;
  $("#profSub").textContent=`${drawTarget()} Pflanzen · max. ${fmtPts(drawTarget()*ptsPer())} P.`;
}
function applyProfileSelect(){
  const id=$("#frSelect").value+"_"+$("#nivSelect").value;
  if(PROFILE_DEFS[id]) switchProfile(id);
}
function applyDrawDefault(){ $("#drawCount").value=drawTarget(); $("#selTarget").textContent=drawTarget(); }

/* ---------- Prüfungsschema (Spalten/Punkte/Anzahl) ---------- */
function toggleSchema(){
  const s=$("#schemaPanel"); if(s.hasAttribute("hidden")){ s.removeAttribute("hidden"); renderSchema(); } else s.setAttribute("hidden","");
  syncPanelButtons();
}
/* Editor-Reihenfolge: erst bewertete Spalten (cols-Reihenfolge = Spaltenfolge auf
   dem Bogen), dann die restlichen Felder (0 Punkte) in Standardreihenfolge. */
function ensureSchemaOrder(){
  if(!schemaOrder){
    const inCols=schema.cols.map(c=>c.key);
    schemaOrder=inCols.concat(FIELD_ORDER.filter(k=>!inCols.includes(k)));
  }
  // genau die vier bekannten Felder, keine Dubletten
  schemaOrder=schemaOrder.filter((k,i)=>FIELD_ORDER.includes(k)&&schemaOrder.indexOf(k)===i);
  FIELD_ORDER.forEach(k=>{ if(!schemaOrder.includes(k)) schemaOrder.push(k); });
}
function renderSchema(){
  $("#scAnzahl").value=schema.anzahl;
  ensureSchemaOrder();
  const host=$("#scFields"); host.innerHTML="";
  schemaOrder.forEach((k,idx)=>{
    const col=schema.cols.find(c=>c.key===k); const pts=col?col.pts:0;
    const row=el("div","scrow");
    row.innerHTML=`<span class="scorder">
        <button class="scmove" data-mv="up" data-i="${idx}" title="nach oben" aria-label="${FIELD_LABEL[k]} nach oben"${idx===0?" disabled":""}>▲</button>
        <button class="scmove" data-mv="down" data-i="${idx}" title="nach unten" aria-label="${FIELD_LABEL[k]} nach unten"${idx===schemaOrder.length-1?" disabled":""}>▼</button>
      </span>
      <span class="scname">${FIELD_LABEL[k]}</span>
      <input class="scpts" type="text" inputmode="decimal" value="${fmtPts(pts)}" data-k="${k}" aria-label="Punkte ${FIELD_LABEL[k]}"><span class="scp">P.</span>`;
    host.appendChild(row);
  });
  host.querySelectorAll(".scpts").forEach(inp=>inp.onchange=updateSchema);
  host.querySelectorAll(".scmove").forEach(b=>b.onclick=()=>moveSchemaField(+b.dataset.i,b.dataset.mv));
  $("#scAnzahl").onchange=updateSchema;
  $("#scSum").textContent=`${fmtPts(ptsPer())} P. je Pflanze · max. ${fmtPts(schema.anzahl*ptsPer())} P. gesamt`;
}
function moveSchemaField(i,dir){
  ensureSchemaOrder();
  const j=dir==="up"?i-1:i+1;
  if(j<0||j>=schemaOrder.length) return;
  [schemaOrder[i],schemaOrder[j]]=[schemaOrder[j],schemaOrder[i]];
  updateSchema();
}
function updateSchema(){
  ensureSchemaOrder();
  const anzahl=Math.max(1,Math.round(parseFloat($("#scAnzahl").value)||drawTarget()));
  const ptsByKey={};
  $("#scFields").querySelectorAll(".scpts").forEach(inp=>{
    let v=parseFloat(String(inp.value).replace(",",".")); if(isNaN(v)) v=0;
    ptsByKey[inp.dataset.k]=Math.max(0,Math.min(20,Math.round(v*100)/100));
  });
  const cols=schemaOrder.map(k=>({key:k,pts:ptsByKey[k]!=null?ptsByKey[k]:0})).filter(c=>c.pts>0);
  if(!cols.length){ toast("Mindestens ein Bewertungsfeld mit Punkten nötig",true); renderSchema(); return; }
  schema.anzahl=anzahl; schema.cols=cols; scaleCfg=schema.scale;
  markDirty(); applyDrawDefault(); renderSchema(); syncProfileUI(); renderList(); syncSelUI();
  if(!$("#grader").hasAttribute("hidden")) renderGrader();
}

/* ---------- Start ---------- */
(function boot(){
  try{
    populateSelectors();
    loadSettings();
    loadExams();
    const pid=store.get(LS_PREFIX+"profile");
    loadProfile(pid&&PROFILE_DEFS[pid]?pid:"gemuesebau_gaertner");
    applyDrawDefault();
    refresh(); wire(); renderAll();
  }catch(e){
    document.body.innerHTML='<div style="max-width:640px;margin:80px auto;font-family:sans-serif;color:#22352b">'+
      '<h2>Start fehlgeschlagen</h2><pre>'+esc(e.message)+'</pre></div>';
  }
})();
window.pickExcel=pickExcel;
window.resetToDefault=resetToDefault;
window.importJsonData=importJsonData; // für Datei-Import und Smoke-Test
