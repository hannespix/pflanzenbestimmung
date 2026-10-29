/* ============================================================
   Gemeinsamer Code beider Werkzeuge (Prüfungswerkzeug app.js + Lern-Tool learn.js).
   build.py stellt diese Datei beiden Skripten voran (ein <script>, ein Geltungsbereich):
   DOM-Helfer, localStorage-Wrapper, Icon-Set, JSONP, Wikipedia-Kandidaten und -Abruf,
   Namensherleitung, Sorten-/Taxon-Erkennung, Lightbox, Versions-Hinweis, View-Transitions.
   Regeln: hier nur Code, der in BEIDEN Werkzeugen wortgleich gebraucht wird; app-spezifische
   Namen (LS_PREFIX, toast-Ziele, Profile) bleiben in den Werkzeug-Dateien. Ein const/let
   hier darf im Initialisierer nichts aus app.js/learn.js benutzen (Temporal Dead Zone).
   build.py lehnt den Build ab, wenn ein Name hier UND in einer Werkzeug-Datei deklariert ist.
   ============================================================ */

/* ---------- Helfer ---------- */
const $ = s => document.querySelector(s);

const el = (t,c) => { const e=document.createElement(t); if(c) e.className=c; return e; };

/* ---------- Icon-Set (statt bunter Emojis) ----------
   Schlichte Strichzeichnungen im Stil der übrigen Icons: currentColor, 1.8er
   Strich, quadratisch. So bleibt die Oberfläche ruhig und professionell –
   Emojis werden je nach Gerät bunt und uneinheitlich gerendert. */
const ICONS = {
  leaf:   `<path d="M4 20c0-9 6-14 15-15 1 10-4 16-13 16"/><path d="M6 18c3-4 6-7 10-9"/>`,
  flame:  `<path d="M12 21c-3.3 0-6-2.4-6-5.6 0-2.2 1.2-3.9 2.3-5.3.8-1 1.6-1.9 1.9-3 .8.9 1.2 1.7 1.3 2.7 0 .5 0 1-.2 1.6.9-.6 1.5-1.4 1.6-2.6C15.3 9.1 18 11.2 18 14.4c0 3.2-2.7 5.6-6 5.6z"/>`,
  sprout: `<path d="M12 21v-7"/><path d="M12 14c-4 0-6-2.5-6-6 3.6 0 6 2 6 6z"/><path d="M12 14c0-4 2.4-6.5 6-6.5 0 3.8-2.2 6.5-6 6.5z"/>`,
  info:   `<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.6" r=".9" fill="currentColor" stroke="none"/>`,
  globe:  `<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>`,
  book:   `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5"/>`,
  image:  `<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>`,
  check:  `<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.4l2.6 2.6 5-5.4"/>`,
  cards:  `<rect x="3.5" y="6.5" width="12" height="14" rx="2"/><path d="M8 3.5h10.5a2 2 0 0 1 2 2V16"/>`,
  keys:   `<rect x="2.5" y="6.5" width="19" height="11" rx="2.5"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 14h12"/>`,
  list:   `<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/>`,
  sliders:`<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/>`,
  trophy: `<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 4M17 6h2.5a2.5 2.5 0 0 1-2.5 4"/><path d="M12 14v3M9 20h6M10 17h4"/>`,
  clock:  `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`,
  // Start-Knöpfe (dieselben Formen stehen als Inline-SVG in learn.html, wie bei den Modus-Tabs):
  play:   `<circle cx="12" cy="12" r="8.5"/><path d="M10.2 8.6v6.8l5.4-3.4z" fill="currentColor" stroke="none"/>`,
  sheet:  `<path d="M8 4.5H6.5a2 2 0 0 0-2 2v12.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V6.5a2 2 0 0 0-2-2H16"/><rect x="8" y="2.8" width="8" height="3.2" rx="1"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/>`,
  back:   `<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>`,
  // Teil 2 der Konsolidierung: Schließen, Blättern, Aufklappen und »öffnet neuen Tab« als Strich-Icons
  // statt der Zeichen × ‹ › ▾ ↗ (↗ und ℹ rendern Handys als buntes Emoji)
  x:      `<path d="M6 6l12 12M18 6L6 18"/>`,
  prev:   `<path d="M15 5l-7 7 7 7"/>`,
  next:   `<path d="M9 5l7 7-7 7"/>`,
  chev:   `<path d="M6 9l6 6 6-6"/>`,
  ext:    `<path d="M7 17L17 7"/><path d="M8 7h9v9"/>`,
  // Lernstand sichern: Pfeil in die Ablage
  download: `<path d="M12 4v10"/><path d="M7.5 10l4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/>`
};

function ico(name, cls){                       // → <svg> im einheitlichen Strichstil
  const d = ICONS[name]; if(!d) return "";
  return `<svg class="ic${cls?" "+cls:""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `+
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

const esc = s => (s==null?"":String(s)).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));   // auch ' (Audit)

const norm = s => (s==null?"":String(s)).replace(/\s+/g," ").trim();

