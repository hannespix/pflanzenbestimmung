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

/* ---------- Browser-Speicher (localStorage, je Profil) ---------- */
const LS_PREFIX="pflanzenkenntnis.";
const dataKey = id => LS_PREFIX+"data."+id;
let persistTimer=null, isSeed=true;
function persist(){
  clearTimeout(persistTimer);
  persistTimer=setTimeout(()=>{
    try{
      localStorage.setItem(dataKey(profileId), JSON.stringify({v:2,plants:cache,schema,nextId}));
      localStorage.setItem(LS_PREFIX+"profile", profileId);
      isSeed=false; setStatus("saved");
    }catch(e){ setStatus("err"); }
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
  selection=[];
  let raw=null; try{ raw=localStorage.getItem(dataKey(id)); }catch(e){}
  if(raw){
    try{
      const d=JSON.parse(raw);
      cache=(d.plants||[]).map(normPlant);
      schema=(d.schema&&Array.isArray(d.schema.cols))?d.schema:cloneSchema(def.schema);
      if(!schema.scale) schema.scale=cloneSchema(def.schema).scale;
      scaleCfg=schema.scale;
      nextId=d.nextId || (cache.reduce((m,p)=>Math.max(m,p.id),0)+1);
      isSeed=false; setStatus("saved");
    }catch(e){ seedInto(def); isSeed=true; setStatus("seed"); }
  }else{
    seedInto(def); isSeed=true; setStatus(cache.length?"seed":"empty");
  }
}
function switchProfile(id){
  loadProfile(id);
  try{ localStorage.setItem(LS_PREFIX+"profile", id); }catch(e){}
  applyDrawDefault();
  refresh(); renderAll();
}

function resetToDefault(){
  const def=PROFILE_DEFS[profileId];
  const label=def.fr+" · "+def.niveau;
  if(!confirm(`Alle im Browser gespeicherten Änderungen für „${label}“ verwerfen und zur hinterlegten Liste zurückkehren?`)) return;
  try{ localStorage.removeItem(dataKey(profileId)); }catch(e){}
  seedInto(def); selection=[]; isSeed=true;
  setStatus(cache.length?"seed":"empty"); refresh(); renderAll();
  toast(cache.length?"Standardliste wiederhergestellt":"Liste geleert (keine hinterlegten Daten)");
}

/* ---------- Backup als JSON-Datei ---------- */
function downloadText(text,name,mime){
  const url=URL.createObjectURL(new Blob([text],{type:mime||"application/json"}));
  const a=el("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
function exportBackup(){
  const d=new Date().toISOString().slice(0,10);
  downloadText(JSON.stringify({v:2,profile:profileId,exported:new Date().toISOString(),plants:cache,schema,nextId},null,0),
    `pflanzenliste_${profileId}_${d}.json`);
  toast("Backup-Datei erstellt");
}
function importBackup(){
  const inp=el("input"); inp.type="file"; inp.accept=".json,application/json";
  inp.onchange=async()=>{
    const f=inp.files[0]; if(!f) return;
    try{
      const d=JSON.parse(await f.text());
      if(!d||!Array.isArray(d.plants)) throw new Error("Format");
      cache=d.plants.map(normPlant);
      if(d.schema&&Array.isArray(d.schema.cols)){ schema=d.schema; if(!schema.scale) schema.scale=cloneSchema(PROFILE_DEFS[profileId].schema).scale; scaleCfg=schema.scale; }
      else if(d.scale&&d.scale.mode){ schema.scale=d.scale; scaleCfg=schema.scale; }
      nextId=d.nextId || (cache.reduce((m,p)=>Math.max(m,p.id),0)+1);
      selection=[]; markDirty(); refresh(); renderAll();
      toast(cache.length+" Arten aus Sicherung geladen");
    }catch(e){ toast("Keine gültige Backup-Datei (.json)",true); }
  };
  inp.click();
}

/* ---------- Status ---------- */
function setStatus(s){
  const dot=$("#dbdot"), name=$("#dbname");
  const map={
    seed:  ["dot",       "Standardliste · hinterlegte Daten"],
    empty: ["dot",       "Keine hinterlegte Liste · Excel importieren"],
    dirty: ["dot dirty", "Browser-Speicher · sichert …"],
    saved: ["dot saved", "Im Browser gespeichert"],
    err:   ["dot dirty", "Speichern fehlgeschlagen"]
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
  $("#ptsPill").textContent="max. "+(selection.length*ptsPer())+" P.";
  document.querySelectorAll(".row").forEach(r=>{
    const on=selection.includes(+r.dataset.id);
    r.classList.toggle("on",on);
    const cb=r.querySelector(".chk"); if(cb) cb.checked=on;
  });
  const has=selection.length>0;
  $("#btnPrint").disabled=!has; $("#btnClear").disabled=!has; $("#btnShuffle").disabled=selection.length<2;
  const sync=$("#gSync"); if(sync) sync.textContent="= "+((selection.length||drawTarget())*ptsPer())+" P.";
  const gr=$("#grader");
  if(gr && !gr.hasAttribute("hidden")){
    if(!$("#gMax").dataset.touched){ $("#gMax").value=(selection.length||drawTarget())*ptsPer(); }
    renderGrader();
  }
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
  if(editId!=null){ const p=cache.find(x=>x.id===editId); if(p) Object.assign(p,obj); }
  else{ cache.push({id:nextId++,...obj}); }
  markDirty(); refresh(); refreshKatList(); renderList(); syncSelUI();
  $("#editScrim").classList.remove("open");
  toast(editId!=null?"Gespeichert":"Art hinzugefügt");
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

function buildSheet(mode){ // mode: 'blank' | 'solution'
  const plants=selectedPlants();
  const cols=activeCols();
  const def=PROFILE_DEFS[profileId];
  const today=new Date().toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"});
  const sol = mode==="solution";
  const per=ptsPer(), maxP=plants.length*per;

  const rows=plants.map((p,i)=>{
    const num=`<td class="num">${i+1}</td>`;
    const cells=cols.map(c=> sol
      ? `<td class="sol">${c.key==="gattung"?`<span class="gg">${esc(p[c.key]||"")}</span>`:esc(p[c.key]||"")}</td>`
      : `<td></td>`).join("");
    const score = sol ? `<td class="score"></td>` : "";
    return `<tr>${num}${cells}${score}</tr>`;
  }).join("");

  let key, keyLabel;
  if(scaleCfg.mode==="ihk"){
    key=GRADE.map(g=>g.stufe===6?`6 unter ${thresholdPts(GRADE[4].min,maxP)}`:`${g.stufe} ab ${thresholdPts(g.min,maxP)}`).join(" · ");
    keyLabel="100-Punkte-Schlüssel";
  }else{
    const B=linBands(scaleCfg.lin);
    key=B.map(b=>b.stufe===6?`6 unter ${thresholdPts(B[4].lo,maxP)}`:`${b.stufe} ab ${thresholdPts(b.lo,maxP)}`).join(" · ");
    keyLabel="linear, Baden-Württemberg";
  }
  const colgroup=`<colgroup><col class="c-num">`+
    cols.map(c=>`<col${c.key==="familie"?' class="c-fam"':''}>`).join("")+
    (sol?`<col class="c-score">`:``)+`</colgroup>`;
  const heads=cols.map(c=>`<th>${esc(FIELD_LABEL[c.key]||c.key)}<span class="p">${c.pts} P.</span></th>`).join("");
  const scoreHead = sol ? `<th>Punkte<span class="p">${per}</span></th>` : "";
  const feldText = cols.map(c=>FIELD_LABEL[c.key]||c.key).join(", ").replace(/,([^,]*)$/," und$1");

  $("#sheet").innerHTML=`
    <div class="sheet-head">
      <div class="title">
        <h1>Pflanzenkenntnisse${sol?" — Musterlösung":""}</h1>
        <div class="st">Abschlussprüfung ${esc(def.niveau)} · Fachrichtung ${esc(def.fr)}</div>
      </div>
      <div class="brand">
        Regierungspräsidium Freiburg<br>Zuständige Stelle Grüne Berufe<br>
        ${sol?'<span class="solution-note">Nur für Prüfende</span>':""}
      </div>
    </div>
    <div class="sheet-meta">
      <div class="mrow"><span class="k">Prüfling</span><span class="val"></span></div>
      <div class="mrow"><span class="k">Prüflings-Nr.</span><span class="val"></span></div>
      <div class="mrow"><span class="k">Datum</span><span class="val">${sol?"":today}</span></div>
      <div class="mrow"><span class="k">Prüfungsort</span><span class="val"></span></div>
      <div class="mrow"><span class="k">Ausschuss</span><span class="val"></span></div>
      <div class="mrow"><span class="k">Bearbeitungszeit</span><span class="val"></span></div>
    </div>
    <div class="scheme">
      <span>Je Pflanze werden ${esc(feldText)} getrennt bewertet.</span>
      <span class="pts">${plants.length} Pflanzen · max. ${maxP} Punkte</span>
    </div>
    <table class="exam">
      ${colgroup}
      <thead><tr><th>Nr.</th>${heads}${scoreHead}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sheet-scale">Bewertungsschlüssel (${keyLabel}): ${key}</div>
    <div class="sheet-foot">
      <div class="sig">Datum, Unterschrift Prüfende</div>
      <div class="sum">Erreicht: <b>&nbsp;&nbsp;&nbsp;&nbsp;</b> / ${maxP} Punkte</div>
    </div>`;
}
function printSheet(mode){
  if(!selection.length){ toast("Erst Arten auswählen",true); return; }
  buildSheet(mode);
  window.print();
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
  $("#btnOpen").onclick=importBackup;
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
  // Edit-Dialog
  $("#editCancel").onclick=()=>$("#editScrim").classList.remove("open");
  $("#editSave").onclick=saveEdit;
  // Scrim-Klick schließt
  document.querySelectorAll(".scrim").forEach(s=>s.addEventListener("mousedown",e=>{ if(e.target===s) s.classList.remove("open"); }));
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") document.querySelectorAll(".scrim.open").forEach(s=>s.classList.remove("open")); });
}

function askPrintMode(){
  // Leichter Auswahl-Dialog: Prüfungsbogen (leer) oder Musterlösung
  const choice=window.prompt("Bogen drucken:\n\n[1] Prüfungsbogen (leer, zum Ausfüllen)\n[2] Musterlösung (mit Antworten, nur für Prüfende)\n\nBitte 1 oder 2 eingeben:","1");
  if(choice==null) return;
  printSheet(choice.trim()==="2"?"solution":"blank");
}

function renderAll(){
  syncProfileUI(); refreshKatList(); renderList(); syncSelUI();
  if(!$("#grader").hasAttribute("hidden")) renderGrader();
  if(!$("#schemaPanel").hasAttribute("hidden")) renderSchema();
}

/* ---------- Fachrichtungs-/Profil-Auswahl ---------- */
function populateSelectors(){
  $("#frSelect").innerHTML=FR_LIST.map(f=>`<option value="${slug(f)}">${esc(f)}</option>`).join("");
  $("#nivSelect").innerHTML=NIVEAUS.map(n=>`<option value="${n.key}">${esc(n.label)}</option>`).join("");
}
function syncProfileUI(){
  const def=PROFILE_DEFS[profileId];
  $("#frSelect").value=slug(def.fr); $("#nivSelect").value=def.niveauKey;
  $("#profSub").textContent=`${drawTarget()} Pflanzen · max. ${drawTarget()*ptsPer()} P.`;
}
function applyProfileSelect(){
  const id=$("#frSelect").value+"_"+$("#nivSelect").value;
  if(PROFILE_DEFS[id]) switchProfile(id);
}
function applyDrawDefault(){ $("#drawCount").value=drawTarget(); $("#selTarget").textContent=drawTarget(); }

/* ---------- Prüfungsschema (Spalten/Punkte/Anzahl) ---------- */
function toggleSchema(){
  const s=$("#schemaPanel"); if(s.hasAttribute("hidden")){ s.removeAttribute("hidden"); renderSchema(); } else s.setAttribute("hidden","");
}
function renderSchema(){
  $("#scAnzahl").value=schema.anzahl;
  const host=$("#scFields"); host.innerHTML="";
  FIELD_ORDER.forEach(k=>{
    const col=schema.cols.find(c=>c.key===k); const pts=col?col.pts:0;
    const row=el("div","scrow");
    row.innerHTML=`<span class="scname">${FIELD_LABEL[k]}</span>
      <input class="scpts" type="number" min="0" max="20" step="1" value="${pts}" data-k="${k}" aria-label="Punkte ${FIELD_LABEL[k]}"><span class="scp">P.</span>`;
    host.appendChild(row);
  });
  host.querySelectorAll(".scpts").forEach(inp=>inp.onchange=updateSchema);
  $("#scAnzahl").onchange=updateSchema;
  $("#scSum").textContent=`${ptsPer()} P. je Pflanze · max. ${schema.anzahl*ptsPer()} P. gesamt`;
}
function updateSchema(){
  const anzahl=Math.max(1,Math.round(parseFloat($("#scAnzahl").value)||drawTarget()));
  const cols=[];
  $("#scFields").querySelectorAll(".scpts").forEach(inp=>{
    const pts=Math.max(0,Math.round(parseFloat(inp.value)||0));
    if(pts>0) cols.push({key:inp.dataset.k,pts});
  });
  if(!cols.length){ toast("Mindestens ein Bewertungsfeld mit Punkten nötig",true); renderSchema(); return; }
  schema.anzahl=anzahl; schema.cols=cols; scaleCfg=schema.scale;
  markDirty(); applyDrawDefault(); renderSchema(); syncProfileUI(); renderList(); syncSelUI();
  if(!$("#grader").hasAttribute("hidden")) renderGrader();
}

/* ---------- Start ---------- */
(function boot(){
  try{
    populateSelectors();
    let pid=null; try{ pid=localStorage.getItem(LS_PREFIX+"profile"); }catch(e){}
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
