/* ============================================================
   Pflanzenkenntnis · Lernen (für Azubis der grünen Berufe)
   Karteikarten mit Leitner/Spaced-Repetition, Multiple-Choice-Quiz und Tippen.
   Nutzt dieselben hinterlegten Listen wie das Prüfungswerkzeug (SEEDS),
   vollständig offline, Fortschritt je Profil im Browser (localStorage).
   Keine Prüfungslisten-Erstellung, kein Notenschlüssel.
   ============================================================ */
"use strict";

/* ---------- Helfer ---------- */
const $ = s => document.querySelector(s);
const el = (t,c) => { const e=document.createElement(t); if(c) e.className=c; return e; };
const esc = s => (s==null?"":String(s)).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
const norm = s => (s==null?"":String(s)).replace(/\s+/g," ").trim();
const shuffle = a => { for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };

/* ---------- Speicher (localStorage mit In-Memory-Fallback) ---------- */
const LS_PREFIX="pflanzenlernen.";
const store = (()=>{
  let ok=false;
  try{ const k=LS_PREFIX+"__probe"; localStorage.setItem(k,"1"); localStorage.removeItem(k); ok=true; }catch(e){ ok=false; }
  const mem=new Map();
  return {
    get(k){ if(ok){ try{ return localStorage.getItem(k); }catch(e){ ok=false; } } return mem.has(k)?mem.get(k):null; },
    set(k,v){ v=String(v); if(ok){ try{ localStorage.setItem(k,v); return; }catch(e){ ok=false; } } mem.set(k,v); },
  };
})();

/* ---------- Profile (wie im Prüfungswerkzeug) ---------- */
const FR_LIST = ["Baumschule","Friedhofsgärtnerei","Garten- und Landschaftsbau",
                 "Gemüsebau","Obstbau","Staudengärtnerei","Zierpflanzenbau"];
const NIVEAUS = [{key:"gaertner",label:"Gärtner/in"},{key:"fachwerker",label:"Fachwerker/in"}];
function slug(s){ return s.toLowerCase().replace(/[äöü]/g,m=>({"ä":"ae","ö":"oe","ü":"ue"}[m])).replace(/ß/g,"ss")
  .replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,""); }
const KAT_ORDER = ["Gemüsepflanzen","Gewürzkräuter","Bei-, Wild- oder Unkräuter","Gründüngungspflanzen","Gehölze","Stauden","Zierpflanzen","Obstgehölze"];
function katRank(k){ const i=KAT_ORDER.indexOf(k); return i<0?99:i; }

/* Seed-Zeile: [gattung, art, familie, deutscher_name, kategorie, zp, synonyme] */
function cardsFor(id){
  const rows = (typeof SEEDS!=="undefined" && SEEDS[id]) || [];
  return rows.map(r=>({
    g:r[0]||"", a:r[1]||"", fam:r[2]||"", de:r[3]||"", kat:r[4]||"", zp:r[5]?1:0, syn:r[6]||"",
    key:((r[0]||"")+"|"+(r[1]||"")+"|"+(r[3]||"")).toLowerCase()
  })).filter(c=>c.g);
}

/* ---------- Zustand ---------- */
let profileId = "gemuesebau_gaertner";
let allCards = [];           // alle Arten des Profils
let progress = {};           // key -> {box(1..5), due(YYYY-MM-DD), seen, correct, wrong}
let mode = "cards";          // cards | quiz | type
let richtung = "de2bot";     // de2bot | bot2de | art2fam
let queue = [], qi = 0, current = null, flipped = false;
let sess = { total:0, done:0, correct:0, active:false };