const store = (()=>{
  let ok=false;
  try{ const k="pflanze-bw.__probe"; localStorage.setItem(k,"1"); localStorage.removeItem(k); ok=true; }catch(e){ ok=false; }
  const mem=new Map();
  // Audit: ein voller Speicher (QuotaExceededError) ist kein Totalausfall – nur DIESER Schreibvorgang
  // scheitert, der nächste (kleinere) darf wieder in localStorage. Vorher schaltete jeder Fehler den
  // Browser-Speicher für die ganze Sitzung ab, und der Fortschritt wirkte danach verloren.
  const isQuota = e => !!e && (e.name==="QuotaExceededError" || e.name==="NS_ERROR_DOM_QUOTA_REACHED" || e.code===22 || e.code===1014);
  return {
    get persistent(){ return ok; },
    get(k){ if(mem.has(k)) return mem.get(k); if(ok){ try{ return localStorage.getItem(k); }catch(e){ ok=false; } } return null; },
    set(k,v){ v=String(v);
      if(ok){ try{ localStorage.setItem(k,v); mem.delete(k); return true; }catch(e){ if(!isQuota(e)) ok=false; } }
      mem.set(k,v); return false; },
    remove(k){ if(ok){ try{ localStorage.removeItem(k); }catch(e){ ok=false; } } mem.delete(k); }
  };
})();

/* ---------- Fachrichtungen (beide Werkzeuge) ---------- */
const FR_LIST = ["Baumschule","Friedhofsgärtnerei","Garten- und Landschaftsbau",
                 "Gemüsebau","Obstbau","Staudengärtnerei","Zierpflanzenbau"];

function slug(s){ return s.toLowerCase().replace(/[äöü]/g,m=>({"ä":"ae","ö":"oe","ü":"ue"}[m])).replace(/ß/g,"ss")
  .replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,""); }

/* ---------- Zustand beider Werkzeuge: aktives Profil, Toast ---------- */
let profileId = "gemuesebau_gaertner";

let toastT=null;

function toast(msg, isErr){
  const t=$("#toast"); t.textContent=msg; t.classList.toggle("err",!!isErr); t.classList.add("show");
  t.setAttribute("role", isErr?"alert":"status"); t.setAttribute("aria-live", isErr?"assertive":"polite");   // Screenreader-Ansage
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"), 2600);
}

function todayISO(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
/* Datei zum Herunterladen anbieten (beide Werkzeuge: JSON-Sicherung · Lernstand-Datei) */
function downloadText(text,name,mime){
  const url=URL.createObjectURL(new Blob([text],{type:mime||"application/json"}));
  const a=el("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}

function printEcoOn(){ return store.get(LS_PREFIX+"printeco")==="1"; }       // opt-in: sparsam drucken (ohne Farbflächen, kompakt)

/* ---------- Info-Modal: Quellen-Deeplinks (offline) + optional Wikipedia (JSONP) ----------
   Deep-Links öffnen nur einen neuen Tab (laden nichts in die Seite) → offline-rein.
   Die Online-Anreicherung ist OPT-IN (Knopf) und nutzt JSONP (dynamisch erzeugtes
   <script>), nicht fetch/XHR – umgeht damit CORS/file://-Sperren und hält den
   Offline-Kern intakt: ohne Netz funktioniert das Tool vollständig weiter. */
/* Suchbegriff für externe Datenbanken: reines Binom (Gattung + Art-Epitheton),
   OHNE Sorten-/Gruppen-/Rang-Zusatz. Wichtig, sonst finden die DBs nichts – z. B.
   NaturaDB liefert für »Beta vulgaris Conditiva-Grp.« 0 Treffer, für »Beta vulgaris«
   dagegen Dutzende. Also bewusst nicht zu feingranular. */
/* Sortennamen stehen in den Listen in Anführungszeichen: 'Nigra', 'Bristol Ruby',
   ('Nana'), 'Frieder's Evergreen'. Die Seeds führen seit dem Konverter-Schritt gerade
   Apostrophe; zur Sicherheit werden hier trotzdem alle Varianten angenommen. */
const CV_RE = /'([^']*(?:'s [^']*)?)'/;

