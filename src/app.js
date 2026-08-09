/* ============================================================
   Pflanzenkenntnis · Prüfungslisten der Gärtnerberufe (BW)
   14 Profile (7 Fachrichtungen × Gärtner/Fachwerker), je eigene Liste,
   Schema und Notenschlüssel. Hinterlegte Seeds + Browser-Speicher
   (localStorage), Excel-Import (SheetJS). Offline, ohne Datenbank-Engine.
   ============================================================ */
"use strict";

/* ---------- kleine Helfer ---------- */
const $ = s => document.querySelector(s);
const el = (t,c) => { const e=document.createElement(t); if(c) e.className=c; return e; };
const esc = s => (s==null?"":String(s)).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
/* Strich-Icons statt bunter Emojis (die werden je nach Gerät unterschiedlich
   gerendert und wirken unprofessionell). Gleicher Stil wie die übrigen Icons. */
const APPICONS = {
  globe:`<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>`,
  book:`<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5"/>`
};
function ico(name, cls){
  const d = APPICONS[name]; if(!d) return "";
  return `<svg class="ic${cls?" "+cls:""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `+
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
const norm = s => (s==null?"":String(s)).replace(/\s+/g," ").trim();
const KAT_ORDER = ["Nadelgehölze","Laubgehölze","Gehölze","Kletterpflanzen","Stauden","Gräser","Farne","Zwiebel- und Knollenpflanzen","Ein- und zweijährige","Zimmerpflanzen","Gemüsepflanzen","Gewürzkräuter","Wild- & Beikräuter","Gründüngungspflanzen","Zierpflanzen","Obstgehölze"];

/* ---- Bewertungsfelder (Spalten des Prüfungsbogens) ---- */
const FIELD_LABEL = { gattung:"Gattung", art:"Art", familie:"Familie", deutscher_name:"Deutscher Name" };
const FIELD_ORDER = ["gattung","art","familie","deutscher_name"];
/* Punkte hübsch: Dezimalkomma, keine überflüssige ,0 (z. B. 0,5 · 2 · 1,5) */
const fmtPts = n => (Math.round((+n||0)*100)/100).toString().replace(".",",");
/* dynamisch aus aktivem Prüfungsschema (profile-abhängig) */
function activeCols(){ return (schema&&schema.cols||[]).filter(c=>c.pts>0); }
function ptsPer(){ return activeCols().reduce((s,c)=>s+(c.pts||0),0); }
function drawTarget(){ return (schema&&schema.anzahl)||20; }

/* ---- Notenstufen (Label/Farbe) für die lineare BW-Skala ----
   Baden-Württemberg rechnet Pflanzenkenntnis linear/gleichmäßig (VGH BW, 24.1.1979);
   ein IHK-Schlüssel wird hier bewusst nicht angeboten. */
const GRADE = [
  {stufe:1, label:"sehr gut",     color:"#2b5138"},
  {stufe:2, label:"gut",          color:"#3d6b4d"},
  {stufe:3, label:"befriedigend", color:"#a9842b"},
  {stufe:4, label:"ausreichend",  color:"#b5762a"},
  {stufe:5, label:"mangelhaft",   color:"#c96a5a"},
  {stufe:6, label:"ungenügend",   color:"#9c3b2e"}
];
const thresholdPts = (min,max) => Math.ceil(min*max/100);

/* ---- Prüfungsschema & Profile ----
   scaleCfg zeigt immer auf schema.scale des aktiven Profils. */
let schema = null;             // {anzahl, cols:[{key,pts}], scale:{mode,lin}}
let scaleCfg = { mode:"linear", lin:[90,70,50,30,10] };
let schemaOrder = null;        // Editor-Reihenfolge der Bewertungsfelder (Spaltenfolge)
function saveCfg(){ markDirty(); }

/* Standard-Prüfungsschema (Pflanzenkenntnis Gärtnerberufe, BW) */
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
/* Note für erreichte Punkte (lineare BW-Skala) */
function computeGrade(raw,max){
  const p=Math.max(0,Math.min(raw,max)), pct=max>0?p/max*100:0;
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
  t.setAttribute("role", isErr?"alert":"status"); t.setAttribute("aria-live", isErr?"assertive":"polite");   // Screenreader-Ansage
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
        openExams();
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
    seed:   ["dot",       "Standardliste"],
    empty:  ["dot",       "Keine hinterlegte Liste · Excel importieren"],
    dirty:  ["dot dirty", "Wird gespeichert …"],
    saved:  ["dot saved", "Auf diesem Gerät gespeichert"],
    session:["dot dirty", "Nur für diese Sitzung (kein dauerhafter Speicher)"],
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

/* Filter-Klappe: aktiven Filter in der Zusammenfassung zeigen, damit er nicht
   unbemerkt eingeklappt aktiv bleibt (»Filter · nur ZP«, hervorgehoben). */
function syncFilterSummary(){
  const d=$("#filterOpts"); if(!d) return;
  const cat=$("#cat").value, zp=$("#onlyzp").checked;   // Suche ist jetzt immer sichtbar → nicht mehr in die Zusammenfassung
  const bits=[];
  if(cat) bits.push(cat);
  if(zp) bits.push("nur ZP");
  const sub=d.querySelector(".fb-sub");
  if(sub) sub.textContent = bits.length ? bits.join(" · ") : "Kategorie · nur ZP";
  d.classList.toggle("filter-on", bits.length>0);
}
/* Zwei Modi: »Prüfung erstellen« (ziehen · aktuelle Prüfung · drucken) und
   »Liste verwalten« (Pflanzenliste bearbeiten). Umschaltung über eine Body-Klasse;
   die Suche bleibt in beiden Modi immer sichtbar. */
/* View-Transition-Helfer: diskrete Zustandswechsel (Filter, Modus, Profil, Ziehen)
   blenden weich über statt hart zu springen. Fällt ohne API, bei reduzierter
   Bewegung oder im Test (window.__noVT) auf sofortiges Rendern zurück. */
function vt(cb){
  try{
    if(document.startViewTransition && !window.__noVT &&
       !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)){
      document.startViewTransition(cb); return;
    }
  }catch(e){}
  cb();
}
function setMode(m){
  const manage = m==="manage";
  document.body.classList.toggle("m-manage", manage);
  document.body.classList.toggle("m-exam", !manage);
  const te=$("#tabExam"), tm=$("#tabManage");
  if(te){ te.classList.toggle("on",!manage); te.setAttribute("aria-selected", String(!manage)); }
  if(tm){ tm.classList.toggle("on",manage); tm.setAttribute("aria-selected", String(manage)); }
  try{ store.set(LS_PREFIX+"examMode", manage?"manage":"exam"); }catch(e){}
}

function renderList(){
  const host=$("#list"); host.innerHTML="";
  if(!cache.length){ host.appendChild(emptyState()); return; }
  const items=currentFilter();
  if(!items.length){
    const e=el("div","empty"); e.innerHTML="<h2>Keine Treffer</h2><p>Für diese Filter gibt es keine Arten. Suche anpassen oder Kategorie zurücksetzen.</p>";
    host.appendChild(e); return;
  }
  if(items.some(p=>p.zp)){
    const lg=el("div","zpnote");
    lg.innerHTML=`<span class="tag zp">ZP</span> = für die Zwischenprüfung relevant`;
    host.appendChild(lg);
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
  const inf=el("button","iconbtn info"); inf.title="Mehr zur Pflanze (Namensherkunft, Quellen, Wikipedia)"; inf.setAttribute("aria-label","Mehr zur Pflanze"); inf.innerHTML=`<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.6" r=".9" fill="currentColor" stroke="none"/></svg>`;
  inf.addEventListener("click",()=>openInfo(infoCard(p)));
  const ed=el("button","iconbtn"); ed.title="Bearbeiten"; ed.innerHTML=`<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L18 10l-4-4L4 16zM14 6l4 4"/></svg>`;
  ed.addEventListener("click",()=>openEdit(p.id));
  const dl=el("button","iconbtn del"); dl.title="Löschen"; dl.innerHTML=`<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`;
  dl.addEventListener("click",()=>delPlant(p.id,p));
  acts.append(inf,ed,dl);
  row.append(cb,name,acts);
  // Touch-Trefferfläche: die ganze Zeile wählt an/ab (nicht nur die 22-px-Checkbox);
  // Klicks auf die Aktions-Knöpfe und die Checkbox selbst bleiben unberührt.
  row.addEventListener("click",e=>{ if(e.target.closest("button,a,input,select,label")) return; cb.click(); });
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
  loadedExamId=null; syncExamControls(); // frisch gezogene Liste = neue Prüfung
  renderList(); syncSelUI();
  toast(n+" Arten gezogen"+(n<want?" (Pool erschöpft)":""));
}
function shuffleSel(){
  for(let i=selection.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [selection[i],selection[j]]=[selection[j],selection[i]]; }
  toast("Reihenfolge neu gemischt");
}
function clearSel(){ selection=[]; loadedExamId=null; syncExamControls(); renderList(); syncSelUI(); }
function syncSelUI(){
  $("#selN").textContent=selection.length;
  $("#selTarget").textContent=drawTarget();   // festes Profil-Soll (nicht das Eingabefeld) – »18 / 20« liest sich als Fortschritt, nicht als Fehler
  $("#ptsPill").textContent="max. "+fmtPts(selection.length*ptsPer())+" P.";
  document.querySelectorAll(".row").forEach(r=>{
    const on=selection.includes(+r.dataset.id);
    r.classList.toggle("on",on);
    const cb=r.querySelector(".chk"); if(cb) cb.checked=on;
  });
  const has=selection.length>0;
  $("#btnPrint").disabled=!has; $("#btnClear").disabled=!has; $("#btnShuffle").disabled=selection.length<2;
  const sync=$("#gSync"); if(sync) sync.textContent="aus Auswahl: "+fmtPts((selection.length||drawTarget())*ptsPer())+" P.";
  if(panelOpen("#graderScrim")){
    if(!$("#gMax").dataset.touched){ $("#gMax").value=(selection.length||drawTarget())*ptsPer(); }
    renderGrader();
  }
  if(panelOpen("#previewScrim")) renderPreview();
  if($("#currentSelList")) renderCurrentSel();   // dauerhaftes »Aktuelle Prüfung«-Panel mitziehen
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

/* Offizielle Leerbögen: Nachbau der AP-Formulare der Regierungspräsidien BW
   (AP_Formular_FW_neu / _Gaertner_GALA_ab_S26 / _Gaertner_Produktion, siehe
   data/leerboegen/). Drei Formular-Familien, Zuordnung über Niveau/Fachrichtung. */
function sheetFamily(def){
  if(/fachwerker/i.test(def.niveau||"")||def.niveauKey==="fachwerker") return "fw";
  if(/landschaftsbau/i.test(def.fr||"")) return "gala";
  return "prod";
}
const SHEET_COL_LABEL={
  fw: {gattung:"Gattung (botanisch)",art:"Art (botanisch)",familie:"Familie (botanisch)",deutscher_name:"Deutscher Name"},
  std:{gattung:"Gattungsname",art:"Artname",familie:"Familienname",deutscher_name:"Deutscher Name"}
};
const SHEET_COL_W={ // Spaltenbreiten in % (aus den DOCX-Vorlagen, dxa umgerechnet)
  fw:  {num:4.6, deutscher_name:36.6, gattung:27.4, art:23.5, pts:7.8},
  gala:{num:5.8, gattung:27.5, art:29,   deutscher_name:26.1, pts:11.6},
  prod:{num:5.8, gattung:21.4, art:22.1, familie:21.7, deutscher_name:21.7, pts:7.2}
};
function buildSheet(mode,ctx){ // mode: 'blank' | 'solution'; ctx optional (gespeicherte Prüfung)
  ctx=ctx||{};
  const plants=ctx.plants||selectedPlants();
  const sch=ctx.schema||schema;
  const scale=sch.scale||scaleCfg;
  const def=ctx.def||PROFILE_DEFS[profileId];
  const cols=(sch.cols||[]).filter(c=>c.pts>0);
  const sol = mode==="solution";
  const fam=sheetFamily(def);
  const per=cols.reduce((s,c)=>s+(c.pts||0),0), maxP=plants.length*per;
  const dateStr=ctx.date?fmtDate(ctx.date):new Date().toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"});

  // Titel: Zusatz »im Gartenbau (GALA)« nur beim unveränderten Standardtitel
  const base=norm(settings&&settings.sheetTitle)||defaultSettings().sheetTitle;
  const title= base!==defaultSettings().sheetTitle ? base
    : fam==="gala" ? base+" im Gartenbau GALA"
    : fam==="prod" ? base+" im Gartenbau" : base;

  // Spalten: Beschriftung wie auf den offiziellen Bögen, Punkte aus dem Schema
  const lbl=SHEET_COL_LABEL[fam==="fw"?"fw":"std"];
  const punkt=p=>fmtPts(p)+" "+(p===1?"Punkt":"Punkte")+(fam==="fw"?"":" (G)");
  const wmap=SHEET_COL_W[fam];
  const rest=cols.filter(c=>wmap[c.key]==null);
  const used=wmap.num+wmap.pts+cols.reduce((s,c)=>s+(wmap[c.key]||0),0);
  const evenW=rest.length?Math.max(8,(100-used)/rest.length):0;
  const colgroup=`<colgroup><col style="width:${wmap.num}%">`+
    cols.map(c=>`<col style="width:${wmap[c.key]!=null?wmap[c.key]:evenW}%">`).join("")+
    `<col style="width:${wmap.pts}%"></colgroup>`;
  const heads=`<th class="fnum"></th>`+
    cols.map(c=>`<th>${esc(lbl[c.key]||c.key)}<span class="p">${punkt(c.pts)}</span></th>`).join("")+
    `<th class="fpth">Punkte</th>`;
  const hinweis= fam==="gala"
    ? `<tr><th class="fhint" colspan="${cols.length+2}">Schreibfehler führen zur Halbierung der Punktezahl</th></tr>` : "";

  const rows=plants.map((p,i)=>
    `<tr><td class="fnum">${i+1}</td>`+
    cols.map(c=>{ const isBot=(c.key==="gattung"||c.key==="art"); // botanische Spalten kursiv (Musterlösung)
      return `<td${sol?` class="sol${isBot?" bot":""}"`:''}>${sol?esc(p[c.key]||""):""}</td>`; }).join("")+
    `<td></td></tr>`).join("");

  // Nur auf der Musterlösung: Zuordnung, Vermerk und Bewertungsschlüssel
  let solMeta="", solScale="";
  if(sol){
    const lin=(scale&&Array.isArray(scale.lin)&&scale.lin.length===5)?scale.lin:[90,70,50,30,10];
    const B=linBands(lin);
    const key=B.map(b=>b.stufe===6?`6 unter ${thresholdPts(B[4].lo,maxP)}`:`${b.stufe} ab ${thresholdPts(b.lo,maxP)}`).join(" · ");
    const keyLabel="linear, Baden-Württemberg";
    solMeta=`<div class="sheet-meta">Fachrichtung ${esc(def.fr)} · ${esc(def.niveau)} · Prüfung am ${esc(dateStr)} ·
      ${plants.length} Pflanzen · max. ${fmtPts(maxP)} Punkte
      ${norm(settings&&settings.pruefendeNote)?`<span class="solution-note">${esc(settings.pruefendeNote)}</span>`:""}</div>`;
    solScale=`<div class="fscale">Bewertungsschlüssel (${keyLabel}): ${key}</div>`;
  }

  // Abschlussbereich je Familie (Wortlaut der Vorlagen)
  const result= fam==="fw"
    ? `<table class="fres fw"><tr><td class="fspace"></td><td class="flab">Gesamtpunkte</td><td class="fbox"></td></tr></table>
       <table class="fnote2"><tr><td>Es wurde folgende Note erzielt:</td></tr></table>
       <table class="fsig"><tr><td><span>Datum / Unterschrift Prüfende</span></td></tr></table>`
    : `<table class="fres"><tr><td class="fspace"></td><td class="flab">Erreichte Punktzahl:</td><td class="fbox"></td></tr></table>
       <table class="fsig2"><tr><td class="fnote3">Note:</td><td class="fsigl"><span>Datum / Unterschrift des Prüfers</span></td></tr></table>`;

  const foot=[settings&&settings.stelle1,settings&&settings.stelle2].filter(x=>norm(x)).map(esc).join(" · ");

  // Der leere Prüfungsbogen bleibt im offiziellen Arial-Look; die Musterlösung
  // bekommt ein schöneres, gut lesbares Layout (Serif, Zebra, grüner Kopf).
  $("#sheet").className = sol ? "sol-look" : "";
  $("#sheet").innerHTML=`
    <h1 class="ftitle${fam==="fw"?" fb":""}">${esc(title)}${sol?" — Musterlösung":""}</h1>
    ${fam==="fw"?`<div class="fsub">Gartenbaufachwerker/in</div>`:""}
    ${solMeta}
    <table class="fname"><tr><td><span class="cap">Auszubildende / Auszubildender&nbsp;&nbsp;·&nbsp;&nbsp;Name, Vorname</span></td></tr></table>
    <table class="exam${sol?" solved":""}">
      ${colgroup}
      <thead><tr>${heads}</tr>${hinweis}</thead>
      <tbody>${rows}</tbody>
    </table>
    ${result}
    ${solScale}
    ${foot?`<div class="ffoot">${foot}</div>`:""}`;
}
function printSheet(mode,ex){ // ex optional: soeben gespeicherte/aktualisierte Prüfung (Datum für die Musterlösung)
  if(!selection.length){ toast("Erst Arten auswählen",true); return; }
  buildSheet(mode, ex?{date:ex.date}:undefined);
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

function examSnapshot(){
  return selectedPlants().map(p=>({gattung:p.gattung,art:p.art,familie:p.familie,
    deutscher_name:p.deutscher_name,kategorie:p.kategorie,zp:p.zp?1:0}));
}
function saveExamData(date,label){ // Kern, auch vom Druck-Dialog genutzt
  if(!selection.length) return null;
  const def=PROFILE_DEFS[profileId];
  const exam={ id:"ex"+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36),
    savedAt:new Date().toISOString(), date:date||todayISO(), profileId, fr:def.fr, niveau:def.niveau,
    label:norm(label||""), plants:examSnapshot(), schema:cloneSchema(schema) };
  exams.unshift(exam); saveExams(); loadedExamId=exam.id; renderExams(); syncExamControls();
  return exam;
}
function saveExam(){
  if(!selection.length){ toast("Erst Arten auswählen oder ziehen",true); return; }
  const ex=saveExamData($("#exDate").value, $("#exLabel").value);
  if(ex) toast(`Prüfung gespeichert (${ex.plants.length} Pflanzen · ${fmtDate(ex.date)})`);
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
function updateExamData(date,label){ // Kern, auch vom Druck-Dialog genutzt
  const ex=exams.find(e=>e.id===loadedExamId);
  if(!ex||!selection.length) return null;
  const def=PROFILE_DEFS[profileId];
  ex.date=date||ex.date;
  ex.label=norm(label!=null?label:ex.label);
  ex.profileId=profileId; ex.fr=def.fr; ex.niveau=def.niveau;
  ex.plants=examSnapshot();
  ex.schema=cloneSchema(schema); ex.savedAt=new Date().toISOString();
  saveExams(); renderExams(); syncExamControls();
  return ex;
}
function updateLoadedExam(){
  if(!exams.find(e=>e.id===loadedExamId)){ toast("Keine geladene Prüfung zum Aktualisieren",true); return; }
  if(!selection.length){ toast("Auswahl ist leer",true); return; }
  const ex=updateExamData($("#exDate").value, $("#exLabel").value);
  if(ex) toast(`Prüfung aktualisiert (${ex.plants.length} Pflanzen · ${fmtDate(ex.date)})`);
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
  $("#exDate").value=ex.date||todayISO(); $("#exLabel").value=ex.label||"";
  closePanel("#examsScrim"); // Modal zu – die geladene Auswahl ist jetzt direkt sichtbar
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
function openExams(){
  if(!$("#exDate").value) $("#exDate").value=todayISO();
  renderExams(); syncExamControls();
  $("#examsScrim").classList.add("open"); syncPanelButtons();
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
function openPreview(){
  renderPreview();
  $("#previewScrim").classList.add("open"); syncPanelButtons();
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
  plants.forEach((p,idx)=> host.appendChild(pvRowEl(p,idx,plants.length)));
}
/* Eine Auswahl-Zeile (nummeriert · ▲▼ · Bearbeiten · Entfernen) – geteilt von der
   Bogen-Vorschau (Modal) und dem dauerhaften »Aktuelle Prüfung«-Panel. */
function pvRowEl(p, idx, n){
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
        <button class="iconbtn info" data-a="info" title="Mehr zur Pflanze (Namensherkunft, Quellen, Wikipedia)" aria-label="Mehr zur Pflanze"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.6" r=".9" fill="currentColor" stroke="none"/></svg></button>
        <button class="iconbtn" data-a="up" title="nach oben" aria-label="nach oben"${idx===0?" disabled":""}><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 15l6-6 6 6"/></svg></button>
        <button class="iconbtn" data-a="down" title="nach unten" aria-label="nach unten"${idx===n-1?" disabled":""}><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>
        <button class="iconbtn" data-a="edit" title="Bearbeiten (wird in die Liste übernommen)" aria-label="Bearbeiten"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L18 10l-4-4L4 16zM14 6l4 4"/></svg></button>
        <button class="iconbtn del" data-a="rm" title="Aus Auswahl entfernen" aria-label="Entfernen"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>`;
  const id=p.id;
  row.querySelector('[data-a="info"]').onclick=()=>openInfo(infoCard(p));
  row.querySelector('[data-a="up"]').onclick=()=>movePreview(idx,-1);
  row.querySelector('[data-a="down"]').onclick=()=>movePreview(idx,1);
  row.querySelector('[data-a="edit"]').onclick=()=>openEdit(id);
  row.querySelector('[data-a="rm"]').onclick=()=>pvRemove(id);
  return row;
}
/* Dauerhaftes »Aktuelle Prüfung«-Panel unter der Ziehen-Leiste (im Modus »Prüfung
   erstellen«): zeigt die gezogene Auswahl nummeriert und bearbeitbar. Wird über
   syncSelUI() nach jeder Selektionsänderung aktualisiert. */
function renderCurrentSel(){
  const host=$("#currentSelList"); if(!host) return;
  const plants=selectedPlants();
  const cnt=$("#curselCount"), pts=$("#curselPts");
  if(cnt) cnt.textContent=plants.length;
  if(pts) pts.textContent=fmtPts(plants.length*ptsPer())+" P.";
  host.innerHTML="";
  if(!plants.length){ host.innerHTML='<div class="exempty">Noch nichts gezogen. Oben »Zufällig ziehen« – die gezogene Prüfung erscheint dann hier (Reihenfolge ▲▼, Bearbeiten, Entfernen).</div>'; return; }
  plants.forEach((p,idx)=> host.appendChild(pvRowEl(p,idx,plants.length)));
}

/* ---------- Pflanzen-Info-Modal (aus dem Lern-Tool portiert) ----------
   Dieselbe Info-Karte wie im Lern-Tool: botanische Namensherleitung (offline,
   kuratiert), neutrale Nachschlage-Deep-Links und – OPT-IN per Knopf – ein
   deutscher Wikipedia-Kurztext + Vorschaubild via JSONP (kein fetch/XHR, damit
   der Offline-Kern und check_offline.py unberührt bleiben). Der Prüfungsbogen
   selbst bleibt strikt offline; diese Anreicherung ist rein optional und öffnet
   höchstens einen neuen Tab bzw. lädt erst auf Knopfdruck.
   Das Modal ist im eigenen Namensraum .infoscrim/.infobox gehalten, damit die
   bestehenden .scrim/.modal-Panels (über .open sichtbar) unberührt bleiben. */
/* Prüfwerkzeug-Pflanze (lange Feldnamen) → kompakte Schlüssel der Info-Logik. */
function infoCard(p){
  if(!p) return null;
  return { g:p.gattung||"", a:p.art||"", fam:p.familie||"", de:p.deutscher_name||"",
    syn:p.synonyme||"", thema:"", key:norm((p.gattung||"")+" "+(p.art||"")) };
}

// ---- Namensherleitung (Latein/Griechisch → Deutsch) ----
function binomEpithet(a){
  return (norm(a).split(" ").filter(w=> w && !/^([×x]|var\.|subsp\.|ssp\.|f\.|cv\.|convar\.)$/i.test(w))[0]) || "";
}
function searchName(c){ return norm(c.g+" "+binomEpithet(c.a)); }
/* ---------- Botanische Namensherleitung (Merkhilfe, offline & kuratiert) ----------
   Latein/Griechisch → Deutsch: kurze Bedeutung von Gattung und Art-Epitheton, damit
   sich die botanischen Namen leichter merken lassen. Ganzwort-Wörterbuch plus
   Kompositions-Bausteine (»macro«+»phylla« → großblättrig). Gegen alle 2114 Arten
   geprüft; Unbekanntes wird einfach weggelassen. Rein lokal, kein Netzabruf. */
/* Art-Epitheta als Ganzwörter (die häufigen/unregelmäßigen). */
const LAT_EPI = {
  // Verbreitung/Status
  vulgaris:"gewöhnlich, verbreitet", vulgare:"gewöhnlich, verbreitet", communis:"gemein, häufig",
  officinalis:"Heil-, Arznei- (aus der Apotheke)", officinale:"Heil-, Arznei-",
  sativus:"angebaut, Kultur-", sativa:"angebaut, Kultur-", sativum:"angebaut, Kultur-",
  oleracea:"Gemüse-, Küchen-", oleraceus:"Gemüse-, Küchen-", hortensis:"Garten-", hortorum:"der Gärten",
  domestica:"Haus-, kultiviert", domesticus:"Haus-, kultiviert", esculentus:"essbar", esculentum:"essbar",
  edulis:"essbar", tinctoria:"Färber- (zum Färben)", tinctorius:"Färber-",
  // Größe/Form
  major:"größer", majus:"größer", maior:"größer", minor:"kleiner", minus:"kleiner",
  maxima:"sehr groß", maximus:"sehr groß", minima:"sehr klein", minimus:"sehr klein",
  media:"mittel(groß)", medius:"mittel", nana:"zwergig, klein", nanus:"zwergig, klein", nana_:"zwergig",
  gracilis:"zierlich, schlank", gracile:"zierlich", compacta:"gedrungen, dicht", compactus:"gedrungen",
  elegans:"zierlich, elegant", spectabilis:"ansehnlich, prächtig", nobilis:"edel", speciosa:"prächtig", speciosus:"prächtig",
  // Farben
  alba:"weiß", albus:"weiß", album:"weiß", nigra:"schwarz", niger:"schwarz", nigrum:"schwarz",
  rubra:"rot", ruber:"rot", rubrum:"rot", rubens:"rötlich", rubra_:"rot",
  lutea:"gelb", luteus:"gelb", luteum:"gelb", flava:"gelb", flavus:"gelb", aurea:"golden", aureus:"golden", aureum:"golden",
  caerulea:"blau", caeruleus:"blau", caeruleum:"blau", azurea:"himmelblau",
  purpurea:"purpurn", purpureus:"purpurn", purpureum:"purpurn", violacea:"violett", violaceus:"violett",
  rosea:"rosenrot, rosa", roseus:"rosa", rosa_:"rosa", carnea:"fleischfarben, zartrosa", carneus:"fleischfarben",
  viridis:"grün", viride:"grün", virens:"grünend", glauca:"blaugrün, bereift", glaucus:"blaugrün, bereift", glaucum:"blaugrün",
  argentea:"silbrig", argenteus:"silbrig", argenteum:"silbrig", cinerea:"aschgrau", cinereus:"aschgrau",
  candida:"schneeweiß", candidum:"schneeweiß", incana:"grauweiß behaart", incanus:"grauweiß",
  variegata:"buntlaubig, gescheckt", variegatus:"buntlaubig", versicolor:"farbwechselnd, bunt", discolor:"zweifarbig",
  atropurpurea:"dunkelpurpurn", atropurpureum:"dunkelpurpurn", sanguinea:"blutrot", sanguineus:"blutrot",
  // Lebensraum
  sylvatica:"Wald-, im Wald wachsend", sylvaticus:"Wald-", silvatica:"Wald-", sylvestris:"wild, im Wald", silvestris:"wild, Wald-",
  pratensis:"Wiesen-", pratense:"Wiesen-", palustris:"Sumpf-, im Sumpf", palustre:"Sumpf-",
  montana:"Berg-", montanus:"Berg-", montanum:"Berg-", alpina:"Alpen-, hochgebirgig", alpinus:"Alpen-", alpinum:"Alpen-",
  maritima:"Meeres-, am Meer", maritimus:"Meeres-", arvensis:"Acker-, auf Feldern", arvense:"Acker-",
  campestris:"Feld-, Flur-", campestre:"Feld-", aquatica:"Wasser-, im Wasser", aquaticus:"Wasser-", aquaticum:"Wasser-",
  rupestris:"Felsen-, auf Felsen", rupestre:"Felsen-", saxatilis:"auf Steinen wachsend", nemorosa:"Hain-, im Wäldchen", nemorosus:"Hain-",
  paludosa:"sumpfig", littoralis:"Ufer-, Küsten-", riparia:"Ufer-", ruderalis:"Schutt-, an Wegen",
  // Herkunft
  japonica:"aus Japan", japonicus:"aus Japan", japonicum:"aus Japan", sinensis:"aus China", sinense:"aus China", chinensis:"aus China", chinense:"aus China",
  europaea:"europäisch", europaeus:"europäisch", europaeum:"europäisch", americana:"amerikanisch", americanus:"amerikanisch",
  orientalis:"östlich, orientalisch", orientale:"östlich", occidentalis:"westlich", occidentale:"westlich",
  canadensis:"aus Kanada", virginiana:"aus Virginia", californica:"aus Kalifornien", carolina:"aus Carolina",
  persica:"aus Persien, Pfirsich-", persicum:"aus Persien", indica:"aus Indien", indicus:"aus Indien",
  germanica:"deutsch", germanicus:"deutsch", helvetica:"schweizerisch", austriaca:"österreichisch",
  hispanica:"spanisch", italica:"italienisch", graeca:"griechisch", tatarica:"tatarisch, aus Zentralasien",
  sibirica:"aus Sibirien", sibiricum:"aus Sibirien", caucasica:"aus dem Kaukasus", himalensis:"aus dem Himalaya",
  // Wuchs/Habitus
  repens:"kriechend", reptans:"kriechend", procumbens:"niederliegend", prostrata:"niederliegend", prostratus:"niederliegend",
  pendula:"hängend, überhängend", pendulus:"hängend", pendulum:"hängend", nutans:"nickend, überhängend",
  erecta:"aufrecht", erectus:"aufrecht", erectum:"aufrecht", scandens:"kletternd", volubilis:"windend",
  fastigiata:"säulenförmig, aufstrebend", fastigiatum:"säulenförmig", columnaris:"säulenförmig",
  fruticosa:"strauchig", fruticosus:"strauchig", arborea:"baumartig", arborescens:"baumartig werdend",
  caespitosa:"horstbildend, rasig", caespitosus:"horstbildend", stolonifera:"Ausläufer treibend", stoloniferus:"Ausläufer treibend",
  // Blätter/Textur
  tomentosa:"filzig behaart", tomentosus:"filzig", tomentosum:"filzig", pubescens:"flaumig behaart",
  hirsuta:"rauhaarig", hirsutus:"rauhaarig", hirta:"behaart", villosa:"zottig behaart", villosus:"zottig",
  glabra:"kahl, unbehaart", glaber:"kahl", glabrum:"kahl", glabra_:"kahl", laevis:"glatt", laevigata:"glatt",
  spinosa:"dornig", spinosus:"dornig", spinosum:"dornig", inermis:"wehrlos, dornenlos",
  serrata:"gesägt (Blattrand)", serratus:"gesägt", serrulata:"feingesägt", dentata:"gezähnt", dentatus:"gezähnt",
  crispa:"kraus, gewellt", crispus:"kraus", crispum:"kraus", crispa_:"kraus",
  sempervirens:"immergrün", perennis:"ausdauernd, mehrjährig", perenne:"ausdauernd",
  annua:"einjährig", annuus:"einjährig", annuum:"einjährig", biennis:"zweijährig",
  // Blüte/Frucht/Zahl
  paniculata:"rispenblütig", paniculatum:"rispenblütig", spicata:"ährenblütig", spicatum:"ährig", racemosa:"traubenblütig", racemosus:"traubig",
  umbellata:"doldenblütig", capitata:"kopfig (Blüten in Köpfchen)", capitatum:"kopfig", corymbosa:"doldentraubig",
  baccata:"beerentragend", baccatus:"beerentragend", fruticans:"strauchig blühend",
  floribunda:"reichblütig", floribundus:"reichblütig", multiflora:"vielblütig", multiflorum:"vielblütig",
  grandiflora:"großblütig", grandiflorum:"großblütig", grandiflorus:"großblütig", parviflora:"kleinblütig", parviflorum:"kleinblütig",
  // Duft/Sonstiges
  odorata:"duftend", odoratus:"duftend", odoratum:"duftend", fragrans:"wohlriechend", graveolens:"stark riechend",
  moschata:"moschusduftend", moschatus:"moschusduftend", suaveolens:"lieblich duftend", foetida:"übelriechend", foetidus:"übelriechend",
  dioica:"zweihäusig (Männchen/Weibchen getrennt)", dioicus:"zweihäusig", mas:"männlich", femina:"weiblich",
  aquifolium:"Stechpalme (‚Nadelblatt‘)", helix:"gewunden (Efeu-Ranke)", avellana:"aus Avella (Haselnuss)",
  regia:"königlich, prächtig", regius:"königlich", imperialis:"kaiserlich, prächtig",
  intermedia:"dazwischenstehend, Übergangsform", intermedium:"dazwischenstehend", hybrida:"Kreuzung, Hybride", hybridus:"Hybride",
  aestivalis:"sommerlich", autumnalis:"herbstblühend", autumnale:"herbstblühend", verna:"Frühlings-", vernalis:"Frühlings-", vernus:"Frühlings-",
  praecox:"frühblühend, früh reifend", montana_:"Berg-", officinarum:"der Apotheken, Heil-",
  bulbosa:"knollig, mit Zwiebel", bulbosus:"knollig", tuberosa:"knollentragend", tuberosus:"knollig",
  reflexa:"zurückgebogen", reflexum:"zurückgebogen", recurva:"zurückgekrümmt", divaricata:"sparrig, weit abstehend",
  horizontalis:"waagerecht ausgebreitet", horizontale:"waagerecht", radicans:"wurzelnd", filifera:"fadentragend",
  // Ergänzungen aus dem Abdeckungsreport (häufige echte Epitheta)
  terminalis:"endständig (Blüten am Triebende)", terminale:"endständig",
  palmata:"handförmig gelappt", palmatum:"handförmig gelappt", palmatus:"handförmig gelappt",
  mollis:"weich(haarig)", molle:"weich", avium:"der Vögel, Vogel-",
  laurocerasus:"‚Lorbeerkirsche‘ (Kirschlorbeer)", cordata:"herzförmig (Blatt)", cordatum:"herzförmig", cordatus:"herzförmig",
  calycina:"großkelchig", calycinum:"großkelchig", sanguineum:"blutrot",
  peltata:"schildförmig (Blatt)", peltatum:"schildförmig", pseudonarcissus:"‚falsche Narzisse‘ (Osterglocke)",
  hippocastanum:"‚Rosskastanie‘ (griech. hippos ‚Pferd‘)", betulus:"birkenähnlich (Hainbuche)", biloba:"zweilappig (Blatt)",
  cerasifera:"kirschtragend", robur:"‚Kraft, Stärke‘ (hartes Holz, Stiel-Eiche)", pseudoacacia:"‚Scheinakazie‘ (Robinie)",
  canina:"Hunds- (gemein)", caninus:"Hunds-", opulus:"alter Name des Schneeballs", deliciosa:"köstlich", deliciosus:"köstlich",
  ternata:"dreizählig (Blätter zu dritt)", ternatum:"dreizählig", pumila:"zwergig, niedrig", pumilus:"zwergig", pumilum:"zwergig",
  rugosa:"runzelig (Blatt)", rugosum:"runzelig", caprea:"Ziegen- (Sal-Weide)", nivalis:"Schnee-, früh blühend", nivale:"Schnee-",
  patula:"ausgebreitet, sparrig", patulus:"ausgebreitet", veris:"des Frühlings (Schlüsselblume)",
  tremula:"zitternd (Espe)", tremulus:"zitternd", decidua:"laubabwerfend", deciduus:"laubabwerfend",
  pungens:"stechend, stachelspitzig", stricta:"straff aufrecht", strictus:"straff aufrecht",
  plicata:"gefaltet", plicatum:"gefaltet", viminalis:"Ruten-, biegsam", incarnata:"fleischrot", incarnatus:"fleischrot",
  mucronata:"stachelspitzig", laciniata:"schlitzblättrig", laciniatum:"schlitzblättrig",
  abies:"‚Tanne‘ (alter Name; hier: Fichte)", mugo:"Name der Berg-Kiefer",
  napus:"‚Steckrübe‘ (Raps)", rapa:"‚Rübe‘", cepa:"‚Zwiebel‘", porrum:"‚Lauch‘",
  // Personen-Epitheta (‚nach …‘)
  fortunei:"nach dem Pflanzensammler Robert Fortune", davidii:"nach dem Sammler Armand David",
  wilsonii:"nach dem Sammler E. H. Wilson", arendsii:"nach dem Züchter Georg Arends",
  dammeri:"nach dem Botaniker Udo Dammer", thunbergii:"nach dem Botaniker C. P. Thunberg",
  sargentii:"nach dem Dendrologen C. S. Sargent", henryi:"nach dem Sammler Augustine Henry",
  delavayi:"nach dem Sammler J. M. Delavay", nordmanniana:"nach dem Zoologen A. v. Nordmann",
  lawsoniana:"nach der Baumschule Lawson", hookeri:"nach dem Botaniker J. D. Hooker",
  walleriana:"nach dem Sammler H. Waller", bodnantense:"nach dem Garten Bodnant",
  lamarckii:"nach dem Naturforscher J.-B. de Lamarck", selloana:"nach dem Sammler F. Sellow (Pampasgras)",
  // weitere häufige Standard-Epitheta
  barbata:"bärtig (Haare)", barbatus:"bärtig", barbatum:"bärtig", acaulis:"stängellos (fast bodennah)", acaule:"stängellos",
  stellata:"sternförmig", stellatum:"sternförmig", stellaris:"sternförmig", coccinea:"scharlachrot", coccineum:"scharlachrot", coccineus:"scharlachrot",
  aucuparia:"‚Vogelfang‘ (Vögel fressen die Beeren)", obtusa:"stumpf (Blattspitze)", obtusum:"stumpf", obtusus:"stumpf",
  nitida:"glänzend", nitidum:"glänzend", nitidus:"glänzend", verticillata:"quirlständig (Blätter im Kranz)", verticillatum:"quirlständig",
  cornuta:"gehörnt (gespornt)", cornutum:"gehörnt", cornutus:"gehörnt", subulata:"pfriemlich (schmal-spitz)", subulatum:"pfriemlich",
  majalis:"im Mai blühend", majale:"im Mai blühend", italicum:"italienisch", syriaca:"aus Syrien", syriacus:"aus Syrien",
  koreana:"aus Korea", koreanum:"aus Korea", koreensis:"aus Korea", podagraria:"gegen Gicht (Giersch)",
  cineraria:"aschgrau (Blätter)", florida:"reich blühend", floridum:"reich blühend", floridus:"reich blühend",
  caryophyllus:"nelkenartig (Gewürznelken-Duft)", caryophyllea:"nelkenartig", zonale:"gezont (Blattzeichnung)", zonalis:"gezont",
  amellus:"antiker Name der Berg-Aster", platyphyllos:"breitblättrig", macrorrhizum:"großwurzelig",
  platanoides:"platanenähnlich (Blatt)", bignonioides:"trompetenbaumähnlich", jasminoides:"jasminähnlich", rhamnoides:"kreuzdornähnlich (Sanddorn)",
  telephium:"antiker Name (Große Fetthenne)", filipendulina:"‚fadenhängend‘ (Knöllchen an Wurzeln)",
  endivia:"aus dem Namen für Endivie", coum:"von der Insel Kos", erinus:"antiker Pflanzenname",
  cerasus:"‚Kirsche‘ (nach der Stadt Kerasos)", laevigata:"glatt (kahl)",
  excelsior:"höher, hochragend (Esche)", excelsa:"hochragend", excelsum:"hochragend",
  monogyna:"eingriffelig (ein Griffel, Weißdorn)", pseudoplatanus:"platanenähnlich (Berg-Ahorn)",
  vinifera:"weintragend (Weinrebe)", tuberosum:"knollentragend", foliosum:"reich beblättert", foliosus:"reich beblättert",
  piperita:"pfefferminzartig, scharf", schoenoprasum:"‚Binsenlauch‘ (Schnittlauch)", cerefolium:"‚Freudenblatt‘ (Kerbel)",
  crenata:"gekerbt (Blattrand)", crenatum:"gekerbt", oblonga:"länglich", oblongum:"länglich", oblongus:"länglich",
  alata:"geflügelt (Kork-/Stängelleisten)", alatus:"geflügelt", alatum:"geflügelt", scabra:"rau(haarig)", scabrum:"rau",
  coronaria:"Kranz-, zum Bekränzen", coronarius:"Kranz-", armeniaca:"aus Armenien (Aprikose)",
  nudiflorum:"nacktblütig (Blüte vor dem Laub)", squamata:"schuppig", squamatum:"schuppig",
  colurna:"antiker Name (Baum-Hasel)", vanhouttei:"nach dem Gärtner L. Van Houtte", fraseri:"nach dem Sammler J. Fraser",
  atlantica:"aus dem Atlasgebirge", antarctica:"südlich (aus dem Süden)", tricuspidata:"dreispitzig (Blattlappen)",
  nummularia:"‚Münzen-‘ (rundliche Blätter, Pfennigkraut)", intybus:"antiker Name (Wegwarte)", styraciflua:"‚Storaxfluss‘ (Harz, Amberbaum)",
};

/* Kompositions-Bausteine für zusammengesetzte Epitheta (Vorderteil + Nachsilbe). */
const LAT_PRE = {
  grandi:"groß", magni:"groß", macro:"groß", mega:"groß", parvi:"klein", micro:"klein",
  angusti:"schmal", steno:"schmal", lati:"breit", platy:"breit", longi:"lang", brevi:"kurz", brachy:"kurz",
  rotundi:"rund", ovali:"oval", cordi:"herzförmig", reni:"nieren-", sagitti:"pfeil-",
  tenui:"dünn, zart", crassi:"dick", multi:"viel", poly:"viel", pauci:"wenig", mono:"ein", uni:"ein",
  pinnati:"gefiedert", palmati:"handförmig", denti:"gezähnt", serrati:"gesägt", integri:"ganzrandig",
  laevi:"glatt", glabri:"kahl", tomentosi:"filzig", leuco:"weiß", chloro:"grün", erythro:"rot",
  melano:"schwarz", chryso:"gold", cyano:"blau", purpureo:"purpurn", flori:"blüten-", folii:"blatt-",
  hetero:"verschieden", homo:"gleich", tri:"drei", bi:"zwei", quadri:"vier", quinque:"fünf",
};
const LAT_SUF = {
  folia:"blättrig", folius:"blättrig", folium:"blättrig", phylla:"blättrig", phyllus:"blättrig", phyllum:"blättrig", phyllos:"blättrig",
  flora:"blütig", florus:"blütig", florum:"blütig", flos:"-blütig", anthos:"blütig", antha:"blütig", anthum:"blütig", anthus:"blütig",
  carpa:"früchtig", carpus:"früchtig", carpum:"früchtig", carpos:"früchtig",
  caulis:"stängelig", caule:"stängelig", nervis:"nervig", nervia:"nervig", spina:"dornig", spinus:"dornig",
  petala:"blütenblättrig", stachya:"ährig", stachys:"ährig", pogon:"bärtig", rhiza:"wurzelig",
};

/* Gattungsnamen – Bedeutung/Merkhilfe (die häufigsten/bekanntesten). */
const LAT_GEN = {
  Acer:"lat. für Ahorn (‚scharf‘ – hartes Holz)", Quercus:"lat. für Eiche", Fagus:"lat. für Buche",
  Betula:"lat. für Birke", Alnus:"lat. für Erle", Salix:"lat. für Weide (‚springen, wachsen‘)",
  Populus:"lat. für Pappel", Tilia:"lat. für Linde", Ulmus:"lat. für Ulme", Fraxinus:"lat. für Esche",
  Carpinus:"lat. für Hainbuche", Corylus:"lat. für Hasel", Castanea:"nach der Stadt Kastanaia (Edelkastanie)",
  Juglans:"‚Jupiters Eichel‘ (Walnuss)", Aesculus:"röm. Eichenart (Rosskastanie)", Robinia:"nach dem Gärtner J. Robin",
  Prunus:"lat. für Pflaume/Kirsche", Malus:"lat. für Apfel", Pyrus:"lat. für Birne", Cydonia:"nach der Stadt Kydonia (Quitte)",
  Rosa:"lat. für Rose", Rubus:"lat. für Brombeere/Himbeere", Fragaria:"‚duftend‘ (Erdbeere)", Crataegus:"‚Kraft, hart‘ (Weißdorn)",
  Sorbus:"lat. für Vogelbeere/Mehlbeere", Cotoneaster:"‚quittenartig‘ (Zwergmispel)", Amelanchier:"altfranz. Name (Felsenbirne)",
  Ribes:"vom arabischen ‚ribas‘ (Johannisbeere)", Vaccinium:"lat. für Heidelbeere",
  Picea:"lat. für Fichte (‚Pech‘)", Abies:"lat. für Tanne", Pinus:"lat. für Kiefer/Föhre", Larix:"lat. für Lärche",
  Taxus:"lat. für Eibe", Juniperus:"lat. für Wacholder", Thuja:"griech. ‚thyia‘ (Lebensbaum)", Cedrus:"griech. für Zeder",
  Fabaceae:"", // Platzhalter, nicht genutzt
  Allium:"lat. für Knoblauch/Lauch", Lilium:"lat. für Lilie", Tulipa:"von türk. ‚tülbend‘ (Turban)", Narcissus:"nach der griech. Sagengestalt",
  Iris:"griech. Regenbogen (Farbenpracht)", Crocus:"griech. ‚krokos‘ (Safran)", Hyacinthus:"nach der griech. Sagengestalt",
  Aster:"griech. ‚Stern‘ (Blütenform)", Bellis:"lat. ‚hübsch‘ (Gänseblümchen)", Chrysanthemum:"griech. ‚Goldblume‘",
  Helianthus:"griech. ‚Sonnenblume‘", Solidago:"‚heilen, festigen‘ (Goldrute)", Achillea:"nach Achilles (Schafgarbe)",
  Campanula:"lat. ‚Glöckchen‘ (Glockenblume)", Digitalis:"lat. ‚Fingerhut‘", Salvia:"‚heilen‘ (Salbei)",
  Lavandula:"‚waschen‘ (Lavendel, für Bäder)", Thymus:"griech. ‚thymon‘ (Thymian)", Mentha:"nach der Nymphe Minthe (Minze)",
  Sedum:"lat. ‚sitzen‘ (Mauerpfeffer, sitzt auf Steinen)", Sempervivum:"‚immer lebend‘ (Hauswurz)",
  Hedera:"lat. für Efeu", Vinca:"‚binden, umschlingen‘ (Immergrün)", Clematis:"griech. ‚Ranke‘ (Waldrebe)",
  Hydrangea:"griech. ‚Wassergefäß‘ (Hortensie)", Rhododendron:"griech. ‚Rosenbaum‘", Erica:"griech. für Heide",
  Viburnum:"lat. für Schneeball", Sambucus:"lat. für Holunder", Lonicera:"nach dem Botaniker A. Lonitzer (Heckenkirsche)",
  Cornus:"lat. ‚Horn‘ (hartes Holz, Hartriegel)", Euonymus:"griech. ‚gut benannt‘ (Pfaffenhütchen)",
  Berberis:"vom arab. Namen (Berberitze)", Ligustrum:"lat. für Liguster", Buxus:"griech./lat. für Buchsbaum",
  Ilex:"lat. für Stechpalme", Magnolia:"nach dem Botaniker P. Magnol", Forsythia:"nach dem Gärtner W. Forsyth",
  Brassica:"lat. für Kohl", Beta:"lat. für Rübe/Bete", Daucus:"griech. für Möhre", Apium:"lat. für Sellerie/Eppich",
  Lactuca:"‚Milch‘ (Milchsaft, Salat)", Cichorium:"vom griech. Namen (Zichorie)", Petroselinum:"griech. ‚Felsen-Eppich‘ (Petersilie)",
  Solanum:"lat. Nachtschatten", Cucumis:"lat. für Gurke/Melone", Cucurbita:"lat. für Kürbis", Phaseolus:"griech. für Bohne",
  Pisum:"lat. für Erbse", Allium_:"", Spinacia:"vom pers. Namen (Spinat)",
  Carex:"lat. für Segge", Festuca:"lat. ‚Halm‘ (Schwingel)", Poa:"griech. ‚Gras, Futter‘ (Rispengras)",
  Primula:"‚die Erste‘ (Frühblüher, Schlüsselblume)", Viola:"lat. für Veilchen", Bergenia:"nach dem Botaniker K. v. Bergen",
  Hosta:"nach dem Botaniker N. Host (Funkie)", Astilbe:"griech. ‚ohne Glanz‘", Geranium:"griech. ‚Kranich‘ (Storchschnabel)",
  Dianthus:"griech. ‚Götterblume‘ (Nelke)", Paeonia:"nach dem Arzt Paion (Pfingstrose)", Papaver:"lat. für Mohn",
  Anemone:"griech. ‚Wind‘ (Windröschen)", Ranunculus:"lat. ‚Fröschlein‘ (Hahnenfuß, feuchte Standorte)",
  Begonia:"nach dem Förderer M. Bégon", Pelargonium:"griech. ‚Storch‘ (Geranie)", Fuchsia:"nach dem Botaniker L. Fuchs",
  Ginkgo:"vom japan. Namen (Fächerblattbaum)", Camellia:"nach dem Botaniker G. Kamel", Syringa:"griech. ‚Röhre‘ (Flieder)",
  Wisteria:"nach dem Anatomen C. Wistar (Blauregen)", Weigela:"nach dem Botaniker C. E. Weigel",
  Deutzia:"nach dem Förderer J. van der Deutz", Spiraea:"griech. ‚Spirale‘ (Spierstrauch)", Philadelphus:"griech. ‚Bruderliebe‘ (Pfeifenstrauch)",
  Potentilla:"lat. ‚kleine Kraft‘ (Fingerkraut, Heilpflanze)", Hypericum:"griech. Name (Johanniskraut)", Mahonia:"nach dem Gärtner B. McMahon",
  Pachysandra:"griech. ‚dicke Staubblätter‘ (Ysander)", Pulmonaria:"lat. ‚Lunge‘ (Lungenkraut, Heilpflanze)",
  Brunnera:"nach dem Botaniker S. Brunner", Heuchera:"nach dem Mediziner J. H. Heucher (Purpurglöckchen)",
  Epimedium:"alter griech. Pflanzenname (Elfenblume)", Helleborus:"griech. Name (Christrose, giftig)",
  Aquilegia:"lat. ‚Adler‘ (Akelei, gespornte Blüten)", Delphinium:"griech. ‚Delfin‘ (Rittersporn, Knospenform)",
  Aconitum:"griech. Name (Eisenhut, sehr giftig)", Phlox:"griech. ‚Flamme‘ (Flammenblume)",
  Echinacea:"griech. ‚Igel‘ (stacheliger Blütenboden)", Rudbeckia:"nach dem Botaniker O. Rudbeck (Sonnenhut)",
  Lupinus:"lat. ‚Wolf‘ (Lupine, ‚zehrt den Boden aus‘)", Nepeta:"nach der Stadt Nepete (Katzenminze)",
  Stachys:"griech. ‚Ähre‘ (Ziest)", Ajuga:"Name des Günsels", Verbena:"lat. für heiliges Kraut (Eisenkraut)",
  Anthemis:"griech. ‚Blüte‘ (Hundskamille)", Matricaria:"lat. ‚Mutter‘ (Kamille, Frauenheilkunde)",
  Calendula:"lat. ‚kleiner Kalender‘ (Ringelblume, blüht lange)", Tagetes:"nach dem etrusk. Gott Tages (Studentenblume)",
  Hemerocallis:"griech. ‚Tagesschönheit‘ (Taglilie)", Convallaria:"lat. ‚Tal‘ (Maiglöckchen)",
  Galanthus:"griech. ‚Milchblume‘ (Schneeglöckchen)", Muscari:"‚Moschus‘ (Traubenhyazinthe, Duft)",
  Fritillaria:"lat. ‚Würfelbecher‘ (Schachblume, Musterung)", Colchicum:"nach der Landschaft Kolchis (Herbstzeitlose)",
  Cyclamen:"griech. ‚Kreis‘ (Alpenveilchen, gedrehte Stiele)", Impatiens:"lat. ‚ungeduldig‘ (schleudernde Samen)",
  Petunia:"vom Tupí-Wort für Tabak", Viola_:"", Antirrhinum:"griech. ‚Nasenähnlich‘ (Löwenmäulchen)",
  Cotinus:"griech. Name (Perückenstrauch)", Hibiscus:"griech./lat. Name (Eibisch)", Laburnum:"lat. Name (Goldregen, giftig)",
  Ostrya:"griech. Name (Hopfenbuche)", Platanus:"griech. ‚breit‘ (Platane, breite Blätter)", Liquidambar:"lat. ‚flüssiger Bernstein‘ (Amberbaum, Harz)",
};
/* Gattungs-Wörterbuch vervollständigt: Ergänzungen, damit praktisch jede Art der Listen
   mindestens eine Herleitung (Gattung oder Epitheton) bekommt (~100 %). »X-Hybriden«
   und Gattungshybriden (×…) lösen über nameEtymology auf die Basisgattung auf. */
Object.assign(LAT_GEN, {
  Ficus:"lat. für Feige", Euphorbia:"nach dem Leibarzt Euphorbos (Wolfsmilch, Milchsaft)",
  Plectranthus:"griech. ‚Sporn-Blume‘ (Harfenstrauch)", Asplenium:"griech. ‚ohne Milz‘ (Milzfarn, Heilpflanze)",
  Artemisia:"nach der Göttin Artemis (Beifuß/Wermut)", Citrus:"lat. für Zitrusbaum",
  Rumex:"lat. für Ampfer", Yucca:"aus einem karibischen Pflanzennamen (Palmlilie)",
  Taraxacum:"vom arab./pers. Namen (Löwenzahn)", Ageratum:"griech. ‚nicht alternd‘ (Leberbalsam)",
  Lantana:"alter Name des Schneeballs (Wandelröschen)", Blechnum:"griech. für Farn (Rippenfarn)",
  Dryopteris:"griech. ‚Eichenfarn‘ (Wurmfarn)", Veronica:"nach der hl. Veronika (Ehrenpreis)",
  Aubrieta:"nach C. Aubriet (Blaukissen)", Amaranthus:"griech. ‚unverwelklich‘ (Fuchsschwanz)",
  Trifolium:"lat. ‚Dreiblatt‘ (Klee)", Cytisus:"griech. Name (Geißklee/Ginster)",
  Daphne:"nach der Nymphe Daphne (Seidelbast)", Nerium:"griech. Name (Oleander)",
  Buddleja:"nach dem Botaniker A. Buddle (Sommerflieder)", Caryopteris:"griech. ‚Nuss-Flügel‘ (Bartblume)",
  Cercis:"griech. ‚Weberschiffchen‘ (Judasbaum, Schoten)", Gleditsia:"nach dem Botaniker J. G. Gleditsch (Lederhülsenbaum)",
  Kolkwitzia:"nach dem Botaniker R. Kolkwitz (Kolkwitzie)", Liriodendron:"griech. ‚Lilienbaum‘ (Tulpenbaum)",
  Metasequoia:"griech. ‚ähnlich der Sequoia‘ (Urwelt-Mammutbaum)", Pseudotsuga:"griech. ‚falsche Tsuga‘ (Douglasie)",
  Rhus:"griech./lat. Name (Sumach/Essigbaum)", Sequoiadendron:"nach dem Cherokee Sequoyah + ‚Baum‘ (Mammutbaum)",
  Symphoricarpos:"griech. ‚zusammengehäufte Früchte‘ (Schneebeere)", Cephalotaxus:"griech. ‚Kopf-Eibe‘ (Kopfeibe)",
  Chamaecyparis:"griech. ‚Zwerg-Zypresse‘ (Scheinzypresse)", Thujopsis:"griech. ‚thujaähnlich‘ (Hiba-Lebensbaum)",
  Callitropsis:"griech. ‚schön gedreht‘ (Zypressenart)", Xanthocyparis:"griech. ‚gelbe Zypresse‘",
  Cryptomeria:"griech. ‚verborgene Teile‘ (Sicheltanne)", Ailanthus:"vom molukk. ‚ailanto‘ = ‚Himmelsbaum‘ (Götterbaum)",
  Albizia:"nach dem Naturforscher F. degli Albizzi (Seidenbaum)", Aralia:"aus einem frz.-kanad. Namen (Aralie)",
  Araucaria:"nach der chilen. Region Arauco (Andentanne)", Arbutus:"lat. für Erdbeerbaum",
  Callicarpa:"griech. ‚schöne Frucht‘ (Schönfrucht)", Campsis:"griech. ‚Krümmung‘ (Klettertrompete)",
  Celtis:"lat./griech. Name (Zürgelbaum)", Elaeagnus:"griech. ‚Ölweide‘",
  Genista:"lat. für Ginster", Neillia:"nach dem Gärtner P. Neill",
  Olea:"lat. für Ölbaum (Olive)", Osmanthus:"griech. ‚Duftblüte‘ (Duftblüte)",
  Pittosporum:"griech. ‚Pech-Same‘ (harzige Samen, Klebsame)", Chaenomeles:"griech. ‚klaffender Apfel‘ (Zierquitte)",
  Pyracantha:"griech. ‚Feuerdorn‘", Pterocarya:"griech. ‚Flügelnuss‘ (Flügelnuss)",
  Hebe:"nach der Göttin Hebe", Muehlenbeckia:"nach dem Arzt H. G. Mühlenbeck (Drahtstrauch)",
  Ceratostigma:"griech. ‚Horn-Narbe‘ (Bleiwurz, Hornnarbe)", Eucalyptus:"griech. ‚gut bedeckt‘ (Knospendeckel, Eukalyptus)",
  Callistemon:"griech. ‚schöne Staubfäden‘ (Zylinderputzer)", Fallopia:"nach dem Anatomen G. Falloppio (Flügelknöterich)",
  Athyrium:"griech. Name (Frauenfarn)", Polystichum:"griech. ‚vielreihig‘ (Schildfarn, Sori in Reihen)",
  Adiantum:"griech. ‚unbenetzbar‘ (Frauenhaarfarn)", Matteuccia:"nach dem Physiker C. Matteucci (Straußenfarn)",
  Onoclea:"griech. Name (Perlfarn)", Osmunda:"alter Name des Königsfarns (Herkunft unsicher)",
  Nephrolepis:"griech. ‚Nieren-Schuppe‘ (Schwertfarn)", Platycerium:"griech. ‚breites Horn‘ (Geweihfarn)",
  Acaena:"griech. ‚Dorn‘ (Stachelnüsschen)", Bidens:"lat. ‚zweizähnig‘ (Zweizahn, Früchte)",
  Calystegia:"griech. ‚Kelch-Dach‘ (Zaunwinde)", Convolvulus:"lat. ‚sich windend‘ (Winde)",
  Saxifraga:"lat. ‚Stein-brechend‘ (Steinbrech, wächst in Felsspalten)", Teucrium:"nach dem König Teukros (Gamander)",
  Leucanthemum:"griech. ‚weiße Blume‘ (Margerite)", Ligularia:"lat. ‚kleine Zunge‘ (Goldkolben, Zungenblüten)",
  Rodgersia:"nach dem Marineoffizier J. Rodgers (Schaublatt)", Bistorta:"lat. ‚zweimal gedreht‘ (Wiesenknöterich, Wurzel)",
  Lamium:"lat./griech. Name (Taubnessel)", Physalis:"griech. ‚Blase‘ (Andenbeere/Lampionblume)",
  Eranthis:"griech. ‚Frühlingsblume‘ (Winterling)", Alisma:"griech. Name (Froschlöffel)",
  Butomus:"griech. ‚Rinder-Schneide‘ (Schwanenblume, scharfe Blätter)", Schoenoplectus:"griech. ‚Binsen-Geflecht‘ (Teichsimse)",
  Ocimum:"griech. Name (Basilikum)", Phacelia:"griech. ‚Büschel‘ (Büschelblume)",
  Dryas:"nach den griech. Baumnymphen (Silberwurz)", Helenium:"nach Helena (Sonnenbraut)",
  Helianthemum:"griech. ‚Sonnenblümchen‘ (Sonnenröschen)", Heracleum:"nach Herakles (Bärenklau, kräftig)",
  Lysimachia:"nach König Lysimachos (Felberich/Gilbweiderich)", Lythrum:"griech. ‚geronnenes Blut‘ (Blutweiderich)",
  Scilla:"griech./lat. Name (Blaustern)", Verbascum:"lat. für Königskerze",
  Centaurea:"nach dem Kentauren Chiron (Flockenblume)", Cimicifuga:"lat. ‚Wanzen vertreibend‘ (Silberkerze)",
  Deschampsia:"nach L. Deschamps (Schmiele)", Eremurus:"griech. ‚Steppenschwanz‘ (Steppenkerze)",
  Menyanthes:"griech. Name (Fieberklee)", Monarda:"nach dem Arzt N. Monardes (Indianernessel)",
  Waldsteinia:"nach dem Botaniker F. v. Waldstein (Golderdbeere)", Gentiana:"nach König Gentius (Enzian)",
  Aloe:"vom arab./hebr. Namen (Aloe)", Crassula:"lat. ‚etwas dick‘ (Dickblatt)",
  Dahlia:"nach dem Botaniker A. Dahl (Dahlie/Georgine)", Hippeastrum:"griech. ‚Ritterstern‘ (Ritterstern)",
  Kalanchoe:"aus einem chines. Namen (Flammendes Käthchen)", Cynara:"griech. Name (Artischocke)",
  Aichryson:"griech. Name (verwandt mit Aeonium)", Ajania:"nach dem Ort Ajan (Ostasien)",
  Alternanthera:"lat. ‚abwechselnde Staubblätter‘ (Papageienblatt)", Delosperma:"griech. ‚sichtbarer Same‘ (Mittagsblume)",
  Echeveria:"nach dem Zeichner A. Echeverría (Echeverie)", Raoulia:"nach dem Arzt É. Raoul (Scheinpolster)",
  Perovskia:"nach dem General W. Perowski (Blauraute)", Geum:"lat. Name (Nelkenwurz)",
  Erigeron:"griech. ‚früh-greis‘ (Berufkraut, frühe weißhaarige Früchte)", Gaura:"griech. ‚prächtig‘ (Prachtkerze)",
  Heliopsis:"griech. ‚sonnenähnlich‘ (Sonnenauge)", Nymphaea:"griech. ‚Nymphe‘ (Seerose)",
  Pennisetum:"lat. ‚Feder-Borste‘ (Lampenputzergras)", Calamagrostis:"griech. ‚Rohrgras‘",
  Echinochloa:"griech. ‚Igel-Gras‘ (Hühnerhirse)", Leymus:"Anagramm von Elymus (Strandroggen)",
  Alopecurus:"griech. ‚Fuchsschwanz‘ (Fuchsschwanzgras)", Panicum:"lat. für Hirse (Rispenhirse)",
  Secale:"lat. für Roggen", Zea:"griech. Name eines Getreides (Mais)",
  Cyperus:"griech. Name (Zypergras)", Luzula:"alter Name (Hainsimse)",
  Gladiolus:"lat. ‚kleines Schwert‘ (Siegwurz, schwertförmige Blätter)", Leucojum:"griech. ‚weißes Veilchen‘ (Knotenblume)",
  Alstroemeria:"nach dem Naturforscher C. Alströmer (Inkalilie)", Camassia:"aus einem indian. Namen (Prärielilie)",
  Anthericum:"griech. Name (Graslilie)", Ornithogalum:"griech. ‚Vogelmilch‘ (Milchstern)",
  Freesia:"nach dem Arzt F. Freese (Freesie)", Acorus:"griech. Name (Kalmus)",
  Agapanthus:"griech. ‚Liebesblume‘ (Schmucklilie)", Citrullus:"lat. Verkleinerung von citrus (Wassermelone)",
  Rheum:"griech. Name (Rhabarber)", Valerianella:"lat. ‚kleiner Baldrian‘ (Feldsalat)",
  Origanum:"griech. ‚Berg-Zierde‘ (Majoran/Oregano)", Plantago:"lat. ‚Fußsohle‘ (Wegerich, breite Blätter)",
  Capsella:"lat. ‚Täschchen‘ (Hirtentäschel, Früchte)", Actinidia:"griech. ‚Strahl‘ (Kiwi, strahlige Griffel)",
  Punica:"lat. ‚punisch‘ (Granatapfel, ‚aus Karthago‘)", Diospyros:"griech. ‚Götterfrucht‘ (Dattelpflaume)",
  Oxalis:"griech. ‚sauer‘ (Sauerklee)", Capsicum:"griech. ‚beißen‘ (Paprika/Chili, scharf)",
  Armoracia:"lat. Name (Meerrettich)", Cyphomandra:"griech. ‚gewölbte Staubbeutel‘ (Baumtomate)",
  Glycine:"griech. ‚süß‘ (Sojabohne)", Lens:"lat. für Linse",
  Claytonia:"nach dem Botaniker J. Clayton (Postelein)", Tetragonia:"griech. ‚viereckig‘ (Neuseeländer Spinat, Früchte)",
  Vicia:"lat. für Wicke", Angelica:"lat. ‚engelhaft‘ (Engelwurz, Heilkraft)",
  Carum:"griech./lat. Name (Kümmel)", Pimpinella:"mittellat. Name (Bibernelle/Anis)",
  Senecio:"lat. ‚Greis‘ (Greiskraut, weiße Haarkrone)", Onobrychis:"griech. ‚Esels-Futter‘ (Esparsette)",
  Asimina:"aus einem indian. Namen (Papau/Indianerbanane)", Musa:"vom arab. ‚mauz‘ (Banane)",
  Tussilago:"lat. ‚Husten vertreiben‘", Urtica:"lat. ‚brennen‘ (Brennnessel)",
  Mandevilla:"nach dem Diplomaten H. Mandeville (Dipladenia)", Petunie:"vom Tupí-Wort für Tabak (Petunie)",
  Cetraria:"lat. ‚cetra‘ = Lederschild (Isländisch Moos, Flechte)", Sphagnum:"griech. Name (Torf-/Sumpfmoos)",
  "×Fatshedera":"Gattungshybride aus Fatsia × Hedera (Efeuaralie)", "×Hesperotropsis":"Gattungshybride (Zypressen-Kreuzung)",
  Acanthus:"griech. ‚Dorn‘ (Bärenklau/Akanthus)", Agastache:"griech. ‚viele Ähren‘ (Duftnessel)",
  Anaphalis:"griech. Name (Perlkörbchen)", Arabis:"‚aus Arabien‘ (Gänsekresse)",
  Aruncus:"griech. ‚Ziegenbart‘ (Wald-Geißbart)", Astilboides:"griech. ‚astilbeähnlich‘ (Schildblatt)",
  Calamintha:"griech. ‚schöne Minze‘ (Bergminze)", Chelone:"griech. ‚Schildkröte‘ (Schildblume, Blütenform)",
  Dicentra:"griech. ‚zweispornig‘ (Herzblume/Tränendes Herz)", Echinops:"griech. ‚igelähnlich‘ (Kugeldistel)",
  Inula:"lat. Name (Alant)", Knautia:"nach dem Arzt C. Knaut (Witwenblume)",
  Linum:"lat. für Lein/Flachs", Lithospermum:"griech. ‚Steinsame‘ (Steinsame, harte Nüsschen)",
  Malva:"lat. für Malve", Phlomis:"griech. Name (Brandkraut)",
  Saponaria:"lat. ‚Seife‘ (Seifenkraut, schäumt)", Scutellaria:"lat. ‚kleine Schale‘ (Helmkraut, Kelchform)",
  Silene:"nach dem Waldgott Silenus (Leimkraut)", Stratiotes:"griech. ‚Soldat‘ (Krebsschere, schwertförmig)",
  Nigella:"lat. ‚schwärzlich‘ (Jungfer im Grünen, schwarze Samen)", Cosmos:"griech. ‚Schmuck, Ordnung‘ (Schmuckkörbchen)",
  Cleome:"alter Pflanzenname (Spinnenblume)", Cuphea:"griech. ‚gekrümmt‘ (Köcherblümchen, Frucht)",
  Limonium:"griech. ‚Wiese‘ (Strandflieder)", Erysimum:"griech. Name (Schöterich/Goldlack)",
  Glechoma:"griech. Name (Gundermann)", Helichrysum:"griech. ‚Gold-Sonne‘ (Strohblume)",
  Nemesia:"altgriech. Pflanzenname (Elfenspiegel)", Diascia:"griech. ‚zwei Säckchen‘ (Doppelsporn)",
  Calceolaria:"lat. ‚Pantöffelchen‘ (Pantoffelblume)", Scaevola:"lat. ‚linkshändig‘ (Fächerblume, einseitige Blüte)",
  Portulaca:"lat. Name (Portulak)", Ipomoea:"griech. ‚wurmähnlich‘ (Prunkwinde, windender Stängel)",
  Torenia:"nach dem Pfarrer O. Torén (Wishbone-Blume)", Gerbera:"nach dem Botaniker T. Gerber (Gerbera)",
  Osteospermum:"griech. ‚Knochen-Same‘ (Kapkörbchen, harte Samen)", Argyranthemum:"griech. ‚Silberblume‘ (Strauchmargerite)",
  Brachyscome:"griech. ‚kurzhaarig‘ (Blaues Gänseblümchen)", Gazania:"nach dem Gelehrten T. Gaza (Mittagsgold)",
  Santolina:"lat. ‚heiliger Flachs‘ (Heiligenkraut)", Leucophyta:"griech. ‚weiße Pflanze‘ (Silberdraht)",
  Calocephalus:"griech. ‚schöner Kopf‘ (Stacheldraht­strauch)", Cotula:"griech. ‚Becherchen‘ (Fiederpolster)",
  Azorella:"Verkleinerung (Andenpolster)", Ambrosia:"griech. ‚Götterspeise‘ (Traubenkraut/Ragweed)",
  Anthurium:"griech. ‚Blüten-Schwanz‘ (Flamingoblume)", Asparagus:"griech./lat. Name (Zierspargel)",
  Philodendron:"griech. ‚Baum-liebend‘ (Kletterpflanze)", Schefflera:"nach dem Botaniker J. C. Scheffler (Strahlenaralie)",
  Chlorophytum:"griech. ‚Grünpflanze‘ (Grünlilie)", Codiaeum:"molukk. Name (Kroton)",
  Guzmania:"nach dem Apotheker A. Guzmán (Guzmanie)", Nicotiana:"nach J. Nicot (Tabak)",
  Phalaenopsis:"griech. ‚falterähnlich‘ (Schmetterlingsorchidee)", Saintpaulia:"nach dem Sammler W. v. Saint Paul (Usambaraveilchen)",
  Spathiphyllum:"griech. ‚Spatha-Blatt‘ (Einblatt)", Sansevieria:"nach dem Fürsten v. Sanseverino (Bogenhanf)",
  Abutilon:"vom arab. Namen (Schönmalve)", Aechmea:"griech. ‚Speerspitze‘ (Lanzenrosette)",
  Aglaonema:"griech. ‚glänzender Faden‘ (Kolbenfaden)", Aphelandra:"griech. ‚einfache Staubblätter‘",
  Beaucarnea:"nach J. Beaucarne (Elefantenfuß)", Calathea:"griech. ‚Korb‘ (Korbmarante)",
  Canna:"griech./lat. ‚Rohr‘ (Blumenrohr)", Cattleya:"nach dem Gärtner W. Cattley (Cattleye)",
  Clivia:"nach Lady Charlotte Clive (Klivie)", Cycas:"griech. Name (Palmfarn)",
  Cymbidium:"griech. ‚Kahn‘ (Kahnorchidee)", Dieffenbachia:"nach dem Gärtner J. Dieffenbach",
  Dracaena:"griech. ‚Drachin‘ (Drachenbaum)", Echinocactus:"griech. ‚Igel-Kaktus‘ (Goldkugelkaktus)",
  Exacum:"lat. Name (Blaues Lieschen)", Hoya:"nach dem Gärtner T. Hoy (Wachsblume)",
  Maranta:"nach dem Arzt B. Maranti (Pfeilwurz)", Medinilla:"nach dem Gouverneur J. de Medinilla",
  Paphiopedilum:"griech. ‚Venus-Schuh‘ (Frauenschuh-Orchidee)", Peperomia:"griech. ‚pfefferähnlich‘ (Zwergpfeffer)",
  Phoenix:"griech. Name (Dattelpalme)", Pilea:"lat. ‚Filzkappe‘ (Kanonierblume)",
  Plumbago:"lat. ‚Blei‘ (Bleiwurz)", Rhipsalidopsis:"griech. ‚rhipsalisähnlich‘ (Osterkaktus)",
  Schlumbergera:"nach dem Sammler F. Schlumberger (Weihnachtskaktus)", Soleirolia:"nach dem Offizier J. Soleirol (Bubikopf)",
  Strelitzia:"nach Königin Charlotte v. Mecklenburg-Strelitz (Paradiesvogelblume)", Streptocarpus:"griech. ‚gedrehte Frucht‘ (Drehfrucht)",
  Syngonium:"griech. ‚zusammen-Frucht‘ (Purpurtute)", Tillandsia:"nach dem Botaniker E. Tillandz",
  Tradescantia:"nach dem Gärtner J. Tradescant (Dreimasterblume)", Vriesea:"nach dem Botaniker W. de Vriese (Vriesie)",
  Zamioculcas:"aus Zamia + arab. ‚culcas‘ (Glücksfeder)", Zantedeschia:"nach dem Botaniker G. Zantedeschi (Calla)",
  Calibrachoa:"nach dem Botaniker A. de Cal y Bracho (Zauberglöckchen)", Coleus:"griech. ‚Scheide‘ (Buntnessel; heute Plectranthus)",
  Chimonanthus:"griech. ‚Winterblüte‘ (Winterblüte)",
});



/* »Alle Namensbestandteile erklären« – Wörterbuch vervollständigt: echte Übersetzungen
   (Epitheta), Kompositions-Bausteine und die restlichen Gattungen. Struktur-Fallbacks in
   latGloss (Personen-Widmung/Herkunft/Ähnlichkeit) fangen den Rest ehrlich ab. */
Object.assign(LAT_EPI, {
  pileata:"mützenförmig", dumosus:"buschig (Kissen-Aster)",
  fulgida:"glänzend", fulgens:"glänzend rot",
  giganteum:"riesig (Mammutbaum)", giganteus:"riesig",
  gigantea:"riesig", corymbosum:"doldentraubig (Kulturheidelbeere)",
  corymbosus:"doldentraubig", micrantha:"kleinblütig",
  micranthus:"kleinblütig", comosum:"schopftragend",
  comosa:"schopftragend", frutescens:"strauchig werdend",
  cucullata:"kapuzenförmig", cucullatum:"kapuzenförmig",
  acre:"scharf (brennend)", acris:"scharf",
  umbrosa:"schattenliebend", umbrosum:"schattenliebend",
  umbellatus:"doldig", umbellatum:"doldig",
  salicifolius:"weidenblättrig", salicifolia:"weidenblättrig",
  lanceolata:"lanzettlich (Blatt)", lanceolatum:"lanzettlich",
  lanceolatus:"lanzettlich", magnifica:"prächtig",
  magnificum:"prächtig", deltoides:"dreieckig",
  deltoideum:"dreieckig", hyemalis:"winterblühend (Winterling)",
  hiemalis:"winterblühend", lactiflora:"milchweiß blühend",
  lactiflorum:"milchweiß blühend", arguta:"scharf gesägt",
  argutus:"scharf gesägt", filamentosa:"fädig (Yucca)",
  splendens:"prächtig glänzend", procera:"hochgewachsen (Edel-Tanne)",
  procerus:"hochgewachsen", glutinosa:"klebrig (Schwarz-Erle)",
  glutinosus:"klebrig", altissima:"sehr hoch",
  altissimum:"sehr hoch", persicifolia:"pfirsichblättrig",
  persicifolius:"pfirsichblättrig", decapetalus:"zehnblättrig (Blüte)",
  superbum:"prächtig", superba:"prächtig",
  superbus:"prächtig", punctata:"punktiert",
  punctatum:"punktiert", salicaria:"weidenartig",
  denticulata:"kleingezähnt", denticulatum:"kleingezähnt",
  flavescens:"gelblich", lanatus:"wollig behaart",
  lanata:"wollig", reticulata:"netznervig",
  reticulatum:"netznervig", dulcis:"süß (Süßmandel)",
  dulce:"süß", triloba:"dreilappig (Mandelbäumchen)",
  trilobum:"dreilappig", trifoliata:"dreiblättrig",
  trifoliatum:"dreiblättrig", affinis:"verwandt, ähnlich",
  affine:"verwandt", glomerata:"geknäuelt (Blüten)",
  glomeratum:"geknäuelt", dealbata:"weiß bestäubt",
  dealbatum:"weiß bestäubt", ramosa:"ästig, verzweigt",
  ramosus:"verzweigt", cespitosa:"horstbildend",
  cespitosum:"horstbildend", plumarius:"gefranst (Feder-Nelke)",
  robustus:"kräftig", robusta:"kräftig",
  sylvaticum:"Wald-", regalis:"königlich",
  regale:"königlich (Königs-Lilie)", floriferum:"blütentragend",
  floriferus:"blütentragend", elatum:"hochgewachsen",
  elata:"hochgewachsen", elatus:"hochgewachsen",
  densiflorus:"dichtblütig", densiflora:"dichtblütig",
  variegatum:"buntlaubig", ovata:"eiförmig (Blatt)",
  ovatum:"eiförmig", ovatus:"eiförmig",
  elastica:"elastisch (Kautschuk-)", concolor:"einfarbig (Kolorado-Tanne)",
  aspera:"rau(haarig)", asperum:"rau",
  asper:"rau", incisa:"eingeschnitten (Fuji-Kirsche)",
  incisum:"eingeschnitten", laxa:"locker (Blütenstand)",
  laxum:"locker", laxus:"locker",
  gramineus:"grasartig", gramineum:"grasartig",
  acutifolia:"spitzblättrig", acutifolius:"spitzblättrig",
  buxifolia:"buchsblättrig", buxifolium:"buchsblättrig",
  octopetala:"achtblättrig (Silberwurz)", repanda:"geschweift (Blattrand)",
  repandens:"geschweift", axillaris:"achselständig (Blüten)",
  fallax:"täuschend (ähnlich einer anderen Art)", sericea:"seidig behaart",
  sericeum:"seidig", purpurascens:"purpurn überlaufen",
  suffruticosa:"halbstrauchig", suffruticosus:"halbstrauchig",
  bifolia:"zweiblättrig", bifolium:"zweiblättrig",
  fistulosum:"röhrig (Winterzwiebel)", fistulosa:"röhrig",
  perfoliata:"durchwachsen (Blatt umfasst Stängel)", perfoliatum:"durchwachsen",
  acuminata:"lang zugespitzt", acuminatum:"zugespitzt",
  acuminatus:"zugespitzt", corniculata:"gehörnt",
  corniculatum:"gehörnt", venustum:"anmutig",
  venusta:"anmutig", triplinervis:"dreinervig (Blatt)",
  procurrens:"vorlaufend (Ausläufer)", acutiflora:"spitzblütig",
  obliqua:"schief (Blattgrund)", obliquum:"schief",
  amplexicaulis:"stängelumfassend (Blatt)", eximia:"ausgezeichnet, hervorragend",
  fulva:"braungelb, rostgelb", fulvum:"braungelb",
  nivea:"schneeweiß", niveum:"schneeweiß",
  niveus:"schneeweiß", alcea:"malvenartig",
  aculeatum:"stachelig (Schildfarn)", aculeata:"stachelig",
  sexangulare:"sechskantig", fasciata:"gebändert (Aechmea)",
  fasciatum:"gebändert", caudatus:"geschwänzt (langes Anhängsel)",
  caudata:"geschwänzt", multifida:"vielspaltig",
  multifidum:"vielspaltig", cristata:"kammförmig, gekräuselt",
  cristatum:"kammförmig", miniata:"zinnoberrot",
  miniatum:"zinnoberrot", bipinnatus:"doppelt gefiedert",
  bipinnata:"doppelt gefiedert", revoluta:"zurückgerollt (Blattrand)",
  revolutum:"zurückgerollt", globulus:"kugelig (Frucht)",
  lyrata:"leierförmig (Blatt)", lyratum:"leierförmig",
  maculatum:"gefleckt (Taubnessel)", maculata:"gefleckt",
  sinuatum:"buchtig (Blattrand)", sinuata:"buchtig",
  virgatum:"rutenförmig", virgata:"rutenförmig",
  nudicaule:"nacktstängelig", caperata:"runzelig (Blatt)",
  erubescens:"errötend, rötlich", auriculata:"geöhrt",
  auriculatum:"geöhrt", roseum:"rosa",
  tricolor:"dreifarbig", bella:"schön",
  bellum:"schön", tetraphylla:"vierblättrig",
  tetraphyllum:"vierblättrig", thyrsoides:"thyrsusförmig (Blütenstand)",
  cyanea:"stahlblau", cyaneus:"blau",
  farinacea:"mehlig bestäubt", farinaceum:"mehlig",
  saligna:"weidenartig", salignus:"weidenartig",
  elegantissima:"sehr elegant", setaceus:"borstig",
  setiferum:"borstentragend (Schildfarn)", flabelliformis:"fächerförmig",
  hyssopifolia:"ysopblättrig", alternifolius:"wechselblättrig",
  alternifolia:"wechselblättrig", citrinus:"zitronengelb",
  citrina:"zitronengelb", isophylla:"gleichblättrig",
  hederacea:"efeuartig", hederaceum:"efeuartig",
  hederifolium:"efeublättrig (Alpenveilchen)", petiolaris:"langstielig",
  petiolare:"langstielig", scoparius:"besenartig (rutig)",
  scoparium:"besenartig", tristis:"trüb, düster (Farbe)",
  conica:"kegelförmig", conicum:"kegelförmig",
  flavum:"gelb", squarrosa:"sparrig (abstehend)",
  squarrosum:"sparrig", byzantina:"byzantinisch (kleinasiatisch)",
  urens:"brennend (Brennhaare)", rugosus:"runzelig",
  suendermannii:"nach dem Gärtner F. Sündermann", triacanthos:"dreidornig (Lederhülsenbaum)",
  siliquastrum:"schotentragend (Judasbaum)", mezereum:"vom pers. Namen (Seidelbast)",
  amabilis:"lieblich, anmutig", amabile:"lieblich",
  tulipifera:"tulpentragend (Tulpenbaum)", ligustrina:"ligusterartig",
  anomala:"abweichend, ungewöhnlich", anomalum:"abweichend",
  vernum:"Frühlings-", brizoides:"zittergrasähnlich",
  botryoides:"traubig (Trauben-Hyazinthe)", echiniformis:"igelförmig",
  chamaecyparissus:"zypressenähnlich niedrig (Heiligenkraut)", decumbens:"niederliegend, aufsteigend",
  scutellarioides:"helmkrautähnlich", alopecuroides:"fuchsschwanzähnlich",
  helianthoides:"sonnenblumenähnlich", plumbaginoides:"bleiwurzähnlich",
  ericoides:"heideähnlich (Myrten-Aster)", aizoides:"hauswurzähnlich",
  fuchsioides:"fuchsienähnlich", geoides:"nelkenwurzähnlich",
  tetragonioides:"neuseeländerspinatähnlich", amygdaloides:"mandelähnlich",
  epithymoides:"thymianähnlich", ocymoides:"basilikumähnlich",
  aloides:"aloeähnlich", abrotanoides:"eberrautenähnlich",
  tanacetifolia:"rainfarnblättrig", ferulifolia:"ferula-/fenchelblättrig",
  oleiformis:"ölbaumähnlich", fraxinifolia:"eschenblättrig",
  aesculifolia:"rosskastanienblättrig", artemisiifolia:"beifußblättrig",
  iberidifolia:"schleifenblumenblättrig", cochleariifolia:"löffelkrautblättrig",
  ficifolia:"feigenblättrig", pyrifolia:"birnenblättrig",
  trifasciata:"dreifach gebändert (Bogenhanf)", podophylla:"schildblättrig",
  "penna-marina":"‚Meeresfeder‘ (gefiederter Farn)", "filix-mas":"‚männlicher Farn‘ (Wurmfarn)",
  "filix-femina":"‚weiblicher Farn‘ (Frauenfarn)", scolopendrium:"‚Hundertfüßer‘ (Hirschzunge, Sori-Reihen)",
  spicant:"kammartig gefiedert (Rippenfarn)", trichomanes:"griech. Farnname (Streifenfarn)",
  struthiopteris:"‚Straußenfeder-Farn‘ (Straußenfarn)", sensibilis:"empfindlich (Perlfarn)",
  nidus:"Nest (Nestfarn, Blattrosette)", bulbiferum:"brutknospentragend",
  atrorubens:"dunkelrot", atropunicea:"dunkelpurpurn",
  brunnea:"braun", brunneus:"braun",
  incarnatum:"fleischrot", semperflorens:"immerblühend",
  pauciflora:"wenigblütig", pauciflorum:"wenigblütig",
  uniflora:"einblütig", biflorus:"zweiblütig",
  australis:"südlich", australe:"südlich",
  hibernica:"irisch", hollandica:"holländisch",
  nootkatensis:"aus Nootka (Nordwestamerika)", colchica:"aus Kolchis (Schwarzmeer)",
  colchicum:"aus Kolchis", pacifica:"pazifisch",
  islandica:"isländisch", danica:"dänisch",
  neapolitanum:"aus Neapel (Blattpetersilie)", alexandrinum:"aus Alexandria",
  carpatica:"aus den Karpaten", sabauda:"savoyisch (Wirsing)",
  gratianopolitanus:"aus Grenoble (Pfingst-Nelke)", bannaticus:"aus dem Banat",
  hungaricus:"ungarisch", canariensis:"von den Kanaren",
  azoricum:"von den Azoren", macedonica:"mazedonisch",
  hupehensis:"aus Hupeh (China)", yunnanensis:"aus Yunnan (China)",
  pekinensis:"aus Peking", africanus:"afrikanisch",
  africana:"afrikanisch", aethiopica:"‚aus Äthiopien/Afrika‘",
  "novi-belgii":"aus dem Raum New York (Aster)", "novae-angliae":"aus Neuengland (Aster)",
  liwanensis:"aus dem Libanon", hachijoensis:"von der Insel Hachijō (Japan)",
  richmondensis:"aus Richmond", europea:"europäisch",
  siberica:"aus Sibirien", scopulorum:"von Felsklippen",
  lacustris:"Seen-, im See", lucustris:"See-",
  sepium:"an Hecken/Zäunen", rusticana:"ländlich (Meerrettich)",
  umbraticola:"an schattigen Orten", vesuv:"nach dem Vesuv (Sortenname)",
  gemmifera:"knospentragend (Rosenkohl)", gongylodes:"knollig (Kohlrabi)",
  botrytis:"traubig, in Röschen (Blumenkohl)", sabellica:"aus Sabina (Grünkohl)",
  rapaceum:"rübig (Knollensellerie)", rapifera:"rüben­tragend",
  napobrassica:"Kohlrübe", carota:"Möhre (griech. Name)",
  melo:"Melone", pepo:"Kürbis (griech. ‚reif‘)",
  lycopersicum:"‚Wolfspfirsich‘ (Tomate)", cerasiforme:"kirschförmig (Kirschtomate)",
  melongena:"Aubergine (vom ital. Namen)", faba:"Bohne (Ackerbohne)",
  culinaris:"Küchen- (Linse)", culta:"kultiviert",
  ananassa:"ananasartig (Erdbeere, Duft)", vesca:"schmackhaft, klein (Wald-Erdbeere)",
  nucipersica:"Nektarine (‚Nuss-Pfirsich‘)", mahaleb:"vom arab. Namen (Weichsel-Kirsche)",
  insititia:"veredelt (Kriechen-Pflaume)", padus:"griech. Name (Traubenkirsche)",
  amygdalus:"Mandel", idaeus:"vom Berg Ida (Himbeere)",
  "uva-crispa":"‚krause Traube‘ (Stachelbeere)", "vitis-idaea":"‚Ida-Rebe‘ (Preiselbeere)",
  macrocarpon:"großfrüchtig (Cranberry)", myrtillus:"kleine Myrte (Heidelbeere)",
  carica:"aus Karien (Feige)", limon:"Zitrone",
  aurantium:"Orange (‚goldgelb‘)", kaki:"vom japan. Namen (Kaki)",
  betacea:"beteartig (Baumtomate)", lotus:"Lotus (griech./ägypt. Name)",
  granatum:"‚kernreich‘ (Granatapfel)", ficus:"Feige",
  rhabarbarum:"‚fremder Rha‘ (Rhabarber)", rhaponticum:"pontischer Rhabarber",
  cardunculus:"kleine Distel (Artischocke/Cardy)", scolymus:"griech. Distelname (Artischocke)",
  locusta:"Feldsalat (‚Heuschrecke‘?)", basilicum:"‚königlich‘ (Basilikum)",
  majorana:"Majoran (vom arab. Namen)", dracunculus:"‚Drachen-‘ (Estragon)",
  absinthium:"griech. Name (Wermut)", abrotanum:"griech. Name (Eberraute)",
  archangelica:"‚Erzengel-‘ (Engelwurz)", carvi:"Kümmel (vom arab. Namen)",
  anisum:"Anis (griech. Name)", recutita:"‚beschnitten‘ (Echte Kamille)",
  rosmarinus:"‚Meertau‘ (Rosmarin)", serpyllum:"kriechend (Sand-Thymian)",
  ursinum:"‚der Bären‘ (Bärlauch)", ampeloprasum:"‚Rebenlauch‘ (Porree-Gruppe)",
  acetosa:"sauer (Sauerampfer)", acetosella:"kleiner Sauerampfer",
  arachnoideum:"spinnwebig (Hauswurz)", chamaedrys:"‚Zwerg-Eiche‘ (Ehrenpreis)",
  teucrium:"gamanderähnlich", napellus:"‚kleine Rübe‘ (Eisenhut, Knolle)",
  cheiri:"vom arab. Namen (Goldlack)", pseudacorus:"‚falscher Kalmus‘ (Sumpf-Schwertlilie)",
  meleagris:"perlhuhnartig gescheckt (Schachblume)", martagon:"‚Türkenbund‘ (Türkenbund-Lilie)",
  quamash:"aus einem indian. Namen (Prärielilie)", hyacinthoides:"hyazinthenähnlich",
  elwesii:"nach dem Sammler H. J. Elwes", eranthis:"Frühlingsblume",
  denudata:"nackt, kahl", liliiflora:"lilienblütig",
  soulangeana:"nach dem Züchter Soulange-Bodin", kobus:"vom japan. Namen (Kobushi-Magnolie)",
  aria:"griech. Name (Mehlbeere)", torminalis:"‚gegen Bauchweh‘ (Elsbeere)",
  coggygria:"griech. Name (Perückenstrauch)", tinus:"lat. Name (Lorbeer-Schneeball)",
  lantana:"alter Name (Wolliger Schneeball)", rhytidophyllum:"runzelblättrig (Runzelblatt-Schneeball)",
  carlesii:"nach dem Sammler W. R. Carles", chenaultii:"nach der Baumschule Chenault",
  buddleja:"nach A. Buddle", omorika:"vom serb. Namen (Serbische Fichte)",
  koraiensis:"aus Korea", kousa:"vom japan. Namen (Japan. Blüten-Hartriegel)",
  pisifera:"erbsentragend (Sawara-Scheinzypresse)", leylandii:"nach dem Züchter C. Leyland",
  pfitzeriana:"nach der Baumschule Pfitzer", sabina:"vom lat. Namen (Sadebaum)",
  franchetii:"nach dem Botaniker A. Franchet", divaricatus:"sparrig",
  lacteus:"milchweiß (Blüten)", microphyllus:"kleinblättrig",
  simonsii:"nach dem Sammler Simons", integerrimus:"ganzrandig",
  indicum:"aus Indien", simsii:"nach dem Botaniker J. Sims (Azalee)",
  yakushimanum:"von der Insel Yakushima", catawbiense:"vom Catawba-Fluss (Rhododendron)",
  ponticum:"aus Pontus (Schwarzmeer)", impeditum:"‚verwickelt‘ (dichtbuschig)",
  williamsianum:"nach J. C. Williams", peduncularis:"langstielig",
  longifolia:"langblättrig", latifolia:"breitblättrig",
  gentianoides:"enzianähnlich", pectinata:"kammförmig",
  faassenii:"nach der Baumschule Faassen", subsessilis:"fast sitzend",
  cordifolia:"herzblättrig", macrophylla:"großblättrig",
  sieboldiana:"nach P. F. von Siebold", plantaginea:"wegerichblättrig (Funkie)",
  ventricosa:"bauchig (Blüte)", undulata:"gewellt (Blattrand)",
  tardiana:"spätblühend", lancifolia:"lanzettblättrig",
  galeobdolon:"‚Wiesel-Gestank‘ (Goldnessel)", orvala:"vom ital. Namen (Riesen-Taubnessel)",
  cardinalis:"scharlachrot (Kardinals-Lobelie)", siphilitica:"‚gegen Syphilis‘ (Blaue Lobelie, Heilpflanze)",
  cordifolius:"herzblättrig", linosyris:"‚Lein-Färberröte‘ (Goldhaar-Aster)",
  tongolensis:"aus Tongolo (China)", sieboldii:"nach dem Arzt P. F. von Siebold",
  menziesii:"nach dem Arzt A. Menzies", forrestii:"nach dem Sammler G. Forrest",
  veitchii:"nach Veitch", brownii:"nach dem Botaniker R. Brown",
  jamesonii:"nach R. Jameson", drummondii:"nach dem Sammler T. Drummond",
  przewalskii:"nach dem Forscher N. Przewalski", gesneriana:"nach dem Gelehrten C. Gessner (Tulpe)",
  wallichiana:"nach dem Botaniker N. Wallich", mariesii:"nach dem Sammler C. Maries",
  christophii:"nach dem Sammler? (Zier-Lauch)", burkwoodii:"nach den Züchtern Burkwood",
  andersonii:"nach einem Sammler Anderson", griffithii:"nach dem Botaniker W. Griffith",
  tommasinianus:"nach M. Tommasini (Krokus)", greigii:"nach dem Förderer S. Greig",
  kaufmanniana:"nach dem Förderer v. Kaufmann (Tulpe)", schmidtiana:"nach dem Gärtner J. Schmidt",
  poscharskyana:"nach dem Gärtner G. Poscharsky", portenschlagiana:"nach F. v. Portenschlag (Glockenblume)",
  wittrockiana:"nach dem Botaniker V. Wittrock (Garten-Stiefmütterchen)", mantegazzianum:"nach dem Forscher P. Mantegazza (Riesen-Bärenklau)",
  houstonianum:"nach dem Botaniker W. Houstoun", gunnii:"nach dem Sammler R. Gunn (Eukalyptus)",
  blossfeldiana:"nach dem Sammler R. Blossfeld (Flammendes Käthchen)", sanderiana:"nach der Gärtnerei Sander",
  sanderi:"nach der Gärtnerei Sander", sanderae:"nach der Gärtnerei Sander",
  makoyana:"nach Gärtnerei Makoy", cadierei:"nach dem Missionar Cadière (Kanonierblume)",
  scherzerianum:"nach dem Diplomaten K. v. Scherzer (Flamingoblume)", wallisii:"nach dem Sammler G. Wallis (Einblatt)",
  milii:"nach Baron Milius (Christusdorn)", martinii:"nach einem Sammler Martin",
  grusonii:"nach dem Industriellen H. Gruson (Goldkugelkaktus)", buckleyi:"nach dem Sammler Buckley",
  gaertneri:"nach dem Botaniker J. Gaertner (Osterkaktus)", fournieri:"nach dem Botaniker E. Fournier (Torenie)",
  soleirolii:"nach dem Sammler J. Soleirol (Bubikopf)", reginae:"‚der Königin‘ (Paradiesvogelblume)",
  seguine:"aus einem karib. Namen (Dieffenbachie)", andraeanum:"nach dem Botaniker É. André (Flamingoblume)",
  degronianum:"nach einem Sammler Degron", pruhoniciana:"nach dem Park Průhonice",
  vossii:"nach dem Gärtner A. Voss", purpusii:"nach dem Sammler C. Purpus",
  wiltonii:"nach dem Sammler Wilton", heckrottii:"nach einem Gärtner Heckrott",
  watereri:"nach der Baumschule Waterer", clandonensis:"aus dem Garten Clandon",
  hillieri:"nach der Baumschule Hillier", sargentiana:"nach C. Sargent",
  giraldii:"nach dem Missionar G. Giraldi", dielsianus:"nach dem Botaniker L. Diels",
  aubertii:"nach dem Missionar G. Aubert", heldreichii:"nach dem Botaniker T. Heldreich",
  tagliabueana:"nach der Baumschule Tagliabue", carmichaelii:"nach dem Sammler D. Carmichael",
  ecklonis:"nach dem Sammler C. Ecklon (Kapkörbchen)", gautieri:"nach einem Sammler Gautier",
  sullivantii:"nach dem Botaniker W. Sullivant (Sonnenhut)", russeliana:"nach dem Förderer Herzog v. Bedford (Russell)",
  endressii:"nach dem Sammler P. Endress (Storchschnabel)", cantabrigiense:"aus Cambridge",
  himalayense:"aus dem Himalaya", nodosum:"knotig",
  forsteri:"nach dem Naturforscher G. Forster", buchananii:"nach dem Botaniker J. Buchanan",
  morrowii:"nach dem Arzt J. Morrow (Japan-Segge)", oshimensis:"von der Insel Ōshima (Segge)",
  muskingumensis:"vom Muskingum-Fluss (Palmwedel-Segge)", flagellifera:"peitschentragend",
  atkinsiana:"nach einem Züchter Atkins", "rosa-sinensis":"‚chinesische Rose‘ (Roseneibisch)",
  ionantha:"veilchenblütig (Tillandsie/Usambara-V.)", surfinia:"Handelsname (Petunie)",
  arboricola:"an Bäumen wachsend (Kletter-Schefflera)", zamiifolia:"zamienblättrig (Glücksfeder)",
  elephantipes:"‚Elefantenfuß‘ (Yucca)", gloriosa:"prachtvoll (Yucca)",
  flaccida:"schlaff (Yucca)", bifurcatum:"zweigabelig (Geweihfarn)",
  raddianum:"nach dem Botaniker G. Raddi (Frauenhaarfarn)", exaltata:"hochwachsend (Schwertfarn)",
  lingulata:"zungenförmig (Guzmanie)", zebrina:"gestreift (Zebra-Ampelkraut)",
  fluminensis:"‚vom Fluss‘ (aus Rio, Dreimasterblume)", leuconeura:"weißnervig (Korbmarante)",
  andreanum:"nach É. André", warscewiczii:"nach dem Sammler Warscewicz",
  pumilio:"zwergig (Berg-Kiefer)", balsamea:"balsamduftend (Balsam-Tanne)",
  grandis:"groß (Küsten-Tanne)", cephalonica:"von Kefalonia (Griech. Tanne)",
  pinsapo:"vom span. Namen (Spanische Tanne)", deodara:"‚Baum der Götter‘ (Himalaya-Zeder)",
  libani:"aus dem Libanon (Zeder)", glyptostroboides:"glyptostrobus-ähnlich (Urwelt-Mammutbaum)",
  distichum:"zweizeilig (Sumpfzypresse)", pensylvanica:"aus Pennsylvania",
  dolabrata:"beilförmig (Hiba-Lebensbaum)", cuspidata:"stachelspitzig (Japan-Eibe)",
  harringtonia:"nach dem Earl of Harrington (Kopfeibe)", buergerianum:"nach dem Sammler H. Bürger (Dreispitz-Ahorn)",
  ginnala:"vom Amur-Namen (Feuer-Ahorn)", griseum:"grau (Zimt-Ahorn)",
  monspessulanum:"aus Montpellier (Burgen-Ahorn)", negundo:"aus einem ind. Namen (Eschen-Ahorn)",
  saccharinum:"zuckerhaltig (Silber-Ahorn)", tataricum:"tatarisch",
  cappadocicum:"aus Kappadokien", julibrissin:"vom pers. Namen (Seidenbaum)",
  araucana:"aus dem Arauco-Gebiet (Andentanne)", unedo:"lat. ‚ich esse eins‘ (Erdbeerbaum)",
  tubulosa:"röhrig (Hülle der Nuss)", ornus:"lat. Name (Blumen-Esche)",
  pennsylvanica:"aus Pennsylvania", babylonica:"‚babylonisch‘ (Trauer-Weide)",
  fragilis:"brüchig (Bruch-Weide)", daphnoides:"seidelbastähnlich (Reif-Weide)",
  canescens:"graubehaart (Grau-Pappel)", ostrya:"Hopfenbuche",
  petraea:"Felsen- (Trauben-Eiche)", cerris:"lat. Name (Zerr-Eiche)",
  ilex:"Stech- (Stein-Eiche)", suber:"lat. ‚Kork‘ (Kork-Eiche)",
  frainetto:"vom ital. Namen (Ungar. Eiche)", lusitanica:"portugiesisch (Portug. Lorbeerkirsche)",
  glandulosa:"drüsig (Mandelkirsche)", subhirtella:"etwas rauhaarig (Winter-Kirsche)",
  yedoensis:"aus Edo/Tokio (Yoshino-Kirsche)", hispida:"borstig (Rosen-Robinie)",
  dioca:"zweihäusig", serphyllum:"kriechend (Sand-Thymian)",
  vinvifera:"weintragend (Tippfehler)", retoflexus:"zurückgebogen",
  retroflexus:"zurückgebogen", supsp:"Unterart (Rangkürzel)",
  nothof:"Nothofagus (Südbuche)", cneorum:"griech. Name (Steinröschen)",
  dryas:"Silberwurz (Baumnymphe)", camara:"aus einem südamerik. Namen (Wandelröschen)",
  "plantago-aquatica":"‚Wasser-Wegerich‘ (Froschlöffel)", oleander:"vom mittellat. Namen (Oleander)",
  armeniacum:"aus Armenien (Trauben-Hyazinthe)", pulcherrima:"sehr schön, prächtig (Weihnachtsstern)",
  benjamina:"vom Namen (Birkenfeige)", asiaticus:"asiatisch",
  asiatica:"asiatisch", alkekengi:"vom arab. Namen (Lampionblume)",
  xylosteum:"‚Knochenholz‘ (hartes Holz, Heckenkirsche)", typhina:"kolbig behaart wie Typha (Essigbaum)",
  mays:"vom Taíno ‚mahiz‘ (Mais)", "crus-galli":"‚Hahnensporn‘ (dornig)",
  cicla:"alter Name für Mangold", "bursa-pastoris":"‚Hirtentasche‘ (Frucht)",
  rhoeas:"griech. Name (Klatsch-Mohn)", vera:"echt, wahr",
  ebbingei:"nach dem Gärtner S. Ebbinge", lydia:"aus Lydien (Kleinasien)",
  tobira:"vom japan. Namen (Klebsame)", calleryana:"nach dem Missionar J. Callery",
  pendulina:"überhängend", complexa:"verschlungen, verwickelt",
  ligtu:"aus einem chilen. Namen (Inkalilie)", "ferdinandi-coburgi":"nach Zar Ferdinand von Sachsen-Coburg",
  trifurcata:"dreigabelig", squalida:"unscheinbar, schmutzig-grün",
  cooperi:"nach dem Sammler T. Cooper", erythrosora:"rotsporig (Farn)",
  rigens:"steif (Mittagsgold)", baldschuanica:"aus Baldschuan (Zentralasien, Schling-Knöterich)",
  lindheimeri:"nach dem Sammler F. Lindheimer", urbanum:"städtisch, an Wegen (Nelkenwurz)",
  patulum:"ausgebreitet", olympicum:"vom Olymp (Johanniskraut)",
  secalinum:"roggenartig (Schnittsellerie)", fimbriata:"gefranst",
  fimbriatum:"gefranst", discoidea:"scheibenförmig (strahllos)",
  viscosus:"klebrig", viscosa:"klebrig",
  viciifolia:"wickenblättrig (Esparsette)", cereale:"Getreide- (Roggen)",
  resupinatum:"umgewendet (Persischer Klee)", farfara:"lat. Name (Huflattich)",
  ptarmica:"‚Nieskraut‘ (Sumpf-Schafgarbe)", liliago:"lilienartig (Astlose Graslilie)",
  aethusifolius:"hundspetersilienblättrig (Zwerg-Geißbart)", pansus:"ausgebreitet",
  tabularis:"flach ausgebreitet, tafelförmig", brachytricha:"kurzhaarig (Diamant-Reitgras)",
  nepeta:"katzenminzenartig (Bergminze)", belladonna:"‚schöne Frau‘ (Belladonna-Lilie)",
  asclepiadea:"schwalbenwurzblättrig (Schwalbenwurz-Enzian)", "sino-ornata":"chinesisch-geschmückt (Herbst-Enzian)",
  maximum:"sehr groß", arenarius:"Sand- (Strandhafer)",
  purpurocaeruleum:"purpurblau (Steinsame)", chalcedonica:"aus Chalkedon (Brennende Liebe)",
  bombyciferum:"seidig-wollig (Königskerze)", commutatum:"vertauscht, verwechselt",
  commutata:"verwechselt", recurvata:"zurückgekrümmt",
  sabatius:"aus Savona (Ligurien)", vigilis:"Herkunft unklar",
  damascena:"aus Damaskus (Jungfer im Grünen)", obconica:"verkehrt-kegelförmig (Becher-Primel)",
  podophyllum:"schildblättrig (Purpurtute)", lizei:"nach der Baumschule Lizé",
  julianae:"nach Juliana (Großblättrige Berberitze)", myrsinites:"myrtenartig (Walzen-Wolfsmilch)",
  nidiformis:"nestförmig (Nest-Fichte)", cauticola:"an Felsen wachsend (Fetthenne)",
  pachyclados:"dickästig (Zwerg-Fetthenne)", blanda:"lieblich, reizend (Balkan-Anemone)",
  perralchicum:"Kreuzungs-Epitheton (Elternarten)", ascomycota:"Schlauchpilze (Abteilung; Flechte)",
});
Object.assign(LAT_PRE, {
  salici:"weiden", tanaceti:"rainfarn",
  oleae:"ölbaum", persici:"pfirsich",
  buxi:"buchs", ilici:"stechpalmen",
  querci:"eichen", populi:"pappel",
  fraxini:"eschen", aesculi:"rosskastanien",
  lauri:"lorbeer", myrti:"myrten",
  hederi:"efeu", plantagini:"wegerich",
  graminei:"gras", hyssopi:"ysop",
  rosmarini:"rosmarin", thymi:"thymian",
});
Object.assign(LAT_SUF, {
  oides:"-ähnlich", odes:"-ähnlich",
  oideus:"-ähnlich", petalum:"blütenblättrig",
  sperma:"samig", spermum:"samig",
  stemon:"staubfädig", glossum:"zungenförmig",
  stigma:"narbig",
});
Object.assign(LAT_GEN, {
  Abelia:"nach dem Arzt C. Abel (Abelie)", Actaea:"griech. ‚Holunder‘ (Christophskraut/Silberkerze)",
  Adonis:"nach dem griech. Jüngling Adonis (Adonisröschen)", Aegopodium:"griech. ‚Ziegenfuß‘ (Giersch, Blattform)",
  Aeschynanthus:"griech. ‚Scham-Blume‘ (Schamblume)", Alcea:"griech. Malvenname (Stockrose)",
  Alchemilla:"vom arab. ‚al-kimiya‘ (Frauenmantel, Alchemie)", Alyssum:"griech. ‚gegen Tollwut‘ (Steinkraut)",
  Anethum:"griech. Name (Dill)", Antennaria:"lat. ‚Fühler‘ (Katzenpfötchen, Haarkrone)",
  Anthriscus:"griech. Name (Kerbel)", Antirrinum:"griech. ‚Nasenähnlich‘ (Löwenmäulchen)",
  Aristolochia:"griech. ‚gute Geburt‘ (Pfeifenwinde, Heilpflanze)", Armeria:"altfranz./kelt. Name (Grasnelke)",
  Aronia:"griech. Name (Apfelbeere)", Arum:"griech. Name (Aronstab)",
  Asarum:"griech. Name (Haselwurz)", Asphodeline:"von Asphodelus (Junkerlilie)",
  Atriplex:"lat. Name (Melde/Gartenmelde)", Astrantia:"vom lat. ‚astrum‘ = Stern (Sterndolde, sternförmige Hülle)",
  Aucuba:"vom japan. ‚aokiba‘ (Aukube)", Aurinia:"lat. ‚golden‘ (Felsen-Steinkraut)",
  Borago:"vom lat. Namen (Borretsch)", Bougainvillea:"nach dem Seefahrer L. de Bougainville (Drillingsblume)",
  Briza:"griech. Name (Zittergras)", Brugmansia:"nach dem Botaniker S. Brugmans (Engelstrompete)",
  Calla:"griech. ‚schön‘ (Sumpf-Calla)", Callistephus:"griech. ‚schöner Kranz‘ (Sommeraster)",
  Calluna:"griech. ‚reinigen, kehren‘ (Besenheide)", Caltha:"lat./griech. Name (Sumpfdotterblume)",
  Calycanthus:"griech. ‚Kelch-Blume‘ (Gewürzstrauch)", Carlina:"nach Karl dem Großen? (Eberwurz/Silberdistel)",
  Catalpa:"aus einem indian. Namen (Trompetenbaum)", Celosia:"griech. ‚brennend‘ (Brandschopf/Hahnenkamm)",
  Centranthus:"griech. ‚Sporn-Blume‘ (Spornblume)", Cerastium:"griech. ‚gehörnt‘ (Hornkraut, Kapselform)",
  Cercidiphyllum:"griech. ‚Judasbaum-Blatt‘ (Kuchenbaum)", Chamaedorea:"griech. ‚niedrige Gabe‘ (Bergpalme)",
  Chameacyparis:"griech. ‚Zwerg-Zypresse‘ (Scheinzypresse)", Chameacypris:"griech. ‚Zwerg-Zypresse‘ (Scheinzypresse)",
  Choisya:"nach dem Botaniker J. D. Choisy (Orangenblume)", Cirsium:"griech. Distelname (Kratzdistel)",
  Cissus:"griech. ‚Efeu‘ (Klimme)", Cobaea:"nach dem Missionar B. Cobo (Glockenrebe)",
  Columnea:"nach dem Botaniker F. Colonna", Cordyline:"griech. ‚Keule‘ (Keulenlilie, Wurzeln)",
  Coreopsis:"griech. ‚wanzenähnlich‘ (Mädchenauge, Samen)", Coriandrum:"griech. Name (Koriander)",
  Cortaderia:"span. ‚schneiden‘ (Pampasgras, scharfe Blätter)", Corydalis:"griech. ‚Haubenlerche‘ (Lerchensporn)",
  Corylopsis:"griech. ‚haselähnlich‘ (Scheinhasel)", Cupressus:"lat. für Zypresse",
  Dasiphora:"griech. ‚dicht tragend‘ (Strauch-Fingerkraut)", Dendranthema:"griech. ‚Baum-Blume‘ (Garten-Chrysantheme)",
  Dictamnus:"griech. Name (Diptam)", Diplotaxis:"griech. ‚doppelte Reihe‘ (Rauke/Rucola, Samen)",
  Doronicum:"vom arab. Namen (Gämswurz)", Elymus:"griech. Getreidename (Quecke)",
  Empetrum:"griech. ‚auf Steinen‘ (Krähenbeere)", Epipremnum:"griech. ‚auf Stämmen‘ (Efeutute)",
  Equisetum:"lat. ‚Pferdehaar‘ (Schachtelhalm)", Eruca:"lat. Name (Salatrauke/Rucola)",
  Eryngium:"griech. Name (Mannstreu/Edeldistel)", Eupatorium:"nach König Mithridates Eupator (Wasserdost)",
  Eustoma:"griech. ‚schöner Mund‘ (Prärieenzian/Lisianthus)", Fagopyrum:"griech. ‚Buchen-Weizen‘ (Buchweizen)",
  Fatsia:"vom japan. Namen (Zimmeraralie)", Filipendula:"lat. ‚Faden-hängend‘ (Mädesüß, Wurzelknöllchen)",
  Foeniculum:"lat. ‚Heuchen‘ (Fenchel, Duft)", Gaillardia:"nach dem Förderer Gaillard de Marentonneau (Kokardenblume)",
  Galinsoga:"nach dem Botaniker M. Galinsoga (Franzosenkraut)", Galium:"griech. ‚Milch‘ (Labkraut, gerinnt Milch)",
  Gardenia:"nach dem Naturforscher A. Garden (Gardenie)", Gaultheria:"nach dem Arzt J.-F. Gaulthier (Scheinbeere)",
  Globularia:"lat. ‚Kügelchen‘ (Kugelblume)", Gypsohila:"griech. ‚Gips liebend‘ (Schleierkraut)",
  Gypsophila:"griech. ‚Gips liebend‘ (Schleierkraut)", Hamamelis:"griech. ‚zugleich mit Früchten‘ (Zaubernuss)",
  Helictotrichon:"griech. ‚gedrehtes Haar‘ (Blauhafer)", Heliotropium:"griech. ‚Sonnenwende‘ (Vanilleblume)",
  Hepatica:"lat. ‚Leber‘ (Leberblümchen, Blattform)", Hippophae:"griech. Name (Sanddorn)",
  Hippuris:"griech. ‚Pferdeschwanz‘ (Tannenwedel)", Hyssopus:"griech./hebr. Name (Ysop)",
  Iberis:"‚aus Iberien‘ (Schleifenblume)", Jasminum:"vom pers. ‚yasmin‘ (Jasmin)",
  Kerria:"nach dem Gärtner W. Kerr (Ranunkelstrauch)", Koeleria:"nach dem Botaniker G. Koeler (Schillergras)",
  Lagererstroemia:"nach dem Kaufmann M. von Lagerström (Kreppmyrte)", Lathyrus:"griech. Name (Platterbse/Wicke)",
  Laurus:"lat. für Lorbeer", Leontopodium:"griech. ‚Löwenfüßchen‘ (Edelweiß)",
  Lepidium:"griech. ‚Schüppchen‘ (Kresse, Früchte)", Levisticum:"aus lat. ligusticum (Liebstöckel)",
  Liatris:"Herkunft unklar (Prachtscharte)", Lobelia:"nach dem Botaniker M. de l’Obel",
  Lobularia:"lat. ‚kleine Schote‘ (Duftsteinrich)", Lolium:"lat. Name (Lolch/Weidelgras)",
  Macleaya:"nach dem Zoologen A. Macleay (Federmohn)", Matthiola:"nach dem Arzt P. A. Mattioli (Levkoje)",
  Medicago:"griech. ‚Kraut aus Medien‘ (Luzerne/Schneckenklee)", Melilotus:"griech. ‚Honig-Klee‘ (Steinklee)",
  Melissa:"griech. ‚Biene‘ (Zitronenmelisse)", Mespilus:"griech./lat. Name (Mispel)",
  Miscanthus:"griech. ‚Stiel-Blume‘ (Chinaschilf)", Mitchella:"nach dem Botaniker J. Mitchell (Rebhuhnbeere)",
  Molinia:"nach dem Naturforscher J. I. Molina (Pfeifengras)", Monstera:"lat. ‚Ungeheuer‘ (Fensterblatt, große löchrige Blätter)",
  Myosotis:"griech. ‚Mausohr‘ (Vergissmeinnicht)", Myrtus:"griech./lat. Name (Myrte)",
  Nandina:"vom japan. ‚nanten‘ (Himmelsbambus)", Nasturtium:"lat. ‚Nasenzwinger‘ (Brunnenkresse, scharf)",
  Nothofagus:"griech. ‚Schein-Buche‘ (Südbuche)", Nuphar:"vom arab. Namen (Teichrose)",
  Oenothera:"griech. Name (Nachtkerze)", Omphalodes:"griech. ‚nabelähnlich‘ (Gedenkemein, Samen)",
  Ophiopogon:"griech. ‚Schlangenbart‘ (Schlangenbart)", Pallenis:"griech. Name (Sternauge)",
  Parrotia:"nach dem Naturforscher F. Parrot (Eisenholzbaum)", Parthenocissus:"griech. ‚Jungfern-Efeu‘ (Wilder Wein)",
  Passiflora:"lat. ‚Passionsblume‘ (an die Passion Christi)", Pastinaca:"lat. Name (Pastinak)",
  Paulownia:"nach der Zarentochter Anna Pawlowna (Blauglockenbaum)", Penstemon:"griech. ‚fünf Staubfäden‘ (Bartfaden)",
  Pericallis:"griech. ‚ringsum schön‘ (Zineraria)", Photinia:"griech. ‚glänzend‘ (Glanzmispel)",
  Phyllostachys:"griech. ‚Blatt-Ähre‘ (Flachrohrbambus)", Physostegia:"griech. ‚Blasen-Dach‘ (Gelenkblume)",
  Pieris:"nach den Musen (Pieriden) (Lavendelheide/Schattenglöckchen)", Platycodon:"griech. ‚breite Glocke‘ (Ballonblume)",
  Podocarpus:"griech. ‚Stiel-Frucht‘ (Steineibe)", Podophyllum:"griech. ‚Fuß-Blatt‘ (Fußblatt/Maiapfel)",
  Polemonium:"griech. Name (Jakobsleiter/Himmelsleiter)", Polygonatum:"griech. ‚vielknotig‘ (Salomonssiegel, Rhizom)",
  Polypodium:"griech. ‚Vielfuß‘ (Tüpfelfarn)", Pontederia:"nach dem Botaniker G. Pontedera (Hechtkraut)",
  Prunella:"vom dt. ‚Bräune‘ (Braunelle, Heilpflanze)", Pulsatilla:"lat. ‚läuten‘ (Küchenschelle, glockig)",
  Raphanus:"griech. ‚schnell keimend‘ (Rettich/Radieschen)", Rosmarinus:"lat. ‚Meertau‘ (Rosmarin)",
  Sagina:"lat. ‚Mast, Futter‘ (Mastkraut)", Sagittaria:"lat. ‚Pfeil‘ (Pfeilkraut, Blattform)",
  Sanguisorba:"lat. ‚Blut aufsaugend‘ (Wiesenknopf, blutstillend)", Sanvitalia:"nach der Familie Sanvitali (Husarenknopf)",
  Satureja:"lat. Name (Bohnenkraut)", Scabiosa:"lat. ‚Krätze‘ (Skabiose, Heilpflanze)",
  Scandosorbus:"Gattungshybride (× Sorbaronia-nah, Mehlbeere)", Sciadopitys:"griech. ‚Schirm-Fichte‘ (Schirmtanne)",
  Scorzonera:"vom altfranz./ital. Namen (Schwarzwurzel)", Sinapis:"griech. Name (Senf)",
  Sinningia:"nach dem Gärtner W. Sinning (Gloxinie)", Skimmia:"vom japan. ‚shikimi‘ (Skimmie)",
  Sonchus:"griech. Name (Gänsedistel)", Sophora:"vom arab. Namen (Schnurbaum)",
  Sparganium:"griech. ‚Band‘ (Igelkolben, Blätter)", Stellaria:"lat. ‚Stern‘ (Sternmiere, Blütenform)",
  Stephanotis:"griech. ‚Kranz-Ohr‘ (Kranzschlinge)", Stipa:"griech. ‚Werg‘ (Federgras)",
  Styphnolobium:"griech. ‚herbe Hülse‘ (Schnurbaum, früher Sophora)", Sutera:"nach dem Botaniker J. R. Suter (Schneeflockenblume)",
  Symphytum:"griech. ‚zusammenwachsen‘ (Beinwell, heilt)", Tamarix:"lat. Name (Tamariske)",
  Thlaspi:"griech. Name (Hellerkraut/Täschelkraut)", Thunbergia:"nach dem Botaniker C. P. Thunberg (Schwarzäugige Susanne)",
  Tiarella:"griech. ‚kleiner Turban‘ (Schaumblüte, Fruchtform)", Trachycarpus:"griech. ‚raue Frucht‘ (Hanfpalme)",
  Trollius:"vom dt. ‚Trollblume‘ (Trollblume)", Tropaeolum:"griech. ‚Siegeszeichen‘ (Kapuzinerkresse)",
  Tsuga:"vom japan. Namen (Hemlocktanne)", Typha:"griech. Name (Rohrkolben)",
  Vitis:"lat. für Weinrebe", Washingtonia:"nach G. Washington (Washingtonpalme)",
  Zelkova:"vom kaukas. Namen (Zelkove)", Zinnia:"nach dem Botaniker J. G. Zinn (Zinnie)",
});
const CULTIVAR = new Set(["evergold","sunburst","herbstblüte","silberteppich","emerald","curry","stokes","bluecarpet","bluestar","maigrün","koster","bluegem","smaragd","hancock","vesuv","der","little","sec","max"]);   // klein geschriebene Sorten-/Handelsnamen im Art-Feld

// ---- Glossierung ----
function stripEnd(w){ return String(w).toLowerCase().replace(/[.,;)('"«»]+$/,"").replace(/^[.,;)('"«»-]+/,""); }
function latGloss(word){
  let w = stripEnd(word);
  if(!w || w.length<3) return null;
  w = w.replace(/-(gruppe|grp|group|gp)$/,"");            // Sorten-Gruppen-Suffix (»belladonna-gruppe«)
  if(LAT_EPI[w]) return LAT_EPI[w];
  // Kompositum: bekannte Nachsilbe + bekanntes Vorderteil
  for(const suf in LAT_SUF){
    if(w.length>suf.length+2 && w.endsWith(suf)){
      let pre = w.slice(0, -suf.length).replace(/[io]$/,m=>m);   // Bindevokal behalten
      if(LAT_PRE[pre]) return LAT_PRE[pre]+LAT_SUF[suf];
      // Bindevokal wegnehmen und erneut prüfen (angustifolia: angusti|folia; latifolia: lati|folia)
      const pre2 = w.slice(0, -suf.length).replace(/[io]$/,"");
      if(LAT_PRE[pre2]) return LAT_PRE[pre2]+LAT_SUF[suf];
    }
  }
  // Struktur-Fallback (nur wenn nichts Konkretes passt) – ehrliche Einordnung des Bestandteils:
  if(CULTIVAR.has(w)) return "Sorten-/Handelsname";
  if(/(ii|iana|ianus|ianum|iae|iorum)$/.test(w)) return "nach einer Person benannt (Widmung)";
  if(/(ensis|ense)$/.test(w))                    return "nach einem Fundort/einer Region benannt";
  if(/(oides|odes)$/.test(w))                    return "…-ähnlich, -artig";
  return null;
}
const RANK = new Set(["var","ssp","subsp","cv","convar","sect","grp","group","gruppe",
  "cultivars","cultivar","sorten","sorte","hybriden","hybride","aggr","agg","nothosubsp"]);
function nameEtymology(g, a){
  const parts = [], seen = new Set();
  const gk = String(g||"").replace(/-Hybride[nr]?$/i,"").trim();   // »Fuchsia-Hybriden« → Basisgattung »Fuchsia«
  if(g && LAT_GEN[g]) parts.push({ t:g, d:LAT_GEN[g] });
  else if(gk && gk!==g && LAT_GEN[gk]) parts.push({ t:gk, d:LAT_GEN[gk] });
  for(const raw of String(a||"").split(/\s+/)){
    const w = stripEnd(raw);
    if(!w || w.length<3 || seen.has(w) || RANK.has(w.toLowerCase()) || /[^a-zäöüß-]/.test(w)) continue;
    if(/^[A-ZÄÖÜ]/.test(raw)) continue;              // Sortennamen (großgeschrieben) auslassen
    const d = latGloss(w);
    if(d){ parts.push({ t:w, d }); seen.add(w); }    // Autonyme (montanum subsp. montanum) nicht doppeln
  }
  return parts;
}

function deepLinks(c){
  const full = encodeURIComponent(norm(c.g+" "+c.a));  // Wikipedia: FEIN – exakter Name inkl. Sorte/Unterart (Wikipedia löst das auf und 404t nie)
  const q = encodeURIComponent(searchName(c));          // andere Quellen: GROB – reines Binom (zu fein → oft 0 Treffer/404; mehrere Treffer sind hier ok)
  // Nur neutrale, nicht-kommerzielle Nachschlagequellen. Wikipedia (immer, fein),
  // NaturaDB (immer, deckt auch Gehölze gut ab), iNaturalist (immer).
  return [
    { n:"Wikipedia",   u:"https://de.wikipedia.org/wiki/Spezial:Suche?search="+full },
    { n:"NaturaDB",    u:"https://www.naturadb.de/suche/?q="+q },
    { n:"iNaturalist", u:"https://www.inaturalist.org/taxa/search?q="+q+"&locale=de" }
  ];
  // Bewusst NICHT verlinkt: Gaißmayer (kommerzieller Shop – gehört nicht in ein
  // neutrales Lern-/Prüfungswerkzeug), Baumkunde (konstant HTTP 403), InfoFlora
  // (nur CH-Wildflora, keine GET-Suche).
}

// ---- Wikipedia-Anreicherung (opt-in, JSONP) ----
const wikiCache = new Map();   // card.key -> {title,extract,thumb,url} | null (nicht gefunden)
let __wpN = 0;
/* Generischer JSONP-Aufruf (dynamisches <script>, kein fetch/XHR): hängt den
   Callback-Namen an die übergebene URL an. Wird von der Text-Anreicherung UND
   vom Bilder-Quiz genutzt. */
function jsonpGet(url){
  return new Promise((resolve,reject)=>{
    const cb = "__wpcb"+(++__wpN);
    const sc = document.createElement("script");
    let done = false;
    const cleanup = ()=>{ try{ delete window[cb]; }catch(e){ window[cb]=undefined; } if(sc.parentNode) sc.parentNode.removeChild(sc); };
    const to = setTimeout(()=>{ if(done) return; done=true; cleanup(); reject(new Error("timeout")); }, 7000);
    window[cb] = d=>{ if(done) return; done=true; clearTimeout(to); cleanup(); resolve(d); };
    sc.onerror = ()=>{ if(done) return; done=true; clearTimeout(to); cleanup(); reject(new Error("network")); };
    sc.src = url + "&callback=" + cb;
    document.head.appendChild(sc);
  });
}
function wikiJSONP(title){
  return jsonpGet("https://de.wikipedia.org/w/api.php?action=query&format=json&prop=extracts%7Cpageimages"+
    "&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=320&redirects=1&titles="+encodeURIComponent(title));
}
function wikiFirstPage(d){
  const pg = d && d.query && d.query.pages; if(!pg) return null;
  const k = Object.keys(pg)[0]; if(!k || k==="-1") return null;
  const p = pg[k]; return (p && p.missing===undefined && p.extract) ? p : null;
}
function shortenExtract(t){
  t = norm(t); if(t.length<=520) return t;
  const cut = t.slice(0,520), dot = cut.lastIndexOf(". ");
  return (dot>300 ? cut.slice(0,dot+1) : cut)+" …";
}
function renderWiki(host, d){
  host.innerHTML =
    (d.thumb ? `<img src="${esc(d.thumb)}" alt="${esc(d.title)}" loading="lazy">` : "")+
    `<div class="wp-text">${esc(d.extract)}</div>`+
    `<div class="wp-src">Quelle: <a href="${esc(d.url)}" target="_blank" rel="noopener">Wikipedia – ${esc(d.title)}</a> · Text unter CC BY-SA</div>`;
  lbWire(host.querySelector("img"), "Vorschaubild vergrößern");
}
/* Bilder eines Artikels für die Galerie in der Vollbild-Ansicht (JSONP, kein fetch).
   Karten/Wappen/Logos fliegen raus; botanische Tafeln bleiben – beim Nachschlagen
   sind sie hilfreich. */
function wikiGallery(title){
  return jsonpGet("https://de.wikipedia.org/w/api.php?action=query&format=json&generator=images"+
      "&gimlimit=20&redirects=1&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=1200&titles="+
      encodeURIComponent(title))
    .then(d=>{
      const pg = (d && d.query && d.query.pages) || {};
      return Object.keys(pg).map(k=>pg[k])
        .filter(p=>{
          const f = String(p.title||"").replace(/^(File|Datei):/i,"");
          const ii = p.imageinfo && p.imageinfo[0];
          if(!ii || !(ii.thumburl||ii.url)) return false;
          if(ii.mime && !/^image\/(jpeg|png|webp)$/i.test(ii.mime)) return false;
          return !/(\.svg$|map|karte|wappen|logo|icon|commons-logo|disambig)/i.test(f);
        })
        .map(p=>{ const ii=p.imageinfo[0];
          return { src: ii.thumburl||ii.url, file: String(p.title||"").replace(/^(File|Datei):/i,"") }; })
        .slice(0,12);
    })
    .catch(()=>[]);
}
/* ---------- Bild-Lightbox (Vorschaubild anklicken → groß ansehen) ----------
   1:1 aus learn.js übernommen (die Info-Karte ist in beiden Werkzeugen gleich).
   Eigener Namensraum .lbscrim; Esc läuft in der Capture-Phase, damit die
   .scrim-Panels und das Info-Modal dahinter nicht mitschließen. */
function lbBig(src){ return String(src||"").replace(/\/(\d{2,4})px-/, "/1600px-"); }
let lbReturnFocus=null;
function closeLightbox(){
  const sc=document.querySelector(".lbscrim"); if(!sc) return;
  sc.remove();
  if(lbReturnFocus && lbReturnFocus.focus){ try{ lbReturnFocus.focus(); }catch(e){} }
  lbReturnFocus=null;
}
let lbList=[], lbIdx=0, lbToken=0;
/* Pfeile und Zähler entstehen erst, wenn es wirklich mehrere Bilder gibt – auch
   nachträglich, falls eine Galerie erst nach dem Öffnen eintrifft. */
function lbSync(){
  const sc=document.querySelector(".lbscrim"); if(!sc) return;
  const img=sc.querySelector(".lb-img");
  if(lbList.length>1 && !sc.querySelector(".lb-nav")){
    img.insertAdjacentHTML("beforebegin", `<button class="lb-nav prev" aria-label="Vorheriges Bild">‹</button>`);
    img.insertAdjacentHTML("afterend", `<button class="lb-nav next" aria-label="Nächstes Bild">›</button>`+
      `<div class="lb-count" aria-live="polite"></div>`);
  }
  const z=sc.querySelector(".lb-count"); if(z) z.textContent = `${lbIdx+1} / ${lbList.length}`;
}
function lbShow(i){
  const sc=document.querySelector(".lbscrim"); if(!sc || !lbList.length) return;
  lbIdx = (i%lbList.length + lbList.length) % lbList.length;
  const it = lbList[lbIdx], img = sc.querySelector(".lb-img");
  const big = lbBig(it.src);
  img.onerror = big!==it.src ? (()=>{ img.onerror=null; img.src=it.src; }) : null;
  img.src = big; img.alt = it.label || it.file || "Bild";
  lbSync();
}
function lbLoad(loader){                                 // Galerie nachladen, während die Großansicht schon offen ist
  if(typeof loader!=="function") return;
  const token = lbToken;
  Promise.resolve().then(loader).then(list=>{
    if(token!==lbToken || !document.querySelector(".lbscrim")) return;
    if(!Array.isArray(list) || !list.length) return;
    const seen = new Set(lbList.map(i=>i.src));
    const add = list.filter(i=>i && i.src && !seen.has(i.src));
    if(!add.length) return;
    lbList = lbList.concat(add);
    lbSync();
  }).catch(()=>{});
}
/* Wischen (Handy/Tablet): einen Finger nach links = nächstes Bild, nach rechts =
   vorheriges. Bewusst OHNE touch-action:none – so bleibt Zwei-Finger-Zoom im Bild
   erhalten; Mehrfinger-Gesten lassen wir daher in Ruhe. Wer gewischt hat, schließt
   nicht versehentlich: der folgende Klick wird verworfen. */
let lbSwiped=false;
function lbSwipe(sc){
  let x0=0, y0=0, multi=false;
  sc.addEventListener("touchstart", e=>{
    multi = e.touches.length>1;
    if(multi) return;
    const t=e.touches[0]; x0=t.clientX; y0=t.clientY; lbSwiped=false;
  }, {passive:true});
  sc.addEventListener("touchmove", e=>{
    if(multi || e.touches.length>1) return;
    if(Math.abs(e.touches[0].clientX-x0) > 12) lbSwiped=true;
  }, {passive:true});
  sc.addEventListener("touchend", e=>{
    const t = e.changedTouches && e.changedTouches[0];
    if(multi || !t || lbList.length<2) return;
    const dx=t.clientX-x0, dy=t.clientY-y0;
    if(Math.abs(dx)<40 || Math.abs(dx) < Math.abs(dy)*1.2) return;
    lbShow(lbIdx + (dx<0 ? 1 : -1));
  }, {passive:true});
}
function openLightbox(src, alt, list, start, loader){
  closeLightbox();
  lbReturnFocus=document.activeElement; lbToken++; lbSwiped=false;
  lbList = Array.isArray(list) && list.length ? list.slice() : [{src, label:alt||""}];
  lbIdx = Math.max(0, Math.min(lbList.length-1, start||0));
  const sc=el("div","lbscrim");
  sc.setAttribute("role","dialog"); sc.setAttribute("aria-modal","true"); sc.setAttribute("aria-label","Bild vergrößert");
  sc.innerHTML=`<button class="lb-x" aria-label="Schließen">×</button><img class="lb-img" src="" alt="">`;
  sc.addEventListener("click",e=>{
    if(lbSwiped){ lbSwiped=false; return; }             // Wisch-Geste, kein Klick
    if(e.target.closest(".lb-nav.prev")) return lbShow(lbIdx-1);
    if(e.target.closest(".lb-nav.next")) return lbShow(lbIdx+1);
    if(e.target===sc || e.target.closest(".lb-x")) closeLightbox();
  });
  document.body.appendChild(sc);
  lbSwipe(sc);
  lbShow(lbIdx);
  sc.querySelector(".lb-x").focus();
  lbLoad(loader);
}
document.addEventListener("keydown",e=>{                // Capture: Esc gilt zuerst der Lightbox
  if(!document.querySelector(".lbscrim")) return;
  if(e.key==="Escape"){ e.stopPropagation(); e.preventDefault(); return closeLightbox(); }
  if(lbList.length>1 && (e.key==="ArrowLeft"||e.key==="ArrowRight")){    // Galerie blättern
    e.stopPropagation(); e.preventDefault(); lbShow(lbIdx + (e.key==="ArrowRight"?1:-1));
  }
}, true);
function lbWire(img, label, list, loader){               // Bild anklick- UND tastaturbedienbar machen
  if(!img) return;
  img.classList.add("lb-zoom");
  img.setAttribute("role","button"); img.tabIndex=0;
  img.setAttribute("aria-label", label||"Bild vergrößern");
  const go=()=>openLightbox(img.currentSrc||img.src, img.alt, list, 0, loader);
  img.addEventListener("click",go);
  img.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); go(); } });
}
/* Deutsche Namen als Wikipedia-Artikeltitel. Die Listen schreiben Komposita mit
   Bindestrich (»Steck-Rübe«, »Kohl- / Steck-Rübe«); Wikipedia löst den Bindestrich
   NICHT auf (»Steck-Rübe« → nichts, »Steckrübe« → Treffer). Darum jeden Namen
   zusätzlich OHNE Bindestrich/Leerzeichen anbieten und die geteilten Grundwörter
   auflösen (»Kohl-« + »…-Rübe« → »Kohlrübe«). */
function deArticleTitles(card){
  const out=[], seen=new Set();
  const push=s=>{ s=norm(String(s)).replace(/^[-\s]+|[-\s]+$/g,"");
    const dehy=s.replace(/-\s*(.)/g,(_,c)=>c.toLowerCase());   // »Steck-Rübe« → »Steckrübe« (Wikipedia löst Bindestriche nicht auf)
    for(const v of [s, dehy]){
      const k=v.toLowerCase(); if(v && !seen.has(k)){ seen.add(k); out.push(v); } } };
  for(const part of (card.de||"").split(/[,;]/)){
    const clean0 = part.replace(/\([^)]*\)/g,"");        // »(Arznei-)Engelwurz« → ohne Klammern
    const segs = clean0.split("/").map(norm).filter(Boolean);
    if(segs.length<2){ push(clean0); continue; }
    const last = segs[segs.length-1];                    // »Steck-Rübe«
    push(last);
    const tail = last.split(/[-\s]/).pop().toLowerCase();// »rübe«
    for(const sg of segs.slice(0,-1)) push(sg.replace(/-$/,"")+tail);   // »Kohl«+»rübe« → »Kohlrübe«
  }
  return out;
}
/* Kandidaten in sinnvoller Reihenfolge – bewusst OHNE bloße Gattung (»Beta«,
   »Iris« sind auf Wikipedia mehrdeutig). Wichtig bei UNTERARTEN/Varietäten: das
   reine Binom ist die ELTERNart und damit eine ANDERE Pflanze – »Brassica napus«
   ist Raps, die Steckrübe (ssp. rapifera) hat einen eigenen Artikel. Dort zeigt
   das Binom das Falsche; deshalb bei infraspezifischen Namen der DEUTSCHE Name
   zuerst und das bloße Binom weglassen. Bei reinen Arten und Sorten-Gruppen bleibt
   das Binom (»Beta vulgaris« → »Rübe«) ein guter Treffer. */
// Reiner Sammel-/Sorteneintrag OHNE echtes Art-Epitheton ("Solidago Cultivars",
// "Aubrieta - Hybriden"): kein Taxon, also gibt es keinen Artartikel. Abgrenzung zu
// "Beta vulgaris Conditiva-Grp." (echtes Epitheton »vulgaris« → Binom findet die Art).
const GROUP_WORD = /^(cultivars?|hybriden?|sorten|grp\.?|gruppe|group|hort\.?)$/i;
function pureGroupName(a){
  const ep = binomEpithet(a);
  return !ep || GROUP_WORD.test(ep) || !/^[a-zäöü]/.test(ep);   // kein kleingeschriebenes Art-Epitheton
}
function wikiCandidates(card){
  const cands=[], seen=new Set();
  const add=s=>{ s=norm(s); if(s && !seen.has(s.toLowerCase())){ seen.add(s.toLowerCase()); cands.push(s); } };
  const de = deArticleTitles(card);
  const inf = infraEpithet(card.a);
  const autonym = inf && inf===binomEpithet(card.a);   // »Cornus kousa subsp. kousa« = die Art selbst
  add(card.g+" "+card.a);                               // voller Name (z. B. mit Sorte/Gruppe)
  if(pureGroupName(card.a)){                            // Sammel-/Sorteneintrag: keine Art → Gattung ist das beste Ziel
    de.forEach(add);                                    // deutscher (Sammel-)Name, z. B. »Goldrute«
    add(card.g);                                        // bloße Gattung – dt. Wikipedia löst »Solidago« → »Goldruten« auf
  }else if(inf && !autonym){                            // ANDERE Unterart: Binom = Elternart (Raps) → nur deutscher Name
    de.forEach(add);
    add(searchName(card));                              // Notnagel ganz am Ende: findet der deutsche Name nichts (»Garten-Dill«
                                                        // hat keinen Artikel), ist die Elternart (»Dill«) besser als gar nichts;
                                                        // die Steckrübe erreicht ihn nie, ihr deutscher Titel trifft vorher
  }else{                                                // Art oder Autonym: Binom ist dieselbe Pflanze (unverändert)
    add(searchName(card));                              // reines Binom zuerst (eindeutig)
    de.forEach(add);
  }
  return cands;
}
async function loadWiki(card, host, btn){
  if(navigator.onLine===false){
    host.innerHTML='<div class="wp-note">Offline – für Online-Infos ist Internet nötig. Die Links oben funktionieren, sobald du online bist.</div>'; return;
  }
  btn.disabled=true; btn.textContent="lädt …";
  let pg=null, hadResponse=false;
  for(const t of wikiCandidates(card)){
    try{ const d=await wikiJSONP(t); hadResponse=true; pg=wikiFirstPage(d); if(pg) break; }
    catch(e){ /* Netzfehler/Timeout – nächster Versuch (hadResponse ggf. false) */ }
  }
  if(!pg){
    if(hadResponse){                                    // echte „nicht gefunden" – cachen, Knopf weg
      wikiCache.set(card.key, null);
      host.innerHTML='<div class="wp-note">Kein deutscher Wikipedia-Artikel gefunden. Die Links oben führen dich weiter.</div>';
      if(btn.parentNode) btn.remove();
    } else {                                            // offline/blockiert – nicht cachen, Wiederholung anbieten
      host.innerHTML='<div class="wp-note">Online-Infos konnten nicht geladen werden (offline oder blockiert). Die Links oben funktionieren weiterhin.</div>';
      btn.disabled=false; btn.innerHTML=ico("globe")+" Erneut versuchen";
    }
    return;
  }
  const data = { title:pg.title, extract:shortenExtract(pg.extract),
    thumb: pg.thumbnail && pg.thumbnail.source,
    url: "https://de.wikipedia.org/wiki/"+encodeURIComponent(pg.title.replace(/ /g,"_")) };
  wikiCache.set(card.key, data); renderWiki(host, data); if(btn.parentNode) btn.remove();
  wikiGallery(pg.title).then(list=>{                    // weitere Artikelbilder für die Vollbild-Galerie
    if(!list.length) return;
    data.gallery = list; wikiCache.set(card.key, data);
    const img = host.querySelector("img"); if(img) lbWire(img, "Bilder ansehen", list);
  }).catch(()=>{});
}

// ---- infraspezifisches Epitheton (für die Wikipedia-Kandidaten) ----
const INFRA_RE = /\b(?:var|subsp|ssp|convar|f|cv)\.\s*([a-zäöüß][a-zäöüß-]{2,})/i;
function infraEpithet(a){ const m = INFRA_RE.exec(norm(a||"")); return m ? m[1].toLowerCase() : ""; }

// ---- Modal (eigener Namensraum .infoscrim/.infobox) ----
let infoEl=null, infoReturnFocus=null;
function infoKey(e){
  if(e.key==="Escape"){ closeInfo(); return; }
  if(e.key==="Tab" && infoEl){                                   // Fokus im Dialog halten (Fokusfalle)
    const f=[...infoEl.querySelectorAll('a[href],button:not([disabled]),input,select,[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);
    if(!f.length) return;
    const first=f[0], last=f[f.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  }
}
function closeInfo(){ if(infoEl){ infoEl.remove(); infoEl=null; document.removeEventListener("keydown", infoKey);
  if(infoReturnFocus && infoReturnFocus.focus){ try{ infoReturnFocus.focus(); }catch(e){} } infoReturnFocus=null; } }
function openInfo(card){
  if(!card) return;
  closeInfo();
  const links = deepLinks(card).map(l=>
    `<a href="${esc(l.u)}" target="_blank" rel="noopener">${esc(l.n)}<span class="ext">↗</span></a>`).join("");
  const fam = [card.fam, card.thema].filter(Boolean).join(" · ");
  const ety = nameEtymology(card.g, card.a);                       // Namensherleitung (Merkhilfe, offline)
  // Standardmäßig aufgeklappt; klappt man sie zu, merkt sich das Gerät den Zustand
  // global – alle folgenden Infokarten öffnen dann zugeklappt (und umgekehrt).
  const etyOpen = store.get(LS_PREFIX+"etyopen")!=="0";
  const etyHTML = ety.length ? `<details class="etym"${etyOpen?" open":""}>
       <summary>${ico("book","etym-ic")} Name-Herkunft · Merkhilfe</summary>
       <ul class="etym-list">${ety.map(p=>`<li><i>${esc(p.t)}</i> — ${esc(p.d)}</li>`).join("")}</ul>
       <div class="etym-note">Kurzherleitung (Latein/Griechisch → Deutsch), kuratiert – ohne Gewähr.</div>
     </details>` : "";
  const scrim = el("div","infoscrim"); scrim.id="infoScrim";
  scrim.innerHTML = `<div class="infobox" role="dialog" aria-modal="true" aria-label="Pflanzen-Info">
     <button class="infobox-x" id="infoClose" aria-label="Schließen" title="Schließen">×</button>
     <div class="modal-head">
       <div class="mh-bot">${esc(norm(card.g+" "+card.a))}</div>
       ${card.de?`<div class="mh-de">${esc(card.de)}</div>`:""}
       ${fam?`<div class="mh-fam">${esc(fam)}</div>`:""}
     </div>
     ${etyHTML}
     <div class="srcblock">
       <div class="srclabel">Nachschlagen · öffnet neuen Tab</div>
       <div class="srcgrid">${links}</div>
     </div>
     <div class="wpblock">
       <button class="btn primary" id="wpLoad" title="Kurztext und Bild von der deutschen Wikipedia laden (nur online)">${ico("globe")}Online-Infos laden (Wikipedia)</button>
       <div class="wphost" id="wpHost"></div>
     </div>
   </div>`;
  document.body.appendChild(scrim); infoEl=scrim;
  scrim.addEventListener("click", e=>{ if(e.target===scrim) closeInfo(); });
  const etyD = scrim.querySelector("details.etym");                // Auf-/Zuklappen global merken
  if(etyD) etyD.addEventListener("toggle", ()=>store.set(LS_PREFIX+"etyopen", etyD.open?"1":"0"));
  $("#infoClose").onclick = closeInfo;
  const host = scrim.querySelector("#wpHost"), btn = scrim.querySelector("#wpLoad");
  const cached = wikiCache.get(card.key);
  if(cached){ renderWiki(host, cached); btn.remove(); }
  else if(cached===null){ host.innerHTML='<div class="wp-note">Kein deutscher Wikipedia-Artikel gefunden. Die Links oben führen dich weiter.</div>'; btn.remove(); }
  else btn.onclick = ()=>loadWiki(card, host, btn);
  document.addEventListener("keydown", infoKey);
  infoReturnFocus = document.activeElement;                       // Fokus nach dem Schließen zurückgeben
  try{ $("#infoClose").focus(); }catch(e){}
}

/* ============================================================
   Einstellungen (global, nicht profilgebunden)
   Damit auch andere zuständige Stellen als das RP Freiburg das Werkzeug nutzen.
   ============================================================ */
const SETTINGS_KEY = LS_PREFIX+"settings";
function defaultSettings(){ return {
  stelle1:"Regierungspräsidien Baden-Württemberg",
  stelle2:"",
  pruefendeNote:"Nur für Prüfende",
  sheetTitle:"Abschlussprüfung Pflanzenbestimmung"
}; }
function loadSettings(){
  let s=null; try{ const raw=store.get(SETTINGS_KEY); if(raw) s=JSON.parse(raw); }catch(e){}
  // Migration auf die offiziellen Leerbögen: unverändert gespeicherte alte
  // Standardwerte gelten als »nicht angepasst« und bekommen die neuen Defaults.
  const OLD={sheetTitle:"Pflanzenkenntnisse",stelle1:"Regierungspräsidium Freiburg",stelle2:"Zuständige Stelle Grüne Berufe"};
  if(s&&typeof s==="object") Object.keys(OLD).forEach(k=>{ if(s[k]===OLD[k]) delete s[k]; });
  settings=Object.assign(defaultSettings(), (s&&typeof s==="object")?s:{});
}
function saveSettings(){ store.set(SETTINGS_KEY, JSON.stringify(settings)); }
const SETTINGS_FIELDS=[
  {key:"sheetTitle",   label:"Titel des Bogens",                        ph:"Abschlussprüfung Pflanzenbestimmung"},
  {key:"stelle1",      label:"Fußzeile – zuständige Stelle (Zeile 1)",  ph:"z. B. Regierungspräsidien Baden-Württemberg"},
  {key:"stelle2",      label:"Fußzeile (Zeile 2, optional)",            ph:"z. B. Abteilung / Ort"},
  {key:"pruefendeNote",label:"Vermerk auf der Musterlösung",            ph:"z. B. Nur für Prüfende"}
];
function openSettings(){
  renderSettings();
  $("#settingsScrim").classList.add("open"); syncPanelButtons();
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
function openGrader(){
  if(!$("#gMax").dataset.touched) $("#gMax").value=(selection.length||drawTarget())*ptsPer();
  renderGrader();
  $("#graderScrim").classList.add("open"); syncPanelButtons();
  setTimeout(()=>$("#gPts").focus(),60);
}
function renderGrader(){
  const max=Math.max(1, Math.round(parseFloat($("#gMax").value)||0));
  $("#gScaleMax").textContent="· "+max+" P.";
  // Baden-Württemberg rechnet immer linear; ein alter (gespeicherter) IHK-Modus heilt sich hier zu linear.
  if(scaleCfg.mode!=="linear"){ scaleCfg.mode="linear"; saveCfg(); }

  const bands = linBands(scaleCfg.lin);
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
        <div class="detail">${r.pct.toFixed(1).replace('.',',')} % · dezimal ${r.dez}</div></div>`;
    mark.innerHTML=`<div class="pin" style="left:${r.pct}%" data-pct="${r.pct.toFixed(0)} %"></div>`;
  }

  // Schwellen-Tabelle (Grenzen editierbar)
  const rows=bands.map(b=>{
    const lo=thresholdPts(b.lo,max);
    const hi=b.stufe===1?max:(thresholdPts(bands[b.stufe-2].lo,max)-1);
    const range=b.stufe===6?`0 – ${thresholdPts(bands[4].lo,max)-1}`:`${lo} – ${hi}`;
    const pctCell = b.stufe<=5
      ? `ab <input class="gedge" type="number" min="1" max="99" step="1" value="${b.lo}" data-i="${b.stufe-1}"> %`
      : `0–${bands[4].lo-1} %`;
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

  $("#gNote").textContent = "Gleichmäßige (lineare) Skala – jede Note gleiche Spannweite, Grenzen anpassbar (VGH BW, Urt. 24.1.1979). Dezimalnote linear.";
}

/* ============================================================
   Verdrahtung
   ============================================================ */
/* Barrierefreiheit für ALLE Modale (.scrim), zentral und additiv – ohne Eingriff in
   die verstreuten Öffnen-/zentralen Schließen-Wege: setzt role/aria-modal/aria-labelledby,
   legt beim Öffnen den Fokus ins Modal (sofern nicht schon dort), gibt ihn beim Schließen
   an den Auslöser zurück und hält Tab im Dialog (Fokusfalle). */
function wireModalA11y(){
  const FOC='input:not([type=hidden]):not([disabled]),select,textarea,button,[href],[tabindex]:not([tabindex="-1"])';
  const ret=[];
  document.querySelectorAll(".scrim").forEach(s=>{
    const dlg = s.querySelector(".modal,.grader,[id$='Panel']") || s.firstElementChild;
    if(dlg){
      dlg.setAttribute("role","dialog"); dlg.setAttribute("aria-modal","true");
      const t = dlg.querySelector(".gtitle,h3,h2");
      if(t){ if(!t.id) t.id=(dlg.id||s.id||"dlg")+"Ttl"; dlg.setAttribute("aria-labelledby",t.id); }
    }
    new MutationObserver(()=>{
      if(s.classList.contains("open")){
        if(!s.__a11yOpen){ s.__a11yOpen=true; ret.push(document.activeElement);
          if(!s.contains(document.activeElement)){ const f=s.querySelector(FOC);
            if(f) setTimeout(()=>{ if(s.classList.contains("open") && !s.contains(document.activeElement)){ try{f.focus();}catch(e){} } }, 20); } }
      } else if(s.__a11yOpen){ s.__a11yOpen=false; const p=ret.pop(); if(p && p.focus){ try{p.focus();}catch(e){} } }
    }).observe(s,{attributes:true, attributeFilter:["class"]});
  });
  document.addEventListener("keydown",e=>{
    if(e.key!=="Tab") return;
    const open=[...document.querySelectorAll(".scrim.open")].pop(); if(!open) return;
    const f=[...open.querySelectorAll(FOC)].filter(x=>!x.disabled && x.offsetParent!==null);
    if(!f.length) return;
    const first=f[0], last=f[f.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  });
}
function wire(){
  wireModalA11y();
  if($("#tabExam")) $("#tabExam").onclick=()=>vt(()=>setMode("exam"));     // Moduswechsel blendet weich über
  if($("#tabManage")) $("#tabManage").onclick=()=>vt(()=>setMode("manage"));
  setMode(store.get(LS_PREFIX+"examMode")||"exam");
  const fb=$(".findbar");   // Suchleiste klebt beim Scrollen oben; »stuck« nur, wenn wirklich angepinnt (dezenter Schatten)
  if(fb){ const upd=()=>fb.classList.toggle("stuck", fb.getBoundingClientRect().top<=0.5);
    window.addEventListener("scroll", upd, {passive:true}); window.addEventListener("resize", upd, {passive:true}); upd(); }
  // »Verwaltung«: seltene Funktionen (Liste/Schema/Einstellungen/Sicherung) auf-/zuklappen
  // Wo die Plattform es kann (Popover + Anchor-Positioning), wird die Leiste ein echtes
  // Popover im Top-Layer: Klick daneben und Esc schließen von selbst, die Position hängt
  // am Knopf. Sonst bleibt exakt das bisherige Auf-/Zuklappen – der »hidden«-Zustand
  // (und damit alles Bestehende) stimmt in beiden Fällen.
  const admPop = (()=>{ try{ return ("popover" in HTMLElement.prototype) && window.CSS && CSS.supports("anchor-name: --a"); }catch(e){ return false; } })();
  const admSync=(on)=>{ $("#btnAdmin").classList.toggle("active",on); $("#btnAdmin").setAttribute("aria-expanded",String(on)); };
  if(admPop){
    const bar=$("#adminBar");
    bar.setAttribute("popover","auto");
    bar.addEventListener("toggle",e=>{                 // deckt auch Light-Dismiss/Esc ab
      const on = e.newState==="open";
      if(!on) bar.hidden=true;
      admSync(on);
    });
  }
  $("#btnAdmin").onclick=()=>{
    const bar=$("#adminBar"), open=bar.hidden;
    if(admPop){                                        // hidden zuerst lösen, sonst bleibt display:none
      if(open){ bar.hidden=false; try{ bar.showPopover(); }catch(e){} }
      else { try{ bar.hidePopover(); }catch(e){} bar.hidden=true; }
      admSync(open);                                   // sofort spiegeln (das toggle-Event kommt erst später)
      return;
    }
    bar.hidden=!open;
    admSync(open);
  };
  $("#btnImport").onclick=pickExcel;
  $("#btnAdd").onclick=()=>openEdit(null);
  $("#btnGrade").onclick=openGrader;
  $("#gPts").addEventListener("input",renderGrader);
  $("#gMax").addEventListener("input",()=>{ $("#gMax").dataset.touched="1"; renderGrader(); });
  $("#gSync").onclick=()=>{ $("#gMax").value=(selection.length||drawTarget())*ptsPer(); delete $("#gMax").dataset.touched; renderGrader(); };
  $("#btnOpen").onclick=importJsonFile;
  $("#btnSave").onclick=exportBackup;
  $("#btnReset").onclick=resetToDefault;
  $("#q").addEventListener("input",()=>{ renderList(); syncSelUI(); syncFilterSummary(); });
  $("#cat").addEventListener("change",()=>{ vt(()=>{ renderList(); syncSelUI(); }); syncFilterSummary(); });   // Gefiltertes gleitet heraus/herein
  $("#onlyzp").addEventListener("change",()=>{ vt(()=>{ renderList(); syncSelUI(); }); syncFilterSummary(); });
  $("#drawCount").addEventListener("input",()=>{ $("#selTarget").textContent=$("#drawCount").value||drawTarget(); });
  $("#btnDraw").onclick=()=>vt(drawRandom);   // gezogene Prüfung gleitet ins Panel
  $("#btnShuffle").onclick=shuffleSel;
  $("#btnClear").onclick=clearSel;
  $("#btnPrint").onclick=()=>askPrintMode();
  // Auswahl-/Bogen-Vorschau
  $("#btnPreview").onclick=openPreview;
  $("#pvAddBtn").onclick=pvAddExisting;
  $("#pvAdd").addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); pvAddExisting(); } });
  $("#pvAddNew").onclick=pvAddNew;
  $("#pvPrint").onclick=()=>askPrintMode();
  // Gespeicherte Prüfungen
  $("#btnExams").onclick=openExams;
  $("#exSave").onclick=saveExam;
  $("#exUpdate").onclick=updateLoadedExam;
  $("#exImport").onclick=importJsonFile;
  // Einstellungen
  $("#btnSettings").onclick=openSettings;
  $("#setReset").onclick=resetSettings;
  // Hilfe
  $("#btnHelp").onclick=openHelp;
  // Profil-Auswahl
  $("#frSelect").addEventListener("change",()=>vt(applyProfileSelect));
  $("#nivSelect").addEventListener("change",()=>vt(applyProfileSelect));
  $("#btnSchema").onclick=openSchema;

  // Import-Dialog
  $("#importCancel").onclick=()=>{ $("#importScrim").classList.remove("open"); pendingImport=null; };
  $("#importConfirm").onclick=doImport;
  document.querySelectorAll('input[name="impmode"]').forEach(r=>r.addEventListener("change",e=>{
    document.querySelectorAll("#importChoice .rcard").forEach(c=>c.classList.remove("sel"));
    e.target.closest(".rcard").classList.add("sel");
  }));
  // Druck-Dialog (mit »Als Prüfung speichern«)
  $("#printBlank").onclick=()=>{ const ex=maybeSaveFromPrint(); $("#printScrim").classList.remove("open"); if(printChoose) printChoose("blank",ex); };
  $("#printSolution").onclick=()=>{ const ex=maybeSaveFromPrint(); $("#printScrim").classList.remove("open"); if(printChoose) printChoose("solution",ex); };
  $("#printCancel").onclick=()=>$("#printScrim").classList.remove("open");
  // Edit-Dialog
  $("#editCancel").onclick=()=>{ selectNewAfterSave=false; $("#editScrim").classList.remove("open"); };
  $("#editSave").onclick=saveEdit;
  // ×-Knopf der Modul-Modals
  document.querySelectorAll(".pclose").forEach(b=>b.onclick=()=>{ b.closest(".scrim").classList.remove("open"); syncPanelButtons(); });
  // Scrim-Klick schließt das jeweilige Modal
  document.querySelectorAll(".scrim").forEach(s=>s.addEventListener("mousedown",e=>{ if(e.target===s){ s.classList.remove("open"); selectNewAfterSave=false; syncPanelButtons(); } }));
  // Escape schließt nur das oberste offene Modal. Das Info-Modal (.infoscrim) liegt
  // darüber und bringt sein eigenes Esc mit (infoKey → closeInfo) – solange es offen
  // ist, fasst dieser Handler die Panels nicht an (sonst schlösse ein Esc beides).
  document.addEventListener("keydown",e=>{
    if(e.key!=="Escape") return;
    if(document.querySelector(".infoscrim")) return;
    const open=[...document.querySelectorAll(".scrim.open")];
    if(open.length){ open[open.length-1].classList.remove("open"); selectNewAfterSave=false; syncPanelButtons(); }
  });
}

/* Druck-Dialog (Prüfungsbogen / Musterlösung) mit Callback statt window.prompt.
   Beim Druck der aktuellen Auswahl (ohne cb) kann sie direkt als Prüfung
   gespeichert werden; eine geladene Prüfung wird stattdessen aktualisiert. */
let printChoose=null;
function askPrintMode(cb){
  printChoose = cb || ((m,ex)=>printSheet(m,ex));
  const row=$("#prSaveRow");
  if(row){
    const forSelection=!cb; // cb gesetzt = Druck einer gespeicherten Prüfung (Snapshot)
    row.hidden=!forSelection||!selection.length;
    if(!row.hidden){
      const ex=exams.find(e=>e.id===loadedExamId);
      $("#prDate").value = ex ? (ex.date||todayISO()) : todayISO();
      $("#prLabel").value = ex ? (ex.label||"") : "";
      $("#prSaveLbl").textContent = ex ? `Geladene Prüfung (${fmtDate(ex.date)}) aktualisieren` : "Als Prüfung speichern";
      $("#prSaveChk").checked = true;
    }
  }
  $("#printScrim").classList.add("open");
}
function maybeSaveFromPrint(){
  const row=$("#prSaveRow");
  if(!row||row.hidden||!$("#prSaveChk").checked||!selection.length) return null;
  const date=$("#prDate").value||todayISO(), label=$("#prLabel").value;
  const hatte=!!exams.find(e=>e.id===loadedExamId);
  const ex=hatte?updateExamData(date,label):saveExamData(date,label);
  if(ex) toast(hatte?`Prüfung aktualisiert (${fmtDate(ex.date)})`:`Als Prüfung gespeichert (${fmtDate(ex.date)})`);
  return ex||null;
}

/* Modul-Panels öffnen als Modal-Fenster (Scrim); Buttons zeigen den Zustand */
const PANEL_BUTTONS=[
  ["#btnHelp","#helpScrim"],["#btnGrade","#graderScrim"],["#btnSchema","#schemaScrim"],
  ["#btnExams","#examsScrim"],["#btnSettings","#settingsScrim"],["#btnPreview","#previewScrim"]
];
function panelOpen(sel){ const s=$(sel); return !!s&&s.classList.contains("open"); }
function closePanel(sel){ const s=$(sel); if(s) s.classList.remove("open"); syncPanelButtons(); }
function openHelp(){
  $("#helpScrim").classList.add("open"); syncPanelButtons();
}
function syncPanelButtons(){
  PANEL_BUTTONS.forEach(([b,p])=>{
    const btn=$(b), pan=$(p); if(!btn||!pan) return;
    const open=pan.classList.contains("open");
    btn.classList.toggle("active",open);
    btn.setAttribute("aria-pressed",open?"true":"false");
  });
}
function renderAll(){
  syncProfileUI(); refreshKatList(); renderList(); syncSelUI(); syncFilterSummary();
  if(panelOpen("#graderScrim")) renderGrader();
  if(panelOpen("#schemaScrim")) renderSchema();
  if(panelOpen("#examsScrim")){ renderExams(); syncExamControls(); }
  if(panelOpen("#settingsScrim")) renderSettings();
  if(panelOpen("#previewScrim")) renderPreview();
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
function openSchema(){
  renderSchema();
  $("#schemaScrim").classList.add("open"); syncPanelButtons();
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
  if(panelOpen("#graderScrim")) renderGrader();
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