let toastT=null;
function toast(msg,isErr){ const t=$("#toast"); t.textContent=msg; t.classList.toggle("err",!!isErr); t.classList.add("show");
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"),2200); }

/* ---------- Leitner / Spaced Repetition ---------- */
const BOX_DAYS = [0,1,3,7,16];               // Intervall je Box 1..5 (Tage)
const todayISO = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
function addDays(iso,n){ const d=new Date(iso+"T00:00:00"); d.setDate(d.getDate()+n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function progKey(){ return LS_PREFIX+"progress."+profileId; }
function loadProgress(){ try{ const raw=store.get(progKey()); progress=raw?JSON.parse(raw):{}; if(typeof progress!=="object"||!progress) progress={}; }catch(e){ progress={}; } }
function saveProgress(){ store.set(progKey(), JSON.stringify(progress)); }
function pget(key){ return progress[key] || {box:0,due:"",seen:0,correct:0,wrong:0}; }
function grade(card, g){ // g: 'again' | 'hard' | 'good'
  const p = pget(card.key);
  p.seen = (p.seen||0)+1;
  if(g==="again"){ p.box=1; p.wrong=(p.wrong||0)+1; }
  else if(g==="hard"){ p.box=Math.max(1,p.box||1); p.correct=(p.correct||0)+1; }
  else { p.box=Math.min(5,(p.box||0)+1); p.correct=(p.correct||0)+1; }
  p.due = addDays(todayISO(), BOX_DAYS[Math.max(1,p.box)-1]);
  progress[card.key]=p; saveProgress();
}

/* ---------- Auswahl / Filter ---------- */
function pool(){
  const cat=$("#cat").value, zp=$("#onlyzp").checked;
  return allCards.filter(c=> (!cat||c.kat===cat) && (!zp||c.zp));
}
function buildQueue(){
  const p = pool();
  const today = todayISO();
  const rank = c => { const pr=pget(c.key);
    if(!pr.box) return 0;                        // neu zuerst
    if(!pr.due || pr.due<=today) return 1;       // fällig
    return 2;                                     // noch nicht fällig
  };
  const arr = p.map(c=>({c,r:rank(c),box:pget(c.key).box||0}));
  shuffle(arr);
  arr.sort((x,y)=> x.r-y.r || x.box-y.box);
  const len = Math.max(1, Math.min(100, parseInt($("#sessLen").value)||20));
  return arr.slice(0,len).map(x=>x.c);
}

/* ---------- Abfrage-Richtung: Prompt & Antwort ---------- */
function promptHTML(c){
  if(richtung==="bot2de" || richtung==="art2fam")
    return `<span class="g">${esc(c.g)}</span> <span class="a">${esc(c.a)}</span>`;
  return esc(c.de||"—");
}
function promptSub(c){
  if(richtung==="de2bot") return c.fam?("Familie: "+c.fam):"";
  if(richtung==="bot2de") return c.fam?("Familie: "+c.fam):"";
  return c.de?("Deutscher Name: "+c.de):"";  // art2fam
}
function answerText(c){
  if(richtung==="de2bot") return norm(c.g+" "+c.a);
  if(richtung==="bot2de") return c.de||"";
  return c.fam||"";                            // art2fam
}
function answerLabel(){ return richtung==="de2bot"?"Botanischer Name":(richtung==="bot2de"?"Deutscher Name":"Familie"); }
function promptLabel(){ return richtung==="de2bot"?"Deutscher Name":(richtung==="bot2de"?"Botanischer Name":"Botanischer Name"); }
function answerMeta(c){
  const bits=[];
  if(richtung!=="de2bot" && c.g) bits.push("<i>"+esc(c.g+" "+c.a)+"</i>");
  if(richtung!=="art2fam" && c.fam) bits.push("Familie: "+esc(c.fam));
  if(richtung==="art2fam" && c.de) bits.push(esc(c.de));
  if(c.syn) bits.push("Syn.: "+esc(c.syn));
  return bits.join(" · ");
}

/* ---------- Distraktoren fürs Quiz ---------- */
function distractors(c, n){
  const want = answerText(c).toLowerCase();
  const same = allCards.filter(x=>x.key!==c.key && answerText(x).toLowerCase()!==want &&
    (richtung==="art2fam" ? x.fam : x.kat) === (richtung==="art2fam" ? c.fam : c.kat));
  const rest = allCards.filter(x=>x.key!==c.key && answerText(x).toLowerCase()!==want);
  const picks=[]; const seen=new Set([want]);
  for(const src of [shuffle(same.slice()), shuffle(rest.slice())]){
    for(const x of src){ const t=answerText(x); const tl=t.toLowerCase(); if(!seen.has(tl)){ seen.add(tl); picks.push(t); if(picks.length>=n) return picks; } }
  }
  return picks;
}

/* ---------- Tippen: tolerante Prüfung ---------- */
function lev(a,b){ a=a||""; b=b||""; const m=a.length,n=b.length; if(!m)return n; if(!n)return m;
  const d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]); for(let j=0;j<=n;j++) d[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++){ const cost=a[i-1]===b[j-1]?0:1;
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+cost); } return d[m][n]; }
const clean = s => norm(s).toLowerCase().replace(/[.,;’'`´()]/g," ").replace(/\s+/g," ").trim();
function closeEnough(input, target){
  const a=clean(input), b=clean(target); if(!a) return false;
  if(a===b) return true;
  const tol = b.length<=5?1:2;
  return lev(a,b)<=tol;
}
function checkTyped(input, c){
  if(richtung==="de2bot"){ // Gattung + Art getrennt prüfen
    const parts=clean(input).split(" ");
    const gi=parts.shift()||""; const ai=parts.join(" ");
    const gOk=closeEnough(gi, c.g);
    const aOk = !norm(c.a) || closeEnough(ai, c.a) || (c.a.toLowerCase().indexOf(ai)===0 && ai.length>=3);
    return gOk && aOk;
  }
  // bot2de / art2fam: gegen alle Varianten (Komma/Semikolon-getrennt) prüfen
  const target = richtung==="art2fam" ? c.fam : c.de;
  const variants = (target||"").split(/[,;/]/).map(clean).filter(Boolean);
  return variants.some(v=>closeEnough(input, v));
}

/* ---------- Fortschritts-Anzeige ---------- */
function renderProgress(){
  const p = pool();
  let neu=0,lern=0,fest=0;
  p.forEach(c=>{ const b=pget(c.key).box||0; if(!b) neu++; else if(b>=4) fest++; else lern++; });
  const tot=p.length||1;
  $("#progress").hidden = false;
  $("#progress").innerHTML =
    `<div class="pstat"><span class="n">${p.length}</span><span class="l">Arten</span></div>
     <div class="pbar">
       <span class="b-fest" style="width:${fest/tot*100}%"></span>
       <span class="b-lern" style="width:${lern/tot*100}%"></span>
       <span class="b-neu" style="width:${neu/tot*100}%"></span>
     </div>
     <div class="plegend">
       <span><i class="b-fest" style="background:var(--green)"></i>${fest} sitzt</span>
       <span><i class="b-lern" style="background:var(--gold)"></i>${lern} am Lernen</span>
       <span><i class="b-neu" style="background:var(--rule-strong)"></i>${neu} neu</span>
     </div>`;
  const due = p.filter(c=>{ const pr=pget(c.key); return !pr.box || !pr.due || pr.due<=todayISO(); }).length;
  $("#startHint").textContent = p.length ? `${due} Karten heute dran · ${answerLabel()} gefragt` : "Keine Arten im aktuellen Filter.";
  $("#btnStart").disabled = !p.length;
}

/* ---------- Sitzung / Bühne ---------- */
function startSession(){
  queue = buildQueue(); qi = 0;
  sess = { total:queue.length, done:0, correct:0, active:true };
  if(!queue.length){ toast("Keine Arten im aktuellen Filter",true); return; }
  nextCard();
}
function sessionBar(){
  const pct = sess.total? Math.round(sess.done/sess.total*100):0;
  return `<div class="sessionbar"><span>${sess.done} / ${sess.total}</span><span class="sbar"><i style="width:${pct}%"></i></span>`+
    (mode!=="cards"?`<span>${sess.correct} richtig</span>`:``)+`<button class="btn ghost" id="btnStop" title="Sitzung beenden">beenden</button></div>`;
}
function nextCard(){
  if(qi>=queue.length){ return finishSession(); }
  current = queue[qi]; flipped=false;
  if(mode==="cards") renderCard();
  else if(mode==="quiz") renderQuiz();
  else renderType();
  const stop=$("#btnStop"); if(stop) stop.onclick=finishSession;
}
function advance(){ qi++; sess.done++; nextCard(); }

function finishSession(){
  sess.active=false;
  const acc = sess.total? Math.round(sess.correct/Math.max(1,sess.done)*100):0;
  const stage=$("#stage");
  stage.innerHTML = `<div class="stage-empty">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6L9 17l-5-5"/></svg>
    <h2>Sitzung geschafft</h2>
    <p>${sess.done} Karten gelernt${mode!=="cards"?` · ${sess.correct} richtig (${acc}%)`:""}.</p>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:6px">
      <button class="btn primary" id="againBtn">Weiter lernen</button>
    </div></div>`;
  const a=$("#againBtn"); if(a) a.onclick=startSession;
  renderProgress();
}

function renderCard(){
  const c=current;
  const stage=$("#stage");
  stage.innerHTML = sessionBar() + `<div class="card" id="card">
      <span class="side-label">${esc(promptLabel())}</span>
      <div class="prompt">${promptHTML(c)}</div>
      ${promptSub(c)?`<div class="sub">${esc(promptSub(c))}</div>`:""}
      <div class="flip-hint">Zum Umdrehen tippen</div>
    </div>`;
  $("#btnStop").onclick=finishSession;
  $("#card").onclick=()=>{ if(!flipped) flipCard(); };
}
function flipCard(){
  flipped=true; const c=current;
  $("#card").innerHTML = `<span class="side-label">${esc(answerLabel())}</span>
    <div class="prompt">${promptHTML(c)}</div>
    ${promptSub(c)?`<div class="sub">${esc(promptSub(c))}</div>`:""}
    <div class="answer"><div class="big">${esc(answerText(c)||"—")}</div>
      ${answerMeta(c)?`<div class="meta">${answerMeta(c)}</div>`:""}</div>`;
  $("#card").onclick=null;
  const rate=el("div","rate");
  rate.innerHTML = `<button class="r-again">Nochmal<small>heute wieder</small></button>
    <button class="r-hard">Unsicher<small>bald wieder</small></button>
    <button class="r-good">Gewusst<small>später wieder</small></button>`;
  $("#stage").appendChild(rate);
  rate.querySelector(".r-again").onclick=()=>{ grade(c,"again"); advance(); };
  rate.querySelector(".r-hard").onclick =()=>{ grade(c,"hard"); advance(); };
  rate.querySelector(".r-good").onclick =()=>{ grade(c,"good"); advance(); };
}

function renderQuiz(){
  const c=current;
  const opts = shuffle([answerText(c), ...distractors(c,3)]);
  const stage=$("#stage");
  stage.innerHTML = sessionBar() +
    `<div class="qprompt">${promptHTML(c)}</div>
     ${promptSub(c)?`<div class="qsub">${esc(promptSub(c))}</div>`:""}
     <div class="options" id="opts"></div>
     <div class="feedback" id="fb"></div>
     <div class="nav" id="nav"></div>`;
  $("#btnStop").onclick=finishSession;
  const host=$("#opts");
  const letters=["A","B","C","D","E"];
  opts.forEach((o,i)=>{
    const b=el("button","opt"); b.innerHTML=`<span class="k">${letters[i]}</span><span>${esc(o)}</span>`;
    b.onclick=()=>answerQuiz(b,o,opts);
    host.appendChild(b);
  });
}
function answerQuiz(btn, chosen, opts){
  const c=current; const correct = answerText(c);
  const ok = chosen.toLowerCase()===correct.toLowerCase();
  document.querySelectorAll("#opts .opt").forEach(b=>{
    b.disabled=true;
    const txt=b.querySelector("span:last-child").textContent;
    if(txt.toLowerCase()===correct.toLowerCase()) b.classList.add("correct");
  });
  if(!ok) btn.classList.add("wrong");
  grade(c, ok?"good":"again"); if(ok) sess.correct++;
  $("#fb").innerHTML = ok ? `<span class="good">Richtig!</span>`
    : `<span class="bad">Leider falsch.</span> <span class="sol">Richtig: ${esc(correct)}</span>`;
  const nav=$("#nav"); nav.innerHTML=`<button class="btn primary" id="wt">Weiter</button>`;
  $("#wt").onclick=advance; $("#wt").focus();
}

function renderType(){
  const c=current;
  const stage=$("#stage");
  stage.innerHTML = sessionBar() +
    `<div class="qprompt">${promptHTML(c)}</div>
     ${promptSub(c)?`<div class="qsub">${esc(promptSub(c))}</div>`:""}
     <div class="typebox">
       <input id="typeIn" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(answerLabel())} eingeben …">
       <div class="feedback" id="fb"></div>
     </div>
     <div class="nav" id="nav"><button class="btn primary" id="chk">Prüfen</button></div>`;
  $("#btnStop").onclick=finishSession;
  const inp=$("#typeIn"); inp.focus();
  inp.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); $("#chk").click(); }});
  $("#chk").onclick=()=>submitType(inp);
}
function submitType(inp){
  const c=current; const ok=checkTyped(inp.value, c);
  inp.disabled=true; inp.classList.add(ok?"ok":"no");
  grade(c, ok?"good":"again"); if(ok) sess.correct++;
  $("#fb").innerHTML = ok ? `<span class="good">Richtig!</span>`
    : `<span class="bad">Nicht ganz.</span> <span class="sol">Richtig: ${esc(answerText(c))}</span>`;
  const nav=$("#nav"); nav.innerHTML=`<button class="btn primary" id="wt">Weiter</button>`;
  $("#wt").onclick=advance; $("#wt").focus();
}