function cultivarName(a){
  a = norm(a||"").replace(/[`´‘’‚“”„"ˋˊ′‵ʹʻʼʽ]/g,"'");
  const m = CV_RE.exec(a); if(m) return norm(m[1]);
  // Ein einzelnes (vergessenes) Anführungszeichen in der Quellliste – sechs Zeilen: »abies 'Nidiformis«
  // (Ende fehlt) bzw. »fortunei Emerald Gold'« (Anfang fehlt). Sortenname = Rest hinter dem ' bzw.
  // die großgeschriebenen Wörter davor (Epitheta sind klein, Sortennamen groß).
  const i = a.indexOf("'"); if(i < 0) return "";
  const rest = norm(a.slice(i+1).replace(/[()]/g,""));
  if(rest) return rest;
  const vor = /((?:[A-ZÄÖÜ][\wäöüß-]*\s*)+)$/.exec(a.slice(0,i).trim());
  return vor ? norm(vor[1]).replace(/^(cultivars?|sorten?)\s+/i,"") : "";
}

function stripCultivar(a){                            // botanischer Name ohne Sortenzusatz
  a = norm(a||"").replace(/[`´‘’‚“”„"ˋˊ′‵ʹʻʼʽ]/g,"'");
  const cv = cultivarName(a); if(!cv) return a;
  const re = new RegExp("\\(?'?"+cv.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"'?\\)?");
  return norm(a.replace(re," "));
}

/* Rang-Kürzel und Verbinder, die kein Namensbestandteil sind. »sect.«/»sec.« (Sektion:
   Taraxacum sect. Ruderalia), »nothof.« und der Quell-Tippfehler »supsp.« fehlten hier
   bisher – das Kürzel wurde so zum »Art-Epitheton« (»Taraxacum sect.«), und die Bildsuche
   verwarf jedes Löwenzahn-Foto als »andere Art« (Realfall: nie ein Bild im Bilder-Quiz). */
const RANK_TOKEN = /^([×x]|var\.|subsp\.|ssp\.|supsp\.|f\.|cv\.|convar\.|nothof\.|sect\.|sec\.|subg\.|agg\.)$/i;

const GROUP_TOKEN = /^(cultivars?|hybriden?|sorten|grp\.?|gruppe|group|hort\.?)$/i;   // Sammel-/Sortenwort – auch kleingeschrieben (»Lupinus cultivars«, 7 Zeilen) kein Epitheton

function binomEpithet(a){
  const s = stripCultivar(a);                          // sonst wäre bei »Weigela 'Bristol Ruby'« »'Bristol« das Epitheton
  const w = (s.split(" ").filter(w=> w && !RANK_TOKEN.test(w) && !/\./.test(w))[0] || "").replace(/[,;:]+$/,"");   // »vulgaris, A. Cultivars« → vulgaris; Abkürzungen (»Sphagnum z.B: fallax …«) tragen nie ein Epitheton
  return /^[a-zäöüß]/.test(w) && !GROUP_TOKEN.test(w) ? w : "";   // großgeschrieben = Sektion/Gruppe (»Ruderalia«), Sammelwort (»Cultivars«/»cultivars«) – kein Art-Epitheton
}

function searchName(c){ return norm(c.g+" "+binomEpithet(c.a)); }

/* Sektion (»sect. Ruderalia«, auch der Quell-Tippfehler »sec.«) → ihr Name, sonst "". */
function sectName(a){ const m = /\b(?:sect|sec|subg)\.\s*([A-ZÄÖÜ][\wäöüß-]*)/.exec(norm(a||"")); return m ? m[1] : ""; }

/* Name des Taxons für Suchen – in der Form, die Wikipedia und Commons führen: Hybriden mit
   »×« (die Commons-Kategorie »Syringa × chinensis« hat 18 Dateien, die mit Buchstaben-x
   keine), Sektionen als »Gattung sect. Name«, sonst das reine Binom (= searchName). */
function taxonName(c){
  const sec = sectName(c.a); if(sec) return norm(c.g+" sect. "+sec);
  const ep = binomEpithet(c.a);
  if(ep && /(^|\s)[×x](\s|$)/i.test(norm(c.a||""))) return norm(c.g+" × "+ep);
  return searchName(c);
}

/* Synonyme aus der Prüfungsliste (Feld 7, botanisch, kommagetrennt) als Karten: Commons und
   Wikipedia führen eine Art oft unter dem ANDEREN Namen – Realfall »Lonicera nitida« ist auf
   Commons eine leere Kategorie, die Fotos liegen unter dem akzeptierten Namen »Lonicera
   ligustrina var. yunnanensis«, genau dem Synonym der Liste (383 Zeilen tragen Synonyme:
   Mahonia→Berberis, Potentilla→Dasiphora, Mespilus→Crataegus …). */
function synCards(card){
  const own = norm((card && card.g||"")+" "+(card && card.a||"")).toLowerCase();
  return String(card && card.syn||"").split(/[,;]/).map(s=>norm(s))
    .filter(s=>/^[A-ZÄÖÜ×][\wäöüß-]*\s+\S/.test(s))             // botanischer Name: Gattung + Rest
    .map(s=>{ const w=s.split(" "); return { g:w[0], a:w.slice(1).join(" "), de:(card.de||""), syn:"" }; })
    .filter(c=>norm(c.g+" "+c.a).toLowerCase()!==own).slice(0,3);
}

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

const wikiCache = new Map();   // card.key -> {title,extract,thumb,url} | null (nicht gefunden)

const WP_NONE = "Kein deutscher Wikipedia-Artikel gefunden – auch nicht zur Gattung. Die Links oben führen dich weiter.";

let __wpN = 0;

/* Generischer JSONP-Aufruf (dynamisches <script>, kein fetch/XHR): hängt den
   Callback-Namen an die übergebene URL an. Wird von der Text-Anreicherung UND
   vom Bilder-Quiz genutzt. */
function jsonpGet(url){
  return new Promise((resolve,reject)=>{
    const cb = "__wpcb"+(++__wpN);
    const sc = document.createElement("script");
    let done = false;
    const cleanup = (spaet)=>{                         // spaet: nach Zeitüberschreitung bleibt ein stiller No-op stehen – eine verspätete Antwort warf sonst »__wpcbN is not defined« (Audit)
      if(spaet) window[cb] = ()=>{ try{ delete window[cb]; }catch(e){ window[cb]=undefined; } };
      else { try{ delete window[cb]; }catch(e){ window[cb]=undefined; } }
      if(sc.parentNode) sc.parentNode.removeChild(sc); };
    const to = setTimeout(()=>{ if(done) return; done=true; cleanup(true); reject(new Error("timeout")); }, 7000);
    window[cb] = d=>{ if(done) return; done=true; clearTimeout(to); cleanup(); resolve(d); };
    sc.onerror = ()=>{ if(done) return; done=true; clearTimeout(to); cleanup(); reject(new Error("network")); };
    sc.src = url + "&callback=" + cb;
    document.head.appendChild(sc);
  });
}

const apiOk = d=>{ if(d && d.error) throw new Error("api:"+(d.error.code||"")); return d; };   // API-Fehlerantwort (ratelimited, maxlag …) = Ausfall, nicht »nicht gefunden«

function wikiJSONP(title){
  return jsonp("https://de.wikipedia.org/w/api.php?action=query&format=json&prop=extracts%7Cpageimages%7Cpageprops&ppprop=disambiguation"+   // pageprops: Begriffsklärungen erkennen
    "&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=320&redirects=1&titles="+encodeURIComponent(title)).then(apiOk);
}

function wikiFirstPage(d){
  const pg = d && d.query && d.query.pages; if(!pg) return null;
  const k = Object.keys(pg)[0]; if(!k || k==="-1") return null;
  const p = pg[k];
  if(p && p.pageprops && p.pageprops.disambiguation!==undefined) return null;   // Begriffsklärung (»Iris steht für …«) ist kein Artikel
  return (p && p.missing===undefined && p.extract) ? p : null;
}

function shortenExtract(t){
  t = norm(t); if(t.length<=520) return t;
  const cut = t.slice(0,520), dot = cut.lastIndexOf(". ");
  return (dot>300 ? cut.slice(0,dot+1) : cut)+" …";
}

/* ---------- Bild-Lightbox (Bild anklicken → groß ansehen) ----------
   Für die Quiz-Fotos und die Wikipedia-Vorschau der Info-Karte. Eigener Namensraum
   .lbscrim (kollidiert nicht mit .scrim-Panels); Esc/Klick daneben/× schließen,
   der Fokus kehrt zum Auslöser zurück.
   Große Ansicht: Wikimedia Commons liefert Vorschaubilder bei Direktabruf nur noch in
   festen Stufen (20 … 500 · 960 · 1280 · 1920 · 3840 px; mediawiki.org/wiki/
   Common_thumbnail_sizes, T414805). Jede andere Breite beantwortet der Server mit einer
   HTML-Fehlerseite (HTTP 400), die der Browser als Bild verwirft (»blocked by CORB«) –
   so entstanden leere Großansichten. Deshalb: nur auf eine Standardstufe ableiten, nie
   über die Originalbreite hinaus, und je Bild eine Ausweich-Kette (abgeleitete Stufe →
   die vom API gelieferte Vorschau); scheitert alles, steht eine Meldung da statt eines
   leeren Rahmens. Die API-Abfragen (iiurlwidth/pithumbsize) rundet der Server selbst auf. */
function lbThrifty(){                                    // Datensparmodus oder 2G → kleinere Stufe, weniger vorladen
  try{ const c = navigator.connection;
    return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType||"")); }catch(e){ return false; }
}