function startHintOnly(){
  $("#stage").innerHTML = `<div class="stage-empty">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22V8M12 8C12 8 7 3 4 4c-1 3 4 8 8 8zM12 8c0 0 5-5 8-4 1 3-4 8-8 8z"/></svg>
    <h2>Bereit zum Lernen</h2>
    <p>Wähle Fachrichtung, Modus und Richtung, dann »Sitzung starten«. Dein Fortschritt wird je Profil im Browser gespeichert und steuert, welche Arten wann drankommen.</p>
  </div>`;
}

/* ---------- Profil-Wechsel ---------- */
function loadProfile(id){
  if(!(typeof SEEDS!=="undefined" && SEEDS[id])) id = SEEDS && SEEDS["gemuesebau_gaertner"] ? "gemuesebau_gaertner" : Object.keys(SEEDS||{})[0];
  profileId = id;
  allCards = cardsFor(id);
  loadProgress();
  refreshKat();
  renderProgress();
  startHintOnly();
  store.set(LS_PREFIX+"profile", id);
}
function refreshKat(){
  const set=[...new Set(allCards.map(c=>c.kat).filter(Boolean))].sort((a,b)=>katRank(a)-katRank(b)||a.localeCompare(b));
  const cur=$("#cat").value;
  $("#cat").innerHTML='<option value="">alle Kategorien</option>'+set.map(k=>`<option value="${esc(k)}">${esc(k)}</option>`).join("");
  if(set.includes(cur)) $("#cat").value=cur;
}
function profSub(){
  const fr = FR_LIST.find(f=>slug(f)===$("#frSelect").value)||"";
  const niv = (NIVEAUS.find(n=>n.key===$("#nivSelect").value)||{}).label||"";
  $("#profSub").textContent = `${allCards.length} Arten · ${fr} · ${niv}`;
}
function applyProfile(){
  const id=$("#frSelect").value+"_"+$("#nivSelect").value;
  loadProfile(id); profSub();
}