const LB_STEPS = [960, 1280, 1920];                      // Standardstufen, die für die Großansicht taugen

function lbBig(src, w){                                  // w: Originalbreite, falls bekannt – nie größer anfragen als das Original
  const s = String(src||"");
  const ina = s.match(/^(https:\/\/(?:inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org)\/photos\/\d+\/)(square|small|medium|large|original)(\.\w+)/);
  if(ina) return (lbThrifty() || ina[2]==="original") ? s : ina[1]+"original"+ina[3];   // iNaturalist: Größe steht im Pfad (original ≤ 2048 px)
  const m = s.match(/\/(\d{2,4})px-/);
  if(!m) return s;
  const cur = +m[1], max = lbThrifty() ? 1280 : 1920;
  const want = LB_STEPS.filter(x => x<=max && (!w || x<w)).pop() || 0;
  if(!want || want<=cur) return s;                       // nichts Größeres verfügbar → wie geliefert
  return s.replace(/\/(\d{2,4})px-/, "/"+want+"px-");
}

/* Wikimedia zieht die Vorschaubilder von upload.wikimedia.org nach thumb.wikimedia.org um
   (Tech News 2026/36); die alten Adressen werden laut Wikimedia weiter bedient. Dieselbe
   Datei gibt es also unter zwei Hosts – antwortet der eine gerade nicht (Zeitüberschreitung,
   HTTP 429 am Thumbnail-Cluster, Mobilfunk teilt sich eine IP), hilft oft der andere. */
function hostAlt(u){                                     // thumb. ↔ upload. – derselbe Pfad, ohne utm-Anhang
  const m = String(u||"").match(/^https:\/\/(thumb|upload)\.wikimedia\.org(\/[^?#]*)/);
  return m ? "https://"+(m[1]==="thumb" ? "upload" : "thumb")+".wikimedia.org"+m[2] : null;
}

function lbChain(it){                                    // Ausweich-Kette: große Stufe → gelieferte Vorschau, je mit Ausweich-Host
  const out = [], big = lbBig(it.src, it.w);
  [big, hostAlt(big), it.src, hostAlt(it.src)].forEach(u => { if(u && out.indexOf(u)<0) out.push(u); });
  return out;
}

function lbKey(it){ return String(it.id || it.file || it.src || "").replace(/_/g," "); }   // dieselbe Datei in anderer Größe ist kein neues Bild

const lbState = new WeakMap();                           // Eintrag → {ok: URL, die lädt | busy | dead}; wird nirgends gespeichert

function lbSt(it){ let s = lbState.get(it); if(!s){ s = {}; lbState.set(it, s); } return s; }

/* Eine URL nach der anderen probieren – auf dem sichtbaren <img> oder im Hintergrund.
   Die erste, die lädt, wird gemerkt (ok); scheitert die ganze Kette, gilt der Eintrag
   als tot (dead) und onFail zeigt die Meldung. Rückgabe: Abbruch-Funktion. */
function lbTry(img, it, onFail){
  const st = lbSt(it), chain = st.ok ? [st.ok] : lbChain(it);
  let k = 0, off = false;
  st.busy = true;
  const next = ()=>{
    if(off) return;
    if(k>=chain.length){ st.busy=false; st.dead=true; st.ok=null; img.onerror=img.onload=null; if(onFail) onFail(); return; }
    const u = chain[k++];
    img.onerror = next;
    img.onload = ()=>{ if(off) return; st.ok=u; st.dead=false; st.busy=false; img.onerror=img.onload=null; };
    img.src = u;
  };
  next();
  return ()=>{ off = true; };                            // Wechsel zum nächsten Bild: alte Rückmeldungen verfallen (busy bleibt – kein Doppelabruf)
}

let lbReturnFocus=null, lbCancel=null;

function closeLightbox(){
  const sc=document.querySelector(".lbscrim"); if(!sc) return;
  if(lbCancel){ lbCancel(); lbCancel=null; }
  sc.remove();
  if(lbReturnFocus && lbReturnFocus.focus){ try{ lbReturnFocus.focus(); }catch(e){} }
  lbReturnFocus=null;
}

let lbList=[], lbIdx=0, lbToken=0;

/* Pfeile und Zähler entstehen erst, wenn es wirklich mehrere Bilder gibt – auch
   nachträglich: Der Bilder-Quiz holt die Bilder eines Wikipedia-Artikels erst,
   wenn jemand die Großansicht öffnet (siehe photoGalLoader). */
function lbSync(){
  const sc=document.querySelector(".lbscrim"); if(!sc) return;
  const img=sc.querySelector(".lb-img");
  if(lbList.length>1 && !sc.querySelector(".lb-nav")){
    img.insertAdjacentHTML("beforebegin", `<button class="lb-nav prev" aria-label="Vorheriges Bild">${ico("prev")}</button>`);
    img.insertAdjacentHTML("afterend", `<button class="lb-nav next" aria-label="Nächstes Bild">${ico("next")}</button>`+
      `<div class="lb-count" aria-live="polite"></div>`);
  }
  const z=sc.querySelector(".lb-count"); if(z) z.textContent = `${lbIdx+1} / ${lbList.length}`;
}

/* Vorladen: Sobald die Großansicht offen ist, holen wir die übrigen Bilder der
   Galerie schon im Hintergrund – dann steht das nächste beim Wischen/Blättern
   sofort da. Reihenfolge von innen nach außen (die Nachbarn kommen als Erstes
   dran). Im Datensparmodus oder auf 2G nur die direkten Nachbarn. Geladen wird
   dieselbe Kette wie bei der Anzeige; die funktionierende URL wird je Eintrag
   gemerkt, nichts wird doppelt angefragt. */
function lbPreload(){
  const n = lbList.length; if(n<2) return;
  const order = [];
  for(let d=1; d<n; d++){                                // 1 vor, 1 zurück, 2 vor, 2 zurück …
    const a=(lbIdx+d)%n, b=(lbIdx-d+n)%n;
    if(order.indexOf(a)<0) order.push(a);
    if(order.indexOf(b)<0) order.push(b);
  }
  for(const i of order.slice(0, lbThrifty() ? 2 : order.length)){
    const it = lbList[i], st = lbSt(it);
    if(st.ok || st.busy || st.dead) continue;            // schon da, unterwegs oder aussichtslos
    const im = new Image(); im.decoding = "async";
    lbTry(im, it);
  }
}

function lbShow(i){
  const sc=document.querySelector(".lbscrim"); if(!sc || !lbList.length) return;
  lbIdx = (i%lbList.length + lbList.length) % lbList.length;
  const it = lbList[lbIdx], img = sc.querySelector(".lb-img");
  if(lbCancel) lbCancel();
  const note = sc.querySelector(".lb-fail"); if(note) note.remove();
  sc.classList.remove("lb-failed");
  img.alt = it.label || it.file || "Bild";
  lbCancel = lbTry(img, it, ()=>{                        // ganze Kette gescheitert → Meldung statt leerem Rahmen
    img.removeAttribute("src"); sc.classList.add("lb-failed");
    const d = el("div","lb-fail"); d.setAttribute("role","status");
    const inat = /inaturalist/.test(String(it.src||"")) || /^inat:/.test(it.file||"");
    d.innerHTML = `<b>Bild nicht verfügbar</b><br>Der Bildserver (${inat ? "iNaturalist" : "Wikimedia Commons"}) liefert diese Datei gerade nicht aus.`+
      (it.file && !inat ? `<br><a href="https://commons.wikimedia.org/wiki/File:${esc(encodeURIComponent(it.file))}" target="_blank" rel="noopener">Datei auf Commons öffnen</a>` : "");
    img.insertAdjacentElement("afterend", d);
  });
  lbSync();
  lbPreload();                                           // Nachbarn im Hintergrund holen
}

function lbLoad(loader){                                 // Galerie nachladen, während die Großansicht schon offen ist
  if(typeof loader!=="function") return;
  const token = lbToken;
  Promise.resolve().then(loader).then(list=>{
    if(token!==lbToken || !document.querySelector(".lbscrim")) return;   // inzwischen geschlossen/neu geöffnet
    if(!Array.isArray(list) || !list.length) return;
    const seen = new Set(lbList.map(lbKey));
    const add = list.filter(i=>i && i.src && !seen.has(lbKey(i)));
    if(!add.length) return;
    lbList = lbList.concat(add);
    lbSync();
    lbPreload();                                         // die neuen Bilder gleich mit vorladen
  }).catch(()=>{});                                      // ohne Netz bleibt es beim einen Bild
}

/* Wischen (Handy/Tablet): einen Finger nach links = nächstes Bild, nach rechts =
   vorheriges. Bewusst OHNE touch-action:none – so bleibt Zwei-Finger-Zoom im Bild
   erhalten (Blattadern ansehen!); Mehrfinger-Gesten lassen wir daher in Ruhe.
   Wer gewischt hat, schließt nicht versehentlich: der folgende Klick wird verworfen. */
let lbSwiped=false;

function lbSwipe(sc){
  let x0=0, y0=0, multi=false;
  sc.addEventListener("touchstart", e=>{
    multi = e.touches.length>1;                        // Pinch-Zoom → nicht blättern
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
    if(Math.abs(dx)<40 || Math.abs(dx) < Math.abs(dy)*1.2) return;   // zu kurz oder eher senkrecht
    lbShow(lbIdx + (dx<0 ? 1 : -1));                                 // nach links wischen = weiter
  }, {passive:true});
}

function openLightbox(src, alt, list, start, loader){
  closeLightbox();
  lbReturnFocus=document.activeElement; lbToken++; lbSwiped=false;
  lbList = Array.isArray(list) && list.length ? list.slice() : [{src, label:alt||""}];
  lbIdx = Math.max(0, Math.min(lbList.length-1, start||0));
  const sc=el("div","lbscrim");
  sc.setAttribute("role","dialog"); sc.setAttribute("aria-modal","true"); sc.setAttribute("aria-label","Bild vergrößert");
  sc.innerHTML=`<button class="lb-x" aria-label="Schließen">${ico("x")}</button><img class="lb-img" src="" alt="">`;
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

function lbWire(img, label, list, loader){               // Bild anklick- UND tastaturbedienbar machen
  if(!img) return;
  img.__lb = { list, loader };                           // spätere Aufrufe (Galerie nachgeladen) aktualisieren nur Liste/Loader …
  img.setAttribute("aria-label", label||"Bild vergrößern");
  if(img.__lbWired) return;                              // … statt ein zweites Klick-Paar anzuhängen (Audit: Lightbox öffnete erst einzeln, dann als Galerie)
  img.__lbWired = true;
  img.classList.add("lb-zoom");
  img.setAttribute("role","button"); img.tabIndex=0;
  const go=()=>openLightbox(img.currentSrc||img.src, img.alt, img.__lb.list, 0, img.__lb.loader);
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
  const ep = binomEpithet(a);                          // "" bei Gruppen-/Sektionswort (großgeschrieben) – eine Sektion ist aber ein Taxon
  return (!ep || GROUP_WORD.test(ep)) && !sectName(a);
}

function wikiCandidates(card){
  const cands=[], seen=new Set();
  const add=s=>{ s=norm(s); if(s && !seen.has(s.toLowerCase())){ seen.add(s.toLowerCase()); cands.push(s); } };
  const de = deArticleTitles(card);
  const inf = infraEpithet(card.a);
  const autonym = inf && inf===binomEpithet(card.a);   // »Cornus kousa subsp. kousa« = die Art selbst
  const full = norm(card.g+" "+card.a);
  add(full);                                            // voller Name (z. B. mit Sorte/Gruppe)
  const hyb = full.replace(/(^|\s)[x×](?=\s)/i, m=>m.replace(/[x×]/i, c=>c==="×" ? "x" : "×"));
  if(hyb!==full) add(hyb);                              // Hybrid-Zeichen in der anderen Schreibweise (»Forsythia × intermedia« ↔ »x«)
  const syn = ()=>synCards(card).forEach(s=>add(norm(s.g+" "+s.a)));   // Synonyme der Liste = dieselbe Pflanze unter anderem Namen
  if(pureGroupName(card.a)){                            // Sammel-/Sorteneintrag: keine Art → Gattung ist das beste Ziel
    de.forEach(add);                                    // deutscher (Sammel-)Name, z. B. »Goldrute«
    syn();
    add(card.g);                                        // bloße Gattung – dt. Wikipedia löst »Solidago« → »Goldruten« auf
  }else if(inf && !autonym){                            // ANDERE Unterart: Binom = Elternart (Raps) → nur deutscher Name
    de.forEach(add);
    syn();                                              // vor der Elternart: das Synonym meint dieselbe Pflanze, die Elternart nicht
    add(searchName(card));                              // Notnagel ganz am Ende: findet der deutsche Name nichts (»Garten-Dill«
                                                        // hat keinen Artikel), ist die Elternart (»Dill«) besser als gar nichts;
                                                        // die Steckrübe erreicht ihn nie, ihr deutscher Titel trifft vorher
  }else{                                                // Art, Sektion oder Autonym: das Taxon ist dieselbe Pflanze (unverändert)
    add(taxonName(card));                               // Hybride mit »×«, Sektion »Gattung sect. Name«, sonst reines Binom (eindeutig)
    add(searchName(card));                              // Hybride auch ohne Zeichen (»Amelanchier lamarckii« leitet weiter)
    de.forEach(add);
    syn();
  }
  return cands;
}

/* ---------- Gattungs-Notnagel (gekennzeichnet) ----------
   Findet keine Kandidatin einen Artikel (Realfall »Syringa x chinensis · Chinesischer
   Flieder«: weder die Hybride noch der deutsche Name haben einen), ist der Artikel zur
   GATTUNG besser als die Sackgasse »nicht gefunden« – aber nur mit deutlicher Kennzeichnung,
   denn Text und Bild beschreiben dann die Gattung (Flieder), nicht diese Art. Kandidatinnen:
   die lateinische Gattung (die deutsche Wikipedia leitet »Syringa« → »Flieder« weiter) und das
   Grundwort der deutschen Namen (»Chinesischer Flieder« → »Flieder«, »Hänge-Birke« → »Birke«).
   Angenommen wird nur ein ECHTER Gattungsartikel (genusArticleOk): keine Begriffsklärung
   (»Iris steht für …«, »Rosa«, »Vinca«), kein Fremdartikel (»Beta« = griechischer Buchstabe),
   kein Artartikel einer anderen Art (»Rosskastanie« leitet auf die Gewöhnliche Rosskastanie).
   Reine Sammel-/Sorteneinträge führen die Gattung schon in der Hauptliste – dort ist sie das
   richtige Ziel und braucht keinen Hinweis. */
function wikiGenusCandidates(card){
  if(pureGroupName(card.a)) return [];
  const main = new Set(wikiCandidates(card).map(s=>s.toLowerCase())), out=[], seen=new Set();
  const add=s=>{ s=norm(s); const k=s.toLowerCase(); if(s && !main.has(k) && !seen.has(k)){ seen.add(k); out.push(s); } };
  add(norm(card.g||"").replace(/^×\s*/,""));           // lateinische Gattung (Hybridgattung ohne ×)
  deArticleTitles(card).forEach(t=>{                    // Grundwort des deutschen Namens
    const w = t.split(/[\s-]+/).pop();
    if(w && w.length>=4 && /^[A-ZÄÖÜ]/.test(w)) add(w);
  });
  return out;
}

function genusArticleOk(p, card){                      // ein ECHTER Gattungsartikel zu dieser Gattung?
  if(!p || (p.pageprops && p.pageprops.disambiguation!==undefined)) return false;   // Begriffsklärung
  const txt = ((p.title||"")+" "+(p.extract||"")).toLowerCase();
  if(/\b(steht für|bezeichnet|kann bedeuten|mehrere bedeutungen)\b/.test(txt)) return false;   // Begriffsklärung ohne pageprops
  const gen = norm(card.g||"").toLowerCase().replace(/^×\s*/,"");
  if(!gen || txt.indexOf(gen)<0) return false;         // der Artikel muss die Gattung nennen (»Flieder (Syringa) ist …«)
  const satz = txt.split(/\.\s/)[0];                   // erster Satz
  if(/\b(pflanzen|unter)?art\b/.test(satz)) return false;   // Artartikel (»… ist eine Pflanzenart aus der Gattung …«)
  return /\b(ist|sind|bilden|bildet)\s+(eine|die)\s+(pflanzen)?gattung\b/.test(txt) || /\bpflanzengattung\b/.test(satz);
}

/* ---------- Welches Bild gehört wirklich zu DIESER Art? ----------
   Das Artikelbild der Wikipedia allein reicht nicht:
     · Sorten/Varietäten haben meist keinen eigenen Artikel – die Anfrage landet
       auf der Art (»Kirschtomate« → Foto einer normalen Tomate).
     · Manche Artikelbilder sind alte Tafeln, die ZWEI Arten zeigen
       (»Illustration Allium schoenoprasum and Allium cepa« beim Zwiebel-Artikel).
     · Der deutsche Name kann auf einen ganz anderen Artikel führen.
   Deshalb: erst die genaue Taxon-Kategorie auf Wikimedia Commons fragen, dann
   der Reihe nach unschärfere Quellen – und jeder Treffer muss zwei Prüfungen
   bestehen: Der Artikel muss die Gattung nennen (pageFitsCard) und der Dateiname
   darf keine ANDERE Art derselben Gattung nennen (fileMentionsOther).
   Sorten-Sonderfall: Steht die Art selbst ebenfalls in der Liste (Tomate UND
   Kirschtomate), wird ein Bild auf Artniveau gar nicht erst angeboten – die Frage
   wäre sonst nicht entscheidbar. Steht die Sorte allein, ist es zulässig. */
const INFRA_RE = /\b(?:var|subsp|ssp|convar|f|cv)\.\s*([a-zäöüß][a-zäöüß-]{2,})/i;

function infraEpithet(a){ const m = INFRA_RE.exec(norm(a||"")); return m ? m[1].toLowerCase() : ""; }

/* Meint der Artikel eine PFLANZE? Für Suchen nach einem einzelnen Wort (bloße Gattung, deutscher
   Sammelname): Der deutsche Artikel »Canna« ist die Hebriden-Insel, die Gattung heißt dort »Blumenrohr«. */
const PLANT_WORD_RE = /(gattung|pflanze|gewächs|familie|\bart(en)?\b|unterart|varietät|sorte|hybride|kreuzung|kulturform|gemüse|obst|kraut|kräuter|baum|bäume|strauch|sträucher|staude|gras|gräser|farn|orchidee|blume|blüte|liane|kletter|zwiebel|knolle|kakte|sukkulent|botani|taxon|beere|getreide|wurz)/i;

function plantArticle(p){
  const t = norm(String((p && p.title) || "")), x = norm(String((p && p.extract) || ""));
  if(/(steht für|bezeichnet:|kann bedeuten|mehrere bedeutungen)/i.test(x)) return false;   // Begriffsklärung
  const satz = x.split(/[.!?]\s+(?=[A-ZÄÖÜ])/)[0] || "";
  return PLANT_WORD_RE.test(satz) || PLANT_WORD_RE.test(t);
}

let jsonp = (...a) => jsonpGet(...a);                 // austauschbar: die Tests laufen ohne Netz

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

/* View-Transition-Helfer: diskrete Zustandswechsel (Filter, Ansicht, Profil, Modus)
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

/* ---------- Neue Version sofort aktiv ----------
   Der Service Worker liefert die Seite cache-first: Beim ersten Aufruf nach einer
   Aktualisierung steht noch die alte Seite, während die neue im Hintergrund installiert
   wird. Sobald sie übernimmt (controllerchange, Snippet im <head>), laden wir neu – aber
   nur, wenn gerade nichts läuft (keine Sitzung, kein Dialog); sonst ein Hinweis mit Knopf.
   Sonst heißt es »ich sehe die Änderung nicht«, obwohl sie längst online ist. */
let swReload = ()=>{ try{ location.reload(); }catch(e){} };

function swUpdate(){
  if(swIdle()) return swReload();
  if($("#swNote")) return;
  const n = el("div"); n.id="swNote"; n.className="swnote"; n.setAttribute("role","status");
  n.innerHTML = `Neue Version geladen – wird beim nächsten Aufruf aktiv. <button class="btn small" id="swGo" type="button">Jetzt neu laden</button>`;
  document.body.appendChild(n);
  $("#swGo").onclick = ()=>swReload();
}