/* ---------- Verdrahtung ---------- */
function wire(){
  $("#frSelect").onchange=applyProfile;
  $("#nivSelect").onchange=applyProfile;
  $("#cat").onchange=()=>renderProgress();
  $("#onlyzp").onchange=()=>renderProgress();
  $("#richtung").onchange=()=>{ richtung=$("#richtung").value; store.set(LS_PREFIX+"richtung",richtung); renderProgress(); };
  $("#modeTabs").querySelectorAll("button").forEach(b=>b.onclick=()=>{
    mode=b.dataset.mode; store.set(LS_PREFIX+"mode",mode);
    $("#modeTabs").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));
  });
  $("#btnStart").onclick=startSession;
}

/* ---------- Start ---------- */
(function boot(){
  try{
    $("#frSelect").innerHTML=FR_LIST.map(f=>`<option value="${slug(f)}">${esc(f)}</option>`).join("");
    $("#nivSelect").innerHTML=NIVEAUS.map(n=>`<option value="${n.key}">${esc(n.label)}</option>`).join("");
    richtung = store.get(LS_PREFIX+"richtung") || "de2bot"; $("#richtung").value=richtung;
    mode = store.get(LS_PREFIX+"mode") || "cards";
    $("#modeTabs").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x.dataset.mode===mode));
    let pid = store.get(LS_PREFIX+"profile");
    if(!(typeof SEEDS!=="undefined" && SEEDS[pid])) pid="gemuesebau_gaertner";
    const parts = pid.match(/^(.*)_(gaertner|fachwerker)$/);
    if(parts){ $("#frSelect").value=parts[1]; $("#nivSelect").value=parts[2]; }
    wire();
    loadProfile(pid); profSub();
  }catch(e){
    document.body.innerHTML='<div style="max-width:640px;margin:80px auto;font-family:sans-serif;color:#22352b">'+
      '<h2>Start fehlgeschlagen</h2><pre>'+esc(e.message)+'</pre></div>';
  }
})();
/* für Tests / Konsole */
window.startSession=startSession;
