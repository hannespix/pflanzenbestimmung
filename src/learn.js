/* ============================================================
   Pflanzenkenntnis · Lernen (für Azubis der Gärtnerberufe)
   Karteikarten mit Leitner/Spaced-Repetition, Multiple-Choice-Quiz und Tippen.
   Nutzt dieselben hinterlegten Listen wie das Prüfungswerkzeug (SEEDS),
   vollständig offline, Fortschritt je Profil im Browser (localStorage).
   Keine Prüfungslisten-Erstellung, kein Notenschlüssel.
   ============================================================ */
"use strict";

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
  clock:  `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`
};
function ico(name, cls){                       // → <svg> im einheitlichen Strichstil
  const d = ICONS[name]; if(!d) return "";
  return `<svg class="ic${cls?" "+cls:""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `+
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
const esc = s => (s==null?"":String(s)).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));   // auch ' (Audit)
const norm = s => (s==null?"":String(s)).replace(/\s+/g," ").trim();
const deacc = s => (s==null?"":String(s)).normalize("NFD").replace(/[\u0300-\u036f]/g,"");   // akzentfrei (Suche, Adjektiv-Erkennung)
const shuffle = a => { for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };

/* ---------- Speicher (localStorage mit In-Memory-Fallback) ---------- */
const LS_PREFIX="pflanzenlernen.";
const store = (()=>{
  let ok=false;
  try{ const k=LS_PREFIX+"__probe"; localStorage.setItem(k,"1"); localStorage.removeItem(k); ok=true; }catch(e){ ok=false; }
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
  };
})();

/* ---------- Profile (wie im Prüfungswerkzeug) ---------- */
const FR_LIST = ["Baumschule","Friedhofsgärtnerei","Garten- und Landschaftsbau",
                 "Gemüsebau","Obstbau","Staudengärtnerei","Zierpflanzenbau"];
const NIVEAUS = [{key:"gaertner",label:"Gärtner/in"},{key:"fachwerker",label:"Fachwerker/in"}];
function slug(s){ return s.toLowerCase().replace(/[äöü]/g,m=>({"ä":"ae","ö":"oe","ü":"ue"}[m])).replace(/ß/g,"ss")
  .replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,""); }
/* ---------- Themen: die Arten nach Lerngruppen ordnen ----------
   Die Prüfungslisten sind alphabetisch, gelernt wird aber nach Themen
   (»große Laubbäume«, »Bodendecker«, »Steinobst« …) – so fragt es auch die ASP.
   Regeln, in dieser Reihenfolge:
     1. Obstbau-Profile: dort sind die Arten Obstgehölze, keine Ziergehölze.
     2. kuratierte Art-Ausnahmen (SPEC_THEME) – z. B. Prunus laurocerasus = immergrün.
     3. Kategorie »Kletterpflanzen« bleibt Kletterpflanzen.
     4. unspezifische Gehölz-Kategorien (Laub-/Nadelgehölze/Gehölze) → Gattungstabellen.
     5. sonst die Kategorie der Liste (vereinheitlicht über KAT_ALIAS).
   Die Seeds bleiben unverändert – das Thema wird zur Laufzeit bestimmt. */
const TH_TREE="Große Laubbäume", TH_SMALL="Kleinbäume & Großsträucher", TH_SHRUB="Blüten- & Ziersträucher",
      TH_EVER="Immergrüne Laubgehölze", TH_GC="Bodendecker & Zwergsträucher", TH_CLIMB="Kletterpflanzen",
      TH_ROSE="Rosen", TH_CONIF="Nadelbäume", TH_DWARF="Zwerg- & Kriechkoniferen",
      TH_WEED="Wild- & Beikräuter";
const THEME_ORDER = [TH_TREE,TH_SMALL,TH_SHRUB,TH_EVER,TH_GC,TH_CLIMB,TH_ROSE,TH_CONIF,TH_DWARF,
  "Kernobst","Steinobst","Beerenobst","Schalenobst","Wildobst","Zitrusfrüchte","Obst","Wirtspflanzen",
  "Beet- & Prachtstauden","Schatten- & Gehölzrandstauden","Steingarten- & Polsterstauden","Wasser- & Uferstauden",
  "Stauden","Gräser","Farne","Zwiebel- und Knollenpflanzen","Ein- und zweijährige","Beet- und Balkonpflanzen",
  "Schnittblumen","Frühjahrsblüher","Herbstpflanzen","Blühpflanzen",
  "Grün- & Blattschmuckpflanzen","Blühende Zimmerpflanzen","Sukkulenten & Kakteen","Bromelien","Orchideen","Palmen & Zimmerfarne",
  "Topf- und Grünpflanzen","Zimmerpflanzen",
  "Fruchtgemüse","Kohlgemüse","Wurzel- & Knollengemüse","Blatt- & Salatgemüse","Zwiebelgemüse","Hülsenfrüchte",
  "Gemüsepflanzen","Gewürzkräuter","Gründüngungspflanzen","Wild- & Beikräuter"];
function themeRank(k){ const i=THEME_ORDER.indexOf(k); return i<0?99:i; }
/* »Laubgehölze«/»Nadelgehölze«/»Gehölze« sagen nichts über die Verwendung – ebenso
   wenig »Blühpflanzen« (Buddleja neben Wildrosen) und »Wirtspflanzen« (Feuerbrand-
   Wirte: Weißdorn, Feuerdorn, Eibe, Wacholder). Alle laufen über woodyTheme. */
const VAGUE_KAT = new Set(["Laubgehölze","Nadelgehölze","Gehölze","Blühpflanzen","Wirtspflanzen","Wirtpflanzen"]);
const ZIMMER_KAT = new Set(["Zimmerpflanzen","Topf- und Grünpflanzen"]);
const KAT_ALIAS = {                                                    // uneinheitliche Kategorien der Quelllisten
  "Ziergräser":"Gräser", "Bodendecker":TH_GC,
  "Unkräuter, Wildkräuter":"Wild- & Beikräuter", "Wildkräuter":"Wild- & Beikräuter",
  "Wild- & Beikräuter":"Wild- & Beikräuter",
  "Bei-, Wild- oder Unkräuter":"Wild- & Beikräuter",
  "Steinobst, Unterlage":"Steinobst", "Unterlage, Steinobst":"Steinobst",
  "Unterlage für Kaki":"Obst", "Wirtpflanzen":"Wirtspflanzen"
};
const G_CONIF = new Set(["Abies","Araucaria","Callitropsis","Cedrus","Cephalotaxus","Chamaecyparis",
  "Chameacyparis","Chameacypris","Cryptomeria","Cupressus","Ginkgo","Juniperus","Larix","Metasequoia",
  "Picea","Pinus","Podocarpus","Pseudotsuga","Sciadopitys","Sequoiadendron","Taxus","Thuja","Thujopsis",
  "Tsuga","Xanthocyparis","×Hesperotropsis"]);
const SP_DWARF_CONIF = new Set(["Pinus mugo","Pinus pumila"]);         // Juniperus komplett, s. u.
const G_TREE = new Set(["Quercus","Fagus","Tilia","Fraxinus","Platanus","Aesculus","Betula","Populus",
  "Juglans","Castanea","Liriodendron","Liquidambar","Ulmus","Zelkova","Robinia","Gleditsia","Sophora",
  "Styphnolobium","Ailanthus","Paulownia","Celtis","Pterocarya","Alnus","Nothofagus","Catalpa","Carpinus"]);
const G_SMALL = new Set(["Acer","Prunus","Salix","Amelanchier","Crataegus","Sorbus","Scandosorbus",
  "Mespilus","Cydonia","Malus","Pyrus","Cercis","Cercidiphyllum","Parrotia","Laburnum","Albizia","Corylus",
  "Ficus","Magnolia","Rhus","Aralia","Olea","Punica","Trachycarpus","Eucalyptus","Sambucus","Diospyros","Asimina"]);
const G_EVER = new Set(["Buxus","Ilex","Aucuba","Skimmia","Osmanthus","Mahonia","Photinia","Laurus",
  "Pittosporum","Nandina","Choisya","Pieris","Arbutus","Myrtus","Yucca","Hebe","Camellia","Citrus",
  "Nerium","Callistemon"]);
const G_GC = new Set(["Calluna","Erica","Empetrum","Gaultheria","Genista","Helianthemum","Dasiphora",
  "Hedera","Muehlenbeckia"]);
const SP_COTO_GC = new Set(["dammeri","horizontalis","procumbens","radicans","microphyllus","salicifolius","congestus"]);
const SPEC_THEME = {   // "Gattung|Art-Epitheton" → Thema (Ausnahmen von der Gattungsregel)
  "Acer|platanoides":TH_TREE, "Acer|pseudoplatanus":TH_TREE, "Acer|saccharinum":TH_TREE, "Acer|negundo":TH_TREE,
  "Salix|alba":TH_TREE, "Salix|babylonica":TH_TREE, "Salix|×":TH_TREE,
  "Aesculus|parviflora":TH_SHRUB,
  "Acer|campestre":TH_SMALL, "Acer|ginnala":TH_SMALL, "Corylus|avellana":TH_SMALL,
  "Salix|caprea":TH_SMALL, "Prunus|padus":TH_SMALL, "Salix|repens":TH_GC,
  "Prunus|laurocerasus":TH_EVER, "Prunus|lusitanica":TH_EVER,
  "Viburnum|tinus":TH_EVER, "Viburnum|davidii":TH_EVER, "Viburnum|rhytidophyllum":TH_EVER,
  "Berberis|julianae":TH_EVER, "Berberis|buxifolia":TH_EVER, "Berberis|microphylla":TH_EVER,
  "Berberis|aquifolium":TH_EVER, "Euonymus|japonicus":TH_EVER, "Ligustrum|ovalifolium":TH_EVER,
  "Rhododendron|catawbiense":TH_EVER, "Rhododendron|degronianum":TH_EVER,
  "Lonicera|nitida":TH_GC, "Lonicera|pileata":TH_GC, "Lonicera|ligustrina":TH_GC,
  "Cytisus|decumbens":TH_GC, "Daphne|cneorum":TH_GC, "Muehlenbeckia|axillaris":TH_GC,
  "Rhododendron|forrestii":TH_GC, "Rhododendron|impeditum":TH_GC,
  "Lonicera|xylosteum":TH_SHRUB, "Lonicera|purpusii":TH_SHRUB,   // stehen in den Listen unter »Kletterpflanzen«
  "Lathyrus|vernus":"Schatten- & Gehölzrandstauden",   // Konstante steht weiter unten – hier als Text
  "Prunus|spinosa":TH_SHRUB, "Prunus|tenella":TH_SHRUB, "Prunus|triloba":TH_SHRUB, "Daphne|mezereum":TH_SHRUB,
  "Juniperus|scopulorum":TH_CONIF,
  // Schlinger, die in den Listen unter »Laubgehölze« stehen (Blauregen, Winterjasmin –
  // Jasminum officinale steht dort bereits als Kletterpflanze)
  "Wisteria|floribunda":TH_CLIMB, "Wisteria|sinensis":TH_CLIMB, "Jasminum|nudiflorum":TH_CLIMB,
  // Hartriegel: die Blüten-Hartriegel und die Kornelkirsche sind Kleinbäume/Großsträucher,
  // nicht Blütensträucher wie Cornus alba/sanguinea (im Obstbau bleibt C. mas Wildobst)
  "Cornus|florida":TH_SMALL, "Cornus|kousa":TH_SMALL, "Cornus|mas":TH_SMALL,
  "Ranunculus|repens":TH_WEED                   // Kriechender Hahnenfuß – steht unter »Zwiebel- und Knollenpflanzen«
};
const FRUIT_THEME = {  // nur in den Obstbau-Profilen (dort zählt die Obstart, nicht die Wuchsform)
  "Malus|domestica":"Kernobst", "Pyrus|communis":"Kernobst", "Pyrus|pyrifolia":"Kernobst",
  "Cydonia|oblonga":"Kernobst", "Mespilus|germanica":"Kernobst", "Aronia|melanocarpa":"Kernobst",
  "Sorbus|domestica":"Kernobst",
  "Prunus|armeniaca":"Steinobst", "Prunus|avium":"Steinobst", "Prunus|cerasus":"Steinobst",
  "Prunus|domestica":"Steinobst", "Prunus|insititia":"Steinobst", "Prunus|persica":"Steinobst",
  "Prunus|mahaleb":"Steinobst", "Prunus|cerasifera":"Steinobst", "Prunus|spinosa":"Steinobst",
  "Ribes|nigrum":"Beerenobst", "Ribes|rubrum":"Beerenobst", "Ribes|uva-crispa":"Beerenobst",
  "Rubus|idaeus":"Beerenobst", "Rubus|fruticosus":"Beerenobst", "Rubus|sect.":"Beerenobst",
  "Vaccinium|corymbosum":"Beerenobst", "Vaccinium|macrocarpon":"Beerenobst",
  "Vaccinium|myrtillus":"Beerenobst", "Vaccinium|vitis-idaea":"Beerenobst",
  "Hippophae|rhamnoides":"Beerenobst", "Sambucus|nigra":"Beerenobst", "Fragaria|x":"Beerenobst",
  "Actinidia|arguta":"Beerenobst", "Actinidia|deliciosa":"Beerenobst", "Actinidia|chinensis":"Beerenobst",
  "Vitis|vinifera":"Beerenobst",
  "Juglans|regia":"Schalenobst", "Corylus|avellana":"Schalenobst", "Castanea|sativa":"Schalenobst",
  "Prunus|dulcis":"Schalenobst", "Prunus|amygdalus":"Schalenobst",
  "Cornus|mas":"Wildobst",
  "Citrus|limon":"Zitrusfrüchte", "Citrus|reticulata":"Zitrusfrüchte", "Citrus|x":"Zitrusfrüchte",
  "Ficus|carica":"Obst", "Punica|granatum":"Obst"
};
function woodyTheme(g, ep){
  if(g==="Rosa") return TH_ROSE;
  if(G_CONIF.has(g)) return (g==="Juniperus" || SP_DWARF_CONIF.has(g+" "+ep)) ? TH_DWARF : TH_CONIF;
  if(g==="Cotoneaster") return SP_COTO_GC.has(ep) ? TH_GC : TH_SHRUB;
  if(G_GC.has(g))    return TH_GC;
  if(G_EVER.has(g))  return TH_EVER;
  if(G_TREE.has(g))  return TH_TREE;
  if(G_SMALL.has(g)) return TH_SMALL;
  return TH_SHRUB;                                    // übriges Laubgehölz = Ziergehölz
}
/* ---------- Krautige Themen (M2/M3/M4): Stauden · Gemüse · Zimmerpflanzen ----------
   Die groben Kategorien der Listen (»Stauden« 550, »Gemüsepflanzen«, »Zimmerpflanzen«)
   werden – analog zu den Gehölzen oben – in gärtnerische Lerngruppen verfeinert:
   Stauden nach Lebensbereich, Gemüse nach Nutzungsgruppe, Zimmerpflanzen nach Typ.
   Gattungs-/Art-kuratiert, gegen alle Arten geprüft (tools/themes_check.py). */
const TH_ST_BEET="Beet- & Prachtstauden", TH_ST_SCHATTEN="Schatten- & Gehölzrandstauden",
      TH_ST_STEIN="Steingarten- & Polsterstauden", TH_ST_WASSER="Wasser- & Uferstauden";
const ST_WASSER = new Set(["Butomus","Calla","Caltha","Hippuris","Nuphar","Nymphaea","Menyanthes","Pontederia","Sagittaria","Stratiotes","Alisma","Lythrum","Ligularia","Filipendula","Trollius","Chelone"]);
const ST_STEIN = new Set(["Acaena","Alyssum","Arabis","Armeria","Aubrieta","Aurinia","Azorella","Cerastium","Delosperma","Dryas","Globularia","Leontopodium","Lithospermum","Raoulia","Sagina","Saxifraga","Sedum","Sempervivum","Antennaria","Dianthus","Pulsatilla","Iberis","Thymus","Santolina","Gentiana","Acantholimon","Draba","Aethionema","Silene"]);
const ST_SCHATTEN = new Set(["Aconitum","Actaea","Aruncus","Asarum","Astilbe","Astilboides","Bergenia","Brunnera","Cimicifuga","Convallaria","Dicentra","Digitalis","Epimedium","Helleborus","Hepatica","Hosta","Lamium","Omphalodes","Pachysandra","Podophyllum","Polygonatum","Pulmonaria","Rodgersia","Symphytum","Tiarella","Vinca","Waldsteinia","Ajuga","Galium","Glechoma","Soleirolia","Mitchella","Heuchera","Aegopodium","Anemone","Primula","Tricyrtis","Tellima","Corydalis","Uvularia","Disporum","Anemonopsis"]);
const ST_SPEC = {   // Art-Ausnahmen (Gattung|Epitheton) – überstimmen die Gattungsregel
  "Gypsophila|repens":TH_ST_STEIN, "Phlox|subulata":TH_ST_STEIN, "Phlox|douglasii":TH_ST_STEIN,
  "Veronica|prostrata":TH_ST_STEIN, "Veronica|spicata":TH_ST_BEET,
  "Campanula|portenschlagiana":TH_ST_STEIN, "Campanula|poscharskyana":TH_ST_STEIN,
  "Campanula|cochleariifolia":TH_ST_STEIN, "Campanula|carpatica":TH_ST_STEIN,
  "Euphorbia|myrsinites":TH_ST_STEIN, "Euphorbia|polychroma":TH_ST_BEET,
  "Primula|auricula":TH_ST_STEIN, "Primula|marginata":TH_ST_STEIN,
  "Saxifraga|umbrosa":TH_ST_SCHATTEN, "Gentiana|asclepiadea":TH_ST_SCHATTEN,
  "Anemone|blanda":TH_ST_BEET,
  "Lysimachia|nummularia":TH_ST_WASSER, "Lysimachia|punctata":TH_ST_BEET,
  "Iris|pseudacorus":TH_ST_WASSER,
  "Sedum|telephium":TH_ST_BEET, "Sedum|spectabile":TH_ST_BEET,
  "Myosotis|palustris":TH_ST_WASSER, "Mentha|aquatica":TH_ST_WASSER,
  "Salvia|nemorosa":TH_ST_BEET
};
/* Beikräuter, die eine Liste unter »Stauden« führt (Vogelmiere, Löwenzahn,
   Brennnessel …) – sie gehören zu den Wild- & Beikräutern, nicht zu den Beet-
   stauden. Art-genau, damit echte Beetstauden derselben Gattung nicht mitgerissen
   werden (Senecio cineraria, Rumex sanguineus); nur Urtica und Taraxacum sind in
   allen Listen ausnahmslos Beikräuter. */
const ST_WEED = new Set(["Stellaria|media","Cirsium|arvense","Plantago|major","Plantago|lanceolata",
  "Senecio|vulgaris","Rumex|acetosa","Heracleum|mantegazzianum","Trifolium|repens"]);
const ST_WEED_G = new Set(["Urtica","Taraxacum"]);
function staudeTheme(g, ep, art){
  const sp=g+"|"+ep;
  if(ST_WEED.has(sp) || ST_WEED_G.has(g)) return TH_WEED;
  if(ST_SPEC[sp]) return ST_SPEC[sp];
  if(ST_WASSER.has(g)) return TH_ST_WASSER;
  if(ST_STEIN.has(g))  return TH_ST_STEIN;
  if(ST_SCHATTEN.has(g)) return TH_ST_SCHATTEN;
  return TH_ST_BEET;
}
const TH_GE_FRUCHT="Fruchtgemüse", TH_GE_KOHL="Kohlgemüse", TH_GE_WURZEL="Wurzel- & Knollengemüse",
      TH_GE_BLATT="Blatt- & Salatgemüse", TH_GE_ZWIEBEL="Zwiebelgemüse", TH_GE_HUELSE="Hülsenfrüchte";
const GEM_FRUCHT=new Set(["Capsicum","Cucumis","Cucurbita","Citrullus","Cyphomandra","Cynara","Zea"]);
const GEM_HUELSE=new Set(["Phaseolus","Pisum","Vicia","Lens","Glycine"]);
const GEM_WURZEL=new Set(["Daucus","Pastinaca","Scorzonera","Armoracia","Raphanus"]);
const GEM_BLATT=new Set(["Lactuca","Spinacia","Valerianella","Eruca","Diplotaxis","Portulaca","Claytonia","Tetragonia","Lepidium","Asparagus","Rheum"]);
function gemueseTheme(g, ep, art){
  art=art||"";
  if(g==="Solanum") return ep==="tuberosum" ? TH_GE_WURZEL : TH_GE_FRUCHT;
  if(g==="Physalis") return TH_GE_FRUCHT;
  if(g==="Brassica"){
    if(ep==="oleracea") return TH_GE_KOHL;
    if(ep==="rapa") return /chinensis|pekinensis|nipposinica|narinosa/i.test(art) ? TH_GE_KOHL : TH_GE_WURZEL;
    if(ep==="napus") return TH_GE_WURZEL;
    return TH_GE_BLATT;
  }
  if(g==="Beta")  return (/vulgaris/.test(art) && !/cicla|flavescens/.test(art)) ? TH_GE_WURZEL : TH_GE_BLATT;
  if(g==="Apium") return /rapaceum/.test(art) ? TH_GE_WURZEL : TH_GE_BLATT;
  if(g==="Cichorium") return TH_GE_BLATT;
  if(GEM_FRUCHT.has(g)) return TH_GE_FRUCHT;
  if(GEM_HUELSE.has(g)) return TH_GE_HUELSE;
  if(g==="Allium") return TH_GE_ZWIEBEL;
  if(GEM_WURZEL.has(g)) return TH_GE_WURZEL;
  if(GEM_BLATT.has(g)) return TH_GE_BLATT;
  if(g==="Helianthus") return TH_GE_WURZEL;   // Topinambur
  return TH_GE_BLATT;
}
const TH_ZI_GRUEN="Grün- & Blattschmuckpflanzen", TH_ZI_BLUEH="Blühende Zimmerpflanzen",
      TH_ZI_SUK="Sukkulenten & Kakteen", TH_ZI_BROM="Bromelien", TH_ZI_ORCH="Orchideen", TH_ZI_PALM="Palmen & Zimmerfarne";
const ZI_ORCH=new Set(["Cattleya","Cymbidium","Paphiopedilum","Phalaenopsis"]);
const ZI_BROM=new Set(["Aechmea","Guzmania","Tillandsia","Vriesea"]);
const ZI_SUK=new Set(["Aloe","Aichryson","Crassula","Echeveria","Kalanchoe","Rhipsalidopsis","Schlumbergera","Echinocactus","Euphorbia"]);
const ZI_PALM=new Set(["Chamaedorea","Phoenix","Washingtonia","Cycas","Nephrolepis","Platycerium"]);
const ZI_BLUEH=new Set(["Abutilon","Aeschynanthus","Anthurium","Aphelandra","Bougainvillea","Brugmansia","Calceolaria","Clivia","Columnea","Cyclamen","Exacum","Gardenia","Hibiscus","Hoya","Mandevilla","Medinilla","Primula","Saintpaulia","Sinningia","Spathiphyllum","Stephanotis","Streptocarpus","Cuphea"]);
/* Art-Ausnahmen: Der Weihnachtsstern ist eine blühende Topfpflanze, kein Sukkulent –
   die Gattung Euphorbia führt sonst zu Recht zu den Sukkulenten (E. milii, E. trigona). */
const ZI_SPEC = { "Euphorbia|pulcherrima":"Blühende Zimmerpflanzen" };
function zimmerTheme(g, ep){
  if(ZI_SPEC[g+"|"+ep]) return ZI_SPEC[g+"|"+ep];
  if(ZI_ORCH.has(g)) return TH_ZI_ORCH;
  if(ZI_BROM.has(g)) return TH_ZI_BROM;
  if(ZI_SUK.has(g))  return TH_ZI_SUK;
  if(ZI_PALM.has(g)) return TH_ZI_PALM;
  if(ZI_BLUEH.has(g)) return TH_ZI_BLUEH;
  return TH_ZI_GRUEN;   // Grünpflanzen + Rest
}
function themeOf(g, art, kat, pid){
  const ep=(art||"").split(" ")[0]||"", sp=g+"|"+ep;
  kat=(kat||"").trim();
  if(/^obstbau/.test(pid||"") && FRUIT_THEME[sp]) return FRUIT_THEME[sp];
  if(g && SPEC_THEME[sp]) return SPEC_THEME[sp];
  if(kat===TH_CLIMB) return TH_CLIMB;
  if(g && VAGUE_KAT.has(kat)) return woodyTheme(g, ep);
  if(kat==="Stauden") return staudeTheme(g, ep, art);
  if(kat==="Gemüsepflanzen") return gemueseTheme(g, ep, art);
  if(ZIMMER_KAT.has(kat)) return zimmerTheme(g, ep);   // auch »Topf- und Grünpflanzen« sind Zimmerpflanzen
  return KAT_ALIAS[kat] || kat || "Ohne Thema";
}

/* ---------- Familien-Steckbriefe (kuratiert, offline) ----------
   Kurze Lernhilfe je Pflanzenfamilie: was die Arten gemeinsam haben (m) und
   ein praktischer Erkennungs-/Merktipp (t). Deutscher Name (de) für den Titel.
   Abgedeckt sind die häufigsten Familien; für die übrigen greift ein Fallback. */
const FAM_INFO = {
  Asteraceae:{de:"Korbblütler",m:"Was wie eine einzelne Blüte aussieht, ist ein Körbchen aus vielen Einzelblüten – außen oft Zungenblüten, innen Röhrenblüten. Sehr artenreich, meist Stauden und Kräuter.",t:"Merkregel: ein »Korb« = viele Blüten. Typisch: Gänseblümchen, Sonnenblume, Aster, Löwenzahn."},
  Rosaceae:{de:"Rosengewächse",m:"Meist 5 Kron- und 5 Kelchblätter und auffällig viele Staubblätter; Blätter oft mit Nebenblättern. Umfasst viele Obst- und Ziergehölze.",t:"Achte auf radiäre 5-zählige Blüten mit vielen Staubblättern, oft Dornen/Stacheln. Apfel, Kirsche, Rose, Weißdorn."},
  Lamiaceae:{de:"Lippenblütler",m:"Vierkantiger Stängel, kreuz-gegenständige Blätter, häufig aromatisch (ätherische Öle). Blüten mit Ober- und Unterlippe.",t:"Fühl den Stängel: vierkantig + Duft = fast immer Lippenblütler. Salbei, Thymian, Minze, Lavendel."},
  Brassicaceae:{de:"Kreuzblütler",m:"4 kreuzweise stehende Kronblätter, 6 Staubblätter (4 lang, 2 kurz); Früchte sind Schoten oder Schötchen.",t:"4 Blütenblätter im Kreuz + Schote. Kohl, Senf, Raps, Schleifenblume."},
  Pinaceae:{de:"Kieferngewächse",m:"Meist immergrüne Nadelgehölze; Nadeln einzeln (Tanne, Fichte) oder in Büscheln (Kiefer, Lärche); verholzte Zapfen.",t:"Nadeln + echte Zapfen. Tanne: Nadeln flach, Zapfen stehend; Fichte: Nadeln spitz, Zapfen hängend."},
  Ranunculaceae:{de:"Hahnenfußgewächse",m:"Meist Stauden mit vielen Staub- und Fruchtblättern; oft giftig. Blütenaufbau sehr variabel.",t:"Viele Staubblätter, krautig, häufig giftig. Hahnenfuß, Eisenhut, Christrose, Küchenschelle."},
  Fabaceae:{de:"Schmetterlingsblütler",m:"Typische Schmetterlingsblüte (Fahne, 2 Flügel, Schiffchen), Früchte sind Hülsen; oft gefiederte Blätter. Binden mit Knöllchenbakterien Luftstickstoff.",t:"Schmetterlingsblüte + Hülse. Erbse, Bohne, Robinie, Lupine, Klee."},
  Poaceae:{de:"Süßgräser",m:"Runde, hohle Halme mit deutlichen Knoten; zweizeilige, parallelnervige Blätter; unscheinbare Blüten in Ährchen.",t:"Halm rund und hohl mit Knoten = echtes Gras. Abgrenzung zu Seggen (dreikantig, markig)."},
  Ericaceae:{de:"Heidekrautgewächse",m:"Meist immergrüne Gehölze saurer, humoser Böden (Moorbeet); oft glockige Blüten.",t:"Saurer Boden, kalkempfindlich. Heidekraut, Rhododendron, Heidelbeere."},
  Cupressaceae:{de:"Zypressengewächse",m:"Immergrüne Nadelgehölze mit meist schuppenförmigen (Thuja, Zypresse) oder nadeligen (Wacholder) Blättern; kleine oder beerige Zapfen.",t:"Schuppenblätter an flachen Zweigen, oft harziger Duft. Thuja, Wacholder, Zypresse."},
  Saxifragaceae:{de:"Steinbrechgewächse",m:"Meist Stauden, viele für Fels-, Schatten- und Steingärten; oft in Rosetten oder mit gelappten Blättern.",t:"Klassische Beetstauden: Steinbrech, Astilbe, Bergenie, Purpurglöckchen."},
  Apiaceae:{de:"Doldenblütler",m:"Kleine Blüten in Doppeldolden, Stängel oft hohl und gerillt; viele aromatisch (Gewürze/Gemüse), einige stark giftig.",t:"Doldenform + hohler Stängel. Vorsicht: essbar (Möhre, Dill) und giftig (Schierling) ähneln sich."},
  Caprifoliaceae:{de:"Geißblattgewächse",m:"Überwiegend Sträucher und Schlingpflanzen mit gegenständigen Blättern; oft Beeren.",t:"Gegenständige Blätter, häufig Heckensträucher. Heckenkirsche, Geißblatt, Weigelie."},
  Caryophyllaceae:{de:"Nelkengewächse",m:"Gegenständige Blätter an oft verdickten Knoten; 5 Kronblätter, häufig ausgerandet oder gefranst.",t:"Knotige Stängel, gegenständig; Blütenblätter oft eingeschnitten. Nelke, Leimkraut, Sternmiere."},
  Asparagaceae:{de:"Spargelgewächse",m:"Formenreich (Spargel, Funkie, Hyazinthe, Palmlilie); meist parallelnervige Blätter, oft Stauden-, Zwiebel- oder Rhizompflanzen.",t:"Sehr vielgestaltig – hier hilft Artkenntnis mehr als ein einzelnes Familienmerkmal."},
  Oleaceae:{de:"Ölbaumgewächse",m:"Bäume und Sträucher mit meist gegenständigen Blättern; Blüten oft 4-zählig.",t:"Gegenständige Blätter; bekannte Vertreter Flieder, Forsythie, Liguster, Esche."},
  Amaryllidaceae:{de:"Amaryllisgewächse",m:"Zwiebelpflanzen mit meist linealen Blättern; die Lauch-Arten riechen typisch nach Zwiebel.",t:"Zwiebel + Zwiebel-/Lauchgeruch (Allium). Narzisse, Schneeglöckchen, Zierlauch."},
  Sapindaceae:{de:"Seifenbaumgewächse",m:"Umfasst u. a. Ahorn und Rosskastanie; Ahorn mit geflügelten Spaltfrüchten, Rosskastanie mit großen, handförmig gefingerten Blättern.",t:"Ahorn: gegenständig + Flügelfrüchte (»Nasenzwicker«). Kastanie: fingerförmiges Blatt."},
  Primulaceae:{de:"Primelgewächse",m:"Meist Stauden, oft in grundständigen Rosetten; Blüten radiär, häufig verwachsenkronblättrig.",t:"Frühlingsstauden in Rosetten: Primel, Schlüsselblume, Gilbweiderich."},
  Crassulaceae:{de:"Dickblattgewächse",m:"Sukkulente mit dicken, wasserspeichernden Blättern; wärme- und trockenheitsliebend (Dach, Fels, Mauer).",t:"Dickfleischige Blätter = Trockenkünstler. Fetthenne, Hauswurz, Dachwurz."},
  Solanaceae:{de:"Nachtschattengewächse",m:"Blüten meist 5-zählig, radiär und verwachsen; viele Arten giftig (Alkaloide), zugleich wichtige Gemüse.",t:"Doppelrolle beachten: Nutzpflanze (Tomate, Kartoffel, Paprika) und Giftpflanze (Nachtschatten)."},
  Boraginaceae:{de:"Raublattgewächse",m:"Blätter und Stängel meist rau behaart; Blüten in eingerollten Wickeln, wechseln oft die Farbe von rosa zu blau.",t:"Raue Behaarung + eingerollter Blütenstand. Borretsch, Vergissmeinnicht, Beinwell."},
  Betulaceae:{de:"Birkengewächse",m:"Laubgehölze mit Blüten in Kätzchen, einhäusig; Früchte oft Nüsschen.",t:"Kätzchenblüher: Birke, Erle, Hainbuche, Hasel."},
  Hydrangeaceae:{de:"Hortensiengewächse",m:"Sträucher mit meist gegenständigen Blättern; oft große, auffällige (auch sterile Schau-)Blüten.",t:"Gegenständige Blätter, üppige Blütenstände. Hortensie, Deutzie, Pfeifenstrauch."},
  Plantaginaceae:{de:"Wegerichgewächse",m:"Formenreich – von Wegerich (Blattrosette, Ähre) bis Fingerhut und Ehrenpreis; viele mit lippigen oder röhrigen Blüten.",t:"Sehr gemischt; bekannte Arten Wegerich, Fingerhut, Ehrenpreis, Löwenmaul."},
  Fagaceae:{de:"Buchengewächse",m:"Große Laubbäume; Früchte sitzen in einem Becher oder Napf (Eichel, Buchecker, Marone).",t:"Frucht im »Näpfchen«: Eiche, Buche, Edelkastanie."},
  Berberidaceae:{de:"Berberitzengewächse",m:"Oft dornige Sträucher mit gelbem Holz und gelber Rinde; Beeren.",t:"Dornen + gelbes Holz (Zweig anschneiden). Berberitze, Mahonie."},
  Araceae:{de:"Aronstabgewächse",m:"Blütenstand aus Kolben und einem Hüllblatt (Spatha); viele beliebte Zimmerpflanzen, häufig mit scharfem Zellsaft (giftig).",t:"Kolben + Hüllblatt. Einblatt, Philodendron; Vorsicht Reizstoffe."},
  Geraniaceae:{de:"Storchschnabelgewächse",m:"Frucht mit langem, schnabelartigem Fortsatz; Blätter oft handförmig gelappt oder geteilt.",t:"»Schnabel«-Frucht + handförmiges Blatt. Storchschnabel (winterhart), Pelargonie (Balkon)."},
  Cornaceae:{de:"Hartriegelgewächse",m:"Sträucher und Bäume, meist gegenständige Blätter mit charakteristisch bogig verlaufenden Nerven.",t:"Blatt vorsichtig zerreißen: die Nerven halten mit feinen »Fäden«. Hartriegel, Kornelkirsche."},
  Celastraceae:{de:"Spindelbaumgewächse",m:"Sträucher mit auffälligen Früchten und Samen (z. B. Pfaffenhütchen); oft gute Herbstfärbung.",t:"Auffällige rosa-orange Früchte im Herbst. Pfaffenhütchen, Kriechspindel (Euonymus)."},
  Araliaceae:{de:"Efeugewächse",m:"Oft immergrüne Kletterer oder Gehölze; kleine Blüten in kugeligen Dolden.",t:"Immergrün, kletternd, kugelige Blütendolden. Efeu."},
  Campanulaceae:{de:"Glockenblumengewächse",m:"Meist Stauden mit glockigen, oft blauen bis violetten Blüten; führen Milchsaft.",t:"Glockenform + Milchsaft. Glockenblumen in vielen Arten."},
  Cyperaceae:{de:"Sauergräser",m:"Grasähnlich, aber Stängel meist dreikantig und markgefüllt (ohne Knoten); vor allem an feuchten Standorten.",t:"»Segge schneidet im Dreieck«: dreikantiger, voller Stängel – anders als runde, hohle Süßgräser."},
  Liliaceae:{de:"Liliengewächse",m:"Zwiebelpflanzen mit meist 3+3 gleichartigen Blütenblättern und parallelnervigen Blättern.",t:"Große 3-zählige Blüten aus Zwiebeln. Tulpe, Lilie, Kaiserkrone."},
  Iridaceae:{de:"Schwertliliengewächse",m:"Schwertförmige, reitend angeordnete Blätter; Blüten 3-zählig; Zwiebel-, Knollen- oder Rhizompflanzen.",t:"Blätter flach, wie ein Fächer reitend. Iris, Krokus, Montbretie."},
  Polygonaceae:{de:"Knöterichgewächse",m:"Am Blattgrund sitzt eine tütenförmige Blattscheide (Ochrea) um den verdickten Knoten.",t:"»Tütchen« am Stängelknoten. Rhabarber, Ampfer, Knöterich."},
  Apocynaceae:{de:"Hundsgiftgewächse",m:"Oft mit weißem Milchsaft und gegenständigen Blättern; viele Arten giftig.",t:"Milchsaft + giftig. Immergrün (Vinca), Oleander."},
  Amaranthaceae:{de:"Fuchsschwanzgewächse",m:"Meist unscheinbare Blüten; viele Arten vertragen Trockenheit oder Salz (auch wichtige Gemüse).",t:"Unscheinbare Blütenknäuel; Spinat, Rote Bete, Melde, Fuchsschwanz."},
  Buxaceae:{de:"Buchsbaumgewächse",m:"Immergrüne Sträucher mit kleinen, gegenständigen, ledrigen Blättern; sehr schnittverträglich.",t:"Dichtes immergrünes Kleinblatt, klassische Formschnittpflanze. Buchsbaum."},
  Malvaceae:{de:"Malvengewächse",m:"Blüten 5-zählig mit zu einer Röhre verwachsenen Staubblättern; Pflanzen oft schleimreich. Umfasst auch die Linden.",t:"Staubblätter zu einer Säule verwachsen. Malve, Eibisch, Stockrose, Linde."},
  Aspleniaceae:{de:"Streifenfarne",m:"Farne – keine Blüten, Vermehrung über Sporen; Sporenhäufchen in Streifen an der Blattunterseite.",t:"Blattunterseite ansehen: streifige Sporenbehälter. Streifenfarn, Hirschzunge."},
  Cucurbitaceae:{de:"Kürbisgewächse",m:"Rankende, einhäusige Pflanzen; große Früchte (Panzerbeere) mit vielen Samen.",t:"Ranken + getrennte männliche und weibliche Blüten. Gurke, Kürbis, Zucchini, Melone."},
  Urticaceae:{de:"Brennnesselgewächse",m:"Oft mit Brennhaaren; Blätter meist gegenständig, Blüten unscheinbar.",t:"Brennhaare an Blatt und Stängel. Große und Kleine Brennnessel."},
  Rutaceae:{de:"Rautengewächse",m:"Blätter mit durchscheinenden Öldrüsen, stark aromatisch; oft immergrün. Umfasst die Zitruspflanzen.",t:"Blatt gegen Licht: helle Punkte (Öldrüsen), Zitrusduft. Zitrone, Orange, Weinraute."}
};
function famLatin(f){ return norm(String(f||"").split("/")[0]); }        // lateinischer Teil vor dem »/«
function famGerman(f){ const p=String(f||"").split("/"); return p.length>1?norm(p.slice(1).join("/")):""; }

/* Weitere Familien-Steckbriefe (ergänzen FAM_INFO), damit möglichst jede in den
   Listen vorkommende Familie einen kuratierten Kurztext hat. */
Object.assign(FAM_INFO, {
  Scrophulariaceae:{de:"Braunwurzgewächse",m:"Kräuter und Sträucher mit meist zweiseitig-symmetrischen (lippigen) Blüten und Kapselfrüchten; nach neuer Gliederung enger gefasst.",t:"Lippenblüten, aber runder Stängel und Kapseln (anders als bei Lippenblütlern). Königskerze, Sommerflieder, Braunwurz."},
  Papaveraceae:{de:"Mohngewächse",m:"Oft mit weißem oder gefärbtem Milchsaft; 2 früh abfallende Kelch- und meist 4 große, zerknittert wirkende Kronblätter; Kapselfrüchte.",t:"Milchsaft + knittrige Blütenblätter. Klatschmohn, Schöllkraut, Lerchensporn."},
  Viburnaceae:{de:"Schneeballgewächse",m:"Sträucher mit gegenständigen Blättern und Blüten in Trugdolden, oft mit auffälligen sterilen Randblüten; Steinfrüchte.",t:"Gegenständig, doldig, Beeren/Steinfrüchte. Schneeball (Viburnum). Oft zu den Moschuskrautgewächsen gestellt."},
  Begoniaceae:{de:"Schiefblattgewächse",m:"Saftige Kräuter und Zimmerpflanzen mit auffällig unsymmetrischen (schiefen) Blättern; männliche und weibliche Blüten getrennt; oft geflügelte Kapseln.",t:"Schiefes, oft glänzendes Blatt und saftiger Stängel. Begonie."},
  Moraceae:{de:"Maulbeergewächse",m:"Gehölze mit Milchsaft; winzige Blüten in dichten Ständen, die zu Fruchtverbänden verwachsen.",t:"Milchsaft + Sammelfrucht. Feige (ein hohler Blütenstand), Maulbeere."},
  Grossulariaceae:{de:"Stachelbeergewächse",m:"Sträucher, oft mit Dornen; meist handförmig gelappte Blätter; Blüten in Trauben, Früchte Beeren.",t:"Gelapptes Blatt, Beeren in Träubchen, teils bestachelt. Johannisbeere, Stachelbeere (Ribes)."},
  Vitaceae:{de:"Weinrebengewächse",m:"Kletterpflanzen mit Ranken, die den Blättern gegenüberstehen; handförmiges Laub; Beeren.",t:"Ranke gegenüber dem Blatt. Weinrebe, Wilder Wein."},
  Taxaceae:{de:"Eibengewächse",m:"Immergrüne Nadelgehölze ohne Harz und ohne Zapfen; Samen von rotem, fleischigem Mantel umgeben; stark giftig.",t:"Weiche flache Nadeln, rote »Beeren«, kein Zapfen – alles außer dem Fruchtfleisch giftig. Eibe."},
  Onagraceae:{de:"Nachtkerzengewächse",m:"Blütenteile meist 4-zählig, mit unterständigem Fruchtknoten (Blüte auf langem »Griffel«); Kapseln.",t:"4-zählige Blüte + langer Fruchtknoten unter der Blüte. Nachtkerze, Fuchsie, Weidenröschen."},
  Salicaceae:{de:"Weidengewächse",m:"Laubgehölze, zweihäusig; Blüten in Kätzchen; Samen mit Haarschopf (Wollflug).",t:"Kätzchen + fliegende Wollsamen. Weide, Pappel."},
  Aquifoliaceae:{de:"Stechpalmengewächse",m:"Meist immergrüne Gehölze mit oft dornig gezähnten, ledrigen Blättern; zweihäusig; rote Beeren.",t:"Ledriges, oft stacheliges Immergrün mit roten Beeren. Stechpalme (Ilex)."},
  Magnoliaceae:{de:"Magnoliengewächse",m:"Ursprüngliche Gehölze mit großen Einzelblüten; Blütenhülle nicht in Kelch und Krone getrennt; viele Staub- und Fruchtblätter spiralig.",t:"Große, urtümliche Blüten oft vor dem Laubaustrieb. Magnolie, Tulpenbaum."},
  Polemoniaceae:{de:"Sperrkrautgewächse",m:"Meist Stauden und Einjährige mit fünfzähligen, verwachsenen Blüten in dichten Ständen.",t:"Bekannt als Beet-/Polsterstauden: Phlox (Flammenblume), Himmelsleiter."},
  Euphorbiaceae:{de:"Wolfsmilchgewächse",m:"Sehr formenreich (Kräuter bis Sukkulente) mit meist ätzendem weißem Milchsaft; oft unscheinbare Blüten in Scheinblüten.",t:"Weißer, reizender Milchsaft. Wolfsmilch, Weihnachtsstern, Christusdorn."},
  Balsaminaceae:{de:"Balsaminengewächse",m:"Saftige Kräuter mit durchscheinenden Stängeln; gespornte Blüten; reife Kapseln schleudern die Samen fort.",t:"Reife Kapsel schnellt bei Berührung auf (»Rührmichnichtan«). Springkraut, Fleißiges Lieschen (Impatiens)."},
  Convolvulaceae:{de:"Windengewächse",m:"Meist windende Kletterpflanzen mit trichterförmigen Blüten; oft mit Milchsaft.",t:"Trichterblüte + windender Stängel. Winde, Prunkwinde, Süßkartoffel."},
  Asphodelaceae:{de:"Affodillgewächse",m:"Stauden und Sukkulente, oft mit grundständigen, fleischigen oder grasartigen Blättern; Blüten meist in Trauben/Kerzen.",t:"Vielgestaltig: Taglilie, Fackellilie (Kniphofia), Aloe."},
  Polypodiaceae:{de:"Tüpfelfarngewächse",m:"Farne – Vermehrung über Sporen; Sporenhäufchen als runde »Tüpfel« ohne Schleier auf der Blattunterseite.",t:"Runde Sporenpunkte an der Blattunterseite, ohne Häutchen. Tüpfelfarn."},
  Violaceae:{de:"Veilchengewächse",m:"Blüten zweiseitig-symmetrisch mit gespornter Unterlippe; Blätter oft herzförmig; Kapseln.",t:"Gespornte, »gesichtige« Blüte. Veilchen, Stiefmütterchen (Viola)."},
  Verbenaceae:{de:"Eisenkrautgewächse",m:"Kräuter und Sträucher mit oft vierkantigem Stängel und Blüten in Ähren oder Dolden.",t:"Beet-/Balkonpflanze mit doldigen Blütenständen. Eisenkraut, Verbene."},
  Juglandaceae:{de:"Walnussgewächse",m:"Laubbäume mit großen, gefiederten, aromatischen Blättern; männliche Blüten in Kätzchen; Frucht eine Nuss/Steinfrucht.",t:"Gefiedertes Duftlaub + Nuss. Walnuss, Flügelnuss."},
  Hamamelidaceae:{de:"Zaubernussgewächse",m:"Sträucher und Bäume; Blüten mit schmalen, bandförmigen Kronblättern, oft im Winter.",t:"Fädige Blütenblätter, Winterblüher. Zaubernuss (Hamamelis)."},
  Plumbaginaceae:{de:"Bleiwurzgewächse",m:"Stauden salz- oder trockenheitsertragender Standorte; kleine Blüten in Köpfchen/Rispen, oft mit trockenhäutigem Kelch.",t:"Polster/Rispen an Küste und Steingarten. Grasnelke (Armeria), Strandflieder."},
  Gentianaceae:{de:"Enziangewächse",m:"Meist Stauden mit gegenständigen Blättern und radförmigen, oft leuchtend blauen, verwachsenen Blüten.",t:"Kräftig blaue Trichter-/Sternblüten, gegenständig. Enzian."},
  Paeoniaceae:{de:"Pfingstrosengewächse",m:"Stauden und Halbsträucher mit großen Blüten, vielen Staubblättern und Balgfrüchten.",t:"Große Frühsommerblüte mit vielen Staubblättern. Pfingstrose (Paeonie)."},
  Adoxaceae:{de:"Moschuskrautgewächse",m:"Meist Gehölze mit gegenständigen Blättern und kleinen Blüten in Trugdolden; Beeren/Steinfrüchte.",t:"Holunder und Schneeball gehören hierher – gegenständig, doldig, Beeren."},
  Alismataceae:{de:"Froschlöffelgewächse",m:"Sumpf- und Wasserpflanzen mit grundständigen, oft pfeilförmigen Blättern; dreizählige Blüten in Quirlen.",t:"Uferstaude mit pfeilförmigem Blatt und 3-zähliger Blüte. Froschlöffel, Pfeilkraut."},
  Nymphaeaceae:{de:"Seerosengewächse",m:"Wasserpflanzen mit rundlichen Schwimmblättern und großen Einzelblüten mit vielen Blütenblättern.",t:"Schwimmblatt + große Wasserblüte. Seerose."},
  Hypericaceae:{de:"Hartheugewächse",m:"Kräuter und Sträucher mit gegenständigen Blättern voller durchscheinender Drüsen; gelbe Blüten mit vielen Staubblättern.",t:"Blatt gegen Licht: helle Punkte; gelbe Blüte färbt zerdrückt rot. Johanniskraut."},
  Gesneriaceae:{de:"Gesneriengewächse",m:"Zimmerpflanzen mit oft samtigen Blättern und lippigen, farbigen Blüten.",t:"Weiche, behaarte Blätter, farbenfrohe Zimmerblüher. Usambaraveilchen, Gloxinie."},
  Hyacinthaceae:{de:"Hyazinthengewächse",m:"Zwiebelpflanzen mit grundständigen Blättern und Blüten in Trauben, oft duftend (heute meist zu den Spargelgewächsen).",t:"Zwiebel + Blütentraube. Hyazinthe, Traubenhyazinthe, Blaustern."},
  Rubiaceae:{de:"Rötegewächse",m:"Blätter gegenständig oder quirlig mit Nebenblättern; kleine, oft vierzählige Blüten. Weltweit riesige Familie.",t:"Quirlständige Blätter mit »Kletthaaren«. Labkraut, Waldmeister; auch Kaffee."},
  Equisetaceae:{de:"Schachtelhalmgewächse",m:"Uralte Sporenpflanzen mit gegliederten, hohlen, quirlig verzweigten Stängeln; Sporen in endständigen Zapfen; kein echtes Laub.",t:"Gliederstängel mit Quirlästen, »schachtelbar«. Schachtelhalm (Zinnkraut)."},
  Actinidiaceae:{de:"Strahlengriffelgewächse",m:"Verholzende Kletterpflanzen; Blüten mit strahlig ausgebreiteten Griffeln; Beeren.",t:"Rankendes Gehölz mit haarigen Beeren. Kiwi (Actinidia)."},
  Elaeagnaceae:{de:"Ölweidengewächse",m:"Gehölze mit silbrig-schülferigen Blättern/Trieben, oft dornig; wurzeln mit Stickstoff-Knöllchen.",t:"Silbrig schimmerndes Laub. Ölweide, Sanddorn."},
  Bignoniaceae:{de:"Trompetenbaumgewächse",m:"Bäume und Kletterer mit großen, trompetenförmigen Blüten und langen Kapseln.",t:"Große Trichter-/Trompetenblüten, bohnenartige Kapseln. Trompetenbaum (Catalpa)."},
  Ginkgoaceae:{de:"Ginkgogewächse",m:"Lebendes Fossil; Baum mit fächerförmigen, gegabelt genervten Blättern; zweihäusig, Samen mit fleischiger, streng riechender Hülle.",t:"Fächerblatt mit Gabeladern – einmalig. Ginkgo."},
  Anacardiaceae:{de:"Sumachgewächse",m:"Gehölze mit meist gefiederten Blättern und Harzkanälen; teils hautreizend; oft leuchtende Herbstfärbung.",t:"Gefiedert, prächtige Herbstfarbe, kolbige Fruchtstände. Essigbaum/Sumach (Rhus)."},
  Lythraceae:{de:"Blutweiderichgewächse",m:"Kräuter und Gehölze feuchter Standorte; Blüten oft 6-zählig; Blätter meist gegenständig.",t:"Feuchtezeiger mit ährigen Blütenständen. Blutweiderich; auch Lagerstroemie."},
  Myrtaceae:{de:"Myrtengewächse",m:"Immergrüne, aromatische Gehölze mit ledrigen, öldrüsigen Blättern und meist vielen auffälligen Staubblättern.",t:"Blatt duftet beim Zerreiben; Blüten wie Puderquasten. Myrte, Eukalyptus."},
  Arecaceae:{de:"Palmengewächse",m:"Palmen: unverzweigter Stamm mit Schopf großer, gefiederter oder gefächerter Blätter.",t:"Stamm + Blattschopf, fieder- oder fächerförmig. Palme."},
  Bromeliaceae:{de:"Bromeliengewächse",m:"Meist Rosettenpflanzen, viele aufsitzend (epiphytisch); Blätter oft mit Saugschuppen, Rosette als Wasserspeicher; leuchtende Hochblätter.",t:"Trichterrosette, oft aufsitzend. Ananas, Zimmerbromelien."},
  Orchidaceae:{de:"Orchideen",m:"Hoch spezialisierte Blüten mit abweichend gestalteter »Lippe« und verdrehtem Fruchtknoten; staubfeine Samen.",t:"Blüte mit auffälliger Lippe. Orchidee."},
  Linaceae:{de:"Leingewächse",m:"Zarte Kräuter mit schmalen Blättern und fünfzähligen, oft blauen, rasch abfallenden Blüten.",t:"Feines Laub, himmelblaue »Eintagsblüten«. Lein (Flachs)."},
  Juncaceae:{de:"Binsengewächse",m:"Grasähnliche Sumpfpflanzen mit rundlichen, markgefüllten Stängeln und unscheinbaren, aber echten dreizähligen Blüten.",t:"»Binsen sind rund« – runder, markiger Halm ohne Knoten. Binse, Simse."},
  Typhaceae:{de:"Rohrkolbengewächse",m:"Hohe Uferpflanzen mit langen, schwertförmigen Blättern und dem braunen, zigarrenförmigen Blütenkolben.",t:"Der braune »Zigarren«-Kolben ist unverkennbar. Rohrkolben."},
  Lauraceae:{de:"Lorbeergewächse",m:"Meist immergrüne, aromatische Gehölze mit ledrigen, öldrüsigen Blättern; Beeren/Steinfrüchte.",t:"Ledriges, würzig duftendes Immergrün. Lorbeer, Zimt, Avocado."},
  Aristolochiaceae:{de:"Osterluzeigewächse",m:"Kletter- und Stauden mit oft herzförmigen Blättern und eigenartig gebogenen, pfeifenförmigen Fallenblüten.",t:"Pfeifenförmige Blüte + herzförmiges Blatt. Pfeifenwinde, Haselwurz."},
  Butomaceae:{de:"Schwanenblumengewächse",m:"Uferstaude mit schmalen, dreikantigen Blättern und rosa Blüten in lockerer Dolde.",t:"Einzige Art: die Schwanenblume – rosa Doldenblüten am Wasser."},
  Agavaceae:{de:"Agavengewächse",m:"Sukkulente Rosettenpflanzen mit steifen, oft dornig gespitzten Blättern; blühen spät und meist nur einmal (heute zu den Spargelgewächsen).",t:"Steife Blattrosette mit Endstachel. Agave, Yucca."},
  Garryaceae:{de:"Becherkätzchengewächse",m:"Immergrüne Gehölze mit gegenständigen Blättern; unscheinbare Blüten, bei Aucuba rote Beeren.",t:"Immergrün, gegenständig; Aucuba mit gelb geflecktem Laub."},
  Altingiaceae:{de:"Amberbaumgewächse",m:"Laubbäume mit ahornähnlich gelappten, aromatischen, aber wechselständigen Blättern; kugelige, stachelige Fruchtstände; prächtige Herbstfarbe.",t:"Ahornähnliches Blatt, aber wechselständig, mit Duft. Amberbaum (Liquidambar)."},
  Platanaceae:{de:"Platanengewächse",m:"Große Bäume mit charakteristisch abblätternder Borke und handförmig gelappten Blättern; kugelige Fruchtstände.",t:"Fleckige, abplatzende Rinde + Kugelfrüchte. Platane."},
  Ulmaceae:{de:"Ulmengewächse",m:"Laubbäume mit meist asymmetrischer Blattbasis und doppelt gesägtem Rand; geflügelte Nussfrüchte.",t:"Blattgrund schief (eine Seite höher), Flügelnüsse. Ulme."},
  Acanthaceae:{de:"Akanthusgewächse",m:"Kräuter und Stauden mit oft großen, gelappten Blättern und lippenförmigen Blüten mit auffälligen Tragblättern.",t:"Namensgeber der antiken Säulen-Ornamente. Akanthus, Bärenklaublatt (Zierpflanze)."},
  Cannaceae:{de:"Blumenrohrgewächse",m:"Kräftige Stauden mit großen, bananenähnlichen Blättern und auffälligen, asymmetrischen Blüten aus umgebildeten Staubblättern.",t:"Große Blätter + leuchtende Sommerblüten. Blumenrohr (Canna)."},
  Cactaceae:{de:"Kakteengewächse",m:"Sukkulenten mit fleischigem, oft blattlosem Sprosskörper; Dornen und Blüten entspringen speziellen Polstern (Areolen).",t:"Dornen aus Areolen – das unterscheidet Kakteen von anderen Sukkulenten."},
  Aizoaceae:{de:"Mittagsblumengewächse",m:"Sukkulente Pflanzen trockener/salziger Standorte; leuchtende, strahlenförmige Blüten, die sich meist in der Sonne öffnen.",t:"Fleischige Blätter, »Gänseblümchen«-Blüten öffnen mittags. Mittagsblume."},
  Buddlejaceae:{de:"Sommerfliedergewächse",m:"Sträucher mit langen, gegenständigen Blättern und dichten, duftenden Blütenrispen (heute meist zu den Braunwurzgewächsen).",t:"Große Blütenrispe, ein Schmetterlingsmagnet. Sommerflieder (Buddleja)."},
  Tiliaceae:{de:"Lindengewächse",m:"Laubbäume mit schief-herzförmigen Blättern und einem zungenförmigen Flügel-Hochblatt am Blütenstand (heute zu den Malvengewächsen).",t:"Herzblatt + flügelartiges Tragblatt am Blütenstand. Linde."},
  Convallariaceae:{de:"Maiglöckchengewächse",m:"Rhizomstauden des Schattens mit glockigen Blüten und Beeren (heute zu den Spargelgewächsen); oft giftig.",t:"Waldschattenstauden mit Glöckchen. Maiglöckchen, Salomonssiegel."},
  Dryopteridaceae:{de:"Wurmfarngewächse",m:"Farne mit meist trichterförmig stehenden, mehrfach gefiederten Wedeln; Sporenhäufchen mit nierenförmigem Schleier.",t:"Kräftige Wedeltrichter, runde Sori mit Häutchen. Wurmfarn, Schildfarn."},
  Hemerocallidaceae:{de:"Tagliliengewächse",m:"Horststauden mit grasartigen Blättern und trichterförmigen Blüten, die meist nur einen Tag halten (heute zu den Affodillgewächsen).",t:"Jede Blüte hält nur einen Tag. Taglilie (Hemerocallis)."},
  Hippuridaceae:{de:"Tannenwedelgewächse",m:"Wasserpflanze mit quirlig stehenden, schmalen Blättern am aufrechten Trieb – wie ein kleiner Tannenwedel.",t:"Quirlblätter am Wassertrieb, tannenwedelartig. Tannenwedel (Hippuris)."},
  Menyanthaceae:{de:"Fieberkleegewächse",m:"Wasser- und Sumpfpflanzen mit gefransten oder kleeartigen Blättern und meist gefransten Blütenblättern.",t:"Fransige Blütenränder am/im Wasser. Fieberklee, Seekanne."},
  Osmundaceae:{de:"Rispenfarngewächse",m:"Große, urtümliche Farne; sporentragende Wedelteile weichen deutlich von den grünen ab (Zweigestaltigkeit).",t:"Getrennte grüne und braun-sporige Wedelteile. Königsfarn (Osmunda)."},
  Araucariaceae:{de:"Araukariengewächse",m:"Immergrüne Nadelbäume der Südhalbkugel mit steifen, schuppen- bis pfriemförmigen Blättern in regelmäßigen Etagen.",t:"Steife, symmetrische »Etagen« – wie gebaut. Andentanne, Zimmertanne (Araucaria)."},
  Calycanthaceae:{de:"Gewürzstrauchgewächse",m:"Sträucher mit gegenständigen, aromatischen Blättern; Blüten mit vielen gleichartigen, oft bräunlich-roten Blütenblättern.",t:"Zerriebenes Holz/Laub duftet würzig. Gewürzstrauch (Calycanthus)."},
  Cercidiphyllaceae:{de:"Kuchenbaumgewächse",m:"Bäume mit rundlich-herzförmigen, gegenständigen Blättern; das welkende Herbstlaub duftet nach Karamell.",t:"Herbstlaub riecht nach Lebkuchen. Kuchenbaum/Katsurabaum (Cercidiphyllum)."},
  Thymelaeaceae:{de:"Seidelbastgewächse",m:"Sträucher mit zäher, faseriger Rinde und duftenden, meist vierzähligen Röhrenblüten; oft giftige Beeren.",t:"Rinde extrem zäh (kaum zu brechen), Blüten oft vor dem Laub. Seidelbast."},
  Paulowniaceae:{de:"Blauglockenbaumgewächse",m:"Schnellwüchsige Bäume mit sehr großen, herzförmigen Blättern und blauvioletten, fingerhutähnlichen Blüten vor dem Laub.",t:"Riesenblätter + blaue Glockenblüten. Blauglockenbaum (Paulownia)."},
  Tamaricaceae:{de:"Tamariskengewächse",m:"Sträucher trockener/salziger Standorte mit schuppenförmigen Blättchen und rosa Blüten in feinen Rispen.",t:"Federleichtes, schuppiges Laub, rosa »Schleier«. Tamariske."},
  Pteridaceae:{de:"Saumfarngewächse",m:"Farne mit oft fein gefiederten Wedeln; Sporenhäufchen liegen am umgerollten Blattrand (Saum).",t:"Sori am eingerollten Blattrand. Frauenhaarfarn (Adiantum)."},
  Alliaceae:{de:"Lauchgewächse",m:"Zwiebelpflanzen, die beim Zerreiben nach Zwiebel/Knoblauch riechen; Blüten in Dolden mit Hüllblatt (heute zu den Amaryllisgewächsen).",t:"Zwiebelgeruch + kugelige Blütendolde. Zwiebel, Knoblauch, Zierlauch (Allium)."},
  Cistaceae:{de:"Zistrosengewächse",m:"Sträucher und Halbsträucher trockener, sonniger Standorte; Blüten mit 5 zerknittert wirkenden, rasch abfallenden Kronblättern.",t:"Mediterran, »Eintagsblüten« wie zerknittertes Seidenpapier. Zistrose, Sonnenröschen."},
  Ebenaceae:{de:"Ebenholzgewächse",m:"Gehölze mit hartem, dunklem Holz; Blüten meist getrenntgeschlechtig; Beeren mit bleibendem Kelch.",t:"Bekannt durch Frucht und Holz: Kaki/Dattelpflaume (Diospyros)."},
  Oxalidaceae:{de:"Sauerkleegewächse",m:"Kräuter mit meist dreizähligen, kleeartigen Blättern, die sich nachts falten; saurer Geschmack; Kapseln.",t:"Kleeblatt, das »schläft«, schmeckt sauer. Sauerklee (Oxalis)."},
  Alstroemeriaceae:{de:"Inkaliliengewächse",m:"Knollen-/Rhizomstauden mit gedrehten Blättern (Unterseite oben) und lilienartigen, oft gefleckten Blüten.",t:"Beliebte Schnittblume, Blätter »verdreht«. Inkalilie (Alstroemeria)."},
  Marantaceae:{de:"Pfeilwurzgewächse",m:"Blattschöne Zimmerpflanzen mit auffällig gemusterten Blättern, die sich abends aufrichten.",t:"Gemustertes Laub klappt zur Nacht hoch. Korbmarante (Maranta/Calathea)."},
  Calceolariaceae:{de:"Pantoffelblumengewächse",m:"Kräuter mit auffällig aufgeblasener, pantoffel-/beutelförmiger Unterlippe der Blüte.",t:"Blüte wie ein kleiner Pantoffel/Beutel. Pantoffelblume (Calceolaria)."},
  Montiaceae:{de:"Quellkrautgewächse",m:"Zarte, oft sukkulente Kräuter mit fleischigen Blättern; kleine, meist fünfzählige Blüten (früher bei den Portulakgewächsen).",t:"Fleischige kleine Salatkräuter. Postelein/Winterportulak (Claytonia)."},
  Portulacaceae:{de:"Portulakgewächse",m:"Sukkulente Kräuter mit fleischigen Blättern; Blüten öffnen sich in der Sonne; Deckelkapseln.",t:"Dickfleischige Blätter, Sonnenanbeter. Portulak, Portulakröschen."},
  Punicaceae:{de:"Granatapfelgewächse",m:"Sträucher/Bäumchen mit leuchtend roten Blüten und der bekannten vielsamigen Frucht mit lederiger Schale (heute zu den Blutweiderichgewächsen).",t:"Rote Blüte + Granatapfel-Frucht. Granatapfel (Punica)."},
  Woodsiaceae:{de:"Wimperfarngewächse",m:"Kleine bis mittelgroße Farne felsiger oder frischer Standorte mit gefiederten Wedeln.",t:"Zarte Fels- und Waldfarne. Wimperfarn, Frauenfarn-Verwandte."},
  Blechnaceae:{de:"Rippenfarngewächse",m:"Farne mit oft zweigestaltigen Wedeln; die sporentragenden Fiedern sind schmaler als die grünen.",t:"Getrennt schmale Sporenwedel. Rippenfarn (Blechnum)."},
  Fumariaceae:{de:"Erdrauchgewächse",m:"Zarte Kräuter mit fein zerteilten Blättern und gespornten, oft zweiseitig-symmetrischen Blüten (heute zu den Mohngewächsen).",t:"Feines Laub + gespornte Blütchen. Erdrauch, Lerchensporn, Tränendes Herz."},
  Globulariaceae:{de:"Kugelblumengewächse",m:"Niedrige Stauden und Polster mit kleinen Blüten in kugeligen, meist blauen Köpfchen.",t:"Blaue Blütenkugeln im Steingarten. Kugelblume (Globularia)."},
  Hostaceae:{de:"Funkiengewächse",m:"Schattenstauden mit breiten, dekorativen Blatthorsten und trichterförmigen Blüten an aufrechten Stielen (heute zu den Spargelgewächsen).",t:"Blattschmuckstaude für den Schatten. Funkie (Hosta)."},
  Clusiaceae:{de:"Klusiengewächse",m:"Meist tropische Gehölze mit gegenständigen, ledrigen Blättern und gelbem Harz/Milchsaft.",t:"Ledriges Immergrün mit gelbem Saft. Clusia (Johanniskraut-Verwandte)."},
  Dipsacaceae:{de:"Kardengewächse",m:"Stauden mit dicht in Köpfchen stehenden Blüten, oft mit stacheligen Hüllblättern (heute zu den Geißblattgewächsen).",t:"Igelige Blütenköpfe. Karde, Skabiose, Witwenblume."},
  Cannabaceae:{de:"Hanfgewächse",m:"Kräuter und Schlingpflanzen mit meist handförmig geteilten oder rauen Blättern; zweihäusig, mit Drüsen.",t:"Handförmiges bzw. rau-lappiges Laub, zweihäusig. Hopfen, Hanf."},
  Nothofagaceae:{de:"Scheinbuchengewächse",m:"Buchenähnliche Gehölze der Südhalbkugel mit kleinen, oft immergrünen Blättern.",t:"Wie kleine Buchen, aus Südamerika/Neuseeland. Scheinbuche (Nothofagus)."},
  Sciadopityaceae:{de:"Schirmtannengewächse",m:"Immergrüner Nadelbaum; die »Nadeln« (verwachsene Kurztriebe) stehen schirmartig quirlig – ein lebendes Fossil.",t:"Dicke, schirmartig gestellte Doppelnadeln. Schirmtanne (Sciadopitys)."},
  Pittosporaceae:{de:"Klebsamengewächse",m:"Immergrüne Sträucher mit ledrigen Blättern und duftenden Blüten; Samen von klebrigem Harz umhüllt.",t:"Ledriges Immergrün, duftende Blüten, klebrige Samen. Klebsame (Pittosporum)."},
  Pontederiaceae:{de:"Wasserhyazinthengewächse",m:"Schwimmende oder Sumpf-Wasserpflanzen mit oft aufgeblasenen Blattstielen und blauen Blüten in Ähren.",t:"Schwimmblattrosette mit blauen Blüten. Wasserhyazinthe."},
  Hydrocharitaceae:{de:"Froschbissgewächse",m:"Untergetauchte oder schwimmende Wasserpflanzen mit unscheinbaren Blüten; häufig in Teich und Aquarium.",t:"Typische Teich-/Aquarienpflanzen. Froschbiss, Wasserpest."},
  Annonaceae:{de:"Annonengewächse",m:"Meist tropische Gehölze mit aromatischen Blättern und fleischigen, dreizähligen Blüten; große Sammelfrüchte.",t:"Tropenobst mit »schuppiger« Sammelfrucht. Cherimoya, Pawpaw (Asimina)."},
  Musaceae:{de:"Bananengewächse",m:"Riesige Stauden mit »Scheinstamm« aus Blattscheiden und sehr großen Blättern; Blüten mit Hochblättern, Beeren.",t:"Scheinstamm + Riesenblatt. Banane (Musa)."},
  Dracaenaceae:{de:"Drachenbaumgewächse",m:"Baumartige Zimmerpflanzen mit Blattschöpfen an verholzenden Stämmen (heute zu den Spargelgewächsen).",t:"Stamm mit Blattschopf als Zimmerpflanze. Drachenbaum (Dracaena)."},
  Nyctaginaceae:{de:"Wunderblumengewächse",m:"Kräuter und Kletterer mit gegenständigen Blättern; auffällige, oft farbige Hochblätter umgeben die trichterförmigen Blüten.",t:"Farbige »Blüten« sind oft Hochblätter. Wunderblume, Drillingsblume (Bougainvillea)."},
  Theaceae:{de:"Teestrauchgewächse",m:"Immergrüne Gehölze mit ledrigen, glänzenden Blättern und großen, schalenförmigen Blüten mit vielen Staubblättern.",t:"Glänzendes Immergrün, kamelienartige Blüte. Kamelie, Teestrauch."},
  Cleomaceae:{de:"Spinnenpflanzengewächse",m:"Kräuter mit handförmig geteilten Blättern und Blüten mit auffällig langen Staubblättern; nahe den Kreuzblütlern.",t:"Blüten mit langen »Spinnenbeinen«. Spinnenpflanze (Cleome)."},
  Cycadaceae:{de:"Palmfarngewächse",m:"Urtümliche, palmenähnliche Nacktsamer mit steifem Schopf gefiederter Blätter; zweihäusig, mit Zapfen; sehr langsam.",t:"»Palme« mit Zapfen – aber kein Farn und keine Palme. Palmfarn (Cycas)."},
  Melastomataceae:{de:"Schwarzmundgewächse",m:"Tropische Kräuter und Sträucher mit auffällig bogig-längsnervigen Blättern.",t:"Blatt mit mehreren bogigen Längsnerven – gutes Merkmal. Medinille."},
  Passifloraceae:{de:"Passionsblumengewächse",m:"Kletterpflanzen mit Ranken und aufwendig gebauten Blüten mit einem Kranz fädiger Nebenkrone.",t:"Ranken + »Uhrwerk«-Blüte mit Strahlenkranz. Passionsblume."},
  Piperaceae:{de:"Pfeffergewächse",m:"Kräuter und Kletterer mit oft fleischigen Blättern und winzigen Blüten in dichten Kolben/Ähren; würzig.",t:"Winzige Blüten am Kolben, fleischige Blätter. Pfeffer, Zwergpfeffer (Peperomie)."},
  Goodeniaceae:{de:"Fächerblumengewächse",m:"Kräuter mit einseitig »aufgefächerten« Blüten (alle Kronzipfel auf einer Seite).",t:"Blüte wie ein halber Fächer. Fächerblume (Scaevola)."},
  Strelitziaceae:{de:"Strelitziengewächse",m:"Große Stauden mit bananenähnlichen Blättern und auffälligen, vogelkopfartigen Blüten in einem Hochblatt-»Kahn«.",t:"Blüte wie ein bunter Vogelkopf. Paradiesvogelblume (Strelitzie)."},
  Linderniaceae:{de:"Büchsenkrautgewächse",m:"Kleine Kräuter feuchter Standorte mit lippenförmigen Blüten (aus den Braunwurzgewächsen ausgegliedert).",t:"Winzige Beet-/Sumpfkräuter mit Lippenblüten. Bacopa, Büchsenkraut."},
  Commelinaceae:{de:"Commelinengewächse",m:"Saftige Kräuter mit geschlossenen Blattscheiden und meist dreizähligen, oft blauen, zarten Blüten.",t:"Saftiger, geknieter Stängel, blaue »Eintagsblüten«. Dreimasterblume (Tradescantia)."},
  Tropaeolaceae:{de:"Kapuzinerkressengewächse",m:"Saftige, kletternde oder kriechende Kräuter mit schildförmigen Blättern und gespornten, leuchtenden Blüten; scharf schmeckend.",t:"Schildblatt + gespornte Blüte, pfeffrig. Kapuzinerkresse."},
  Acoraceae:{de:"Kalmusgewächse",m:"Sumpfpflanzen mit schwertförmigen, aromatischen Blättern und einem seitlichen Blütenkolben ohne auffälliges Hüllblatt.",t:"Iris-ähnliches Blatt, aber würzig duftend, mit Kolben. Kalmus (Acorus)."},
  Anthericaceae:{de:"Grasliliengewächse",m:"Horststauden mit grasartigen Blättern und sternförmigen weißen Blüten in Trauben (heute zu den Spargelgewächsen).",t:"Graslaub + weiße Sternblüten. Graslilie (Anthericum)."},
  Aceraceae:{de:"Ahorngewächse",m:"Laubgehölze mit gegenständigen, meist handförmig gelappten Blättern und geflügelten Spaltfrüchten (heute zu den Seifenbaumgewächsen).",t:"Gegenständig + »Nasenzwicker«-Flügelfrüchte. Ahorn."},
  Simaroubaceae:{de:"Bittereschengewächse",m:"Bäume und Sträucher mit gefiederten Blättern und bitteren Rinden-/Holzstoffen; geflügelte Früchte.",t:"Gefiedert, bitter, schnellwüchsig und ausschlagfreudig. Götterbaum (Ailanthus)."},
  Cephalotaxaceae:{de:"Kopfeibengewächse",m:"Immergrüne, eibenähnliche Nadelgehölze mit größeren, pflaumenartig umhüllten Samen.",t:"Wie eine Eibe, aber mit größerem, »pflaumigem« Samen. Kopfeibe (Cephalotaxus)."},
  Podocarpaceae:{de:"Steineibengewächse",m:"Immergrüne Nadelgehölze der Südhalbkugel; Samen auf einem oft fleischigen, farbigen Fruchtträger.",t:"Südliche »Eiben« mit fleischigem Samenstiel. Steineibe (Podocarpus)."}
});
/* Tippfehler/alte Schreibweisen aus den Quelldaten auf die richtige Familie führen,
   damit auch dort der passende Steckbrief erscheint. */
const FAM_ALIAS = {
  "lridaceae":"Iridaceae", "Malvacea":"Malvaceae", "Asteraceae.":"Asteraceae",
  "Saxifrasgaceae":"Saxifragaceae", "Brasslcaceae":"Brassicaceae", "Ericacea":"Ericaceae",
  "Scophulariaceae":"Scrophulariaceae", "Portulaceae":"Portulacaceae", "Thymelaceae":"Thymelaeaceae",
  "Pittosperaceae":"Pittosporaceae", "Sciadopityacaea":"Sciadopityaceae", "Caesalpinaceae":"Fabaceae"
};
function famKey(f){ const k=famLatin(f); return FAM_ALIAS[k]||k; }        // normalisierter Familien-Schlüssel

/* Seed-Zeile: [gattung, art, familie, deutscher_name, kategorie, zp, synonyme] */
function cardsFor(id){
  const rows = (typeof SEEDS!=="undefined" && SEEDS[id]) || [];
  return rows.map(r=>({
    g:r[0]||"", a:r[1]||"", fam:r[2]||"", de:r[3]||"", kat:r[4]||"", zp:r[5]?1:0, syn:r[6]||"",
    thema:themeOf(r[0]||"", r[1]||"", r[4]||"", id),
    key:((r[0]||"")+"|"+(r[1]||"")+"|"+(r[3]||"")).toLowerCase()
  })).filter(c=>c.g);
}

/* ---------- Zustand ---------- */
let profileId = "gemuesebau_gaertner";
let allCards = [];           // alle Arten des Profils
let progress = {};           // key -> {box(1..5), due(YYYY-MM-DD), seen, correct, wrong}
let mode = "cards";          // cards | quiz | type | list
let lastLearnMode = "photo"; // zuletzt aktiver Nicht-Listen-Modus (Rückweg aus dem Listen-Schnellzugriff)
let queue = [], qi = 0, current = null, flipped = false;
let sessSeq = 0;                                        // Audit: renderPhoto prüft nach jedem await gegen die Sitzungs-Nummer
let sess = { total:0, done:0, correct:0, ms:0, pts:null, active:false };
let qStart = 0, clockTimer = null;   // Zeitmessung: Start der offenen Frage · Anzeige-Takt
let listCats = new Set();     // aktive Filter-Tags der laufenden Dimension (leer = alle)
let listSort = "thema";       // Ansicht: bot | de | thema | familie (Standard: nach Thema gruppiert)
let pendingChallenge = null;  // aus der URL (#c=…) dekodierte, noch nicht angenommene Herausforderung
let examOnly = false;         // opt-in: nur Prüfungsstoff (Fachwerker) – Familie/Synonyme ausblenden
let dirText  = "de2bot";      // Abfragerichtung für Karteikarten/Quiz/Selbst eingeben
let dirPhoto = "img2both";    // Bilder-Quiz: angeboten wird nur noch »Bild → voller Name«
let photoAnswer = "mc";       // Antwortart im Bilder-Quiz: mc | type | exam
let examFields = null;        // Felder im Modus »wie in der Prüfung« (je Profil merkbar)
let printColsOff = null;      // beim Lernlisten-Druck abgewählte Spalten (Set von Schlüsseln: g/a/fam/de/zp/chk)

/* Nur-Prüfungsstoff-Modus: Die Fachwerker-Abschlussprüfung bewertet ausschließlich
   Deutscher Name, Gattung und Art (keine Familie). Diese opt-in Option blendet in
   Karteikarten und Liste alles außer diesen Feldern aus (Info-Links bleiben) –
   weniger Lernstoff, nur das Geprüfte. Nur bei Fachwerker-Profilen aktivierbar. */
function isFachwerker(){ return /_fachwerker$/.test(profileId); }
function examOnlyActive(){ return examOnly && isFachwerker(); }
function normalizeSort(){ if(examOnlyActive() && listSort==="familie"){ listSort="thema"; store.set(LS_PREFIX+"listsort",listSort); } }
function syncExamOnlyUI(){
  const wrap=$("#examOnlyWrap"); if(wrap) wrap.hidden = !isFachwerker();   // Schalter nur bei Fachwerker zeigen
  const cb=$("#examOnly"); if(cb) cb.checked = examOnly;
}

let toastT=null;
function toast(msg,isErr){ const t=$("#toast"); t.textContent=msg; t.classList.toggle("err",!!isErr); t.classList.add("show");
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"),2200); }

/* ---------- Leitner / Spaced Repetition ----------
   Boxen 1..5 mit steigenden Wiedervorlage-Intervallen. Box 0 = neu (noch nie bewertet).
   Die Selbsteinschätzung bestimmt die Zielbox – und damit, wann die Karte wiederkommt:
     Nochmal (again) → Box 1, HEUTE nochmal (in derselben Sitzung erneut).
     Unsicher (hard) → Box halten (neu → 1), kurzes Intervall.
     Gewusst (good)  → Box hoch (neu → 2), längeres Intervall.
   »sitzt« = Box 4–5. So wirkt jede Bewertung schon beim ersten Mal unterschiedlich. */
const BOX_DAYS = [1,3,7,16,35];              // Intervall je Box 1..5 (Tage); Box 1 = morgen
function boxAfter(cur, g){                    // Zielbox je Bewertung (cur = aktuelle Box, 0 = neu)
  if(g==="again") return 1;                   // zurück auf Anfang
  if(g==="hard")  return Math.max(1, cur);    // halten (neu → 1)
  return Math.min(5, Math.max(2, cur+1));     // good: eine Box hoch (neu → 2)
}
const todayISO = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
function addDays(iso,n){ const d=new Date(iso+"T00:00:00"); d.setDate(d.getDate()+n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function progKey(){ return LS_PREFIX+"progress."+profileId; }
function loadProgress(){ try{ const raw=store.get(progKey()); progress=raw?JSON.parse(raw):{}; if(typeof progress!=="object"||!progress) progress={}; }catch(e){ progress={}; } masteryReset(); }
function saveProgress(){ store.set(progKey(), JSON.stringify(progress)); }
function pget(key){ return progress[key] || {box:0,due:"",seen:0,correct:0,wrong:0}; }
function grade(card, g){ // g: 'again' | 'hard' | 'good'
  const p = pget(card.key);
  const vor = p.box||0;
  p.seen = (p.seen||0)+1;
  const nb = boxAfter(vor, g);
  p.box = nb;
  if(g==="again"){ p.wrong=(p.wrong||0)+1; p.due=todayISO(); }        // heute nochmal fällig
  else { p.correct=(p.correct||0)+1; p.due=addDays(todayISO(), BOX_DAYS[nb-1]); }
  progress[card.key]=p; saveProgress();
  lastStep = { vor, nach:nb, neuFest: vor<4 && nb>=4 };               // für die Stufen-Anzeige der Rückmeldung
  if(lastStep.neuFest){                                              // DER Moment: die Art sitzt jetzt
    toast(`»${deMain(card)||botName(card)}« sitzt jetzt – Stufe 4 von 5.`);
    celebrate($("#fb")||$("#stage")||document.body, 2);
  }
  streakBump();                                // jede bearbeitete Karte zählt fürs Tagesziel
  if(sess.active) renderProgress();            // Fortschritt sofort sichtbar aktualisieren
}
/* ---------- Der Weg zum »sitzt« sichtbar machen ----------
   Ohne Anzeige sieht man nach der ersten Sitzung nur »0 sitzt« und hört auf. Deshalb
   zeigt jede Rückmeldung, auf welcher Stufe die Karte jetzt steht und wie viele
   richtige Antworten noch bis »sitzt« fehlen – jeder einzelne Schritt wird sichtbar. */
let lastStep = null;
/* Wie viele richtige Antworten fehlen noch bis Stufe 4? Der erste Treffer springt von
   »neu« gleich auf Stufe 2, deshalb nicht einfach 4−Stufe rechnen. */
function stepsLeft(box){ return box>=4 ? 0 : box<=1 ? 3 : 4-box; }
function stepHTML(boxOpt){
  const nach = boxOpt!=null ? boxOpt : (lastStep ? lastStep.nach : null);
  if(nach==null) return "";
  const neuFest = boxOpt==null && lastStep && lastStep.neuFest;
  const pips = [1,2,3,4,5].map(i=>`<i class="${i<=nach?(nach>=4?"on fest":"on"):""}"></i>`).join("");
  const rest = stepsLeft(nach);
  const txt = neuFest ? `<b>Sitzt!</b> Kommt jetzt nur noch selten dran.`
    : nach>=4 ? `Sitzt sicher – Stufe ${nach} von 5.`
    : nach<=0 ? `<b>Neu</b> · noch ${rest}× richtig bis <b>»sitzt«</b>`   // Audit: »Stufe 0 von 5« passte nicht zur Leiter, die mit »neu« beginnt
    : `Stufe ${nach} von 5 · noch ${rest}× richtig bis <b>»sitzt«</b>`;
  return `<div class="stepline${neuFest?" now":""}" title="Jede richtige Antwort bringt die Karte eine Stufe weiter; ab Stufe 4 gilt sie als sicher gemerkt und kommt nur noch selten dran.">
      <span class="pips">${pips}</span><span class="step-t">${txt}</span></div>`;
}

/* ---------- Lernserie + Tagesziel (Gewohnheits-Motor) ----------
   Ein Serientag zählt, sobald das Tagesziel erreicht ist (einstellbar, Standard
   20 Karten) – denn der Karteikasten wirkt nur bei regelmäßigem Üben; genau das
   wird belohnt. Global über alle Profile (EIN Lernender, EINE Gewohnheit).
   Speicher: pflanzenlernen.streak = {d:Datum, n:Karten heute, g:Ziel,
   s:Serie, b:Rekord, gd:letzter Zieltag}. */
const LS_STREAK = LS_PREFIX+"streak";
function streakLoad(){ try{ const s=JSON.parse(store.get(LS_STREAK)||"{}"); return (s&&typeof s==="object")?s:{}; }catch(e){ return {}; } }
function streakSave(s){ try{ store.set(LS_STREAK, JSON.stringify(s)); }catch(e){} }
function streakGoal(){ const g=+(streakLoad().g||0); return g>=5?g:20; }
function streakState(){                        // aufgeräumter Blick auf heute (Tageswechsel + gerissene Serie)
  const s=streakLoad(), t=todayISO();
  if(s.d!==t){ s.d=t; s.n=0; }
  if(s.gd && s.gd!==t && s.gd!==addDays(t,-1)) s.s=0;   // letzter Zieltag weder heute noch gestern → Serie gerissen
  return s;
}
function streakBump(){
  try{
    const s=streakState(), t=todayISO(), goal=streakGoal();
    s.n=(s.n||0)+1;
    if(s.n===goal && s.gd!==t){                // Tagesziel JETZT erreicht → Serientag
      s.s=(s.s||0)+1; s.b=Math.max(s.b||0, s.s); s.gd=t;
      streakSave(s);
      const stark = (s.s===7 || s.s===30 || s.s===100);   // Meilensteine groß feiern
      toast(`Tagesziel geschafft – Lernserie: ${s.s} ${s.s===1?"Tag":"Tage"}`);
      celebrate($("#stage")||document.body, stark?2:1);
      return;
    }
    streakSave(s);
  }catch(e){ /* Belohnung ist Kür */ }
}

/* ---------- Erfahrungspunkte + botanische Ränge ----------
   Didaktisches Prinzip: Je schwerer das Abrufen, desto mehr Punkte – Tippen
   (freies Erinnern) bringt doppelt so viel wie Ankreuzen, die Selbsteinschätzung
   der Karteikarte am wenigsten. Teilweise richtig gibt anteilig. Global über
   alle Profile (Key pflanzenlernen.xp = {x:Punkte, r:zuletzt gefeierter Rang}). */
const LS_XP = LS_PREFIX+"xp";
/* Rang = Punkte UND Lernstand (Rückmeldung: »Prachtexemplar« nach 20 sitzenden Arten und
   leerem Herbarium). Punkte messen Fleiß, nicht Können – jede Stufe verlangt deshalb
   zusätzlich, dass der Lernstand mitwächst: erst angefangene Arten, dann Arten, die wirklich
   »sitzen« (Box 4–5, also mehrere richtige Antworten über Tage; die Intervalle machen das
   bewusst langsam). Maßgeblich ist das am weitesten gediehene Profil – der Rang ist global,
   der Lernstand je Profil. Die Stufen werden nur der Reihe nach erreicht. */
const RANKS = [                                  // Gärtner-Laufbahn statt Level-Zahlen – jede Stufe erklärt sich selbst
  {n:"Keimling",          x:0,    d:"gerade aufgegangen – die ersten Punkte"},
  {n:"Sämling",           x:150,  d:"erste Blätter – du bist dabei",          g:{started:10}},
  {n:"Steckling",         x:500,  d:"schlägt Wurzeln – regelmäßig am Üben",   g:{fest:5}},
  {n:"Jungpflanze",       x:1200, d:"wächst kräftig – viele Namen sitzen",    g:{share:0.25}},
  {n:"Prachtexemplar",    x:2500, d:"voll entwickelt – kaum noch Lücken",     g:{share:0.6}},
  {n:"Meistergärtner/in", x:5000, d:"kennt sie alle – die höchste Stufe",     g:{share:0.9}}
];
const RANK_HOW = "Punkte gibt es für richtige Antworten: Selbst eingeben 10 · Auswahl 5 · Karteikarte 3 – plus Bonus ab drei Treffern in Folge. Höhere Ränge brauchen zusätzlich Arten, die wirklich sitzen – Punkte allein reichen nicht.";
const XP_BASE = { cards:3, quiz:5, type:10 };    // Karteikarte < Auswahl < freies Tippen
function xpLoad(){ try{ const o=JSON.parse(store.get(LS_XP)||"{}"); return (o&&typeof o==="object")?o:{}; }catch(e){ return {}; } }
function xpSave(o){ try{ store.set(LS_XP, JSON.stringify(o)); }catch(e){} }
function xpTotal(){ return Math.max(0, +(xpLoad().x||0)); }
function gateText(r){                            // Lernstand-Bedingung einer Stufe in Worten
  const g=r.g||{};
  if(g.started) return `${g.started} Arten angefangen`;
  if(g.fest)    return `${g.fest} Arten sitzen`;
  if(g.share)   return `${Math.round(g.share*100)} % der Arten sitzen`;
  return "";
}
function gateOk(r, m){
  const g=r.g||{};
  return (!g.started || m.started>=g.started) && (!g.fest || m.fest>=g.fest) && (!g.share || (m.n>0 && m.fest/m.n>=g.share));
}
function gatePct(r, m){                          // Fortschritt zur Lernstand-Bedingung (0–100)
  const g=r.g||{}; let q=1;
  if(g.started) q=m.started/g.started; else if(g.fest) q=m.fest/g.fest; else if(g.share) q=m.n ? (m.fest/m.n)/g.share : 0;
  return Math.max(0, Math.min(100, Math.round(q*100)));
}
function gateNeed(r, m){                         // was zum nächsten Rang am Lernstand noch fehlt ("" = erfüllt)
  const g=r.g||{};
  if(g.started && m.started<g.started) return `noch ${g.started-m.started} Arten anfangen`;
  if(g.fest && m.fest<g.fest){ const f=g.fest-m.fest; return `noch ${f} ${f===1?"Art muss":"Arten müssen"} sitzen`; }
  if(g.share && m.n>0 && m.fest/m.n<g.share){ const f=Math.ceil(g.share*m.n)-m.fest; return `noch ${f} ${f===1?"Art muss":"Arten müssen"} sitzen (${Math.round(g.share*100)} %)`; }
  if(g.share && !m.n) return `${Math.round(g.share*100)} % der Arten müssen sitzen`;
  return "";
}
function masteryOf(id){                          // Lernstand eines Profils: angefangen (Box ≥1), sitzt (Box ≥4), gesamt
  let prog = progress;
  if(id!==profileId){ try{ prog = JSON.parse(store.get(LS_PREFIX+"progress."+id)||"{}")||{}; }catch(e){ prog = {}; } }
  const n = ((typeof SEEDS!=="undefined" && SEEDS[id]) || []).length;
  let started=0, fest=0;
  Object.keys(prog||{}).forEach(k=>{ const b=+(prog[k]&&prog[k].box)||0; if(b>0) started++; if(b>=4) fest++; });
  return { id, n, started, fest, share: n ? fest/n : 0 };
}
const masteryCache = new Map();                  // andere Profile ändern sich in dieser Seite nicht – einmal rechnen (Profilwechsel leert)
function masteryReset(){ masteryCache.clear(); }
function masteryBest(){                          // das am weitesten gediehene Profil zählt
  let best = masteryOf(profileId);
  try{
    Object.keys(typeof SEEDS!=="undefined" ? SEEDS : {}).forEach(id=>{
      if(id===profileId) return;
      if(!masteryCache.has(id)) masteryCache.set(id, store.get(LS_PREFIX+"progress."+id)==null ? null : masteryOf(id));
      const m = masteryCache.get(id); if(!m) return;
      if(m.share>best.share || (m.share===best.share && (m.fest>best.fest || (m.fest===best.fest && m.started>best.started)))) best = m;
    });
  }catch(e){}
  return best;
}
function rankOf(xp, m){                          // m: Lernstand (Standard: bestes Profil)
  m = m || masteryBest();
  let i=0;
  for(let k=1;k<RANKS.length;k++){ if(xp>=RANKS[k].x && gateOk(RANKS[k], m)) i=k; else break; }   // nur der Reihe nach
  const cur=RANKS[i], next=RANKS[i+1]||null;
  const spanne = next ? next.x-cur.x : 1;
  const xpPct = next ? Math.min(100, Math.round(Math.max(0,xp-cur.x)/spanne*100)) : 100;
  return { i, name:cur.n, next:next?next.n:null, need:next?Math.max(0,next.x-xp):0,
           needText: next ? gateNeed(next, m) : "",
           pct: next ? Math.min(xpPct, gatePct(next, m)) : 100 };
}
function rankCheck(anchor){                      // Rang neu bestimmen – gestiegen (Punkte ODER Lernstand) → einmalig feiern
  try{
    const o=xpLoad(), i=rankOf(Math.max(0,+o.x||0)).i, r=+o.r||0;
    if(i>r){ o.r=i; xpSave(o); toast(`Neuer Rang: ${RANKS[i].n} – ${RANKS[i].d}`); celebrate(anchor||$("#stage")||document.body, 2); }
    else if(i<r){ o.r=i; xpSave(o); }           // gesunken (z. B. neue Regel): der nächste Aufstieg wird wieder gefeiert
  }catch(e){}
}
function xpAdd(n, anchor){                       // Punkte gutschreiben, Rangaufstieg feiern
  n = Math.max(0, Math.round(n||0));
  if(!n) return 0;
  try{
    const o=xpLoad(); o.x=(+o.x||0)+n; xpSave(o);
    rankCheck(anchor);
    if(sess.active) sess.xp=(sess.xp||0)+n;      // in der Sitzungsleiste mitzählen
  }catch(e){}
  return n;
}
/* Rangliste als echtes Popover (Top-Layer, Light-Dismiss + Esc kommen von der
   Plattform), am Rang-Namen verankert. Nur wenn Popover UND Anchor-Positioning
   können – sonst bleibt es beim erklärenden Tooltip, ohne toten Knopf. */
function canPopover(){
  try{ return ("popover" in HTMLElement.prototype) && window.CSS && CSS.supports("anchor-name: --a"); }
  catch(e){ return false; }
}
function rankRowsHTML(jetzt){                     // eine Zeile je Rang: Name · ab wie vielen Punkten · was er bedeutet
  return RANKS.map((r,i)=>{ const gt=gateText(r);
    return `<div class="rkp-row${i===jetzt?" on":""}"><span class="r-n">${esc(r.n)}</span><span class="r-x">ab ${r.x} P.${gt?` · ${esc(gt)}`:""}</span><span class="r-d">${esc(r.d||"")}</span></div>`; }).join("");
}
/* Dieselbe Laufbahn als Dialog – für Browser ohne Popover/Anchor-Positioning (der
   Rang-Knopf bleibt so nie tot; ein Tooltip ist am Handy unsichtbar). */
function openRankModal(){
  closeInfo();
  const xp=xpTotal(), m=masteryBest(), r=rankOf(xp, m), jetzt=r.i;
  const scrim = el("div","scrim"); scrim.id="infoScrim";
  scrim.innerHTML = `<div class="modal rankmodal" role="dialog" aria-modal="true" aria-label="Deine Laufbahn">
     <button class="modal-x" id="infoClose" aria-label="Schließen" title="Schließen">×</button>
     <div class="modal-head">
       <div class="mh-bot fam">Deine Laufbahn</div>
       <div class="mh-fam">${xp} Punkte · ${m.fest} von ${m.n} Arten sitzen · Rang: ${esc(RANKS[jetzt].n)}${r.next?` · bis ${esc(r.next)}: ${esc([r.need?`noch ${r.need} P.`:"", r.needText].filter(Boolean).join(" und ") || "gleich geschafft")}`:""}</div>
     </div>
     <div class="rkp-list">${rankRowsHTML(jetzt)}</div>
     <div class="famfoot">${esc(RANK_HOW)}</div>
   </div>`;
  document.body.appendChild(scrim); infoEl=scrim;
  scrim.addEventListener("click", e=>{ if(e.target===scrim) closeInfo(); });
  scrim.querySelector("#infoClose").onclick = closeInfo;
  document.addEventListener("keydown", infoKey);
  infoReturnFocus = document.activeElement;
  try{ scrim.querySelector("#infoClose").focus(); }catch(e){}
}
function wireRankPopover(){
  const chip=$("#rankName"); if(!chip) return;
  if(chip.tagName!=="BUTTON"){ chip.setAttribute("role","button"); chip.tabIndex=0; }
  chip.setAttribute("aria-label","Laufbahn ansehen: alle Ränge, was sie bedeuten und ihre Punktzahlen");
  if(!canPopover()){                             // kein Popover/Anchor: Übersicht als Dialog
    chip.onclick=openRankModal;
    chip.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openRankModal(); } };
    return;
  }
  let pop=$("#rankPop");
  if(!pop){
    pop=el("div"); pop.id="rankPop"; pop.setAttribute("popover","auto");
    document.body.appendChild(pop);
  }
  const m=masteryBest(), r=rankOf(xpTotal(), m), jetzt=r.i;
  pop.innerHTML = `<div class="rkp-h">Deine Laufbahn <span class="rkp-m">${m.fest} von ${m.n} Arten sitzen</span></div>`+rankRowsHTML(jetzt)+
    (r.next?`<div class="rkp-need">Bis ${esc(r.next)}: ${esc([r.need?`noch ${r.need} P.`:"", r.needText].filter(Boolean).join(" und ") || "gleich geschafft")}</div>`:"")+
    `<div class="rkp-f">${esc(RANK_HOW)}</div>`;
  const zeig=()=>{ try{ pop.togglePopover(); }catch(e){} };
  chip.onclick=zeig;
  chip.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); zeig(); } };
}
/* ---------- Sitzungs-Combo (Treffer in Folge) ----------
   Kein Zeitdruck – nur eine Serie richtiger Antworten innerhalb der Sitzung.
   Ab 3 in Folge gibt es Bonuspunkte, bei 5/10/15… ein größeres Feuerwerk.
   Nur in bewerteten Modi (Quiz, Tippen, Bilder) – bei der Karteikarte könnte
   man sich sonst durch »Gewusst« klicken. */
function comboBonus(n){ return n>=10 ? 8 : n>=5 ? 4 : n>=3 ? 2 : 0; }
function comboHit(ok, anchor){
  if(!scoreable()) return 0;                     // Karteikarten: keine Combo
  if(!ok){ sess.combo=0; return 0; }
  sess.combo=(sess.combo||0)+1;
  sess.comboMax=Math.max(sess.comboMax||0, sess.combo);
  const n=sess.combo, bonus=comboBonus(n);
  if(n>=5 && n%5===0){                           // 5er-Stufen: größere Feier + kräftigere Haptik
    celebrate(anchor||$("#fb")||document.body, 2);
    buzz([14,40,14,40,30]);
    toast(`${n} richtige in Folge! +${bonus} Punkte`);
  }
  return bonus;
}
/* Ein Treffer wird verbucht: Grundpunkte je Übungsform × Anteil + Combo-Bonus. */
function scoreHit(kind, ok, anteil, anchor){
  const base = XP_BASE[kind]||XP_BASE.quiz;
  const teil = Math.max(0, Math.min(1, anteil==null ? (ok?1:0) : anteil));
  const bonus = comboHit(ok, anchor);
  return xpAdd(base*teil + (ok?bonus:0), anchor);
}

/* ---------- Auswahl / Filter ---------- */
/* Lernstoff eingrenzen: alles, ein Thema (»t:…«) oder eine Pflanzenfamilie (»f:…«). */
function scopeOk(c, sel){
  if(!sel) return true;
  if(sel.slice(0,2)==="t:") return c.thema===sel.slice(2);
  if(sel.slice(0,2)==="f:") return famKey(c.fam)===sel.slice(2);
  return c.thema===sel;                                    // Altbestand: reiner Themenname
}
function pool(){
  const sel=$("#cat").value, zp=$("#onlyzp").checked;
  return allCards.filter(c=> scopeOk(c,sel) && (!zp||c.zp));
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

/* ---------- Abfragerichtung ----------
   Standard ist die Prüfungssituation: Man erkennt die Pflanze (ohne Bild ist der
   greifbarste Anker ihr deutscher Name) und nennt Gattung, Art und Familie.
   Wer den umgekehrten Weg üben will (botanischer Name → deutscher Name) oder im
   Bilder-Modus den deutschen Namen sucht, stellt das unter »Optionen · Abfrage«
   um. Art→Familie gibt es bewusst nicht – die Familie steht auf der Rückseite
   und wird über Liste + Familien-Steckbriefe vertieft. */
const DIRS = {
  de2bot : { label:"Deutscher Name → botanisch", prompt:"Deutscher Name",    answer:"Botanischer Name" },
  bot2de : { label:"Botanisch → deutscher Name", prompt:"Botanischer Name",  answer:"Deutscher Name"   },
  img2bot: { label:"Bild → botanischer Name",    prompt:"Bild",              answer:"Botanischer Name" },
  img2de : { label:"Bild → deutscher Name",      prompt:"Bild",              answer:"Deutscher Name"   },
  img2both:{ label:"Bild → voller Name (botanisch + deutsch)", prompt:"Bild", answer:"Voller Name"      }
};
const DIRS_TEXT  = ["de2bot","bot2de"];               // Karteikarten · Quiz · Selbst eingeben
const DIRS_PHOTO = ["img2bot","img2de","img2both"];   // Bilder-Quiz – Reihenfolge fest (Duell-Links)
/* Angeboten ≠ spielbar: Im Bilder-Quiz steht nur noch »Bild → voller Name« zur Wahl –
   eine Entscheidung weniger, und die Auswahl zeigt immer botanischen + deutschen Namen.
   Die älteren Richtungen bleiben SPIELBAR, damit bereits verschickte Duell-Links exakt
   dieselbe Aufgabe stellen; wählen kann man sie nicht mehr. */
function dirsFor(m){ return (m||mode)==="photo" ? ["img2both"] : DIRS_TEXT; }   // was das Auswahlfeld anbietet
function playableDirs(){                                // was die Engine spielen kann
  if(mode!=="photo") return DIRS_TEXT;
  return photoAnswer==="mc" ? DIRS_PHOTO : DIRS_PHOTO.filter(d=>d!=="img2both");  // »voller Name« braucht die 4 Auswahl-Optionen
}
function curDir(){                                 // gültige Richtung für den aktuellen Modus
  const d = mode==="photo" ? dirPhoto : dirText, ok = playableDirs();
  if(ok.includes(d)) return d;
  return ok.includes(dirsFor()[0]) ? dirsFor()[0] : ok[0];
}
const wantsBoth = () => curDir()==="img2both";                     // gesucht ist der volle Name (botanisch + deutsch)
const wantsDe = () => curDir()==="bot2de" || curDir()==="img2de";   // gesucht ist der deutsche Name
function famName(f){                              // "Fabaceae · Schmetterlingsblütler" (dt. Name aus Daten oder FAM_INFO)
  const lat=famKey(f); if(!lat) return f||"";
  const de=famGerman(f) || (FAM_INFO[lat] && FAM_INFO[lat].de) || "";
  return de ? lat+" · "+de : lat;
}
/* Platzhalter »'Sorte'« der GaLaBau-Listen (»Salvia nemorosa 'Sorte'« = die Art in
   irgendeiner Gartensorte; 25 Einträge) wird als »in Sorten« gezeigt – so schreibt die
   Fachwerker-Liste denselben Gedanken ohnehin (»Weigelie in Sorten«). Reine ANZEIGE
   (offengelegt): beim Eingeben gilt die Listenform weiter, das Prüfungswerkzeug zeigt
   sie unverändert. clean() streicht den Platzhalter beidseitig, deshalb zählt
   »Salvia nemorosa« exakt. */
function artShown(a){ return norm(String(a||"").replace(/\(?'Sorten?'\)?/i, "in Sorten")); }
const botName = c => norm(c.g+" "+artShown(c.a));
const fullName = c => botName(c)+" · "+deMain(c);   // voller Name: botanisch · deutsch (Bilder-Quiz »voller Name«)
// Abkürzungen, wie sie in den Quelllisten vorkommen → ausgeschriebene Anzeigeform
// (nur fürs Lern-Tool; das Prüfungswerkzeug zeigt den amtlichen Namen unverändert).
// Adjektive stehen als STAMM: die Endung richtet sich nach dem Geschlecht des Nomens
// (ohne Artikel: der → -er, die → -e, das → -es) – eine feste Endung ergab früher
// »Gewöhnliche Trompetenbaum« und »Amerikanische Blumen-Hartriegel«.
const DE_ADJ_ABBR = { gew:"Gewöhnlich", amerik:"Amerikanisch", austr:"Australisch",
  jap:"Japanisch", japan:"Japanisch", kriech:"Kriechend", einj:"Einjährig", "zurückgekr":"Zurückgekrümmt" };
const DE_ABBR = { treibh:"Treibhaus", strauchmarg:"Strauchmargerite" };
const ADJ_END = { m:"er", f:"e", n:"es" };
function deGenus(noun){                                    // Geschlecht nach dem letzten Wortteil
  const w = deacc(String(noun||"")).toLowerCase().split(/[-\s]/).filter(Boolean).pop() || "";
  if(/(chen|lein|kraut|gras|blatt)$/.test(w)) return "n";  // das Gänseblümchen, das Bohnenkraut
  if(/(nessel|heit|keit|ung|schaft|ion|ie|e)$/.test(w)) return "f";   // die Eiche, Melone, Heide
  return "m";                                              // der Baum, Salat, Rettich, Ysop, Hartriegel
}
function expandAbbr(s){
  s = String(s==null?"":s).replace(/[\[\]]/g," ");           // eckige Qualifier-Klammern raus
  s = s.replace(/\.(?=[A-Za-zÄÖÜäöüß])/g, ". ");              // fehlendes Leerzeichen nach Abk.-Punkt (»jap.Azalee«)
  const end = ADJ_END[deGenus(norm(s).split(" ").pop())];     // Kopfnomen = letztes Wort des Namens
  for(const k in DE_ADJ_ABBR)
    s = s.replace(new RegExp("\\b"+k+"\\.\\s*", "gi"), DE_ADJ_ABBR[k]+end+" ");
  for(const k in DE_ABBR)
    s = s.replace(new RegExp("\\b"+k+"\\.\\s*", "gi"), DE_ABBR[k]+" ");
  return norm(s);
}
// Erster VOLLSTÄNDIGER deutscher Name für Anzeige/Antwort. Wählt aus der
// klammerbereinigten Grundform und den von deForms() erkannten Vollformen die
// erste, die weder ein hängender Stamm (»Gew. Hain-«) noch eine blanke Abkürzung
// (»Treibh.«) ist, und schreibt Kürzel aus (»Gew.«→»Gewöhnliche«). So wird aus
// »Gurke (Freiland / Treibh.)« → »Gurke« und »Gew. Zucker-Melone« → »Gewöhnliche
// Zucker-Melone«, während »Krauser / gewöhnlicher Rhabarber« → »gewöhnlicher
// Rhabarber« erhalten bleibt.
function deMain(c){
  const letters = x => (String(x).match(/[A-Za-zÄÖÜäöüß]/g)||[]).length;
  const isAbbr  = s => /^[A-Za-zÄÖÜäöüß]{2,10}\.$/.test(String(s).trim());   // »Treibh.«, »Gew.«
  const reduce = raw => {                                   // ein Synonym → saubere Vollform (oder "")
    let s = norm(String(raw||"").replace(/[\[\]]/g," ").replace(/\s*\([^)]*\)\s*/g," "));   // Qualifier-Klammern raus
    if(s.includes("/")){                                    // geteiltes Grundwort/Alternativen: letzte Vollform
      const segs = s.split("/").map(norm).filter(Boolean);
      s = segs[segs.length-1] || s;
    }
    return /[-–]$/.test(s) ? "" : norm(s);                  // hängender Stamm (»Gew. Hain-«) → verwerfen
  };
  const ok = s => s && !isAbbr(s) && letters(s)>=3;
  const cands = (c.de||"").split(/[,;]/).map(reduce).filter(Boolean);
  const pick = cands.find(ok) || cands[0]
    || deForms(c).names.map(n=>norm(n)).find(ok)           // Fallback: von deForms aufgelöste Vollformen
    || norm((c.de||"").split(/[,;/]/)[0]) || "—";
  return expandAbbr(pick) || "—";
}
const deAll   = c => (c.de||"").split(/[,;]/).map(norm).filter(Boolean);   // Synonyme; »/«-Formen bleiben zusammen
function promptHTML(c){                            // Vorderseite (im Bilder-Modus steht dort das Bild)
  return wantsDe() ? `<i>${esc(botName(c))}</i>` : esc(c.de||"—");   // gefragt wird nach allen geführten Namen
}
function answerText(c){ return wantsBoth() ? fullName(c) : wantsDe() ? deMain(c) : botName(c); }
function answerLabel(){ return DIRS[curDir()].answer; }
function promptLabel(){ return DIRS[curDir()].prompt; }
/* Lösungszeile für Quiz/Tippen/Bilder: Gesuchtes zuerst, die andere Seite dahinter. */
function solutionLine(c){
  return wantsDe() ? esc(c.de||"—")+" · <i>"+esc(botName(c))+"</i>"      // alle geführten Synonyme zeigen
                   : "<i>"+esc(botName(c))+"</i>"+(c.de?" · "+esc(c.de):"");
}
/* Rückseite: die vollständige Identität, gefragte Seite ausgenommen. Botanische
   Werte kursiv (Gattung/Art/Synonyme), Familiennamen aufrecht. */
function answerMeta(c){
  const row=(lab,val,it)=>`<span class="mf"><b>${lab}</b>${it?"<i>"+esc(val)+"</i>":esc(val)}</span>`;
  const bits=[];
  if(wantsDe()){                                   // gesucht war der deutsche Name → botanische Seite steht schon vorne
    const weitere = deAll(c).slice(1);
    if(weitere.length) bits.push(row("Auch", weitere.join(", "), false));
  } else {
    if(c.g) bits.push(row("Gattung", c.g, true));
    if(c.a) bits.push(row("Art", artShown(c.a), true));
    if(mode==="photo" && deMain(c)) bits.push(row("Deutsch", c.de, false));
  }
  if(!examOnlyActive()){                          // im Prüfungsstoff-Modus (Fachwerker) Familie/Synonyme weglassen
    if(c.fam) bits.push(row("Familie", famName(c.fam), false));
    if(c.syn) bits.push(row("Syn.", c.syn, true));
  }
  return bits.join("");
}

/* ---------- Distraktoren fürs Quiz ---------- */
const atMemo = new Map();                              // Audit: answerText → deMain → expandAbbr lief je Frage für ALLE Karten (~10 RegExp je Aufruf)
function answerTextMemo(x){
  const k = String(curDir())+"|"+(wantsBoth()?1:0)+"|"+(examOnlyActive()?1:0);
  let m = atMemo.get(x); if(!m || m.k!==k){ m = { k, v:answerText(x) }; atMemo.set(x, m); }
  return m.v;
}
function distractors(c, n){
  const want = answerTextMemo(c).toLowerCase();
  // Im Bilder-Quiz keine Geschwister derselben Art anbieten (Tomate ↔ Kirschtomate):
  // Auf einem Foto wäre die Frage sonst auch mit perfektem Bild kaum zu entscheiden.
  const binom = searchName(c).toLowerCase();
  const ok = x => x.key!==c.key && answerTextMemo(x).toLowerCase()!==want
                  && (mode!=="photo" || searchName(x).toLowerCase()!==binom);
  const same = allCards.filter(x=>ok(x) && x.thema===c.thema);
  const rest = allCards.filter(ok);
  const picks=[]; const seen=new Set([want]);
  for(const src of [shuffle(same.slice()), shuffle(rest.slice())]){
    for(const x of src){ const t=answerTextMemo(x); const tl=t.toLowerCase(); if(!seen.has(tl)){ seen.add(tl); picks.push(t); if(picks.length>=n) return picks; } }
  }
  return picks;
}

/* ---------- Tippen: tolerante Prüfung ---------- */
function lev(a,b){ a=a||""; b=b||""; const m=a.length,n=b.length; if(!m)return n; if(!n)return m;
  const d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]); for(let j=0;j<=n;j++) d[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++){ const cost=a[i-1]===b[j-1]?0:1;
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+cost); } return d[m][n]; }
/* Eingaben normalisieren: Groß/Klein, Satzzeichen, Klammern und ALLE Varianten von
   Anführungszeichen (' ` ´ ‘ ’ „ “ ” ") sind egal – wer »Weigela x „Bristol Ruby“«
   tippt, meint Weigela 'Bristol Ruby'. Ebenso das Hybrid-Zeichen (× bzw. ein
   freistehendes x): ob jemand »Petunia × atkinsiana« oder »Petunia atkinsiana«
   schreibt, ist keine Frage der Pflanzenkenntnis. (Realfall: »x „Bristol Ruby“« gab
   Abzug, weil die Anführungszeichen und das x als Teil des Namens verglichen wurden.) */
const clean = s => norm(s).toLowerCase().replace(/×/g," ").replace(/[.,;:’'`´‘‚“”„"«»()\[\]]/g," ")
  .replace(/(^|\s)x(?=\s|$)/g," ")
  .replace(/\bin sorten\b|\bsorten?\b/g," ")                     // Platzhalter »'Sorte'« / »in Sorten« zählt nicht (Salvia nemorosa 'Sorte' = Salvia nemorosa)
  .replace(/\s+/g," ").trim();
/* Wie viel Tippfehler zählt noch als »richtig«?
   Früher waren zwei Zeichen erlaubt – damit ging »Bollensellerie« als
   *Knollensellerie* durch, und die Rechtschreibung war praktisch egal. Jetzt:
   **ein** Zeichen, und das erst ab fünf Buchstaben (kurze Namen wie *Acer* oder
   *Rosa* müssen sitzen); der **Anfangsbuchstabe muss stimmen** (ein falscher
   Wortanfang ist kein Vertipper, sondern ein anderes Wort).
   Alles knapp daneben landet nicht auf »falsch«, sondern auf »fast« (nearEnough)
   – mit der richtigen Schreibweise und einer Wiederholung in derselben Sitzung. */
function closeEnough(input, target){
  const a=clean(input), b=clean(target); if(!a || !b) return false;
  if(a===b) return true;
  if(b.length<5 || a[0]!==b[0]) return false;
  return lev(a,b)<=1;
}
/* Art-Epitheton ohne Sorten-/Rangzusatz gilt: »sativus« für »sativus var. niger«.
   Aber ganze Wörter – ein abgeschnittenes »sat« reicht nicht. */
function wordPrefixOk(input, full){
  const w=clean(full).split(" ").filter(Boolean), i=clean(input).split(" ").filter(Boolean);
  if(!i.length || i.length>=w.length) return false;
  return i.every((x,k)=>closeEnough(x, w[k]));
}
/* ---------- Antwort »wie in der Prüfung« ----------
   Statt einer Auswahl werden die Felder des Prüfungsbogens abgefragt – je
   Fachrichtung genau die, die dort bewertet werden (Fachwerker: Dt. Name +
   Gattung + Art; GaLaBau: Gattung + Art + Dt. Name; Produktion zusätzlich die
   Familie), samt Punkten. Welche Felder abgefragt werden, ist pro Profil
   einstellbar; die Spalten kommen aus PRINT_COLS – dieselbe Quelle wie für
   Druckliste und Prüfungsbogen. */
const nfmt = n => String(n).replace(".", ",");                        // 0.5 -> »0,5«
const FIELD_LABEL = { g:"Gattung", a:"Art", fam:"Familie", de:"Deutscher Name" };
const FIELD_ORDER = ["g","a","fam","de"];
const examCols  = () => PRINT_COLS[printFamily()];
const examPts   = k => { const c=examCols().find(x=>x[0]===k); return c?c[3]:1; };
const examLabel = k => { const c=examCols().find(x=>x[0]===k); return c?c[1]:(FIELD_LABEL[k]||k); };
function defaultExamFields(){ return examCols().map(c=>c[0]); }        // Standard = Bogen des Profils
function examFieldsKey(){ return LS_PREFIX+"examfields."+profileId; }
function loadExamFields(){
  let v=null;
  try{ v=JSON.parse(store.get(examFieldsKey())||"null"); }catch(e){ v=null; }
  examFields = (Array.isArray(v) && v.length && v.every(k=>FIELD_LABEL[k])) ? v : defaultExamFields();
}
function saveExamFields(){ try{ store.set(examFieldsKey(), JSON.stringify(examFields)); }catch(e){} }
function examFieldList(){                                             // Bogen-Reihenfolge, Rest hinten
  const order = examCols().map(c=>c[0]).concat(FIELD_ORDER);
  return order.filter((k,i)=> order.indexOf(k)===i && examFields.includes(k));
}
function fieldSolution(k,c){                                          // richtige Antwort zum Anzeigen
  if(k==="fam") return famName(c.fam);
  if(k==="de")  return c.de||"";
  if(k==="a")   return artShown(c.a);                                 // »'Sorte'« → »in Sorten«
  return c[k]||"";
}
/* ---------- Deutsche Namen: gültige Schreibweisen ----------
   Die Listen führen deutsche Namen in drei Mustern, die alle gelten müssen:
     1. Synonyme, mit Komma getrennt   »Hänge-Birke, Sand-Birke, Weiß-Birke«
     2. geteiltes Grundwort mit Bindestrich  »Knollen- / Gemüsefenchel«
        → Knollenfenchel UND Gemüsefenchel
     3. geteiltes Grundwort mit Adjektiv    »Krauser / gewöhnlicher Rhabarber«
        → »Krauser Rhabarber« und »gewöhnlicher Rhabarber«, aber »Krauser«
          allein ist kein Pflanzenname
   Zusätzlich gilt das **Grundwort allein** (»Rhabarber«), sofern es im Profil
   eindeutig ist – bei »Birke« oder »Ahorn« reicht es also nicht, weil die Liste
   mehrere führt. Muster 3 unterscheidet sich von Muster 1 (»Karotte / Möhre /
   Gelbe Rübe«, wo jeder Teil ein eigener Name ist) daran, ob das Vorderteil ein
   flektiertes Adjektiv ist; die Stämme dafür stehen in ADJ_STEMS (gegen alle
   Listen geprüft). */
const adjKey = w => deacc(String(w||"")).replace(/ß/g,"ss").toLowerCase();   // »größe« → »grosse«
const ADJ_STEMS = new Set(("gewöhnlich gemein echt wild kraus weiß gelb rot schwarz blau grün "+
  "braun grau silbrig bunt groß klein breit schmal spitz rund hoch niedrig kriechend hängend aufrecht "+
  "essbar giftig australisch westindisch isländisch japanisch chinesisch amerikanisch europäisch kanadisch "+
  "orientalisch mediterran gefüllt klebrig strahlig ewig dick dünn süß sauer scharf bitter einjährig "+
  "zweijährig ausdauernd stengellos stiellos wohlriechend duftend kahl rauhaarig behaart edel bekannt "+
  "gebräuchlich falsch stachelig dornig krautig staudig früh spät").split(" ").map(adjKey));
const ABBR = { "gew":"gewöhnliche", "einj":"einjähriges", "gemü":"Gemüse" };   // in den Listen vorkommende Kürzel
function looksAdjective(seg){
  const raw=norm(seg);
  if(/\.$/.test(raw)) return true;                       // »Gew.«, »Einj.« – Abkürzung, kein Name
  const w=clean(seg); if(!w || w.includes(" ")) return false;
  const st = adjKey(w);
  for(const end of ["er","es","en","em","e"])
    if(st.endsWith(end) && ADJ_STEMS.has(st.slice(0,-end.length))) return true;
  return ADJ_STEMS.has(st);
}
const flatName = t => clean(t).replace(/[-\s]/g,"");
function deHeads(name){                                   // Grundwort: letztes Wort, auch nach dem Bindestrich
  const t=clean(name).split(" "); const last=t[t.length-1]||"";
  const out=[last];
  if(last.includes("-")) out.push(last.split("-").pop());
  return out.filter(h=>h.length>=3);
}
function deForms(c){                                      // {names, prefixes, heads} – je Karte gemerkt
  if(c.__de) return c.__de;
  const names=[], prefixes=[], heads=new Set();
  const add=v=>{ v=norm(v).replace(/^[-\s]+|[-\s]+$/g,""); if(!v) return;
    names.push(v); deHeads(v).forEach(h=>heads.add(h));
    const x=expandAbbr(v); if(x && x!==v) names.push(x); };   // ausgeschriebene Anzeigeform gilt ebenfalls
  for(const part of (c.de||"").split(/[,;]/)){
    const withParens = /\(/.test(part)
      ? [part.replace(/[()]/g,""), part.replace(/\([^)]*\)/g,"")]   // »(Arznei-)Engelwurz«: mit und ohne
      : [part];
    for(const v of withParens){
      const segs=v.split("/").map(norm).filter(Boolean);
      if(segs.length<2){ add(v); continue; }
      const last=segs[segs.length-1];
      add(last);
      const head=last.split(" ").pop();
      for(const sg of segs.slice(0,-1)){
        if(/-$/.test(sg)){                                // geteiltes Grundwort – zur Prüfzeit aufgelöst
          const pre=sg.replace(/-$/,"");
          prefixes.push([pre,last]);
          deHeads(last).forEach(h=>heads.add(h));
        } else {
          add(sg+" "+head);                               // Adjektiv-Lesart: »Krauser Rhabarber«
          const ab=ABBR[clean(sg).replace(/\.$/,"")];
          if(ab) add(ab+" "+head);                        // »Gew. / Große Brennessel« → gewöhnliche Brennessel
          if(!looksAdjective(sg)) add(sg);                // eigenständiger Name: »Karotte«
        }
      }
    }
  }
  c.__de={ names, prefixes, heads:[...heads] };
  return c.__de;
}
let deHeadCount = new Map();                              // Grundwort → Zahl der Arten im Profil
function buildDeIndex(){
  deHeadCount = new Map();
  allCards.forEach(c=>{ new Set(deForms(c).heads).forEach(h=>deHeadCount.set(h,(deHeadCount.get(h)||0)+1)); });
}
function checkDeName(input, c){
  const inp=flatName(input); if(!inp) return false;
  const f=deForms(c);
  if(f.names.some(v=> closeEnough(input,v) || closeEnough(inp, flatName(v)))) return true;
  for(const [pre,last] of f.prefixes){                    // »Knollen-…fenchel«: Vorderteil + Endung des Grundworts
    const cands=[flatName(pre)]; const w=norm(pre).split(" ").pop(); if(w) cands.push(flatName(w));
    for(const p of cands){
      if(!p || !inp.startsWith(p)) continue;
      const rest=inp.slice(p.length);
      if(rest.length>=4 && flatName(last).endsWith(rest)) return true;
    }
  }
  // Grundwort allein – nur wenn im Profil keine zweite Art dasselbe Grundwort trägt
  return f.heads.some(h=> (deHeadCount.get(h)||0)<=1 && (closeEnough(input,h) || closeEnough(inp, flatName(h))));
}
function fieldOk(k, input, c){                                        // tippfehlertolerant, je Feld passend
  const v=clean(input); if(!v) return false;
  if(k==="g")  return closeEnough(input, c.g);
  if(k==="a")  return !norm(c.a) || closeEnough(input, c.a) || wordPrefixOk(input, c.a);
  if(k==="de") return checkDeName(input, c);
  if(k==="fam"){                                                      // lateinisch ODER deutsch zählt
    const lat=famKey(c.fam), de=famGerman(c.fam) || (FAM_INFO[lat]&&FAM_INFO[lat].de) || "";
    return (!!lat && (closeEnough(input, lat) || closeEnough(input, famLatin(c.fam)))) ||
           (!!de  && closeEnough(input, de));
  }
  return false;
}
function fieldJudge(k, input, c){                                     // "ok" | "near" (Schreibfehler) | "no"
  if(fieldOk(k, input, c)) return "ok";
  if(!clean(input)) return "no";
  if(k==="de") return deForms(c).names.some(n=>nearEnough(input, n)) ? "near" : "no";
  if(k==="fam"){
    const lat=famLatin(c.fam), de=famGerman(c.fam) || (FAM_INFO[famKey(c.fam)]&&FAM_INFO[famKey(c.fam)].de) || "";
    return (nearEnough(input, lat) || (de && nearEnough(input, de))) ? "near" : "no";
  }
  return nearEnough(input, k==="g" ? c.g : c.a) ? "near" : "no";
}
function checkTyped(input, c){
  if(wantsDe()) return checkDeName(input, c);   // deutscher Name: jede geführte Schreibweise
  // Gattung + Art getrennt prüfen (tippfehlertolerant)
  const parts=clean(input).split(" ");
  const gi=parts.shift()||""; const ai=parts.join(" ");
  const gOk=closeEnough(gi, c.g);
  const aOk = !norm(c.a) || closeEnough(ai, c.a) || wordPrefixOk(ai, c.a);
  return gOk && aOk;
}

/* ---------- »Fast richtig« statt »falsch« ----------
   Wer *Weigelia* statt *Weigela* schreibt, weiß die Pflanze – nur die Schreibung
   sitzt noch nicht. Ein hartes »Falsch« entmutigt und sagt nichts; deshalb drei
   Stufen: **richtig** (zählt, bei Tippfehler wird die saubere Schreibweise
   gezeigt), **fast** (zählt nicht als Treffer, kommt aber gleich wieder – mit der
   richtigen Form und der Stelle, die abweicht) und **noch nicht**. Immer wird die
   korrekte Antwort sofort mitgeliefert; die Abweichung ist markiert, weil das Auge
   sie so behält. Was schon stimmte, wird zuerst genannt (»Gattung stimmt«) –
   Teilwissen anzuerkennen hält bei der Stange und entspricht der Prüfung, die
   Gattung und Art ebenfalls getrennt bewertet. */
function nearEnough(input, target){                     // knapp daneben (grober Tippfehler)
  const a=clean(input), b=clean(target);                // »richtig« deckt schon 1–2 Zeichen ab (closeEnough)
  if(!a || !b) return false;
  return lev(a,b) <= Math.max(2, Math.round(b.length*0.4));
}
function judgeTyped(input, c){                          // {lvl:"ok"|"near"|"no", exact?, hint?}
  const soll = answerText(c);
  if(checkTyped(input, c)) return { lvl:"ok", exact: clean(input)===clean(soll) };
  if(wantsDe())
    return deForms(c).names.some(n=>nearEnough(input, n)) ? { lvl:"near" } : { lvl:"no" };
  const parts=clean(input).split(" ").filter(Boolean);
  if(parts.length && closeEnough(parts[0], c.g))        // Gattung sitzt, Art noch nicht
    return { lvl:"near", hint:"Gattung stimmt" };
  return nearEnough(input, soll) ? { lvl:"near" } : { lvl:"no" };
}
function markDiff(right, typed){                        // abweichende Stelle in der richtigen Antwort markieren
  const a=norm(right||""), b=norm(typed||"");
  const la=a.toLowerCase(), lb=b.toLowerCase();
  let p=0; while(p<la.length && p<lb.length && la[p]===lb[p]) p++;
  let s=0; while(s<la.length-p && s<lb.length-p && la[la.length-1-s]===lb[lb.length-1-s]) s++;
  const mid=a.slice(p, a.length-s);
  if(mid) return esc(a.slice(0,p)) + `<u class="dif">${esc(mid)}</u>` + esc(a.slice(a.length-s));
  if(la===lb) return esc(a);
  const i=Math.max(0, Math.min(a.length-1, p-1));       // zu viel getippt: Stelle trotzdem zeigen
  return esc(a.slice(0,i)) + `<u class="dif">${esc(a.slice(i,i+1))}</u>` + esc(a.slice(i+1));
}
function typeFeedback(j, c, typed){                     // Rückmeldungstext zu einer Eingabe
  const soll = answerText(c);
  if(j.lvl==="ok")
    return (j.exact ? `<span class="good">Richtig!</span> `
                    : `<span class="good">Richtig!</span> <span class="sol">Schreibweise: <b>${markDiff(soll, typed)}</b> · </span>`)+
           `<span class="sol">${solutionLine(c)}</span>`;
  if(j.lvl==="near")
    return `<span class="near">Fast!</span> <span class="sol">${j.hint?esc(j.hint)+" · ":""}`+
           `richtig wäre <b>${markDiff(soll, typed)}</b> – die Karte kommt gleich noch einmal.</span>`;
  return `<span class="bad">Noch nicht.</span> <span class="sol">${solutionLine(c)}</span>`;
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
       <span title="Sicher gemerkt – Box 4–5. Kommt nur noch selten dran.">
         <i class="b-fest" style="background:var(--green)"></i>${fest} sitzt</span>
       <span title="In Arbeit – Box 1–3. Wird gerade wiederholt.">
         <i class="b-lern" style="background:var(--gold)"></i>${lern} am Lernen</span>
       <span title="Noch nie bewertet.">
         <i class="b-neu" style="background:var(--rule-strong)"></i>${neu} neu</span>
       <button class="legend-i" id="btnHow" aria-label="So wächst dein Fortschritt" title="So wächst dein Fortschritt – die fünf Stufen erklärt">${ico("info")}</button>
     </div>
     ${(()=>{ const st=streakState(), goal=streakGoal(), done=Math.min(st.n||0, goal);
       rankCheck();                                                  // Aufstieg auch durch den Lernstand (eine Art mehr »sitzt«)
       const xp=xpTotal(), r=rankOf(xp);
       const bis = r.next ? ` · bis ${esc(r.next)}: ${esc([r.need?`noch ${r.need} P.`:"", r.needText].filter(Boolean).join(" und ") || "gleich geschafft")}` : "";
       // EINE kompakte Chip-Zeile statt drei Textzeilen: Serie · Tagesziel · Rang · Herbarium
       return `<div class="statusrow" id="streakRow">
         <span class="chip flamechip${(st.s||0)>0?" on":""}" title="Lernserie: an so vielen Tagen in Folge hast du dein Tagesziel erreicht. Rekord: ${st.b||0} ${(st.b||0)===1?"Tag":"Tage"}.">
           <span class="sflame${(st.s||0)>0?" on":""}">${ico("flame")}<b>${st.s||0}</b></span></span>
         <span class="chip goalchip" title="Heute bearbeitete Karten – ab dem Tagesziel (${goal}) zählt der Tag für die Serie. Einstellbar unter Optionen.">
           <span class="ring" style="--p:${Math.round(done/goal*100)}"></span><span class="sr-n">${done}/${goal} heute</span></span>
         <button class="chip rankchip" id="rankName" title="Rang aus Punkten und Lernstand – höhere Stufen brauchen Arten, die wirklich sitzen. ${xp} P.${bis}">
           ${ico("sprout")}<span class="rk-name">${esc(r.name)}</span><i class="rk-mini"><b style="width:${r.pct}%"></b></i></button>
         <button class="chip" id="btnHerb" title="Deine Themen-Sammlung: Jedes gemeisterte Thema legt eine gepresste Pflanze ins Herbarium.">${ico("leaf")}Herbarium</button>
       </div>`; })()}`;
  wireRankPopover();
  const hb=$("#btnHerb"); if(hb) hb.onclick=openHerbarium;
  const bh=$("#btnHow"); if(bh) bh.onclick=openHowModal;
  const due = p.filter(c=>{ const pr=pget(c.key); return !pr.box || !pr.due || pr.due<=todayISO(); }).length;
  const wie = mode==="photo" ? (photoAnswer==="exam" ? "wie in der Prüfung" : DIRS[curDir()].label+" · "+phLabel(photoAnswer))
                            : DIRS[curDir()].label;
  $("#startHint").textContent = p.length ? `${due} Karten heute dran · ${wie}` : "Keine Arten in der aktuellen Auswahl.";
  $("#btnStart").disabled = !p.length;
  const hasProg = p.some(c=>pget(c.key).box);
  const go=$("#btnGo");
  if(go){ go.disabled = !p.length; go.textContent = hasProg ? "Weiter lernen" : "Loslegen"; }
  const gh=$("#goHint");
  if(gh) gh.innerHTML = p.length ? `${ico("cards")}<b>${due}</b> heute dran` : "Keine Arten in der aktuellen Auswahl.";
}

/* ---------- Kleine Belohnung: Feuerwerk + Haptik bei einem Treffer ----------
   Reines CSS/JS, keine Bibliothek: Blättchen, Blüten und goldene Funken bersten
   in zwei Phasen auseinander (schneller Burst, dann Fallen mit Drall), dazu ein
   kurzer Licht-Ring am Auslöser und – wo das Gerät es kann (Android) – ein
   feiner Vibrations-Tick. Stärke 1 = Treffer, 2 = Sitzung/Duell gewonnen
   (größerer Burst + zweite Welle). Wer im System »weniger Bewegung« eingestellt
   hat, bekommt nichts (prefers-reduced-motion); Haptik bleibt (kein Motion). */
const CONF_COLORS = ["#3d6b4d","#7aa87f","#c8a24a","#9c3b2e","#2b4f38","#e0c56e"];
function buzz(pattern){                                // Haptik – still ignoriert, wo es keine gibt (iOS/Desktop)
  try{ if(navigator.vibrate) navigator.vibrate(pattern); }catch(e){}
}
function celebrate(anchor, strength){
  try{
    buzz(strength>1 ? [18,60,18,60,45] : 12);          // Dopamin auch ohne Bild – dezent, treffergebunden
    if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
    const x = r && r.width ? r.left + r.width/2 : innerWidth/2;
    const y = r && r.height ? r.top + r.height/2 : innerHeight/3;
    const host = el("div","conf-host");
    const ring = el("i","conf-ring");                  // kurzer Licht-Ring am Auslöser
    ring.style.left = x+"px"; ring.style.top = y+"px";
    host.appendChild(ring);
    const wave = (count, spread, delay0) => {
      for(let i=0;i<count;i++){
        const kind = i%5===4 ? "conf c-spark" : (i%3===2 ? "conf c-petal" : "conf");
        const s = el("i",kind);
        const ang = (Math.PI*2*i)/count + Math.random()*0.6;
        const dist = spread * (0.45+Math.random());
        s.style.left = x+"px"; s.style.top = y+"px";
        s.style.setProperty("--dx", Math.cos(ang)*dist+"px");
        s.style.setProperty("--dy", (Math.sin(ang)*dist*0.8 - 60)+"px");
        s.style.setProperty("--fall", Math.round(70+Math.random()*120)+"px");
        s.style.setProperty("--rot", Math.round(Math.random()*900-450)+"deg");
        s.style.setProperty("--del", (delay0+Math.random()*0.14).toFixed(2)+"s");
        s.style.setProperty("--dur", (0.95+Math.random()*0.65).toFixed(2)+"s");
        s.style.setProperty("--s", (0.7+Math.random()*0.7).toFixed(2));
        s.style.background = CONF_COLORS[i%CONF_COLORS.length];
        host.appendChild(s);
      }
    };
    wave(strength>1 ? 40 : 22, strength>1 ? 190 : 110, 0);
    if(strength>1) wave(24, 140, 0.18);                // zweite Welle beim großen Erfolg
    document.body.appendChild(host);
    setTimeout(()=>host.remove(), strength>1 ? 2200 : 1700);
  }catch(e){ /* Animation ist Kür – nie ein Grund für einen Fehler */ }
}

/* ---------- Zeitmessung (Denkzeit) ----------
   Gezählt wird nur die reine Antwortzeit: Die Uhr läuft, sobald die Frage fertig
   auf dem Schirm steht (im Bilder-Quiz also erst NACH dem Laden des Bildes), und
   stoppt mit dem Abschicken der Antwort. Warten auf die Leitung und das Lesen der
   Lösung zählen nicht mit – nur so ist der Vergleich im Lernduell fair, egal wie
   schnell die Verbindung ist. Läuft nur in den bewerteten Modi (Quiz, Tippen,
   Bilder); Karteikarten bewerten sich selbst und bleiben ohne Uhr. */
function fmtDur(ms){
  const s = Math.max(0, Math.round(ms/1000));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), r = s%60;
  const mm = h ? String(m).padStart(2,"0") : String(m);
  return (h ? h+":" : "") + mm + ":" + String(r).padStart(2,"0");
}
function clockStart(){ if(scoreable() && sess.active) qStart = Date.now(); }
function clockStop(){ if(qStart){ sess.ms = (sess.ms||0) + (Date.now()-qStart); qStart = 0; } }
function clockNow(){ return (sess.ms||0) + (qStart ? Date.now()-qStart : 0); }
function clockTick(){ const e=$("#sclockT")||$("#sclock"); if(e) e.textContent = fmtDur(clockNow()); }
function clockRun(on){
  if(clockTimer){ clearInterval(clockTimer); clockTimer=null; }
  if(on) clockTimer = setInterval(clockTick, 1000);
}

/* ---------- Ergebnis teilen · Lernduell (Herausforderung) ----------
   Eine abgeschlossene Quiz-/Tipp-Sitzung lässt sich als Herausforderung teilen:
   Profil, Modus und die EXAKTE Kartenauswahl (als Indizes in
   cardsFor(profil)) plus das erreichte Ergebnis werden kompakt base64-kodiert an
   die URL gehängt (#c=…). Wer den Link öffnet, bekommt genau dieselben Karten und
   Fragen und versucht, die Trefferquote zu schlagen. Alles offline – kein Netz-
   abruf; geteilt wird per Web-Share (mobil inkl. WhatsApp), WhatsApp-Deeplink
   (wa.me, neuer Tab) oder Link-Kopieren. */
function b64urlEnc(obj){                  // Altformat (v1): lesbares JSON – nur noch zum Lesen alter Links
  const s = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  return s.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function b64urlDec(s){
  try{ s=String(s).replace(/-/g,"+").replace(/_/g,"/"); while(s.length%4) s+="=";
    return JSON.parse(decodeURIComponent(escape(atob(s)))); }catch(e){ return null; }
}

/* ---------- Kodierung der Herausforderung (kompakt · nicht im Klartext) ----------
   Früher stand die Sitzung als lesbares JSON im Link (»…"s":8,"t":10…«) – wer den
   Link vor dem Verschicken aufmachte, konnte sein Ergebnis in zehn Sekunden
   hochschrauben. Jetzt werden die Angaben binär gepackt, verwürfelt und mit einer
   Prüfsumme versehen: im Link stehen keine lesbaren Zahlen mehr, jede geänderte
   Stelle fällt auf, und der Link wird nebenbei rund fünfmal kürzer.
   Ehrlich gesagt: Einen echten Fälschungsschutz kann es ohne Server nicht geben –
   der Code liegt im Browser jedes Nutzers. Es verhindert das schnelle Schummeln,
   nicht den entschlossenen Bastler.
   Reihenfolge der drei Tabellen NICHT ändern – sonst zeigen alte Links ins Leere. */
const CH_PROFILES = [
  "baumschule_gaertner","baumschule_fachwerker",
  "friedhofsgaertnerei_gaertner","friedhofsgaertnerei_fachwerker",
  "garten_und_landschaftsbau_gaertner","garten_und_landschaftsbau_fachwerker",
  "gemuesebau_gaertner","gemuesebau_fachwerker",
  "obstbau_gaertner","obstbau_fachwerker",
  "staudengaertnerei_gaertner","staudengaertnerei_fachwerker",
  "zierpflanzenbau_gaertner","zierpflanzenbau_fachwerker"];
const CH_MODES = ["quiz","type","photo","guided"];   // 3 = geführte Lektion (gemischte Übungsformen)
const CH_DIRS  = ["de2bot","bot2de","img2bot","img2de"];   // nur noch zum LESEN alter v2-Links
/* v3: Die Richtung wird je Modus gezählt (Text: 2, Bild: 3 Möglichkeiten) – so passt
   auch »Bild → voller Name« (img2both) in die zwei Bit, die im Kopfbyte frei sind.
   In v2 war der Index global über CH_DIRS, deshalb fiel img2both dort heraus und die
   Herausforderung kam beim Empfänger als »nur botanisch« an. Zusätzlich wandert bei
   Bild-Lektionen die Antwortart mit (Auswahl/Tippen/wie in der Prüfung) – sonst ist
   es nicht dieselbe Aufgabe. Die geführte Lektion (»Weiter lernen«) mischt die
   Übungsformen je Karte – die wandern als 2 Bit pro Karte mit (CH_FORMS), sonst
   wäre sie gar nicht teilbar. Reihenfolge von DIRS_TEXT, DIRS_PHOTO, CH_PHA und
   CH_FORMS ebenfalls NICHT mehr ändern. */
const CH_DIR3  = { quiz:DIRS_TEXT, type:DIRS_TEXT, photo:DIRS_PHOTO, guided:DIRS_TEXT };
const CH_PHA   = ["mc","type","exam"];
const CH_FORMS = ["cards","quiz","photo","type"];
const CH_VER   = 3;

function vPut(out, n){                     // Varint: kleine Zahlen = ein Byte
  n = Math.max(0, Math.round(n));
  while(n > 127){ out.push((n & 127) | 128); n = Math.floor(n/128); }
  out.push(n);
}
function vGet(b, st){
  let n=0, sh=1;
  for(;;){ if(st.i>=b.length) throw 0; const x=b[st.i++]; n += (x & 127)*sh; if(!(x & 128)) break; sh *= 128; }
  return n;
}
function chSum(b, len){                    // FNV-1a, 16 Bit – erkennt jede Handänderung
  let h = 0x811c;
  for(let i=0;i<len;i++){ h ^= b[i]; h = (h*0x0193) & 0xffff; }
  return h;
}
function chMask(b){                        // Verwürfeln (symmetrisch): kein lesbares Muster im Link
  let x = 0x9e3779b9, out = new Uint8Array(b.length);
  for(let i=0;i<b.length;i++){ x = (Math.imul(x,1664525) + 1013904223) >>> 0; out[i] = b[i] ^ ((x>>>24) & 255); }
  return out;
}
function bytesToB64url(b){
  let s=""; for(let i=0;i<b.length;i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function b64urlToBytes(s){
  s = String(s).replace(/-/g,"+").replace(/_/g,"/"); while(s.length%4) s+="=";
  const bin = atob(s), a = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) a[i] = bin.charCodeAt(i);
  return a;
}
function chEncode(o){
  const pi = CH_PROFILES.indexOf(o.p), mi = Math.max(0, CH_MODES.indexOf(o.m));
  const dirs = CH_DIR3[o.m] || DIRS_TEXT, di = Math.max(0, dirs.indexOf(o.r));
  const out = [CH_VER, ((pi<0?15:pi)<<4) | (mi<<2) | di];
  if(pi<0){ const s=unescape(encodeURIComponent(o.p||"")); vPut(out,s.length); for(let i=0;i<s.length;i++) out.push(s.charCodeAt(i) & 255); }
  // Antwortart gehört zur Aufgabe; bei der geführten Lektion zusätzlich die
  // Bild-Richtung (sie hat ja Bild- UND Textkarten) – beides in einem Byte.
  if(o.m==="photo") out.push(Math.max(0, CH_PHA.indexOf(o.a||"mc")));
  else if(o.m==="guided") out.push((Math.max(0, CH_PHA.indexOf(o.a||"mc"))<<2) | Math.max(0, DIRS_PHOTO.indexOf(o.rp||"img2bot")));
  const idx = o.i||[];
  vPut(out, idx.length); idx.forEach(n=>vPut(out,n));
  if(o.m==="guided"){                                   // Übungsform je Karte, 4 Karten pro Byte
    const f = o.f||[];
    for(let k=0;k<idx.length;k+=4){
      let b=0;
      for(let j=0;j<4;j++) b |= (Math.max(0, CH_FORMS.indexOf(f[k+j]||"quiz")) << (j*2));
      out.push(b);
    }
  }
  vPut(out, o.s||0); vPut(out, o.t||0); vPut(out, o.z||0);
  const nm = unescape(encodeURIComponent((o.n||"").slice(0,40)));
  vPut(out, nm.length); for(let i=0;i<nm.length;i++) out.push(nm.charCodeAt(i) & 255);
  const body = Uint8Array.from(out), sum = chSum(body, body.length);
  const all = new Uint8Array(body.length+2);
  all.set(body); all[body.length] = sum & 255; all[body.length+1] = sum >>> 8;
  return bytesToB64url(chMask(all));
}
function chDecode(s){
  try{
    const raw = chMask(b64urlToBytes(s));
    const ver = raw[0];
    if(raw.length>=4 && (ver===3 || ver===2)){           // v2 weiterhin lesen – geteilte Links bleiben gültig
      const n = raw.length-2, sum = chSum(raw, n);
      if(((sum & 255)===raw[n]) && ((sum>>>8)===raw[n+1])){
        const st={i:2}, head=raw[1], pi=head>>>4;
        let p;
        if(pi===15){ const len=vGet(raw,st); let t=""; for(let k=0;k<len;k++) t+=String.fromCharCode(raw[st.i++]); p=decodeURIComponent(escape(t)); }
        else p = CH_PROFILES[pi] || "";
        const m = CH_MODES[(head>>>2)&3] || "quiz";
        let a = "mc", rp = "img2bot";
        if(ver===3 && m==="photo") a = CH_PHA[raw[st.i++]] || "mc";
        else if(ver===3 && m==="guided"){ const b=raw[st.i++]; a = CH_PHA[(b>>>2)&3]||"mc"; rp = DIRS_PHOTO[b&3]||"img2bot"; }
        const cnt=vGet(raw,st), i=[];
        for(let k=0;k<cnt;k++) i.push(vGet(raw,st));
        let f = null;
        if(ver===3 && m==="guided"){                     // Übungsform je Karte, 4 pro Byte
          f=[];
          for(let k=0;k<cnt;k+=4){ const b=raw[st.i++];
            for(let j=0;j<4 && k+j<cnt;j++) f.push(CH_FORMS[(b>>>(j*2))&3]||"quiz"); }
        }
        const sc=vGet(raw,st), t=vGet(raw,st), z=vGet(raw,st);
        const nl=vGet(raw,st); let nm="";
        for(let k=0;k<nl;k++) nm += String.fromCharCode(raw[st.i++]);
        const dirs = CH_DIR3[m] || DIRS_TEXT;
        const r = ver===3 ? (dirs[head&3] || dirs[0]) : (CH_DIRS[head&3] || "de2bot");
        const o = { v:ver, p, m, r, a, rp, f, i, s:sc, t, z, n:decodeURIComponent(escape(nm)) };
        return chPlausible(o) ? o : null;
      }
    }
  }catch(e){ /* kein neues Format – unten das alte versuchen */ }
  const old = b64urlDec(s);                       // v1-Links (lesbares JSON) weiterhin annehmen
  return old && chPlausible(old) ? old : null;
}
function chPlausible(o){                          // grober Unsinn (mehr richtig als gefragt …) fliegt raus
  return !!o && typeof o.p==="string" && Array.isArray(o.i) && o.i.length>0
      && o.i.every(n=>Number.isInteger(n) && n>=0)
      && Number.isFinite(o.s) && Number.isFinite(o.t) && o.s>=0 && o.t>0 && o.s<=o.t;
}
function duelName(v){                    // Name des Herausforderers (optional, im Browser gemerkt)
  if(v!=null) store.set(LS_PREFIX+"name", String(v).slice(0,40));
  return store.get(LS_PREFIX+"name") || "";
}
function sessAcc(){ return sess.done ? Math.round(sess.correct/sess.done*100) : 0; }
function scoreable(){ return mode==="quiz" || mode==="type" || mode==="photo"; }   // nur Modi mit echter Trefferquote
function frNameOf(pid){ const s=(pid.match(/^(.*)_(gaertner|fachwerker)$/)||[])[1]; return FR_LIST.find(f=>slug(f)===s)||""; }
function nivNameOf(pid){ return /_fachwerker$/.test(pid)?"Fachwerker/in":"Gärtner/in"; }

function challengeURL(){                  // aktuelle Sitzung als Herausforderungs-Link kodieren
  const idx = (sess.cards||[]).map(c=>allCards.indexOf(c)).filter(i=>i>=0);
  const auto = !!sess.auto;
  // z = Denkzeit in Sekunden; ältere Links ohne z werden weiterhin verstanden.
  // Seit v3 wandern Richtung (auch »voller Name«) und die Antwortart des Bilder-Quiz
  // mit – sonst bekäme der Herausgeforderte eine andere Aufgabe als man selbst.
  // Die geführte Lektion wird als eigener Modus geteilt: die Übungsform je Karte
  // fährt mit, gezählt wird über die BEWERTETEN Karten (Karteikarten geben keine Quote).
  const payload = { v:CH_VER, p:profileId, m: auto ? "guided" : mode,
                    r: auto ? dirText : curDir(), a:photoAnswer, rp: dirPhoto,
                    f: auto ? (sess.cards||[]).map(c=>(sess.formOf&&sess.formOf.get(c))||"quiz") : null,
                    i:idx, s:sess.correct, t: auto ? (sess.scored||0) : sess.done,
                    z:Math.round((sess.ms||0)/1000), n:duelName() };
  return location.href.split("#")[0] + "#c=" + chEncode(payload);
}
function chModeLabel(m){
  return m==="quiz" ? "Quiz" : m==="photo" ? "Bilder-Quiz" : m==="guided" ? "Geführte Lektion" : "Selbst eingeben";
}
function duelMessage(url){
  const who = duelName().trim();
  const auto = !!sess.auto;
  const modeLabel = chModeLabel(auto ? "guided" : mode);
  const fr = frNameOf(profileId);
  const zeit = sess.ms ? ` in ${fmtDur(sess.ms)} min` : "";
  const von = auto ? (sess.scored||0) : sess.done;
  const quote = von ? Math.round(sess.correct/von*100) : 0;
  return `Pflanzen-Lernduell (${modeLabel}${fr?" · "+fr:""})\n`+
    `${who?who+" hat":"Ich habe"} ${sess.correct} von ${von} richtig (${quote} %)${zeit}. Schaffst du mehr?\n`+
    `Gleiche Karten, gleiche Fragen – tippe den Link:\n${url}`;
}
function shareChallenge(){
  const url = challengeURL(), msg = duelMessage(url);
  if(navigator.share){ navigator.share({ title:"Pflanzen-Lernduell", text:msg }).catch(()=>{}); return; }
  whatsappChallenge(url, msg);            // kein Web-Share (Desktop): WhatsApp-Deeplink öffnen
}
function whatsappChallenge(url, msg){
  url = url || challengeURL(); msg = msg || duelMessage(url);
  window.open("https://wa.me/?text="+encodeURIComponent(msg), "_blank", "noopener");
}
function copyChallengeLink(){
  const url = challengeURL();
  const done = ()=>toast("Link kopiert – jetzt verschicken");
  if(navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(url).then(done, ()=>fallbackCopy(url,done));
  else fallbackCopy(url,done);
}
function fallbackCopy(text, done){
  try{ const ta=el("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0";
    document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand("copy"); ta.remove(); done&&done(); }
  catch(e){ toast("Kopieren nicht möglich – Link manuell markieren",true); }
}
function shareBlockHTML(primaryLabel){
  const name = esc(duelName());
  return `<div class="shareblock" id="shareBlock">
    <p class="share-h">Fordere jemanden heraus oder gib einfach mit deinem Wissen an</p>
    <p class="share-sub">Verschick genau diese Lektion – gleiche Karten, gleiche Fragen. Wer den Link öffnet, versucht deine Trefferquote zu schlagen (bei Gleichstand zählt die Denkzeit) und kann dir sein Ergebnis zurückschicken.</p>
    <input id="duelName" class="duel-name" type="text" maxlength="40" placeholder="Dein Name (optional)" value="${name}" aria-label="Dein Name für die Herausforderung">
    <div class="share-btns">
      <button class="btn primary" id="btnShare">${esc(primaryLabel)}</button>
      <button class="btn" id="btnWa" title="Herausforderung per WhatsApp schicken">WhatsApp</button>
      <button class="btn ghost" id="btnCopy" title="Link in die Zwischenablage kopieren">Link kopieren</button>
    </div></div>`;
}
function wireShareBlock(){
  const n=$("#duelName"); if(n) n.oninput=()=>duelName(n.value);
  const s=$("#btnShare"); if(s) s.onclick=shareChallenge;
  const w=$("#btnWa");    if(w) w.onclick=()=>whatsappChallenge();
  const c=$("#btnCopy");  if(c) c.onclick=copyChallengeLink;
}
function showChallengeBanner(ch){
  const b=$("#duelBanner"); if(!b) return;
  const who=(ch.n||"").trim();
  const theirAcc = ch.t ? Math.round(ch.s/ch.t*100) : 0;
  const modeLabel = chModeLabel(ch.m);
  // Aufgabenstellung mit ansagen – gefragt ist genau dasselbe wie beim Herausforderer
  const wie = ch.m==="guided" ? "gemischte Übungsformen"
            : ch.m==="photo" && ch.a==="exam" ? "wie in der Prüfung"
            : (DIRS[ch.r] ? DIRS[ch.r].label : "") + (ch.m==="photo" && ch.a==="type" ? " · Namen eingeben" : "");
  const n=(ch.i||[]).length;
  b.innerHTML = `<div class="duel-ic">${ico("trophy")}</div>
    <div class="duel-txt">
      <p class="duel-title">${who?esc(who)+" fordert dich heraus!":"Lernduell – Herausforderung"}</p>
      <p class="duel-meta">${modeLabel}${wie?" ("+esc(wie)+")":""} · ${esc(frNameOf(ch.p))} · ${esc(nivNameOf(ch.p))} · ${n} Karten · Zielwert <b>${theirAcc} %</b> (${ch.s}/${ch.t} richtig)${ch.z?` · Zeit <b>${fmtDur(ch.z*1000)}</b>`:""}</p>
    </div>
    <div class="duel-cta">
      <button class="btn primary" id="btnAcceptDuel">Herausforderung annehmen</button>
      <button class="btn ghost" id="btnDeclineDuel" title="Herausforderung schließen und normal weiterlernen">schließen</button>
    </div>`;
  b.hidden=false;
  $("#btnAcceptDuel").onclick=startChallenge;
  $("#btnDeclineDuel").onclick=()=>{ b.hidden=true; };
}
function startChallenge(){                // genau die Karten der Herausforderung, in kodierter Reihenfolge
  const ch = pendingChallenge;
  if(!ch){ return startSession(); }
  applyChallengePrefs(ch); syncDirUI();   // auch wenn zwischendurch eigene Sitzungen liefen
  if(ch.p && ch.p!==profileId && typeof SEEDS!=="undefined" && SEEDS[ch.p]){   // Audit: die Karten-Indizes gelten für das Profil des Links – nach einem Berufswechsel liefen sonst fremde Karten
    const parts = ch.p.match(/^(.*)_(gaertner|fachwerker)$/);
    if(parts){ $("#frSelect").value=parts[1]; $("#nivSelect").value=parts[2]; }
    loadProfile(ch.p); profSub(); syncOptsSummary();
  }
  const cards = (ch.i||[]).map(i=>allCards[i]).filter(Boolean);
  if(!cards.length){ toast("Karten dieser Herausforderung nicht gefunden",true); return; }
  const b=$("#duelBanner"); if(b) b.hidden=true;
  queue = cards.slice(); qi = 0; photoMisses = 0; qStart = 0;
  sess = { id:++sessSeq, total:queue.length, done:0, correct:0, ms:0, pts:null, active:true, baseMode:mode, cards:cards.slice(), challenge:ch };
  // Geführte Lektion: die Übungsform je Karte kommt aus dem Link, damit wirklich
  // dieselbe Aufgabe läuft (nicht die, die der eigene Leitner-Stand vorgeben würde).
  if(ch.m==="guided" && Array.isArray(ch.f) && ch.f.length===cards.length){
    const formOf = new Map();
    cards.forEach((c,k)=>formOf.set(c, ch.f[k]));
    sess.auto = true; sess.scored = 0; sess.formOf = formOf; sess.modeBefore = mode;
  }
  clockRun(true); stageFull(true);
  nextCard();
}

/* ---------- Sitzung / Bühne ---------- */
/* Fokus-Modus: die laufende Lektion füllt auf dem Smartphone den ganzen Schirm.
   Reines CSS-Overlay (body.stagefull) statt Fullscreen-API – das funktioniert auch
   auf dem iPhone (die echte Fullscreen-API greift dort nur für Videos). */
function stageFull(on){
  try{
    document.body.classList.toggle("stagefull", !!on);
    // Audit: Tab wanderte im Fokus-Modus in die verdeckten Elemente dahinter – alles außer der
    // Bühne ist jetzt inert (Toast und per JS angehängte Dialoge liegen außerhalb von .wrap).
    // Geschwister der Bühne UND ihrer Vorfahren bis .wrap (die Bühne liegt in <main>, Kopf und
    // Fußzeile daneben); Body-Ebene (Toast, per JS angehängte Dialoge) bleibt bewusst unberührt.
    let node=$("#stage");
    while(node && node.parentElement && !(node.classList && node.classList.contains("wrap")) && node.parentElement!==document.body){
      const par=node.parentElement;
      [...par.children].forEach(el=>{ if(el!==node) el.inert=!!on; });
      node=par;
    }
  }catch(e){}
}
function startSession(){
  endChallengeOverride();                 // eigene Sitzung: eigene Einstellungen
  queue = buildQueue(); qi = 0; photoMisses = 0; qStart = 0;
  sess = { id:++sessSeq, total:queue.length, done:0, correct:0, ms:0, pts:null, active:true, baseMode:mode, cards:queue.slice(), challenge:null };
  if(!queue.length){ toast("Keine Arten im aktuellen Filter",true); return; }
  clockRun(true); stageFull(true);
  nextCard();
}
/* ---------- Geführte Sitzung (Ein-Knopf-Start »Weiter lernen«) ----------
   Wählt die Übungsform PRO KARTE nach ihrem Leitner-Stand – der Lernpfad
   (erkennen → abrufen), eingebaut statt nur erklärt:
     Box 0–1 (neu/unsicher) → Bilder-Quiz (ohne Internet: Auswahl-Quiz)
     Box 2                  → Auswahl-Quiz
     Box 3                  → Karteikarte (Selbsteinschätzung)
     Box 4–5 (sitzt)        → Tippen (prüfungsnah)
   Umsetzung: nextCard() schaltet den Modus je Karte um – Renderer, Tastatur-,
   Uhr-, Punkte- und Leitner-Logik gelten damit unverändert je Übungsform; beim
   Abschluss wird der zuvor gewählte Modus wiederhergestellt. Geführte Sitzungen
   haben kein Lernduell (CH_MODES bleibt unangetastet – Teilen gibt es in den
   reinen Modi Quiz/Tippen/Bilder). */
function guidedForm(box, online){
  if(box<=1) return online ? "photo" : "quiz";
  if(box===2) return "quiz";
  if(box===3) return "cards";
  return "type";
}
function startGuided(){
  endChallengeOverride();
  const q = buildQueue();
  if(!q.length){ toast("Keine Arten im aktuellen Filter",true); return; }
  const online = navigator.onLine !== false;
  const formOf = new Map(), boxOf = new Map();
  q.forEach(c=>{ const b = pget(c.key).box||0; boxOf.set(c, b); formOf.set(c, guidedForm(b, online)); });
  queue=q; qi=0; photoMisses=0; qStart=0;
  sess = { id:++sessSeq, total:q.length, done:0, correct:0, scored:0, ms:0, pts:null, active:true, baseMode:mode,
           cards:q.slice(), challenge:null, auto:true, formOf, boxOf, modeBefore:mode };
  clockRun(true); stageFull(true);
  nextCard();
}
/* Dieselben Karten als REINES Auswahl-Quiz spielen – z. B. um eine geführte
   Lektion noch einmal am Stück abzufragen. (Fürs Teilen braucht es das nicht
   mehr: die geführte Lektion ist seit v3 des Links direkt duellfähig.) */
function sessionBar(){
  const pct = sess.total? Math.round(sess.done/sess.total*100):0;
  return `<div class="sessionbar"><span>${sess.done} / ${sess.total}</span><span class="sbar"><i style="width:${pct}%"></i></span>`+
    (mode!=="cards"?`<span>${sess.correct} richtig</span>`:``)+
    (examScoring()&&sess.pts?`<span class="spts" title="Punkte dieser Sitzung – ein Schreibfehler zählt halb, der Rest kommt bei der fehlerfreien Wiederholung dazu">${nfmt(sess.pts.sum)} / ${nfmt(sess.pts.max)} P.</span>`:``)+
    ((sess.combo||0)>=3?`<span class="scombo" title="Treffer in Folge – ab 3 gibt es Bonuspunkte, jede 5er-Stufe wird gefeiert">${sess.combo}× in Folge</span>`:``)+
    (scoreable()?`<span class="sclock" id="sclock" title="Denkzeit dieser Sitzung – die Uhr läuft nur, solange eine Frage offen ist">${ico("clock")}<span id="sclockT">${fmtDur(clockNow())}</span></span>`:``)+
    `<button class="btn ghost" id="btnStop" title="Sitzung beenden">beenden</button></div>`;
}
/* Warum kommt DIESE Karte gerade so? In der geführten Lektion wechselt die
   Übungsform mit dem Lernstand (neu → Bild, ab Stufe 2 am Namen statt am Bild, dann
   selbst abrufen, zuletzt tippen). Ohne Hinweis wirkt das wie ein zufällig
   »eingemischtes« Quiz – deshalb eine ruhige Zeile über der Aufgabe. Nur in der
   geführten Lektion; bei einer angenommenen Herausforderung fehlt der fremde
   Lernstand, dann nennt sie nur die Übungsform.
   Wortlaut: »jetzt ohne Bild« las sich wie ein Fehler des Bilder-Quiz (Rückmeldung mit
   drei Screenshots) – der gewollte Schritt heißt jetzt »am Namen statt am Bild«, und ein
   ECHTER Ausfall (Bild geplant, aber keins gefunden bzw. »Ohne Bilder weiterlernen«
   gewählt) wird als solcher benannt. */
const GUIDED_WIE = { photo:"am Bild erkennen", quiz:"jetzt am Namen statt am Bild",
                     cards:"selbst abrufen", type:"prüfungsnah eingeben" };
function guidedNoteHTML(card){
  if(!sess.auto || !card) return "";
  let wie = GUIDED_WIE[mode]; if(!wie) return "";
  const plan = sess.formOf ? sess.formOf.get(card) : undefined;
  if(mode==="quiz" && plan==="photo")                  // Bild war geplant, kommt aber nicht: ehrlich sagen, warum
    wie = sess.photoGiveUp ? "ohne Bild – auf deinen Wunsch" : "kein brauchbares Bild gefunden – deshalb Auswahlfrage";
  const box = sess.boxOf ? sess.boxOf.get(card) : undefined;
  const stufe = box===undefined ? "" : box ? `Stufe ${box} von 5` : "Neu";
  return `<div class="gnote" title="Die geführte Lektion wählt die Übungsform nach deinem Lernstand: `+
    `neu → am Bild erkennen · ab Stufe 2 am Namen statt am Bild (gewollt, kein Fehler) · Stufe 3 selbst abrufen · ab Stufe 4 selbst eingeben wie in der Prüfung. `+
    `Durchgehend Bilder: unter »Selbst wählen« den Modus Bilder nehmen.">`+
    `${stufe?esc(stufe)+" · ":""}${esc(wie)}</div>`;
}
function showGuidedNote(){
  const html = guidedNoteHTML(current); if(!html) return;
  const bar = $("#stage") && $("#stage").querySelector(".sessionbar");
  if(bar && !$("#stage").querySelector(".gnote")) bar.insertAdjacentHTML("afterend", html);
}
function nextCard(){
  if(qi>=queue.length){
    // Ausweich-Umschaltung der LETZTEN Karte zurücknehmen, bevor abgerechnet wird –
    // sonst gilt eine Bilder-Lektion als Quiz (und wäre auch nur als Quiz teilbar).
    if(sess.baseMode && !sess.auto) mode = sess.baseMode;
    return finishSession();
  }
  current = queue[qi]; flipped=false;
  if(sess.auto && sess.formOf && sess.formOf.has(current))
    mode = sess.formOf.get(current);   // geführte Sitzung: Übungsform je Karte (wird nicht gespeichert)
  else if(sess.baseMode) mode = sess.baseMode;   // Bilder-Modus: Quiz-Ausweichen der Vorkarte zurücknehmen
  if(mode==="cards") renderCard();
  else if(mode==="quiz") renderQuiz();
  else if(mode==="photo") renderPhoto();
  else renderType();
  showGuidedNote();                    // geführte Lektion: Lernstand + Übungsform ansagen
  const stop=$("#btnStop"); if(stop) stop.onclick=finishSession;
}
function advance(){ if(sess.auto && mode!=="cards") sess.scored=(sess.scored||0)+1; qi++; sess.done++; nextCard(); }
function requeueCurrent(){ // "Nochmal"/falsch: Karte in dieser Sitzung später erneut zeigen
  const pos = Math.min(queue.length, qi + 3 + Math.floor(Math.random()*3)); // 3–5 Karten später
  queue.splice(pos, 0, current); sess.total++;
}

/* »Zur Übersicht«: Fokus-Modus verlassen und zurück zur Startansicht (Bereit-Screen). */
function exitSession(){ stageFull(false); startHintOnly(); try{ window.scrollTo(0,0); }catch(e){} }
function finishSession(){
  clockStop(); clockRun(false); phWaitStop();   // Fokus-Overlay bleibt an: Ergebnis + Teilen im Vollbild
  sess.active=false;
  const auto = !!sess.auto;
  if(auto && sess.modeBefore) mode = sess.modeBefore;   // Übungsform-Umschaltung der geführten Sitzung zurücknehmen
  const aborted = qi < queue.length;   // vorzeitig über »beenden« verlassen (nicht alle Karten dran)
  const acc = sessAcc();
  const scoredN = auto ? (sess.scored||0) : sess.done;
  const accS = auto ? (scoredN ? Math.round(sess.correct/scoredN*100) : 0) : acc;
  const ch = sess.challenge;                     // angenommene Herausforderung (falls vorhanden)
  // Quote fürs Vergleichen und Teilen: bei der geführten Lektion zählen nur die
  // BEWERTETEN Karten – Karteikarten geben keine Trefferquote.
  const accEff = auto ? accS : acc, doneEff = auto ? scoredN : sess.done;
  let extra = "", gewonnen = auto ? (scoredN>0 && accS>=80) : (scoreable() && sess.done>0 && acc>=80);   // ohne Duell: gute Quote reicht
  if(ch){                                        // Vergleich Du ↔ Herausforderer
    const theirAcc = ch.t ? Math.round(ch.s/ch.t*100) : 0;
    const who = (ch.n||"").trim() || "Herausforderer";
    const mine = sess.ms||0, theirs = (ch.z||0)*1000;   // Zeit entscheidet nur bei gleicher Quote
    gewonnen = accEff>theirAcc || (accEff===theirAcc && !!mine && !!theirs && mine<theirs);
    const verdict = accEff>theirAcc ? `<b class="duel-win">Du hast gewonnen!</b>`
      : accEff<theirAcc ? `<b class="duel-lose">Knapp – ${esc(who)} liegt vorn. Nochmal versuchen?</b>`
      : (mine && theirs && mine<theirs) ? `<b class="duel-win">Gleiche Quote – aber du warst schneller!</b>`
      : (mine && theirs && mine>theirs) ? `<b class="duel-lose">Gleiche Quote – ${esc(who)} war schneller. Revanche?</b>`
      : `<b>Gleichstand!</b>`;
    extra = `<div class="duel-result">
      <div class="duel-row"><span>Du</span><span class="duel-pct">${accEff} %</span><span class="duel-raw">${sess.correct}/${doneEff}</span>${mine?`<span class="duel-time">${ico("clock")}${fmtDur(mine)}</span>`:""}</div>
      <div class="duel-row"><span>${esc(who)}</span><span class="duel-pct">${theirAcc} %</span><span class="duel-raw">${ch.s}/${ch.t}</span>${theirs?`<span class="duel-time">${ico("clock")}${fmtDur(theirs)}</span>`:""}</div>
      <p class="duel-verdict">${verdict}</p></div>`;
  }
  // Teilen direkt nach JEDER bewerteten Lektion – auch nach der geführten und nach
  // dem Bilder-Quiz. Früher musste man dafür dieselben Karten noch einmal als
  // Auswahl-Quiz spielen; die Übungsformen wandern jetzt im Link mit.
  const teilbar = auto ? scoredN>0 : (scoreable() && sess.done>0);
  const share = teilbar ? shareBlockHTML(ch ? "Mein Ergebnis zurückschicken" : "Ergebnis teilen · herausfordern") : "";
  const stage=$("#stage");
  stage.innerHTML = `<div class="stage-empty">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6L9 17l-5-5"/></svg>
    <h2>${aborted?"Sitzung beendet":"Sitzung geschafft"}</h2>
    <p>${sess.done} Karten gelernt${auto ? (scoredN?` · ${sess.correct} richtig von ${scoredN} bewerteten (${accS} %)`:"") : (mode!=="cards"?` · ${sess.correct} richtig (${acc} %)`:"")}${sess.pts&&(auto||examScoring())?` · <b>${nfmt(sess.pts.sum)} von ${nfmt(sess.pts.max)} Punkten</b>`:""}${(auto?sess.ms:(scoreable()&&sess.ms))?` · Denkzeit ${fmtDur(sess.ms)}`:""}.</p>
    ${(sess.xp||sess.comboMax>=3)?`<p class="xpline"><b>+${sess.xp||0} Erfahrungspunkte</b>${sess.comboMax>=3?` · beste Serie: ${sess.comboMax}× in Folge`:""} · Rang: ${esc(rankOf(xpTotal()).name)}</p>`:""}
    ${extra}
    ${share}
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px">
      <button class="btn primary" id="againBtn">Weiter lernen</button>
      <button class="btn ghost" id="btnOverview">Zur Übersicht</button>
    </div></div>`;
  wireShareBlock();
  const a=$("#againBtn"); if(a) a.onclick = auto ? startGuided : startSession;
  const ov=$("#btnOverview"); if(ov) ov.onclick=exitSession;
  if(gewonnen) celebrate(stage.querySelector("h2"), 2);
  herbCheck();                                 // frisch gemeisterte Themen einmalig feiern
  renderProgress();
  // Desktop (kein Vollbild-Overlay): Ergebnis in den Blick holen statt unter dem Fold
  try{ if(!matchMedia("(max-width:640px)").matches) stage.scrollIntoView({behavior:"smooth", block:"center"}); }catch(e){}
}

function renderCard(){
  const c=current;
  const stage=$("#stage");
  stage.innerHTML = sessionBar() + `<div class="card" id="card" role="button" tabindex="0" aria-label="Karteikarte – zum Umdrehen aktivieren">
      <span class="side-label">${esc(promptLabel())}</span>
      <div class="prompt">${promptHTML(c)}</div>
      <div class="flip-hint">Zum Umdrehen tippen · Leertaste</div>
    </div>`;
  $("#btnStop").onclick=finishSession;
  $("#card").onclick=()=>{ if(!flipped) flipCard(); };
  try{ $("#card").focus(); }catch(e){}
}
/* Tastatur in Karteikarten: Leertaste/Enter dreht um, danach 1/2/3 bewerten
   (Nochmal/Unsicher/Gewusst). Ein globaler Listener, der nur im Karten-Modus greift. */
function cardKeys(e){
  if(mode!=="cards" || !sess || !sess.active || !$("#card")) return;
  if(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  // Audit: Enter/Leertaste auf einem ANDEREN Knopf (»beenden«, Teilen …) darf die Karte nicht
  // umdrehen – nur die Karte selbst (und die Bewertungs-Knöpfe) gehören zur Tastatursteuerung;
  // hinter einem offenen Dialog (Info-Karte, Lightbox, Hilfe) bewerten die Ziffern nicht.
  const t = e.target && e.target.closest ? e.target.closest("button,a,[role='button'],summary") : null;
  if(t && !t.closest("#card,.r-again,.r-hard,.r-good")) return;
  if(document.querySelector(".scrim:not([hidden]), .lbscrim")) return;
  if(!flipped){
    if(e.key===" " || e.key==="Enter" || e.key==="Spacebar"){ e.preventDefault(); flipCard(); }
    return;
  }
  const sel = e.key==="1" ? ".r-again" : e.key==="2" ? ".r-hard" : e.key==="3" ? ".r-good" : null;
  if(sel){ const b=document.querySelector(sel); if(b){ e.preventDefault(); b.click(); } }
}
function flipCard(){
  flipped=true; const c=current;
  $("#card").innerHTML = `<span class="side-label">${esc(answerLabel())}</span>
    <div class="prompt">${promptHTML(c)}</div>
    <div class="answer"><div class="big">${esc(answerText(c)||"—")}</div>
      ${answerMeta(c)?`<div class="meta">${answerMeta(c)}</div>`:""}</div>
    <div style="margin-top:14px">${infoBtnHTML("Mehr zur Pflanze")}</div>`;
  $("#card").onclick=null;
  wireInfoBtn();
  const cur = pget(c.key).box||0;               // Intervall je Knopf aus der aktuellen Box ableiten
  const days = g => g==="again" ? 0 : BOX_DAYS[boxAfter(cur,g)-1];
  const when = n => n<=0 ? "heute" : (n===1 ? "morgen" : "in "+n+" Tagen");
  const rate=el("div","rate");
  rate.innerHTML = `<button class="r-again">Nochmal<small>${when(days("again"))}</small></button>
    <button class="r-hard">Unsicher<small>${when(days("hard"))}</small></button>
    <button class="r-good">Gewusst<small>${when(days("good"))}</small></button>`;
  $("#stage").appendChild(rate);
  // Karteikarte: Stufe VOR der Bewertung zeigen (danach geht es sofort weiter) –
  // so sieht man auch hier, wie weit die Karte schon ist.
  rate.insertAdjacentHTML("afterend", stepHTML(cur));
  rate.querySelector(".r-again").onclick=()=>{ grade(c,"again"); requeueCurrent(); advance(); };
  rate.querySelector(".r-hard").onclick =()=>{ grade(c,"hard"); xpAdd(1); advance(); };   // Teilwissen zählt ein wenig
  rate.querySelector(".r-good").onclick =()=>{ grade(c,"good"); scoreHit("cards", true, 1); advance(); };
  try{ rate.querySelector(".r-again").focus(); }catch(e){}   // Tastatur: direkt bewerten (1/2/3 oder Tab)
}

function renderQuiz(){
  const c=current;
  const opts = shuffle([answerText(c), ...distractors(c,3)]);
  const stage=$("#stage");
  stage.innerHTML = sessionBar() +
    `<div class="qprompt">${promptHTML(c)}</div>
     <div class="options" id="opts"></div>
     <div class="feedback" id="fb" aria-live="polite"></div>
     <div class="nav" id="nav"></div>`;
  $("#btnStop").onclick=finishSession;
  const host=$("#opts");
  const letters=["A","B","C","D","E"];
  opts.forEach((o,i)=>{
    const b=el("button","opt"); b.innerHTML=`<span class="k">${letters[i]}</span><span>${esc(o)}</span>`;
    b.onclick=()=>answerQuiz(b,o,opts);
    host.appendChild(b);
  });
  clockStart();                                   // Frage steht – ab jetzt läuft die Uhr
}
function answerQuiz(btn, chosen, opts){
  clockStop();
  const c=current; const correct = answerText(c);
  const ok = chosen.toLowerCase()===correct.toLowerCase();
  document.querySelectorAll("#opts .opt").forEach(b=>{
    b.disabled=true;
    const txt=b.querySelector("span:last-child").textContent;
    if(txt.toLowerCase()===correct.toLowerCase()) b.classList.add("correct");
  });
  if(!ok) btn.classList.add("wrong");
  grade(c, ok?"good":"again"); if(ok) sess.correct++; else requeueCurrent();
  $("#fb").innerHTML = (ok ? `<span class="good">Richtig!</span>` : `<span class="bad">Leider falsch.</span>`)+
    ` <span class="sol">${solutionLine(c)}</span>` + stepHTML();
  if(ok) celebrate(btn, 1);
  scoreHit("quiz", ok, ok?1:0, btn);                   // Punkte + Combo (Auswahl = mittlere Schwierigkeit)
  const nav=$("#nav"); nav.innerHTML=infoBtnHTML("Mehr")+`<button class="btn primary" id="wt">Weiter</button>`;
  wireInfoBtn(); $("#wt").onclick=advance; $("#wt").focus();
}

/* Tippen = »wie in der Prüfung« als Text: für JEDEN bewerteten Bogen-Bestandteil ein
   eigenes Feld (analog zur Prüfungstabelle), mit Punkten. Es werden genau die Felder
   abgefragt, die der Prompt NICHT schon zeigt – deutscher Name gegeben → Gattung/Art/
   Familie; botanisch gegeben → Familie/deutscher Name. Punkte, Teilpunkte (halbe bei
   Schreibfehler) und Punktekonto wie im Bilder-Quiz »wie in der Prüfung«. */
const TYPE_PH = { g:"z. B. Allium", a:"Art (Epitheton)", fam:"lat. oder deutsch", de:"deutscher Name" };
function typeFields(c){
  if(!examFields) loadExamFields();
  const given = wantsDe() ? ["g","a"] : ["de"];           // was der Prompt bereits zeigt
  let keys = examFieldList().filter(k=>!given.includes(k));
  keys = keys.filter(k => k!=="a" || norm(c.a));          // Hybrid-Gruppen: kein leeres Art-Feld
  return keys.length ? keys : (wantsDe() ? ["de"] : ["g"]);
}
function renderType(){
  const c=current, keys=typeFields(c);
  const stage=$("#stage");
  stage.innerHTML = sessionBar() +
    `<div class="qprompt">${promptHTML(c)}</div>
     <div class="examform" id="typeForm">`+
       keys.map((k,i)=>`<label class="exrow" for="ty_${k}">
           <span class="exlab">${esc(FIELD_LABEL[k]||k)}<span class="expts">${nfmt(examPts(k))} P.</span></span>
           <input id="ty_${k}" data-k="${k}" type="text" autocomplete="off" autocapitalize="${k==="de"?"sentences":"off"}"
                  spellcheck="false" placeholder="${esc(TYPE_PH[k]||"")}" ${i===0?"autofocus":""}>
           <span class="exmark" id="tmk_${k}"></span>
         </label>`).join("")+
     `</div>
     <div class="feedback" id="fb" aria-live="polite"></div>
     <div class="nav" id="nav"><button class="btn primary" id="chk">Prüfen</button></div>`;
  $("#btnStop").onclick=finishSession;
  const ins=[...document.querySelectorAll("#typeForm input")];
  if(ins[0]) ins[0].focus();
  ins.forEach((inp,i)=>inp.addEventListener("keydown",e=>{       // Enter: nächstes Feld, am Ende prüfen
    if(e.key!=="Enter") return;
    e.preventDefault();
    if(i<ins.length-1) ins[i+1].focus(); else { const b=$("#chk"); if(b) b.click(); }
  }));
  $("#chk").onclick=()=>submitType(ins);
  clockStart();
}
function submitType(ins){
  clockStop();
  const c=current;
  let got=0, max=0, right=0, near=0;
  ins.forEach(inp=>{
    const k=inp.dataset.k, lvl=fieldJudge(k, inp.value, c), pts=examPts(k);
    max+=pts;
    if(lvl==="ok"){ got+=pts; right++; }
    else if(lvl==="near"){ got+=pts/2; near++; }                 // Schreibfehler: halbe Punkte (wie auf dem Bogen)
    inp.disabled=true; inp.classList.add(lvl==="ok"?"ok":lvl==="near"?"near":"no");
    const mk=$("#tmk_"+k);
    if(mk) mk.innerHTML = lvl==="ok" ? `<span class="ex-ok">✓</span>`
      : lvl==="near" ? `<span class="ex-near">≈</span> <span class="ex-sol">${markDiff(fieldSolution(k,c), inp.value)}</span>`
      : `<span class="ex-no">✗</span> <span class="ex-sol">${esc(fieldSolution(k,c))}</span>`;
  });
  const all = right===ins.length;
  const buch = bookPoints(c, got, max);                          // Punkte gutschreiben (Rest bei der Wiederholung)
  grade(c, all ? "good" : (right||near) ? "hard" : "again");
  if(all) sess.correct++; else requeueCurrent();
  $("#fb").innerHTML = `<span class="sol">${nfmt(got)} von ${nfmt(max)} Punkten`+
    (buch.nach>0 ? ` · <b>+${nfmt(buch.nach)}</b> nachträglich gutgeschrieben` : "")+
    (near&&!all ? ` · <b>≈</b> Schreibfehler zählen halb – schreibst du es gleich fehlerfrei, gibt es den Rest`
                : near ? ` · <b>≈</b> Schreibfehler zählen halb – so steht es auf dem Prüfungsbogen` : "")+
    (all?"":" · "+solutionLine(c))+`</span>` + stepHTML();
  if(all) celebrate($("#fb"), 1);
  scoreHit("type", all, max?got/max:0, $("#fb"));      // freies Tippen zählt doppelt; Teilpunkte anteilig
  const nav=$("#nav"); nav.innerHTML=infoBtnHTML("Mehr")+`<button class="btn primary" id="wt">Weiter</button>`;
  wireInfoBtn(); $("#wt").onclick=advance; $("#wt").focus();
}

function startHintOnly(){
  // Ruhe-Ansicht: führt immer zum Ein-Knopf-Start; der Internet-Hinweis des
  // Bilder-Modus erscheint nur als Randnotiz, wenn dieser Modus gewählt ist.
  const photo = mode==="photo";
  $("#stage").innerHTML = `<div class="stage-empty">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22V8M12 8C12 8 7 3 4 4c-1 3 4 8 8 8zM12 8c0 0 5-5 8-4 1 3-4 8-8 8z"/></svg>
    <h2>Bereit zum Lernen</h2>
    <p><b>»Weiter lernen«</b> startet eine geführte Sitzung – die Übungsform (Bilder, Quiz,
       Karteikarte, Selbst eingeben) richtet sich je Pflanze nach deinem Lernstand. Unter <b>»Selbst
       wählen«</b> gibt es jeden Modus einzeln; Details unter <b>Hilfe</b>.</p>
    ${photo ? `<p class="stage-note">Der Bilder-Modus braucht Internet (die Bilder kommen von
       Wikipedia); alles andere läuft auch ohne.</p>` : ``}
  </div>`;
}

/* ---------- Liste / Nachschlagen (durchsuchbar, nach Kategorie gruppiert) ---------- */
/* Gefilterte Listen-Menge (Kategorie-/ZP-Filter + Suchfeld) \u2013 auch Basis der Druckliste */
/* Ansichten (Gruppier-/Sortier-Dimensionen). »bot«/»de« sind flach-alphabetisch
   (keine Filter-Tags); »thema«/»familie« gruppieren und bieten Filter-Tags
   der jeweiligen Dimension. */
const SORT_LABEL={bot:"A–Z botanisch",de:"A–Z deutsch",thema:"Thema",familie:"Familie"};
const groupsView = () => listSort==="thema" || listSort==="familie";
const dimKey = c => listSort==="familie" ? (c.fam||"Ohne Familie") : (c.thema||"Ohne Thema");
function dimValues(){ // Werte der aktuellen Gruppier-Dimension (+ Anzahl), für die Filter-Tags
  const zp=$("#onlyzp") && $("#onlyzp").checked;
  const set=new Map();
  allCards.forEach(c=>{ if(zp&&!c.zp) return; const k=dimKey(c); set.set(k,(set.get(k)||0)+1); });
  const byFam=listSort==="familie";
  return [...set.entries()].sort((a,b)=> byFam ? a[0].localeCompare(b[0],"de") : (themeRank(a[0])-themeRank(b[0]) || a[0].localeCompare(b[0],"de")));
}
function listFiltered(){
  const raw = $("#listSearch") ? $("#listSearch").value : "";
  const term = deacc(norm(raw)).toLowerCase();
  const zpOnly = $("#onlyzp") && $("#onlyzp").checked;
  let p = allCards.filter(c => !zpOnly || c.zp);  // Liste: nur ZP-Filter – Themen/Familien laufen über die Ansicht-Tags, nicht über das »Auswahl«-Dropdown (das ist im Listenmodus ausgeblendet). Ein Filtermodell.
  if(groupsView() && listCats.size) p = p.filter(c => listCats.has(dimKey(c)));
  if(term){
    const hay = c => deacc(c.g+" "+c.a+" "+c.de+" "+c.fam+" "+c.syn).toLowerCase();
    p = p.filter(c => hay(c).includes(term));
  }
  return { p, raw, term };
}
function renderListControls(){
  const host=$("#listControls"); if(!host) return;
  const open = host.dataset.open==="1";
  const zpOn = !!($("#onlyzp") && $("#onlyzp").checked);
  // Zusammenfassung für die (eingeklappte) Kopfzeile des Akkordions
  const sub = (groupsView()
    ? (listCats.size ? `${SORT_LABEL[listSort]} · ${listCats.size} ausgewählt` : `${SORT_LABEL[listSort]} · alle`)
    : SORT_LABEL[listSort]) + (zpOn ? " · nur ZP" : "");
  // im Prüfungsstoff-Modus (Fachwerker) entfällt die Familien-Ansicht (Familie ist ausgeblendet)
  const sortKeys=Object.keys(SORT_LABEL).filter(s=> !(examOnlyActive() && s==="familie"));
  const sorts=sortKeys.map(s=>`<button class="sortbtn${listSort===s?" on":""}" data-sort="${s}">${SORT_LABEL[s]}</button>`).join("");
  let tags="";
  if(groupsView()){
    const vals=dimValues();
    tags=`<div class="cattags" role="group" aria-label="Filtern">`+
      `<button class="cattag${listCats.size?"":" on"}" data-cat="" title="Alle anzeigen">Alle</button>`+
      vals.map(([k,n])=>`<button class="cattag${listCats.has(k)?" on":""}" data-cat="${esc(k)}">${esc(k)}<span class="ct-n">${n}</span></button>`).join("")+
      `</div>`;
  }
  // Filter + Drucken gehören mit ins EINE Akkordeon (die Sitzungs-Optionen sind im
  // Listenmodus ausgeblendet; ZP/Prüfungsstoff spiegeln deren Schalter – gleiche Quelle).
  // Aufbau: klar getrennte Sektionen mit Überschrift – Ansicht (+ Eingrenzen-Tags),
  // Filter, Drucken; die geöffnete Klappe wird als EINE Karte gerahmt (CSS .open).
  const exWrap=$("#examOnlyWrap");
  const secAnsicht=`<div class="lc-sec">
      <div class="lc-h">Ansicht</div>
      <div class="sortbtns" role="group" aria-label="Ansicht">${sorts}</div>
      ${groupsView() ? `<div class="lc-h lc-h2">${listSort==="familie"?"Nach Familie eingrenzen":"Nach Thema eingrenzen"}</div>${tags}` : ""}
    </div>`;
  const secFilter=`<div class="lc-sec">
      <div class="lc-h">Filter</div>
      <div class="lc-checks">
        <label class="po-ety" title="Nur Arten zeigen, die für die Zwischenprüfung relevant sind"><input type="checkbox" id="lcZp"${zpOn?" checked":""}> nur ZP-relevant</label>
        ${exWrap && !exWrap.hidden ? `<label class="po-ety" title="Nur die in der Fachwerker-Prüfung bewerteten Angaben zeigen (ohne Familie)"><input type="checkbox" id="lcExamOnly"${examOnly?" checked":""}> nur Prüfungsstoff</label>` : ""}
      </div>
    </div>`;
  const secPrint=`<div class="lc-sec">
      <div class="lc-h">Drucken</div>
      <div class="po-cols" id="printCols" role="group" aria-label="Spalten für den Druck"></div>
      <label class="po-ety" title="Zu jeder Pflanze eine kurze Merkzeile mit der Herkunft/Bedeutung des botanischen Namens mitdrucken (Latein/Griechisch → Deutsch, kuratiert – ohne Gewähr)."><input type="checkbox" id="printEty"${printEtyOn()?" checked":""}> Namensherkunft mitdrucken</label>
      <label class="po-ety" title="Jede Gruppe der gewählten Ansicht (Thema, Familie oder Anfangsbuchstabe) beginnt beim Drucken auf einer eigenen Seite – braucht mehr Papier, ist aber übersichtlicher zum Lernen."><input type="checkbox" id="printBreak"${printBreakOn()?" checked":""}> jede Gruppe auf neuer Seite</label>
    </div>`;
  host.classList.toggle("open", open);
  host.innerHTML=`
    <button class="lc-toggle" id="lcToggle" aria-expanded="${open?"true":"false"}">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M6 12h12M10 18h4"/></svg>
      <span class="lc-title">Optionen</span><span class="lc-sub">${esc(sub)}</span>
      <span class="lc-caret" aria-hidden="true">▾</span>
    </button>
    <div class="lc-body"${open?"":" hidden"}>
      ${secAnsicht}
      ${secFilter}
      ${secPrint}
    </div>`;
  $("#lcToggle").onclick=()=>{ host.dataset.open = open?"0":"1"; renderListControls(); };
  host.querySelectorAll(".sortbtn").forEach(b=>b.onclick=()=>{
    if(listSort!==b.dataset.sort){ listSort=b.dataset.sort; listCats.clear(); store.set(LS_PREFIX+"listsort",listSort); }
    vt(()=>{ renderListControls(); renderList(); });   // Ansicht wechselt gleitend
  });
  host.querySelectorAll(".cattag").forEach(b=>b.onclick=()=>{
    const k=b.dataset.cat;
    if(!k) listCats.clear();
    else { if(listCats.has(k)) listCats.delete(k); else listCats.add(k); }
    vt(()=>{ renderListControls(); renderList(); });   // Gefiltertes gleitet heraus/herein
  });
  renderPrintCols();
  const zp=$("#lcZp"); if(zp) zp.onchange=()=>{ const src=$("#onlyzp"); if(src){ src.checked=zp.checked; src.dispatchEvent(new Event("change")); } };
  const ex=$("#lcExamOnly"); if(ex) ex.onchange=()=>{ const src=$("#examOnly"); if(src){ src.checked=ex.checked; src.dispatchEvent(new Event("change")); } };
  const pe=$("#printEty"); if(pe) pe.onchange=()=>store.set(LS_PREFIX+"printety", pe.checked?"1":"0");
  const pb=$("#printBreak"); if(pb) pb.onchange=()=>store.set(LS_PREFIX+"printbreak", pb.checked?"1":"0");
}
function renderList(){
  const stage=$("#stage");
  const { p, raw, term } = listFiltered();
  if(!p.length){
    stage.innerHTML = `<div class="stage-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <h2>Kein Treffer</h2><p>${term?("Nichts gefunden für »"+esc(raw)+"«."):"Keine Arten im aktuellen Filter."}</p></div>`;
    return;
  }
  const flat=[];
  const showFam = !examOnlyActive();               // Prüfungsstoff-Modus (Fachwerker): keine Familie in der Zeile
  const rowHtml=c=>{ const idx=flat.push(c)-1;
    const sub = showFam
      ? `${c.de?esc(c.de):""}${c.de&&c.fam?" · ":""}${c.fam?`<span class="sp-fam">${esc(c.fam)}</span>`:""}`
      : (c.de?esc(c.de):"");
    return `<li><button type="button" class="sprow" data-idx="${idx}" aria-label="${esc(botName(c))} – Infos öffnen">
      <span class="sp-main"><span class="sp-bot">${esc(botName(c))}</span>${c.zp?'<span class="sp-zp" title="prüfungsrelevant (ZP)">ZP</span>':""}<span class="sp-go">ℹ</span></span>
      ${sub?`<span class="sp-sub">${sub}</span>`:""}
    </button></li>`; };
  let html=`<div class="listtop">${p.length} ${p.length===1?"Art":"Arten"}${term?(" · Treffer für »"+esc(raw)+"«"):""} · sortiert nach ${SORT_LABEL[listSort]} · zum Nachschlagen antippen</div>`;
  // Datenherkunft dort nennen, wo nachgeschlagen wird: Namen = amtliche Liste, Gliederung = erzeugt
  const profL = profilLabel();
  html+=`<div class="listsrc">${ico("check")}<div><b>Artnamen unverändert aus der amtlichen
    Prüfungsliste</b>${profL?" ("+esc(profL)+")":""} · die Gruppierung nach Themen ist
    automatisch erzeugt, teils mit KI</div></div>`;
  if(p.some(c=>c.zp)) html+=`<div class="zpnote"><span class="sp-zp">ZP</span> = für die Zwischenprüfung relevant</div>`;

  if(listSort==="bot" || listSort==="de"){
    // flache, alphabetische Liste mit Anfangsbuchstaben-Trennern
    const keyf = listSort==="bot" ? (c=>norm(c.g+" "+c.a)) : (c=>norm(c.de)||norm(c.g+" "+c.a));
    const arr=p.slice().sort((a,b)=> keyf(a).localeCompare(keyf(b),"de"));
    let letter="";
    for(const c of arr){
      const L=(deacc(keyf(c)).charAt(0)||"·").toUpperCase();
      if(L!==letter){ if(letter) html+=`</ul></div>`; letter=L; html+=`<div class="catblock"><div class="cathead">${esc(L)}</div><ul class="splist">`; }
      html+=rowHtml(c);
    }
    if(letter) html+=`</ul></div>`;
  } else {
    // nach Thema oder Familie gruppieren
    const byFam = listSort==="familie";
    const groups=new Map();
    p.forEach(c=>{ const k=dimKey(c); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(c); });
    const keys=[...groups.keys()].sort((a,b)=> byFam ? a.localeCompare(b,"de") : (themeRank(a)-themeRank(b) || a.localeCompare(b,"de")));
    for(const k of keys){
      const rows=groups.get(k).slice().sort((a,b)=> norm(a.g+" "+a.a).localeCompare(norm(b.g+" "+b.a),"de"));
      // In der Familien-Ansicht: ℹ öffnet einen kurzen Familien-Steckbrief
      const fi = byFam && k!=="Ohne Familie"
        ? `<button class="cathead-i" data-fam="${esc(k)}" title="Was diese Familie ausmacht – kurzer Steckbrief mit Lerntipp" aria-label="Familien-Steckbrief ${esc(famLatin(k))}">ℹ</button>` : "";
      html+=`<div class="catblock"><div class="cathead">${esc(k)}<span class="catn">${rows.length}</span>${fi}</div><ul class="splist">`;
      rows.forEach(c=>{ html+=rowHtml(c); });
      html+=`</ul></div>`;
    }
  }
  stage.innerHTML=html;
  stage.querySelectorAll(".sprow").forEach(b=>{          // echter Button: Enter/Leertaste nativ
    const c=flat[+b.getAttribute("data-idx")];
    b.onclick=()=>openInfo(c);
  });
  stage.querySelectorAll(".cathead-i").forEach(b=> b.onclick=()=>openFamilyInfo(b.dataset.fam));
}
/* ---------- Druckbare Lernliste ----------
   Gleiche Form wie die offiziellen Prüfungsbögen (drei Formular-Familien wie im
   Prüfungswerkzeug): dieselben Spalten, Beschriftungen und Punktangaben je Profil,
   ausgefüllt wie eine Musterlösung, plus ZP-Spalte. Gruppierung/Reihenfolge folgen
   der in der Liste gewählten Ansicht (Wuchsform/Familie mit Gruppen-Bändern, A–Z
   flach mit Buchstaben-Bändern); gedruckt wird genau die gefilterte Menge. */
function printFamily(){
  if(profileId.endsWith("_fachwerker")) return "fw";
  if(profileId.startsWith("garten_und_landschaftsbau")) return "gala";
  return "prod";
}
const PRINT_COLS={ // [Feld, Beschriftung, Punktangabe im Wortlaut der Bögen, Punkte]
  fw:  [["de","Deutscher Name","3 Punkte",3],["g","Gattung (botanisch)","0,5 Punkte",0.5],["a","Art (botanisch)","0,5 Punkte",0.5]],
  gala:[["g","Gattungsname","1 Punkt (G)",1],["a","Artname","1 Punkt (G)",1],["de","Deutscher Name","2 Punkte (G)",2]],
  prod:[["g","Gattungsname","3 Punkte (G)",3],["a","Artname","3 Punkte (G)",3],["fam","Familienname","1 Punkt (G)",1],["de","Deutscher Name","3 Punkte (G)",3]]
};
/* ---------- Druck-Spaltenauswahl ---------- */
/* Der Nutzer kann in den Druckoptionen einzelne Spalten abwählen (nicht alle müssen
   gedruckt werden). Merkt sich die ABGEWÄHLTEN Schlüssel geräteweit; Zusatzspalten
   ZP und »gelernt« sind ebenfalls abschaltbar. Mindestens eine Bogen-Spalte bleibt. */
const printColKeys = () => PRINT_COLS[printFamily()].map(c=>c[0]).concat(["zp","chk"]);
const printColLabel = k => k==="zp" ? "ZP" : k==="chk" ? "gelernt" : (FIELD_LABEL[k]||k);
function loadPrintColsOff(){
  let v=null; try{ v=JSON.parse(store.get(LS_PREFIX+"printcols")||"null"); }catch(e){ v=null; }
  printColsOff = new Set(Array.isArray(v)?v:[]);
}
function savePrintColsOff(){ try{ store.set(LS_PREFIX+"printcols", JSON.stringify([...printColsOff])); }catch(e){} }
function printEtyOn(){ return store.get(LS_PREFIX+"printety")==="1"; }   // Quelle: Speicher (Checkbox lebt nur im offenen Akkordeon)
function printBreakOn(){ return store.get(LS_PREFIX+"printbreak")==="1"; }   // opt-in: jede Gruppe auf neuer Seite
function renderPrintCols(){
  const host=$("#printCols"); if(!host) return;
  if(!printColsOff) loadPrintColsOff();
  host.innerHTML = printColKeys().map(k=>{
    const on=!printColsOff.has(k);
    return `<label class="pocol${on?" on":""}"><input type="checkbox" data-k="${k}"${on?" checked":""}> ${esc(printColLabel(k))}</label>`;
  }).join("");
  host.querySelectorAll("input").forEach(cb=>cb.onchange=()=>{
    const k=cb.dataset.k;
    if(cb.checked) printColsOff.delete(k); else printColsOff.add(k);
    const dataKeys = PRINT_COLS[printFamily()].map(c=>c[0]);          // mind. eine Bogen-Spalte muss bleiben
    if(dataKeys.every(dk=>printColsOff.has(dk))){ printColsOff.delete(k); cb.checked=true; toast("Mindestens eine Spalte muss gedruckt werden",true); return; }
    savePrintColsOff(); renderPrintCols();
  });
}
function buildPrintList(){
  const host=$("#printList"); if(!host) return 0;
  const fam=printFamily();
  if(!printColsOff) loadPrintColsOff();
  const cols=PRINT_COLS[fam].filter(c=>!printColsOff.has(c[0]));   // nur gewählte Bogen-Spalten
  const showZP=!printColsOff.has("zp"), showChk=!printColsOff.has("chk");
  const extra=(showZP?1:0)+(showChk?1:0), tCols=1+cols.length+extra;   // Gesamtspalten (pnum + Daten + ZP + gelernt)
  const { p, raw, term } = listFiltered();
  const frLabel=$("#frSelect").selectedOptions[0]?$("#frSelect").selectedOptions[0].textContent:"";
  const nivLabel=$("#nivSelect").selectedOptions[0]?$("#nivSelect").selectedOptions[0].textContent:"";
  const title= fam==="gala" ? "Abschlussprüfung Pflanzenbestimmung im Gartenbau GALA"
             : fam==="prod" ? "Abschlussprüfung Pflanzenbestimmung im Gartenbau"
             : "Abschlussprüfung Pflanzenbestimmung";
  const heute=new Date().toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"});
  const filt=[];
  if(groupsView() && listCats.size) filt.push((listSort==="familie"?"Familie: ":"Thema: ")+[...listCats].join(", "));
  if($("#onlyzp").checked) filt.push("nur ZP-relevant");
  if(term) filt.push("Suche: »"+raw+"«");

  const heads=`<th class="pnum"></th>`+
    cols.map(c=>`<th>${esc(c[1])}<span class="pp">${esc(c[2])}</span></th>`).join("")+
    (showZP?`<th class="pzp" title="prüfungsrelevant für die Zwischenprüfung">ZP</th>`:"")+
    (showChk?`<th class="pchk" title="zum Abhaken, was schon sitzt">gelernt</th>`:"");
  const wantEty = printEtyOn();                                   // opt-in: Namensherkunft-Merkzeile je Pflanze
  const wantBreak = printBreakOn();                               // opt-in: jede Gruppe auf neuer Seite (mehr Papier, übersichtlicher)
  let n=0, rows="", bandN=0;
  const band = label => { bandN++;                                // erstes Band ohne Umbruch (sonst leere erste Seite)
    return `<tr class="pcat${wantBreak&&bandN>1?" pbrk":""}"><td colspan="${tCols}">${esc(label)}</td></tr>`; };
  const rowFor = c => { n++;
    const cls = wantEty ? ` class="pmain${n%2===0?" pz":""}"` : "";
    let tr = `<tr${cls}><td class="pnum">${n}</td>`+
      cols.map(k=>`<td class="${k[0]==="g"||k[0]==="a"?"bot":""}">${esc(k[0]==="a" ? artShown(c.a) : (c[k[0]]||""))}</td>`).join("")+
      (showZP?`<td class="pzp">${c.zp?'<span class="zpdot"></span>':""}</td>`:"")+
      (showChk?`<td class="pchk"><span class="box"></span></td>`:"")+`</tr>`;
    if(wantEty){                                                  // Merkzeile aus der Namensherleitung (offline, kuratiert)
      const parts=nameEtymology(c.g, c.a);
      if(parts.length){
        const inline=parts.map(pp=>`<i>${esc(pp.t)}</i> — ${esc(pp.d)}`).join(" · ");
        tr += `<tr class="pety${n%2===0?" pz":""}"><td class="pnum"></td>`+
          `<td class="pety-c" colspan="${tCols-1}"><span class="pety-lab">Name:</span> ${inline}</td></tr>`;
      }
    }
    return tr;
  };

  // Gruppierung/Reihenfolge folgt der in der Liste gewählten Ansicht (listSort)
  if(listSort==="bot" || listSort==="de"){
    // flach, alphabetisch, mit Anfangsbuchstaben-Bändern
    const keyf = listSort==="bot" ? (c=>norm(c.g+" "+c.a)) : (c=>norm(c.de)||norm(c.g+" "+c.a));
    const arr=p.slice().sort((a,b)=> keyf(a).localeCompare(keyf(b),"de"));
    let letter="";
    for(const c of arr){
      const L=(deacc(keyf(c)).charAt(0)||"·").toUpperCase();
      if(L!==letter){ letter=L; rows+=band(L); }
      rows+=rowFor(c);
    }
  } else {
    // nach Thema oder botanischer Familie gruppieren
    const byFam=listSort==="familie";
    const groups=new Map();
    p.forEach(c=>{ const k=dimKey(c); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(c); });
    const keys=[...groups.keys()].sort((a,b)=> byFam ? a.localeCompare(b,"de") : (themeRank(a)-themeRank(b) || a.localeCompare(b,"de")));
    for(const k of keys){
      const arr=groups.get(k).slice().sort((a,b)=> norm(a.g+" "+a.a).localeCompare(norm(b.g+" "+b.a),"de"));
      rows+=band(`${k} · ${arr.length} ${arr.length===1?"Art":"Arten"}`);
      for(const c of arr) rows+=rowFor(c);
    }
  }
  const hasZP = p.some(c=>c.zp);
  const showBot = cols.some(c=>c[0]==="g"||c[0]==="a");            // botanischer Name überhaupt gedruckt?
  const legend=[
    (showZP&&hasZP)?"ZP = für die Zwischenprüfung relevant":"",
    showChk?"Spalte »gelernt« zum Abhaken, was sitzt":"",
    showBot?"Botanischer Name (grün) = Lernziel":"",
    "Artnamen unverändert aus der amtlichen Prüfungsliste der Regierungspräsidien Baden-Württemberg",
    "Pflanzenkenntnis · Lernliste in der Form des Prüfungsbogens (Spalten und Punkte wie in der Prüfung)",
    wantEty?"Namensherkunft: Kurzherleitung (Latein/Griechisch → Deutsch), kuratiert – ohne Gewähr":""
  ].filter(Boolean).join(" · ");
  host.innerHTML=`
    <h1 class="ptitle${fam==="fw"?" pb":""}">${esc(title)} — Lernliste</h1>
    ${fam==="fw"?`<div class="psub">Gartenbaufachwerker/in</div>`:""}
    <div class="pmeta">Fachrichtung ${esc(frLabel)} · ${esc(nivLabel)} · ${n} ${n===1?"Art":"Arten"}
      · sortiert nach ${esc(SORT_LABEL[listSort]||"Thema")}${filt.length?` · ${esc(filt.join(" · "))}`:""} · Stand ${esc(heute)}</div>
    <table class="ptab${wantEty?" ety":""}"><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>
    <div class="pfoot">${legend}</div>`;
  return n;
}
function printList(){
  const n=buildPrintList();
  if(!n){ toast("Keine Arten im aktuellen Filter",true); return; }
  window.print();
}

/* Modus anwenden: Liste zeigt sofort die Nachschlage-Liste (ohne »Sitzung starten«) */
/* Aktive, vom Standard abweichende Optionen in die zugeklappte »Optionen«-Kopfzeile
   spiegeln (wie die Filter-Zusammenfassung im Prüfungswerkzeug) – so sieht man ohne
   Aufklappen, was gerade gilt. Ohne Abweichung steht dort die neutrale Beschreibung. */
function syncOptsSummary(){
  const sub = $("#setOpts") && $("#setOpts").querySelector(".opts-sub"); if(!sub) return;
  const bits=[];
  const d=curDir();
  // Abweichende Abfragerichtung – nur wenn eine wählbar ist (im Bilder-Quiz gibt es keine;
  // bei »wie in der Prüfung« fällt die Richtung intern nur auf einen spielbaren Wert zurück)
  if(mode!=="list" && dirsFor().length>1 && d!==dirsFor()[0]) bits.push(DIRS[d].label);
  if(mode!=="list"){ const sc=$("#cat"); if(sc && sc.value) bits.push(norm(sc.options[sc.selectedIndex].textContent).replace(/\s*\(\d+\)\s*$/,"")); }
  if($("#onlyzp") && $("#onlyzp").checked) bits.push("nur ZP");
  if($("#examOnly") && $("#examOnly").checked && $("#examOnlyWrap") && !$("#examOnlyWrap").hidden) bits.push("nur Prüfungsstoff");
  const sl=parseInt($("#sessLen") && $("#sessLen").value)||20; if(sl!==20) bits.push(sl+" Karten");
  sub.textContent = bits.length ? bits.join(" · ")
    : (mode==="photo" ? "Antwort" : "Abfrage")+" · Lernstoff · ZP · Sitzungslänge";   // im Bilder-Quiz gibt es keine Richtung zu wählen
  sub.classList.toggle("active", bits.length>0);
}
function syncModeTabs(){                       // Audit: Tabs tragen aria-pressed (Zustand für Screenreader)
  const tabs=$("#modeTabs"); if(!tabs) return;
  tabs.querySelectorAll("button").forEach(x=>{ const on=x.dataset.mode===mode; x.classList.toggle("on",on); x.setAttribute("aria-pressed",String(on)); });
}
function applyMode(){
  const isList = mode==="list";
  sess.active=false; qStart=0; clockRun(false); phWaitStop(); stageFull(false);   // Moduswechsel bricht die Sitzung ab
  const sr=$("#startRow"), lsr=$("#listSearchRow"), lc=$("#listControls");
  if(sr) sr.hidden = isList;
  const bg=$("#btnGo"), gh=$("#goHint");                    // Ein-Knopf-Start nur außerhalb der Liste
  if(bg) bg.hidden = isList;
  if(gh) gh.hidden = isList;
  const bl=$("#btnList");                                   // Schnellzugriff wird zum Rückweg
  if(bl) bl.textContent = isList ? "← Zurück zum Lernen" : "Liste zum Nachschlagen";
  const ln=$("#learnNote"); if(ln) ln.hidden = isList;   // Hinweis gehört zu den Lektionen, nicht zur Liste
  const cf=$("#cat") && $("#cat").closest(".field"); if(cf) cf.hidden = isList;  // »Auswahl«-Scope filtert die Liste nicht – im Listenmodus ausblenden (Suche + Ansicht-Tags reichen)
  // Im Listenmodus gibt es EIN Options-Akkordeon: die Sitzungs-Optionen sind ausgeblendet,
  // ihre listenrelevanten Schalter (ZP, Prüfungsstoff) stehen gespiegelt im Listen-Akkordeon.
  const so=$("#setOpts"); if(so) so.hidden = isList;
  const cw=$("#chooseWrap"); if(cw) cw.hidden = isList;   // Audit: die Sitzungs-Klappe »Selbst wählen« hat in der Nachschlage-Liste nichts verloren – zurück geht es über »← Zurück zum Lernen«
  if(lsr) lsr.hidden = !isList;
  if(lc) lc.hidden = !isList;
  syncDirUI(); syncOptsSummary();
  if(isList){ $("#progress").hidden = true; renderListControls(); renderList(); }
  else { renderProgress(); startHintOnly(); }
}

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
  a = norm(a||"").replace(/[`´‘’‚“”„"]/g,"'");
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
  a = norm(a||"").replace(/[`´‘’‚“”„"]/g,"'");
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
  const w = (s.split(" ").filter(w=> w && !RANK_TOKEN.test(w))[0] || "").replace(/[,;:]+$/,"");   // »vulgaris, A. Cultivars« → vulgaris
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
function renderWiki(host, d){
  const credit = d.photo ? [d.photo.artist, d.photo.license].filter(Boolean).join(", ") : "";
  host.innerHTML =
    (d.note ? `<div class="wp-taxon">${d.note}</div>` : "")+                       // Sorte/Varietät: Artikel nur zur Art (gekennzeichnet)
    (d.thumb ? `<img src="${esc(d.thumb)}" alt="${esc(d.photo ? (d.photo.alt||"Bild der Sorte") : d.title)}" loading="lazy">` : "")+
    `<div class="wp-text">${esc(d.extract)}</div>`+
    `<div class="wp-src">Quelle: <a href="${esc(d.url)}" target="_blank" rel="noopener">Wikipedia – ${esc(d.title)}</a> · Text unter CC BY-SA`+
    (d.photo ? ` · Bild: <a href="${esc(d.photo.url||"https://commons.wikimedia.org/")}" target="_blank" rel="noopener">Wikimedia Commons</a>${credit ? " ("+esc(credit)+")" : ""}` : "")+
    `</div>`;
  lbWire(host.querySelector("img"), d.gallery && d.gallery.length>1 ? "Bilder ansehen" : "Vorschaubild vergrößern", d.gallery && d.gallery.length>1 ? d.gallery : undefined);
}
/* Bilder eines Artikels (für die Galerie in der Vollbild-Ansicht). Karten,
   Wappen, Logos und Schadbilder fliegen raus; botanische Tafeln bleiben – beim
   Nachschlagen sind sie hilfreich (anders als im Bilder-Quiz). */
function wikiGallery(title, noArt, width){              // noArt: für den Bilder-Quiz zusätzlich Zeichnungen/Tafeln raus (Dateiname + Metadaten)
  // width: gewünschte Vorschaubreite – der Server rundet auf seine Standardstufen auf (1200 → 1280, 640 → 960 px)
  return jsonp("https://de.wikipedia.org/w/api.php?action=query&format=json&generator=images"+
      "&gimlimit=20&redirects=1&prop=imageinfo&iiprop=url%7Cmime%7Csize"+
      (noArt ? "%7Cextmetadata&iiextmetadatafilter=Categories%7CArtist%7CCredit" : "")+"&iiurlwidth="+(width||1200)+"&titles="+
      encodeURIComponent(title))
    .then(d=>{
      const pg = (d && d.query && d.query.pages) || {};
      return Object.keys(pg).map(k=>pg[k])
        .filter(p=>{
          const f = String(p.title||"").replace(/^(File|Datei):/i,"");
          const ii = p.imageinfo && p.imageinfo[0];
          if(!ii || !(ii.thumburl||ii.url)) return false;
          if(ii.mime && !/^image\/(jpeg|png|webp)$/i.test(ii.mime)) return false;   // keine SVG-Icons/PDF
          if(noArt && (looksIllustration(f) || looksArtwork(ii.extmetadata))) return false;
          return usablePhoto(f) && !looksDamage(f);
        })
        .map(p=>{ const ii=p.imageinfo[0];
          return { src: ii.thumburl||ii.url, file: String(p.title||"").replace(/^(File|Datei):/i,""), w: ii.width||0 }; })   // w: Originalbreite (Großansicht nie darüber hinaus)
        .slice(0,12);
    })
    .catch(()=>[]);
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
  const s = String(src||""), m = s.match(/\/(\d{2,4})px-/);
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
    img.insertAdjacentHTML("beforebegin", `<button class="lb-nav prev" aria-label="Vorheriges Bild">‹</button>`);
    img.insertAdjacentHTML("afterend", `<button class="lb-nav next" aria-label="Nächstes Bild">›</button>`+
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
    d.innerHTML = `<b>Bild nicht verfügbar</b><br>Der Bildserver (Wikimedia Commons) liefert diese Datei gerade nicht aus.`+
      (it.file ? `<br><a href="https://commons.wikimedia.org/wiki/File:${esc(encodeURIComponent(it.file))}" target="_blank" rel="noopener">Datei auf Commons öffnen</a>` : "");
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
document.addEventListener("keydown",e=>{                // Capture: Esc gilt zuerst der Lightbox, nicht dem Modal dahinter
  if(!document.querySelector(".lbscrim")) return;
  if(e.key==="Escape"){ e.stopPropagation(); e.preventDefault(); return closeLightbox(); }
  if(lbList.length>1 && (e.key==="ArrowLeft"||e.key==="ArrowRight")){    // Galerie blättern
    e.stopPropagation(); e.preventDefault(); lbShow(lbIdx + (e.key==="ArrowRight"?1:-1));
  }
}, true);
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
/* ---------- Sorte/Varietät, aber nur der Artikel der Art? ----------
   Für Sorten gibt es keinen eigenen Wikipedia-Artikel – die Kandidatenkette landet
   beim Artikel der Art (»Seidiger Hartriegel« für 'Flaviramea'). Der Text passt
   (dieselbe Art), das Artikelbild zeigt aber die Art in ihrer typischen Form – für
   eine Sorte mit beschreibendem Namen (gelbes statt rotes Holz) irreführend.
   Deshalb: deutlich kennzeichnen, und wo das Artbild für diese Karte nicht zulässig
   ist (artLevelOk – beschreibende Sorte, Varietät mit Geschwistern in der Liste),
   das Sortenfoto aus derselben Bildsuche wie im Bilder-Quiz zeigen; gibt es keins,
   lieber gar kein Bild. Phantasienamen ohne Geschwister behalten das Artbild, aber
   mit Hinweis. Placeholder ('Sorte') und Autonyme sind die Art selbst → nichts. */
async function taxonNote(card, pg, data){
  const kind = cultivarKind(card.a); if(kind!=="cv" && kind!=="infra") return;
  const inf = infraEpithet(card.a), cv = cultivarName(card.a), epi = binomEpithet(card.a);
  if(kind==="infra" && inf===epi.toLowerCase()) return;                         // Autonym (subsp. kousa) = die Art selbst
  const sub = (inf || cv).toLowerCase();
  if(!sub || ((pg.title||"")+" "+(pg.extract||"")).toLowerCase().indexOf(sub) >= 0) return;   // Artikel meint die Sorte/Varietät
  const rang = epi ? "Art" : "Gattung", taxon = epi ? norm(card.g+" "+epi) : card.g;
  const m = /\b(?:var|subsp|ssp|convar|f|cv)\.\s*[a-zäöüß-]+/i.exec(norm(card.a));
  const was = kind==="cv" ? `die Sorte '${esc(cv)}'` : `die ${/subsp|ssp/i.test(m?m[0]:"") ? "Unterart" : "Varietät"} »${esc(m ? m[0].replace(/\s+/g," ") : inf)}«`;
  const lab = `Artikel zur ${rang} <i>${esc(taxon)}</i>`;
  if(artLevelOk(card)){ data.note = `${lab} – das Bild zeigt die ${rang}, nicht ${was}.`; return; }
  let hit = null; try{ hit = await photoFor(card); }catch(e){ hit = null; }     // Sortenfoto aus der Quiz-Suche (Cache oder Netz)
  if(hit && hit.thumb){
    const bild = hit.art ? (hit.art==="herbar" ? "der Herbarbeleg" : "die Zeichnung") : "das Bild";   // Notnagel der Bildsuche (kein Foto auf Commons)
    data.thumb = hit.thumb;
    data.photo = { file:hit.file||"", url:hit.url||"", artist:hit.artist||"", license:hit.license||"", alt: hit.art ? "Zeichnung der Sorte" : "" };
    const urls = (hit.gal && hit.gal.length>1) ? hit.gal : [hit.thumb];
    data.gallery = urls.map((u,i)=>({ src:u, label:`Bild ${i+1} – ${was.replace(/^die /,"")}`, w:(hit.galInfo && hit.galInfo[i] && hit.galInfo[i].w)||0 }));
    data.note = `${lab} – der Text gilt der ${rang}; ${bild} zeigt ${was}${hit.art ? " (ein Foto gibt es auf Wikimedia Commons nicht)" : ""}.`;
  }else{
    data.thumb = null;
    data.note = `${lab} – das Artikelbild zeigt die ${rang} und ist hier weggelassen; ein Bild von ${was.replace(/^die /,"der ")} liegt nicht vor.`;
  }
}
/* Gattungs-Notnagel kennzeichnen. Wie bei den Sorten: Gibt es aus der Bildsuche des
   Bilder-Quiz ein Foto DIESER Art (Cache oder Netz – »Syringa × chinensis« hat eine eigene
   Commons-Kategorie), ersetzt es das Gattungsbild; sonst bleibt das Gattungsbild, und der
   Hinweis sagt, dass es die Gattung zeigt. */
async function genusNote(card, pg, data){
  const full = norm(card.g+" "+card.a), gen = norm(card.g||"");
  const titel = pg.title && pg.title.toLowerCase()!==gen.toLowerCase() ? ` (${esc(pg.title)})` : "";
  const lab = `<b>Kein eigener Wikipedia-Artikel</b> zu <i>${esc(full)}</i> – stattdessen der Artikel zur <b>Gattung</b> <i>${esc(gen)}</i>${titel}.`;
  let hit = null; try{ hit = await photoFor(card); }catch(e){ hit = null; }
  if(hit && hit.thumb){
    const bild = hit.art ? (hit.art==="herbar" ? "der Herbarbeleg" : "die Zeichnung") : "das Bild";   // Notnagel der Bildsuche (kein Foto auf Commons)
    data.thumb = hit.thumb;
    data.photo = { file:hit.file||"", url:hit.url||"", artist:hit.artist||"", license:hit.license||"", alt: hit.art ? "Zeichnung der Art" : "Bild der Art" };
    const urls = (hit.gal && hit.gal.length>1) ? hit.gal : [hit.thumb];
    data.gallery = urls.map((u,i)=>({ src:u, label:`Bild ${i+1} – ${full}`, w:(hit.galInfo && hit.galInfo[i] && hit.galInfo[i].w)||0 }));
    data.note = `${lab} Der Text beschreibt die Gattung; ${bild} zeigt diese Art${hit.art ? " (ein Foto gibt es auf Wikimedia Commons nicht)" : ""}.`;
  }else{
    data.note = `${lab} Text und Bild beschreiben die Gattung – nicht unbedingt diese Art.`;
  }
}
async function loadWiki(card, host, btn){
  if(navigator.onLine===false){
    host.innerHTML='<div class="wp-note">Offline – für Online-Infos ist Internet nötig. Die Links oben funktionieren, sobald du online bist.</div>'; return;
  }
  btn.disabled=true; btn.textContent="lädt …";
  // »Nicht gefunden« darf nur heißen: JEDE Anfrage wurde beantwortet und keine traf. Blieb
  // auch nur eine ohne Antwort (Zeitüberschreitung, Drosselung, API-Fehler), ist das ein
  // Verbindungsproblem – nicht cachen, Wiederholung anbieten. (Realfall: »kein Artikel – auch
  // nicht zur Gattung« für Lonicera nitida 'Elegant', obwohl »Lonicera« → Heckenkirschen existiert.)
  let pg=null, antworten=0, fehler=0, gattung=false;
  const frag = async t=>{ try{ const d=await wikiJSONP(t); antworten++; return wikiFirstPage(d); }catch(e){ fehler++; return null; } };
  for(const t of wikiCandidates(card)){ pg = await frag(t); if(pg) break; }
  if(!pg){                                              // Gattungs-Notnagel: nur ein echter Gattungsartikel, deutlich gekennzeichnet
    for(const t of wikiGenusCandidates(card)){
      const p = await frag(t); if(p && genusArticleOk(p, card)){ pg=p; gattung=true; break; }
    }
  }
  if(!pg){
    if(fehler===0 && antworten>0){                      // echte „nicht gefunden" – cachen, Knopf weg
      wikiCache.set(card.key, null);
      host.innerHTML='<div class="wp-note">'+WP_NONE+'</div>';
      if(btn.parentNode) btn.remove();
    } else {                                            // offline/gedrosselt/Zeitüberschreitung – nicht cachen, Wiederholung anbieten
      host.innerHTML='<div class="wp-note">Online-Infos konnten nicht geladen werden – '+fehler+' von '+(antworten+fehler)+
        ' Anfragen an Wikipedia blieben ohne Antwort (offline, langsam oder gedrosselt). Die Links oben funktionieren weiterhin.</div>';
      btn.disabled=false; btn.innerHTML=ico("globe")+" Erneut versuchen";
    }
    return;
  }
  const data = { title:pg.title, extract:shortenExtract(pg.extract),
    thumb: pg.thumbnail && pg.thumbnail.source,
    url: "https://de.wikipedia.org/wiki/"+encodeURIComponent(pg.title.replace(/ /g,"_")) };
  if(gattung) await genusNote(card, pg, data);          // Gattungs-Notnagel → kennzeichnen, ggf. Foto dieser Art
  else await taxonNote(card, pg, data);                 // Sorte/Varietät, aber nur Artikel der Art? → kennzeichnen, ggf. Sortenfoto
  wikiCache.set(card.key, data); renderWiki(host, data); if(btn.parentNode) btn.remove();
  // Weitere Bilder des Artikels nachladen – sie machen die Vollbild-Ansicht zur
  // kleinen Galerie. Schlägt es fehl, bleibt es beim einen Vorschaubild. Zeigt die
  // Karte das Sortenfoto (oder bewusst kein Bild), entfällt die Artikel-Galerie –
  // sie zeigte die Art.
  if(data.photo || !data.thumb) return;
  wikiGallery(pg.title).then(list=>{
    if(!list.length) return;
    data.gallery = list; wikiCache.set(card.key, data);
    const img = host.querySelector("img"); if(img) lbWire(img, "Bilder ansehen", list);
  }).catch(()=>{});
}
/* ---------- Bilder-Quiz: Foto erkennen (opt-in, braucht Internet) ----------
   Prüfungsnah: Man sieht die Pflanze und muss sie benennen – hier als Bild
   statt in echt. Die Bilder sind das Artikelbild der deutschen Wikipedia
   (meist ein Foto, gelegentlich eine botanische Tafel; JSONP wie die
   Text-Anreicherung, kein fetch/XHR), die Bildrechte
   fragen wir NACH der Antwort bei Wikimedia Commons nach und weisen sie aus.
   Bewusst ein EIGENER Modus: Er lädt nichts beim Seitenaufbau, und ohne Netz
   sagt er das klar – Karteikarten, Quiz, Tippen und Liste bleiben offline voll
   nutzbar. */
const LS_PHOTOS = LS_PREFIX+"photos7";                // gemerkte Bild-URLs (spart API-Abrufe; »7« = Bildfilter mit Wortgrenzen – Hortensien & Co. bekommen jetzt ein eigenes Foto, alte Fehltreffer verfallen)
let photoStore = null, photoMisses = 0;
function photoStoreLoad(){
  if(photoStore) return photoStore;
  try{ photoStore = JSON.parse(store.get(LS_PHOTOS)||"{}") || {}; }catch(e){ photoStore = {}; }
  return photoStore;
}
const PHOTO_CAP = 400;                                 // Audit: 1500 Einträge samt Galerie + Nachweis kamen an die 5-MB-Grenze
let photoSaveT = null;
function photoRemember(key, val){
  const s = photoStoreLoad(); delete s[key]; s[key] = val;   // neu einsortieren → der älteste Eintrag fällt zuerst
  const ks = Object.keys(s);
  for(let i=0; ks.length-i > PHOTO_CAP; i++) delete s[ks[i]];
  clearTimeout(photoSaveT); photoSaveT = setTimeout(photoStoreFlush, 250);   // gebündelt – jedes Bild serialisierte sonst den ganzen Cache
}
function photoStoreFlush(){
  photoSaveT = null;
  const s = photoStoreLoad();
  if(!store.set(LS_PHOTOS, JSON.stringify(s))){        // Speicher voll: ältere Hälfte verwerfen, einmal nachsetzen
    const ks = Object.keys(s); ks.slice(0, Math.ceil(ks.length/2)).forEach(k=>delete s[k]);
    try{ store.set(LS_PHOTOS, JSON.stringify(s)); }catch(e){}
  }
}
try{ addEventListener("pagehide", ()=>{ if(photoSaveT){ clearTimeout(photoSaveT); photoStoreFlush(); } }); }catch(e){}
function wikiPage(d){                                  // erste Seite der Antwort (auch ohne extract)
  const pg = d && d.query && d.query.pages; if(!pg) return null;
  const k = Object.keys(pg)[0]; if(!k || k==="-1") return null;
  const p = pg[k]; return (p && p.missing===undefined) ? p : null;
}
/* Verbreitungskarten, Diagramme, Wappen – und Buchdeckel/Titelseiten/Scans aus
   digitalisierten Werken – taugen nicht zum Erkennen. Vorsicht bei »buch«:
   Bu-che (Fagus) und Bu-chs-baum (Buxus) dürfen NICHT matchen, deshalb nur
   eindeutige Wörter (einband, buchdeckel, \bbook\b, \bcover\b …). */
function usablePhoto(file){
  if(!file) return true;
  if(/\.(svg|pdf|djvu)$/i.test(file)) return false;  // PDF/DjVu = digitalisierte Bücher; ihr Vorschaubild ist der Buchdeckel
  if(/\(ia\b/i.test(file)) return false;             // »(IA xyz)« = Internet-Archive-Buchscan (»Garten-Dill« traf so ein Werk von 1768)
  const f = String(file).replace(/[_\-.]+/g, " ");   // _-. sind Wortzeichen – erst normalisieren, sonst greift \b nicht (Book_cover)
  // Karten/Diagramme/Wappen – mit WORTGRENZEN: als Teilstring verwarf »range« jede Hydrangea,
  // »map« jeden »maple«-Dateinamen und »orange« jede Zitrusfrucht (Audit-Fund). Deutsche
  // Komposita bleiben erfasst (»Verbreitungskarte«: Präfix »verbreitung«, Suffix »karte«).
  if(/(\bmaps?\b|karten?\b|\bdistribution\b|\branges?\b|verbreitung|\blocator\b|\bdiagrams?\b|\bcharts?\b|\bwappen\b|\blogos?\b|\bsignature\b)/i.test(f)) return false;
  return !/(\bcover\b|einband|buchdeckel|deckblatt|titelblatt|titelseite|\btitle ?page\b|frontispi[sz]|manuscript|manuskript|handschrift|codex|\bbook\b|\bscans?\b|\bscanned\b)/i.test(f);
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
const GRP_RE   = /(cultivars?|hybriden?|in sorten|-?grp\.|gruppe|group)/i;
function infraEpithet(a){ const m = INFRA_RE.exec(norm(a||"")); return m ? m[1].toLowerCase() : ""; }
/* Was für ein Name ist das? "infra" = Varietät/Unterart (var. cerasiforme), "cv" = benannte
   Sorte ('Nigra', 'Bristol Ruby'), "placeholder" = die Liste meint »irgendeine Sorte«
   ('Sorte', »Hybriden«, »in Sorten«, »Grp.«) – dafür IST das Artbild das richtige Bild,
   eine Sorten-Suche wäre sinnlos. "" = reine Art. */
function cultivarKind(a){
  a = norm(a||"");
  if(INFRA_RE.test(a)) return "infra";
  const cv = cultivarName(a);
  if(cv) return /^sorten?$/i.test(cv) ? "placeholder" : "cv";
  return GRP_RE.test(a) ? "placeholder" : "";
}
function isCultivarName(a){ return cultivarKind(a) !== ""; }
/* Sortennamen, die eine SICHTBARE Abweichung von der Art benennen – Farbe (nigra,
   purpurea, aurea, glauca, variegata …), Wuchs (nana, fastigiata, pendula, contorta,
   repanda …) oder Blatt (crispa, dissecta …). Für solche Sorten ist ein Bild der ART
   schlicht falsch (Realfälle: Blutpflaume 'Nigra' → weiß blühende Kirschpflaume,
   Cornus sericea 'Flaviramea' → rotholziger Hartriegel). Phantasie- und Züchternamen
   ('Bristol Ruby', 'Koster', 'Hancock') dürfen dagegen auf das Artbild zurückfallen,
   wenn keine Geschwister in der Liste stehen – dort ist die Abweichung selten
   bildentscheidend, und oft gibt es gar kein eigenes Sortenbild. Gegen alle
   Sortennamen der 14 Listen durchgesehen (s. tests/learn.mjs). */
const CV_DESC_RE = /(nigr|purpur|atro|rubr|rubens|\bros[ea]|\baure|\blute|\bflav|\balb[au]|variegat|marginat|argent|glauc|caerul|blue|gold|silver|silber|\bred\b|\brot\b|yellow|gelb|white|weiss|purple|pink|contort|tortuos|pendul|fastigiat|column|\bnan[au]s?\b|compact|globos|conic|pyramid|erect|repand|horizontal|prostrat|procumb|tristis|youngii|weeping|dwarf|zwerg|crisp|dissect|lacinia|squarros|echinif|teppich|carpet|gracil|smaragd|emerald|sunburst|\bsun ?spot|evergold|hibernic|hibernik|\bmops\b|danica|elegantissim|punice|nidiform|minim)/;
function descriptiveCultivar(name){
  const n = deacc(String(name||"").toLowerCase()).replace(/[_\-]+/g," ");
  return !!n && CV_DESC_RE.test(n);
}
function looksIllustration(file){                     // alte Tafeln/Sammelbilder statt Foto – nach dem DATEINAMEN
  const f = deacc(String(file||"").toLowerCase()).replace(/[_\-.]+/g," ");   // »Köhler–s Medizinal-Pflanzen« → kohler…; _-. werden Wortgrenzen
  return /(illustration|kohler|koehler|\bkoeh\b|medizinal|\bsturm\b|\bthome\b|liebig|\bplates?\b|drawing|zeichnung|botanical (illustration|art|plate|drawing|print|magazine)|\btafel|gravure|lithograph|herbarium|herbarbeleg|specimen|exsiccat|woodcut|holzschnitt|engraving|abbildung)/.test(f);
}
/* Krankheits-/Schädlings-/Schadbilder: Fotos von Rost, Mehltau, Fraßschäden, Larven …
   nennen die WIRTSPFLANZE im Dateinamen und gewinnen sonst über commonsScore
   (Realfall Feuerbohne: »Uromyces appendiculatus telia at Phaseolus coccineus«).
   Als Bestimmungsfoto unbrauchbar → hart verwerfen. Wortliste gegen alle 2114
   Arten geprüft; »botrytis« fehlt BEWUSST (Brassica oleracea var. botrytis =
   Blumenkohl), Gallen nur englisch/als Kompositum (»St. Gallen«-Fotos bleiben). */
function looksDamage(file){
  const f = deacc(String(file||"").toLowerCase()).replace(/[_\-.]+/g," ");
  return /(telia|teliospor|uredini|aecidi|\brusts?\b|\brost\b|mildew|mehltau|blight|leaf ?spot|blattfleck|disease|krankheit|infect|infest|\bdamaged?\b|\bschaden\b|befall|\bgalls?\b|gallmilbe|gallwespe|pflanzengalle|leaf ?miner|blattminier|\blarvae?\b|\blarven?\b|\braupen?\b|caterpillar|aphid|blattlaus|\bpests?\b|pathogen|\bfungus\b|\bfungi\b|pilzbefall|\bvirus\b|chlorosis|chlorose|necrosis|nekrose|deficiency|uromyces|puccinia|erysiphe|peronospora|phytophthora|fusarium|septoria|colletotrichum|alternaria|sclerotinia|monilinia|venturia|missbildung|fasciation|fasziation|verb(ae|a)nderung)/.test(f);
}
/* ---------- Zeichnungen, Tafeln, Herbarbelege, Buchscans: raus ----------
   Rückmeldung mit Screenshot: Im Bilder-Quiz erschien eine Tafel aus einem
   digitalisierten Buch von 1841 (»Bulletin de la Société … de Moscou«) – der
   Dateiname verrät so etwas oft nicht. Verlässlicher sind die METADATEN der Datei
   auf Commons: ihre Kategorien (»Botanical illustrations«, »Files from the
   Biodiversity Heritage Library«, »Herbarium specimens of …«), der Urheber
   (»Internet Archive Book Images«) und die Quelle. Commons liefert sie in derselben
   Antwort wie die Bild-URL (iiprop=extmetadata) – kostet also keinen zusätzlichen
   Abruf; für das Artikelbild der Wikipedia fragen wir sie einmal VOR dem Anzeigen
   ab (der Bildnachweis kam bisher ohnehin nach der Antwort – jetzt eben vorher, und
   dafür entfällt der Abruf danach). FOTOS GEHEN IMMER VOR. Zeichnungen, Tafeln und
   Herbarbelege sind seit der Rückmeldung »lieber Zeichnung als gar kein Bild« der
   NOTNAGEL: Sie werden während der Suche gesammelt (artKind) und nur gezeigt, wenn auf
   keinem Weg ein Foto zu finden ist – gekennzeichnet (»Zeichnung · kein Foto verfügbar«,
   ein aufgedruckter Name kann die Lösung verraten). Nie als Notnagel: Karten, Diagramme,
   Etiketten, Briefmarken, Buchscans/PDFs, Textseiten – die zeigen die Pflanze nicht.
   (In der Info-Karte bleiben Tafeln ohnehin erlaubt – beim Nachschlagen sind sie hilfreich.) */
const ART_CAT_RE = /(illustration|drawing|line art|engrav|lithograph|woodcut|etching|chromolith|painting|watercolo|aquarell|botanical art|\bplates?\b|\btafeln?\b|herbari|exsiccat|type specimen|\bscans?\b|scanned|book images|internet ?archive|biodiversity heritage|\bbhl\b|flora batava|flora danica|botanical magazine|medizinal|\bthom[eé]\b|\bsturm\b|\bprints?\b|manuscript|codex|postcard|\bstamps?\b|\bcoins?\b|artwork|\bpd-art\b|sketch|graphics?\b|diagram|\bmaps?\b|seed packet|catalog|advertis|\blabels?\b|\blogos?\b|pdf files|djvu)/i;
const ART_BY_RE  = /(internet ?archive|biodiversity heritage|\bbhl\b|herbari|archive\.org|biodiversitylibrary)/i;
function metaValue(m, k){ const v = m && m[k] && m[k].value; return v==null ? "" : String(v).replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim(); }
function looksArtwork(meta){                           // meta = imageinfo[0].extmetadata; ohne Metadaten nicht prüfbar → gilt als Foto
  if(!meta) return false;
  return ART_CAT_RE.test(metaValue(meta,"Categories")) || ART_BY_RE.test(metaValue(meta,"Artist")+" "+metaValue(meta,"Credit"));
}
/* Was für ein Nicht-Foto ist das? "zeichnung" (Illustration, Tafel, Stich, Aquarell, Köhler …)
   und "herbar" (Herbarbeleg) zeigen die Pflanze und taugen als Notnagel – Zeichnung vor Beleg;
   "" = kein Kunstwerk ODER Karte/Diagramm/Etikett/Logo/Briefmarke/Buchscan/Textseite (nie zeigen).
   Entschieden nach Dateiname UND Commons-Kategorien: »Bulletin … de Moscou (1841)« sagt
   nichts, die Kategorie »Botanical illustrations« schon. */
const ART_HERB_RE  = /(herbari|exsiccat|specimen|herbarbeleg)/i;
const ART_NOPIC_RE = /(\bmaps?\b|\bkarten?\b|diagram|\bcharts?\b|distribution|verbreitung|\blabels?\b|etikett|\blogos?\b|\bstamps?\b|briefmarke|\bcoins?\b|postcard|postkarte|seed packet|catalog|advertis|manuscript|codex|\bscans?\b|scanned|pdf files|djvu|graphics?\b|signature|\bcovers?\b|title ?pages?)/i;
function artKind(file, meta){
  if(!looksIllustration(file) && !looksArtwork(meta)) return "";
  const cats = metaValue(meta,"Categories"), f = deacc(String(file||"").toLowerCase()).replace(/[_\-.]+/g," ");
  if(ART_NOPIC_RE.test(cats) || ART_NOPIC_RE.test(f)) return "";
  return (ART_HERB_RE.test(cats) || ART_HERB_RE.test(f)) ? "herbar" : "zeichnung";
}
function metaCredit(meta){                             // Urheber + Lizenz für den Bildnachweis
  const artist = metaValue(meta,"Artist"), license = metaValue(meta,"LicenseShortName");
  return (artist || license) ? { artist, license } : null;
}
function fileMetaQuery(file){                          // Metadaten EINER Commons-Datei (Artikelbild der Wikipedia: Tafel? Urheber/Lizenz?)
  return jsonp("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo"+
    "&iiprop=mime%7Cextmetadata&iiextmetadatafilter=Categories%7CArtist%7CCredit%7CLicenseShortName&titles=File:"+
    encodeURIComponent(file)).then(apiOk);
}
async function fileMeta(file){                          // → {art, kind, mime, credit} | null (nicht auf Commons → nicht prüfbar)
  const p = wikiPage(await fileMetaQuery(file)), ii = p && p.imageinfo && p.imageinfo[0];
  if(!ii) return null;
  return { art: looksArtwork(ii.extmetadata), kind: artKind(file, ii.extmetadata), mime: ii.mime||"", credit: metaCredit(ii.extmetadata) };
}
function fileMentionsOther(file, card){               // Dateiname nennt eine andere Art derselben Gattung
  const gen = norm(card.g||"").toLowerCase(); if(!gen) return false;
  const epi = binomEpithet(card.a||"").toLowerCase(), inf = infraEpithet(card.a||"");
  if(!epi) return false;                              // gattungsreine Karte (»Weigela 'Bristol Ruby'«): jede Art der Gattung darf sie vertreten
  const cv = cultivarName(card.a||"").toLowerCase().split(" ")[0];   // »Prunus cerasifera Nigra 01.jpg« nennt keine andere Art
  const ok = new Set([epi, inf, cv, "var","subsp","ssp","sect","nothof"].filter(Boolean));
  synCards(card).forEach(s=>{ const e=binomEpithet(s.a).toLowerCase(), i=infraEpithet(s.a); if(e) ok.add(e); if(i) ok.add(i); });   // Synonym-Epitheta (»ligustrina«, »yunnanensis«) = dieselbe Pflanze
  const w = String(file||"").replace(/[_\-.,()']/g," ").split(/\s+/).filter(Boolean);
  for(let i=0;i<w.length-1;i++){
    const a = w[i].toLowerCase(), b = w[i+1].toLowerCase().replace(/\d+$/,"");
    if(a!==gen || !/^[a-zäöüß]{4,}$/.test(b)) continue;
    if(!ok.has(b)) return true;
  }
  return false;
}
function pageFitsCard(p, card){                       // Artikel muss die Pflanze meinen, nicht ein Homonym
  const gen = norm(card.g||"").toLowerCase().replace(/^×\s*/,""); if(!gen) return true;   // Hybridgattung ohne × (im Artikel steht »× Hesperotropsis« mit Leerzeichen)
  const txt = ((p.title||"")+" "+(p.extract||"")).toLowerCase();
  const gens = [gen].concat(synCards(card).map(s=>norm(s.g).toLowerCase().replace(/^×\s*/,"")));   // Synonym-Gattung (»Mahonia« für Berberis aquifolium)
  return gens.some(g=>g && txt.indexOf(g)>=0);
}
let binomCount = new Map();                           // Binom → Zahl der Arten im Profil (Sorten-Geschwister)
function buildBinomIndex(){
  binomCount = new Map();
  allCards.forEach(c=>{ const b=searchName(c).toLowerCase(); binomCount.set(b,(binomCount.get(b)||0)+1); });
}
function artLevelOk(card){                            // darf ein Bild der ART gezeigt werden?
  const kind = cultivarKind(card.a);
  if(kind==="cv" && descriptiveCultivar(cultivarName(card.a))) return false;   // 'Nigra' ≠ Kirschpflaume – nie das Artbild
  if(kind!=="infra" && kind!=="cv") return true;      // reine Art oder Platzhalter ('Sorte', Hybriden) → Artbild ist das richtige Bild
  return (binomCount.get(searchName(card).toLowerCase())||0) <= 1;   // Geschwister in der Liste? dann nein
}
function photoSteps(card){                            // Suchwege, vom genauesten zum gröbsten
  const binom = searchName(card), de = (card.de||"").split(/[,;/]/)[0].trim();
  const kind = cultivarKind(card.a), inf = infraEpithet(card.a), cv = cultivarName(card.a), steps = [];
  if(kind==="infra" || kind==="cv"){
    // fein: genau dieses Taxon bzw. diese Sorte (Commons-Kategorien heißen »Prunus cerasifera 'Nigra'«)
    const full = kind==="cv" ? `${binom} '${cv}'` : norm(card.g+" "+card.a).replace(/\s+/g," ").trim();
    const sub  = inf || cv, subQ = /\s/.test(sub) ? `"${sub}"` : sub;   // mehrteilige Sortennamen als Phrase
    steps.push({k:"cm", q:`incategory:"${full}"`});                       // exakte Taxon-/Sorten-Kategorie
    steps.push({k:"cm", q:`incategory:"${binom}" ${subQ}`});              // Sorte innerhalb der Art-Kategorie
    steps.push({k:"cm", q:`"${full}"`});
    if(de){ steps.push({k:"wp", q:de}); steps.push({k:"cm", q:`"${de}"`}); }
    steps.push({k:"cm", q:`${binom} ${subQ}`});                          // Volltext, alle Wörter müssen vorkommen
    // grob (Artniveau) – nur wenn das für diese Karte zulässig ist (artLevelOk)
    if(artLevelOk(card)){ steps.push({k:"wp", q:binom}); steps.push({k:"cm", q:`incategory:"${binom}"`}); }
  }else{                                              // reine Art, Sektion oder Platzhalter-Sorte: direkt das Taxon
    const taxon = taxonName(card);                     // Hybride mit »×«, Sektion »Gattung sect. Name« – so heißen Artikel und Kategorien
    steps.push({k:"wp", q:taxon});
    if(taxon!==binom && !sectName(card.a)) steps.push({k:"wp", q:binom});   // Hybride auch ohne Zeichen (»Amelanchier lamarckii« leitet weiter);
                                                                          // bei Sektionen NICHT die Gattung (ihr Artikelbild zeigt irgendeine Art)
    steps.push({k:"cm", q:`incategory:"${taxon}"`});                      // Commons-Kategorie des Taxons (Löwenzahn: 157 Dateien)
    const alt = /\(([a-zäöüß-]{3,})\)/.exec(norm(card.a||""));            // »Rubus sect. Rubus (fruticosus)« → Rubus fruticosus
    if(alt) steps.push({k:"wp", q:norm(card.g+" "+alt[1])});
    if(de) steps.push({k:"wp", q:de});
    steps.push({k:"cm", q:taxon});                                        // Volltext, z. B. »Osmanthus burkwoodii« (Kategorie heißt »× burkwoodii«)
  }
  // Synonyme der Liste (Artniveau): Commons/Wikipedia führen die Art oft unter dem ANDEREN Namen
  // (»Lonicera nitida« = leere Kategorie; die Fotos liegen unter »Lonicera ligustrina var. yunnanensis«)
  if((kind!=="infra" && kind!=="cv") || artLevelOk(card)){
    synCards(card).forEach(s=>{
      const t = (infraEpithet(s.a) || cultivarName(s.a)) ? norm(s.g+" "+s.a) : taxonName(s);   // infraspezifisches Synonym ganz (»… var. yunnanensis« – die Art allein wäre ein anderes Taxon)
      if(steps.some(x=>x.q===t)) return;
      steps.push({k:"wp", q:t}); steps.push({k:"cm", q:`incategory:"${t}"`}); steps.push({k:"cm", q:t}); });
  }
  return steps;
}
let jsonp = (...a) => jsonpGet(...a);                 // austauschbar: die Tests laufen ohne Netz
function wikiArticleQuery(title){                     // Artikelbild + erster Satz in EINER Anfrage
  return jsonp("https://de.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages%7Cextracts"+
    "&exintro=1&explaintext=1&exsentences=1&piprop=thumbnail%7Cname&pithumbsize=640&redirects=1&titles="+
    encodeURIComponent(title)).then(apiOk);
}
function commonsQuery(q){                             // Dateien auf Commons suchen (Kategorie oder Phrase) – samt Metadaten (Tafel? Urheber/Lizenz)
  return jsonp("https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search"+
    "&gsrnamespace=6&gsrlimit=12&gsrsearch="+encodeURIComponent(q)+
    "&prop=imageinfo&iiprop=url%7Cmime%7Csize%7Cextmetadata&iiextmetadatafilter=Categories%7CArtist%7CCredit%7CLicenseShortName&iiurlwidth=640").then(apiOk);   // 640 → Server rundet auf 960 px (Standardstufe)
}
/* Dateien, die die Pflanze im Namen führen, sind meist gezielte Aufnahmen –
   besser als ein beliebiges Bild aus derselben Kategorie (»Hortus Haren … 24.jpg«). */
function commonsScore(file, card){
  const f = deacc(String(file||"").toLowerCase());
  const gen = deacc(norm(card.g||"").toLowerCase().replace(/^×\s*/,""));
  const epi = deacc((binomEpithet(card.a||"") || sectName(card.a||"")).toLowerCase());   // Sektion zählt wie ein Epitheton (»Taraxacum sect. Ruderalia 01.JPG«)
  const de = deacc(((card.de||"").split(/[,;/]/)[0]||"").toLowerCase().trim());
  let s = 0;
  const synEpi = synCards(card).some(x=>{ const e=deacc(binomEpithet(x.a).toLowerCase()); return e && f.indexOf(e)>=0; });
  if(gen && f.indexOf(gen)>=0) s += ((epi && f.indexOf(epi)>=0) || synEpi) ? 4 : 2;
  if(de && de.length>4 && f.indexOf(de)>=0) s += 3;
  return s;
}
function pickCommons(d, card, artOut){                // bester Treffer der Commons-Suche; artOut: Sammelliste für Zeichnungen/Belege (Notnagel)
  const pg = (d && d.query && d.query.pages) || null; if(!pg) return null;
  const list = Object.keys(pg).map(k=>pg[k]).sort((a,b)=>(a.index||0)-(b.index||0));
  const ok = [];
  list.forEach((p, i)=>{
    const file = String(p.title||"").replace(/^File:/i,"").replace(/^Datei:/i,"");
    const ii = p.imageinfo && p.imageinfo[0]; if(!ii || !(ii.thumburl||ii.url)) return;
    if(ii.mime && (!/^image\//i.test(ii.mime) || /djvu/i.test(ii.mime))) return;   // PDF/DjVu-Buchscans: Vorschau = Buchdeckel
    if(!usablePhoto(file) || looksDamage(file) || fileMentionsOther(file, card)) return;
    const meta = ii.extmetadata || null;
    const cand = { thumb: ii.thumburl || ii.url, file, i, w: ii.width||0, sc: commonsScore(file, card), credit: metaCredit(meta),
              url: ii.descriptionurl || ("https://commons.wikimedia.org/wiki/File:"+encodeURIComponent(file)) };
    if(looksIllustration(file) || looksArtwork(meta)){   // kein Foto (Tafel/Herbarbeleg laut Dateiname, Kategorien oder Urheber)
      const kind = artKind(file, meta);              // → höchstens Notnagel; Karten/Scans/Etiketten gar nicht
      if(kind && artOut) artOut.push(Object.assign(cand, { kind, src:"cm", title: norm(card.g+" "+card.a) }));
      return;
    }
    ok.push(cand);
  });
  if(!ok.length) return null;
  ok.sort((a,b)=> b.sc-a.sc || a.i-b.i);              // Gleichstand → der zuerst gelistete (Relevanz der Suche)
  const best = ok[0];
  // Die übrigen geprüften Treffer sind weitere Ansichten DERSELBEN Art – sie kosten
  // keinen zusätzlichen Abruf und werden zur Galerie in der Großansicht (max. 6).
  const take = ok.slice(0,6);
  return Object.assign({ thumb: best.thumb, file: best.file, title: norm(card.g+" "+card.a),
           url: best.url, src:"cm", gal: take.map(o=>o.thumb),
           top: take.filter(o=>o.sc===best.sc).length,                 // so viele Ansichten sind gleich gut (Platzhalter-Arten wechseln darunter)
           galInfo: take.map(o=>Object.assign({ file:o.file, url:o.url, w:o.w }, o.credit||{})) },   // Datei + Nachweis + Originalbreite je Ansicht
         best.credit||{});   // + artist/license → Bildnachweis ohne zweiten Abruf
}
/* Notnagel wählen: Zeichnung/Tafel vor Herbarbeleg; darunter das Artikelbild der Wikipedia
   (von Menschen als Artbild gewählt) vor Commons-Funden, dann Dateien, die die Art nennen;
   dieselbe Datei kann über mehrere Wege kommen (Synonym) → nur einmal. Die übrigen werden
   zur Galerie wie bei Fotos. */
function bestArt(list){
  const seen = new Set();
  list = list.filter(o=>{ const k=String(o.file||o.thumb).replace(/_/g," ").toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; });
  const rank = o => o.kind==="zeichnung" ? 2 : 1;
  list.sort((a,b)=> rank(b)-rank(a) || (b.wp?1:0)-(a.wp?1:0) || (b.sc||0)-(a.sc||0) || (a.i||0)-(b.i||0));
  const best = list[0], take = list.slice(0,6);
  return Object.assign({ thumb: best.thumb, file: best.file, title: best.title, url: best.url, src: best.src, art: best.kind,
           gal: take.map(o=>o.thumb), top: 1,
           galInfo: take.map(o=>Object.assign({ file:o.file, url:o.url, w:o.w||0 }, o.credit||{})) },
         best.credit||{});
}
async function wikiPhoto(card){                        // → {thumb,title,file,url,src,art?,artist?,license?,tmp?} | null
  let answered = false, fehler = 0;
  const art = [], metaMemo = new Map();               // art: Zeichnungen/Belege als Notnagel; metaMemo: dieselbe Datei nur einmal abfragen
  const kind = cultivarKind(card.a), sub = (infraEpithet(card.a) || cultivarName(card.a)).toLowerCase();
  const strict = (kind==="infra" || kind==="cv") && !artLevelOk(card);   // Artbild für diese Karte NICHT zulässig
  // Kam ein FEINERER Suchweg nicht durch (Zeitüberschreitung, Ratenlimit) und ein gröberer
  // trifft, gilt der Treffer nur für diese Sitzung (tmp) – sonst stünde das Artbild für
  // immer im Speicher, obwohl es ein Sortenbild gäbe. Beim nächsten Start wird neu gesucht.
  const mark = h => { if(fehler) h.tmp = true; return h; };
  for(const st of photoSteps(card)){
    try{
      if(st.k==="cm"){
        const hit = pickCommons(await commonsQuery(st.q), card, art);
        answered = true;
        if(hit) return mark(hit);
      }else{
        const d = await wikiArticleQuery(st.q); answered = true;
        const p = wikiPage(d);
        if(!p || !p.thumbnail || !p.thumbnail.source) continue;
        if(!pageFitsCard(p, card)) continue;                       // anderer Artikel (Homonym)
        // Sorte gesucht, aber auf dem Art-Artikel gelandet? Nur zulässig, wenn das Artbild für diese Karte erlaubt ist.
        if(strict && ((p.title||"")+" "+(p.extract||"")).toLowerCase().indexOf(sub) < 0) continue;
        const file = p.pageimage || "";
        if(!usablePhoto(file) || looksDamage(file) || fileMentionsOther(file, card)) continue;
        const hit = { thumb:p.thumbnail.source, title:p.title, file, src:"wp",
                      url:"https://de.wikipedia.org/wiki/"+encodeURIComponent(String(p.title).replace(/ /g,"_")) };
        const vormerken = (kind, credit) => { if(kind) art.push(Object.assign({}, hit, { kind, wp:true, credit:credit||null, i:art.length, sc:commonsScore(file, card) })); };
        // Zeichnung laut Dateiname (Köhler, »Illustration …«)? → Notnagel vormerken, ohne Metadaten-Abruf (Nachweis kommt nach der Antwort)
        if(looksIllustration(file)){ vormerken(artKind(file, null), null); continue; }
        // Metadaten der Datei: Tafel/Herbarbeleg laut Kategorien oder Urheber? → Notnagel vormerken, nächster Weg (Buchscan/PDF: gar nicht)
        if(file && !metaMemo.has(file)) metaMemo.set(file, await fileMeta(file));
        const fm = file ? metaMemo.get(file) : null;
        if(fm && fm.mime && !/^image\//i.test(fm.mime)) continue;
        if(fm && fm.art){ vormerken(fm.kind, fm.credit); continue; }
        if(fm && fm.credit) Object.assign(hit, fm.credit);         // Bildnachweis liegt damit schon vor
        return mark(hit);
      }
    }catch(e){ fehler++; continue; }                   // einzelner Fehlversuch – nächster Weg
  }
  // »Kein Bild« darf nur heißen: ALLE Suchwege sind sauber durchgelaufen und keiner
  // hatte einen Treffer. Kam auch nur ein Weg nicht durch (Zeitüberschreitung,
  // Funkloch), ist das ein Verbindungsproblem – sonst gilt die Art fälschlich als
  // bildlos und der Bilder-Quiz fiele wegen einer schwachen Leitung zurück.
  // Kein Foto auf keinem Weg: lieber eine Zeichnung als gar kein Bild (Rückmeldung). Kam ein Weg nicht
  // durch, gilt sie nur für diese Sitzung (tmp) – beim nächsten Start wird erneut nach einem Foto gesucht.
  if(art.length) return mark(bestArt(art));
  if(!answered || fehler) throw new Error("network");
  return null;                                         // beantwortet, aber ohne passendes Bild – nicht einmal eine Zeichnung
}
let photoSource = wikiPhoto;                           // austauschbar (Tests laufen ohne Netz)
/* »Kein Bild« gilt nur für DIESE Sitzung. Früher wurde ein Fehlversuch dauerhaft
   gemerkt – ein einziger Aussetzer (schwache Verbindung, ein Suchweg lief ins
   Leere) machte die Art damit für immer bildlos, und der Bilder-Quiz fiel bei ihr
   auf eine Quizfrage zurück. Jetzt bekommt jede solche Art bei jedem neuen Start
   einen frischen Versuch; gefundene Bilder bleiben wie bisher dauerhaft gemerkt. */
const photoTried = new Set(), photoTmp = new Map();  // photoTmp: Treffer, bei denen ein feinerer Suchweg nicht durchkam – nur für diese Sitzung
const ART_TTL = 30*86400e3;                            // gemerkte Zeichnung: nach 30 Tagen erneut nach einem Foto suchen (Commons wächst)
async function photoFor(card){
  const known = photoStoreLoad()[card.key];
  const alt = !!(known && known.art && Date.now() - (known.t||0) > ART_TTL);   // Notnagel gealtert → neue Suche, die alte bleibt als Rückfall
  if(known && !alt) return known;                      // gemerktes Bild – sofort da
  if(photoTmp.has(card.key)) return photoTmp.get(card.key);
  if(photoTried.has(card.key)) return known || null;   // in dieser Sitzung schon erfolglos gesucht
  let p;
  try{ p = await photoSource(card); }                  // wirft bei Netzfehler (dann KEIN Merken → später erneut)
  catch(e){ if(known){ photoTried.add(card.key); return known; } throw e; }   // alte Zeichnung bleibt, solange die neue Suche nicht durchkommt
  if(p && p.art) p.t = Date.now();
  if(p && p.tmp){ photoTmp.set(card.key, p); return p; }   // nicht dauerhaft merken: beim nächsten Start wird wieder fein gesucht
  photoRemember(card.key, p);
  if(!p) photoTried.add(card.key);
  return p;
}
/* Bildnachweis (Urheber + Lizenz) – erst nach der Antwort, damit die Frage nicht
   verraten wird und die Anzeige nicht wartet. */
async function photoCredit(file){
  const d = await jsonp("https://commons.wikimedia.org/w/api.php?action=query&format=json"+
    "&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=Artist%7CLicenseShortName&titles=File:"+
    encodeURIComponent(file));
  const p = wikiPage(d), m = p && p.imageinfo && p.imageinfo[0] && p.imageinfo[0].extmetadata;
  return m ? metaCredit(m) : null;
}
function photoSrcLine(p){                              // Quellenzeile unter dem Bild (nach der Antwort)
  const commons = p.file ? "https://commons.wikimedia.org/wiki/File:"+encodeURIComponent(p.file) : p.url;
  return `<div class="ph-src" id="phSrc">Bild: <a href="${esc(commons)}" target="_blank" rel="noopener">Wikimedia&nbsp;Commons</a>`+
         (p.src==="cm" ? "" :                          // Commons-Treffer haben keinen Artikel dahinter
           ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">Wikipedia – ${esc(p.title)}</a>`)+
         `</div>`;
}
/* ---------- Galerie im Bilder-Quiz ----------
   Eine Pflanze zeigt sich selten auf einem Bild vollständig (Habitus, Blatt,
   Blüte, Frucht) – deshalb lässt sich die Großansicht durchblättern. Die
   Kandidaten der Commons-Suche liegen ohnehin schon vor (p.gal, kein weiterer
   Abruf); kam das Bild aus einem Wikipedia-Artikel, holen wir dessen Bilder
   erst, wenn jemand die Großansicht wirklich öffnet.
   Bewusst OHNE Dateinamen: die stehen sonst im alt-Text und verraten die Lösung. */
function photoGalList(p){
  const urls = (p && p.gal && p.gal.length) ? p.gal : (p && p.thumb ? [p.thumb] : []);
  const inf = (p && p.galInfo) || [];
  return urls.map((u,i)=>({ src:u, label:`Bild ${i+1} der gesuchten Pflanze`,
    w: (inf[i] && inf[i].w) || 0,                        // Originalbreite → Großansicht nie darüber hinaus
    id: (inf[i] && inf[i].file) || (i===0 && p.file) || u }));   // nur zum Dedupen mit der Artikel-Galerie (steht nirgends im DOM)
}
/* ---------- Nicht immer dasselbe Bild zuerst ----------
   Wer eine Art immer am selben Foto sieht, lernt das Foto auswendig – nicht die
   Pflanze. Deshalb merkt sich das Werkzeug je Art, welche Ansicht zuletzt zuerst
   gezeigt wurde (pflanzenlernen.photoseen), und nimmt beim nächsten Mal die nächste:
   reihum durch alle geprüften Ansichten (Habitus, Blatt, Blüte, Frucht; bei
   Platzhalter-Arten verschiedene Sorten). Die erste Begegnung zeigt die am besten
   bewertete Ansicht; nennen mindestens zwei Dateinamen die Art, bleibt die Rotation
   unter diesen (ein Kategoriebild ohne Namen im Dateinamen ist seltener eindeutig).
   Die Galerie beginnt mit der gezeigten Ansicht, Datei und Bildnachweis gehören zu ihr. */
const LS_SEEN = LS_PREFIX+"photoseen";
let photoSeenStore = null;
function photoSeenLoad(){
  if(!photoSeenStore){ try{ photoSeenStore = JSON.parse(store.get(LS_SEEN)||"{}") || {}; }catch(e){ photoSeenStore = {}; } }
  return photoSeenStore;
}
function photoSeenGet(key){ const v = photoSeenLoad()[key]; return (typeof v==="number") ? v : null; }
function photoSeenSet(key, i){
  const s = photoSeenLoad(); delete s[key]; s[key] = i;   // neu einsortieren → der älteste Eintrag fällt zuerst
  const ks = Object.keys(s); if(ks.length > 1500) delete s[ks[0]];
  try{ store.set(LS_SEEN, JSON.stringify(s)); }catch(e){}
}
function photoVariant(p, card){
  const gal = p.gal||[], n = gal.length, key = card && card.key;
  if(n<2){ if(key) photoSeenSet(key, 0); return p; }
  const named = gal.map((_,k)=>k).filter(k => p.galInfo && p.galInfo[k] && commonsScore(p.galInfo[k].file, card||{})>0);
  const order = named.length>=2 ? named : gal.map((_,k)=>k);
  const last = key ? photoSeenGet(key) : null;
  const i = order[(order.indexOf(last)+1) % order.length];   // unbekannt/-1 → erste; sonst die nächste
  if(key) photoSeenSet(key, i);
  if(!i) return p;
  const rot = a => a.slice(i).concat(a.slice(0,i));
  const info = (p.galInfo && p.galInfo[i]) || {};
  return Object.assign({}, p, { thumb: gal[i], gal: rot(gal), galInfo: p.galInfo ? rot(p.galInfo) : p.galInfo,
    file: info.file || p.file, url: info.url || p.url, artist: info.artist || "", license: info.license || "" });
}
/* Artikelbild (src:"wp"): nur EINE Ansicht bekannt. Beim ersten Mal reicht sie; ab der
   zweiten Begegnung holen wir einmalig die Bilder des Artikels (dieselbe Abfrage wie die
   Galerie der Großansicht) und behalten die, deren Dateiname DIESE Art nennt und keine
   andere Art derselben Gattung – sie werden zu weiteren Ansichten (gemerkt, kein
   zweiter Abruf). Netzfehler schluckt wikiGallery ([]) – dann nächste Sitzung erneut. */
const photoMoreTried = new Set();
async function photoMoreViews(p, card){
  if(!p || p.art || p.src!=="wp" || !p.title || (p.gal && p.gal.length>1)) return p;   // Notnagel-Zeichnung: keine Foto-Nachsuche
  if(photoSeenGet(card.key)==null || photoMoreTried.has(card.key)) return p;   // erste Begegnung: Artikelbild reicht
  photoMoreTried.add(card.key);
  let list = [];
  try{ list = await wikiGallery(p.title, true, 640); }catch(e){ return p; }   // 640 → Server liefert die 960-px-Stufe (Quiz-Breite); nie selbst umrechnen
  const extra = list.filter(it => it.src!==p.thumb && it.file!==p.file && commonsScore(it.file, card)>0 && !fileMentionsOther(it.file, card)).slice(0,5);
  if(!extra.length) return p;
  const q = Object.assign({}, p, {
    gal: [p.thumb].concat(extra.map(it=>it.src)), top: 1,
    galInfo: [{ file:p.file, url:p.url, artist:p.artist||"", license:p.license||"" }].concat(
      extra.map(it=>({ file:it.file, w:it.w, url:"https://commons.wikimedia.org/wiki/File:"+encodeURIComponent(it.file) }))) });
  if(photoTmp.has(card.key)) photoTmp.set(card.key, q); else photoRemember(card.key, q);
  return q;
}
function photoGalLoader(p){
  if(!p || p.src!=="wp" || !p.title) return null;
  return ()=>wikiGallery(p.title, !p.art, 640).then(l=>l.map(it=>({ src:it.src, label:(p.art?"Weitere Abbildung":"Weiteres Bild")+" der gesuchten Pflanze", w:it.w, id:it.file })));   // Notnagel: auch die übrigen Zeichnungen des Artikels
}
/* ---------- Bild lädt nicht: nicht aufgeben ----------
   Alle Ansichten einer Art, jede über beide Wikimedia-Hosts (siehe hostAlt); die zweite
   Runde umgeht den Browser-Zwischenspeicher mit einem harmlosen Anhang (Query-Strings
   kennen die Thumbnail-Server ohnehin – die API liefert sie selbst mit utm_…). */
let phImgRetryMs = 1500;                                 // Pause vor der zweiten Runde
function imgChain(gal){
  const out = [];
  (gal||[]).forEach(it => { [it.src, hostAlt(it.src)].forEach(u => { if(u && out.indexOf(u)<0) out.push(u); }); });
  return out;
}
function imgBust(u){ return /^data:|^blob:/.test(u) ? u : u + (u.indexOf("?")>=0 ? "&" : "?") + "pbw=" + Date.now().toString(36); }   // je Versuch neu – sonst liefert der Browser-Cache die alte Antwort
function photoForget(key){                               // Treffer verwerfen: beim nächsten Mal frisch suchen (Datei umbenannt/gelöscht?)
  const s = photoStoreLoad();
  if(key in s){ delete s[key]; clearTimeout(photoSaveT); photoSaveT = setTimeout(photoStoreFlush, 250); }
  photoTmp.delete(key);
}
/* Auch die zweite Runde ohne Bild: Treffer verwerfen (eine umbenannte oder gelöschte Datei
   darf nicht ewig im Speicher stehen), Karte ans Ende der Runde – dort wird sie neu
   gesucht. Geht das nicht mehr (letzte Karten), bleibt eine Meldung MIT Knöpfen. */
function photoImgFailed(card, p){
  photoForget(card.key);
  if(deferPhotoCard("imgDefer")){ toast("Bild gerade nicht ladbar – die Art kommt später noch einmal."); return nextCard(); }
  const b = $("#stage").querySelector(".photobox"); if(!b) return;
  b.innerHTML = `<div class="ph-load">Bild konnte gerade nicht geladen werden.
    <div class="ph-actions"><button class="btn primary" id="phImgRetry">Nochmal versuchen</button>
    <button class="btn ghost" id="phImgOther">Andere Art zeigen</button>
    <button class="btn ghost" id="phImgQuiz" title="Nur diese eine Art ohne Bild als Auswahlfrage">Ohne Bild weiter</button></div></div>`;
  $("#phImgRetry").onclick=()=>renderPhoto();
  $("#phImgOther").onclick=()=>{ sess.imgDefer = 0; if(deferPhotoCard("imgDefer")) nextCard(); else renderPhoto(); };
  $("#phImgQuiz").onclick=()=>{ mode="quiz"; renderQuiz(); showGuidedNote(); };   // nur diese Karte; nextCard stellt den Bilder-Modus wieder her
}
/* ---------- Geduld statt Ersatzmodus ----------
   Der Bilder-Quiz bleibt der Bilder-Quiz. Eine schwache Leitung darf nicht dazu
   führen, dass plötzlich Textfragen kommen – das fühlt sich an, als wäre das
   Werkzeug kaputt. Zwei Wege statt Moduswechsel:
     · Findet sich für EINE Art gerade kein Foto, kommt sie ans Ende der Runde und
       wir machen mit der nächsten Art weiter (sie ist später wieder dran).
     · Kommt gar nichts durch, wartet der Bildschirm sichtbar auf die Verbindung
       und versucht es von selbst weiter, bis das Netz zurück ist.
   Erst wenn eine ganze Runde ohne ein einziges Bild vergangen ist, fragen wir –
   und wechseln auch dann nur, wenn der Lernende es ausdrücklich will. */
function deferPhotoCard(ctr){                         // ctr: Zähler – "photoDefer" (Suche erfolglos) oder "imgDefer" (Datei lädt nicht)
  ctr = ctr || "photoDefer";
  const rest = queue.length - qi;                      // noch offene Karten (inkl. dieser)
  if(rest < 2) return false;                           // nichts zum Tauschen
  if((sess[ctr]||0) >= rest) return false;             // schon einmal im Kreis – nicht endlos
  queue.push(queue.splice(qi,1)[0]);
  sess[ctr] = (sess[ctr]||0)+1;
  return true;
}
let phWaitTimer = null, phWaitMs = 6000;             // Takt des selbsttätigen neuen Versuchs
function phWaitStop(){ if(phWaitTimer){ clearTimeout(phWaitTimer); phWaitTimer=null; } }
function photoNotice(html){
  $("#stage").innerHTML = sessionBar() + `<div class="ph-note">${html}</div>`;
  const stop=$("#btnStop"); if(stop) stop.onclick=finishSession;
}
async function renderPhoto(){
  const c = current, sid = sess.id;
  const stale = ()=> current!==c || !sess || !sess.active || sess.id!==sid;   // Sitzung beendet/neu gestartet → nichts mehr rendern (Audit)
  phWaitStop();
  if(sess.photoGiveUp){ mode = "quiz"; return renderQuiz(); }   // ausdrücklich gewählt (s. u.)
  $("#stage").innerHTML = sessionBar() + `<div class="photobox"><div class="ph-load">Bild wird geladen …</div></div>
    <div class="options" id="opts"></div><div class="feedback" id="fb" aria-live="polite"></div><div class="ph-srcslot"></div><div class="nav" id="nav"></div>`;
  const stop=$("#btnStop"); if(stop) stop.onclick=finishSession;
  const box = ()=>$("#stage").querySelector(".photobox");
  // Lieber hartnäckig als schnell aufgeben: Ein kurzer Aussetzer (Funkloch,
  // überlastete API) heilt sich meist von selbst, deshalb zwei stille Wiederholungen
  // mit wachsender Pause, bevor überhaupt eine Meldung erscheint.
  let p=null, netFail=false;
  for(let versuch=1; versuch<=3; versuch++){
    try{ p = await photoFor(c); netFail=false; break; }
    catch(e){ netFail=true; }
    if(stale()) return;
    if(versuch===3) break;
    const b=box(); if(b) b.innerHTML=`<div class="ph-load">Bild wird geladen … <span class="ph-try">neuer Versuch ${versuch+1} von 3</span></div>`;
    await new Promise(r=>setTimeout(r, versuch*900));
    if(stale()) return;
  }
  if(stale()) return;                              // Sitzung weitergelaufen (Abbruch/Weiter)
  if(netFail){
    // Kein Moduswechsel: Der Bildschirm wartet sichtbar auf die Verbindung und
    // versucht es von selbst weiter – sobald das Netz zurück ist, geht es weiter.
    photoNotice(`<b>Warte auf die Bilder …</b> Die Fotos kommen von Wikipedia; die Verbindung ist gerade
      langsam oder weg. Sobald sie wieder da ist, geht es automatisch weiter.
      <div class="ph-dots" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="ph-actions"><button class="btn primary" id="phRetry">Jetzt nochmal versuchen</button>
      <button class="btn ghost" id="phOther">Andere Art zeigen</button></div>`);
    $("#phRetry").onclick=()=>{ phWaitStop(); renderPhoto(); };
    $("#phOther").onclick=()=>{ phWaitStop(); if(deferPhotoCard()) nextCard(); else renderPhoto(); };
    phWaitTimer = setTimeout(()=>{ if(!stale()) renderPhoto(); }, phWaitMs);
    return;
  }
  if(!p){
    // Für DIESE Art gibt es gerade kein brauchbares Foto: Karte ans Ende der Runde,
    // weiter mit der nächsten – der Bilder-Quiz bleibt ein Bilder-Quiz.
    photoMisses++;
    if(deferPhotoCard()) return nextCard();
    // Eine ganze Runde ohne ein einziges Bild – jetzt ehrlich fragen statt still
    // den Modus zu wechseln. Der Wechsel passiert nur auf Knopfdruck.
    photoNotice(`<b>Zu diesen Arten finde ich gerade kein Bild.</b> Das liegt meist an der Verbindung;
      zu wenigen Arten gibt es auf Wikimedia Commons auch schlicht weder ein Foto noch eine Zeichnung
      (Buchscans, Karten und Diagramme zeige ich nicht).
      <div class="ph-actions"><button class="btn primary" id="phRetry">Nochmal versuchen</button>
      <button class="btn ghost" id="phQuiz">Ohne Bilder weiterlernen</button></div>`);
    $("#phRetry").onclick=()=>{ sess.photoDefer=0; renderPhoto(); };
    $("#phQuiz").onclick=()=>{ sess.photoGiveUp=true; mode="quiz"; renderQuiz(); showGuidedNote(); };
    return;
  }
  photoMisses = 0; sess.photoDefer = 0;
  p = await photoMoreViews(p, c);                     // Artikelbild: ab der zweiten Begegnung weitere Ansichten holen
  if(stale()) return;
  p = photoVariant(p, c);                              // nicht immer dasselbe Bild zuerst (merkt sich die letzte Ansicht)
  const gal = photoGalList(p), viele = gal.length>1;
  const artLabel = p.art==="herbar" ? "Herbarbeleg" : "Zeichnung";   // Notnagel: kein Foto auf Commons – gekennzeichnet, Name bleibt geheim
  $("#stage").querySelector(".photobox").innerHTML =
    `<div class="ph-wrap"><img class="ph-img" id="phImg" src="${esc(p.thumb)}" alt="${p.art ? artLabel : "Bild"} der gesuchten Pflanze">`+
    (p.art ? `<span class="ph-kind" title="Zu dieser Art gibt es auf Wikimedia Commons kein Foto – ersatzweise ${p.art==="herbar" ? "ein Herbarbeleg" : "eine Zeichnung"}. Ein aufgedruckter Name kann die Lösung verraten.">${artLabel} · kein Foto verfügbar</span>` : "")+
    (viele ? `<span class="ph-more">${gal.length} Bilder</span>` : "")+`</div>`;
  const img=$("#phImg");
  // Lädt die Datei selbst nicht (Funkloch, Zeitüberschreitung, HTTP 429 am Thumbnail-
  // Cluster), nehmen wir der Reihe nach die übrigen Ansichten derselben Art – jede
  // zusätzlich über den Ausweich-Host – und nach einer kurzen Pause alle noch einmal.
  // Ein Artikelbild hat nur EINE Ansicht; früher hieß ein einziger Aussetzer dort sofort
  // »Bild konnte nicht geladen werden« (Rückmeldung Vinca minor). Scheitert auch die
  // zweite Runde, wandert die Karte ans Ende der Runde statt tot stehen zu bleiben.
  if(img){
    const chain = imgChain(gal); let k = 0, runde = 1;
    img.onload=()=>{ if(!stale()) sess.imgDefer = 0; };   // ein geladenes Bild schließt die Fehlerrunde ab
    img.onerror=()=>{
      if(stale()) return;
      k++;
      if(k < chain.length){ img.src = runde===2 ? imgBust(chain[k]) : chain[k]; return; }
      if(runde===1){ runde = 2; k = 0;
        setTimeout(()=>{ if(!stale()) img.src = imgBust(chain[0]); }, phImgRetryMs); return; }
      photoImgFailed(c, p);
    };
  }
  // antippen/Enter → Großansicht; mehrere Ansichten derselben Art als Galerie
  lbWire(img, viele ? "Bilder ansehen" : "Bild vergrößern", gal, photoGalLoader(p));
  if(photoAnswer==="exam")      renderPhotoExam(p);
  else if(photoAnswer==="type") renderPhotoType(p);
  else                          renderPhotoChoice(p);
  clockStart();                                        // erst jetzt – die Ladezeit zählt nicht mit
  prefetchPhoto();                                     // nächstes Bild schon im Hintergrund holen
}
/* Antwort 1: Auswahl aus vier Namen */
function optLabelHTML(o){                            // im »voller Name«-Quiz den botanischen Teil kursiv setzen
  if(!wantsBoth()) return esc(o);
  const i = String(o).indexOf(" · ");
  return i<0 ? esc(o) : `<i>${esc(o.slice(0,i))}</i> · ${esc(o.slice(i+3))}`;
}
function renderPhotoChoice(p){
  const c=current, opts=shuffle([answerText(c), ...distractors(c,3)]);
  const host=$("#opts"), letters=["A","B","C","D","E"];
  opts.forEach((o,i)=>{
    const b=el("button","opt"); b.innerHTML=`<span class="k">${letters[i]}</span><span>${optLabelHTML(o)}</span>`;
    b.onclick=()=>answerPhoto(b,o,p);
    host.appendChild(b);
  });
}
/* Antwort »Namen eingeben« (EIN Feld) – nur noch über ältere Duell-Links erreichbar;
   zur Wahl stehen Auswahl und »Selbst eingeben (wie in der Prüfung)« */
function renderPhotoType(p){
  $("#opts").innerHTML = `<div class="typebox">
      <input id="typeIn" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
             placeholder="${esc(answerLabel())} eingeben …">
    </div>`;
  $("#nav").innerHTML = `<button class="btn primary" id="chk">Prüfen</button>`;
  const inp=$("#typeIn"); inp.focus();
  inp.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); const b=$("#chk"); if(b) b.click(); }});
  $("#chk").onclick=()=>{
    const c=current, j=judgeTyped(inp.value, c), ok=j.lvl==="ok";
    inp.disabled=true; inp.classList.add(ok?"ok":j.lvl==="near"?"near":"no");
    finishPhotoAnswer(ok, ok?"good":j.lvl==="near"?"hard":"again", p, typeFeedback(j, c, inp.value), true);
  };
}
/* Antwort 3: wie in der Prüfung – ein Feld je bewerteter Spalte, mit Punkten */
function renderPhotoExam(p){
  const keys=examFieldList();
  $("#opts").innerHTML = `<div class="examform" id="examForm">`+
    keys.map((k,i)=>`<label class="exrow" for="ex_${k}">
        <span class="exlab">${esc(examLabel(k))}<span class="expts">${nfmt(examPts(k))} P.</span></span>
        <input id="ex_${k}" data-k="${k}" type="text" autocomplete="off" autocapitalize="${k==="de"?"sentences":"off"}"
               spellcheck="false" ${i===0?"autofocus":""}>
        <span class="exmark" id="mk_${k}"></span>
      </label>`).join("")+
    `</div>`;
  $("#nav").innerHTML = `<button class="btn primary" id="chk">Prüfen</button>`;
  const ins=[...document.querySelectorAll("#examForm input")];
  if(ins[0]) ins[0].focus();
  ins.forEach((inp,i)=>inp.addEventListener("keydown",e=>{        // Enter: nächstes Feld, am Ende prüfen
    if(e.key!=="Enter") return;
    e.preventDefault();
    if(i<ins.length-1) ins[i+1].focus(); else { const b=$("#chk"); if(b) b.click(); }
  }));
  $("#chk").onclick=()=>{
    const c=current;
    let got=0, max=0, right=0, fast=0;
    ins.forEach(inp=>{
      const k=inp.dataset.k, lvl=fieldJudge(k, inp.value, c), pts=examPts(k);
      max+=pts;
      if(lvl==="ok"){ got+=pts; right++; }
      else if(lvl==="near"){ got+=pts/2; fast++; }        // Schreibfehler: halbe Punkte (wie auf dem Bogen)
      inp.disabled=true; inp.classList.add(lvl==="ok"?"ok":lvl==="near"?"near":"no");
      const mk=$("#mk_"+k);
      if(mk) mk.innerHTML = lvl==="ok" ? `<span class="ex-ok">✓</span>`
        : lvl==="near" ? `<span class="ex-near">≈</span> <span class="ex-sol">${markDiff(fieldSolution(k,c), inp.value)}</span>`
        : `<span class="ex-no">✗</span> <span class="ex-sol">${esc(fieldSolution(k,c))}</span>`;
    });
    const all = right===ins.length;
    const buch = bookPoints(c, got, max);                // Punkte gutschreiben (Rest bei der Wiederholung)
    finishPhotoAnswer(all, all ? "good" : ((right||fast) ? "hard" : "again"), p,
      `<span class="sol">${nfmt(got)} von ${nfmt(max)} Punkten`+
      (buch.nach>0 ? ` · <b>+${nfmt(buch.nach)}</b> nachträglich gutgeschrieben` : "")+
      (fast&&!all ? ` · <b>≈</b> Schreibfehler zählen halb – schreibst du die Art gleich fehlerfrei, gibt es den Rest`
                  : fast ? ` · <b>≈</b> Schreibfehler zählen halb – so steht es auf dem Prüfungsbogen` : "")+
      (all?"":" · "+solutionLine(c))+`</span>`);
  };
}
/* ---------- Punktekonto der Sitzung ----------
   Ein Schreibfehler gibt die halbe Punktzahl und die Karte kommt wieder – sie gilt
   NICHT als bestanden. Wird sie beim zweiten Anlauf fehlerfrei geschrieben, wird nur
   die noch fehlende Hälfte gutgeschrieben (nicht doppelt gezählt). Je Karte zählt
   also der beste Versuch, und das Konto kann nie über die mögliche Punktzahl steigen. */
function bookPoints(card, got, max){
  if(!sess.pts) sess.pts = { sum:0, max:0, je:{} };
  const k = card.key, alt = sess.pts.je[k];
  if(alt===undefined){ sess.pts.je[k] = 0; sess.pts.max += max; }
  const nach = Math.max(0, got - (sess.pts.je[k]||0));
  sess.pts.sum += nach;
  sess.pts.je[k] = Math.max(sess.pts.je[k]||0, got);
  return { nach: alt===undefined ? 0 : nach, sum:sess.pts.sum, max:sess.pts.max };
}
function examScoring(){ return mode==="type" || (mode==="photo" && photoAnswer==="exam"); }   // Modi mit Punkten (Tippen zählt wie der Bogen)
/* Gemeinsamer Abschluss: bewerten, Rückmeldung, Bildnachweis, »Weiter« */
function finishPhotoAnswer(ok, g, p, solHTML, full){
  clockStop();                                        // gilt für alle drei Antwortarten
  const c=current;
  grade(c, g); if(ok) sess.correct++; else requeueCurrent();
  $("#fb").innerHTML = (full ? solHTML                 // Tippen bringt seinen Text schon fertig mit
    : (ok ? `<span class="good">Richtig!</span>`
      : g==="hard" ? `<span class="near">Teilweise richtig.</span>` : `<span class="bad">Leider falsch.</span>`)+" "+solHTML) + stepHTML();
  if(ok) celebrate($("#fb"), 1);
  // Punkte + Combo: Auswahl zählt wie Quiz, Tippen/»wie in der Prüfung« wie freies Tippen;
  // teilweise richtig (»hard«) gibt die Hälfte.
  scoreHit(photoAnswer==="mc" ? "quiz" : "type", ok, ok?1:(g==="hard"?0.5:0), $("#fb"));
  photoRevealCredit(p);
  const nav=$("#nav"); nav.innerHTML=infoBtnHTML("Mehr")+`<button class="btn primary" id="wt">Weiter</button>`;
  wireInfoBtn(); $("#wt").onclick=advance; $("#wt").focus();
}
function photoRevealCredit(p){                        // Bildnachweis erst jetzt (verrät sonst die Lösung)
  const st=$("#stage"), box=st && st.querySelector(".photobox");
  if(!box || !p || st.querySelector(".ph-src")) return;
  const slot = st.querySelector(".ph-srcslot");          // Audit: unter Optionen/Rückmeldung statt in der Bildbox – die Optionen rutschen beim Aufdecken nicht mehr
  if(slot) slot.innerHTML = photoSrcLine(p); else box.insertAdjacentHTML("beforeend", photoSrcLine(p));
  const show = cr => {
    const el2=$("#phSrc");
    if(el2 && cr && (cr.artist||cr.license))
      el2.insertAdjacentHTML("beforeend", ` · ${esc([cr.artist,cr.license].filter(Boolean).join(", "))}`);
  };
  if(p.artist || p.license) show(p);                   // kam mit den Suchmetadaten – kein weiterer Abruf
  else if(p.file) photoCredit(p.file).then(show).catch(()=>{});   // ältere Cache-Einträge / eingehängte Quellen
}
function prefetchPhoto(){
  // Die nächsten ZWEI Karten vorab holen – auf einer langsamen Leitung ist der
  // Vorsprung genau das, was den Unterschied zwischen »flüssig« und »hakelig« macht.
  // Auch Arten, die früher einmal ohne Treffer blieben (gemerkte null), bekommen je
  // Sitzung einen neuen Versuch, und der soll schon vorab laufen.
  for(const nx of [queue[qi+1], queue[qi+2]]){
    if(!nx) continue;
    const known = photoStoreLoad()[nx.key];
    if(known && known.src==="wp" && !known.art) photoMoreViews(known, nx).catch(()=>{});   // weitere Ansichten schon vorab
    else if(!known && !photoTried.has(nx.key)) photoFor(nx).catch(()=>{});
  }
}
function answerPhoto(btn, chosen, p){
  const c=current, correct=answerText(c);
  const ok = chosen.toLowerCase()===correct.toLowerCase();
  document.querySelectorAll("#opts .opt").forEach(b=>{
    b.disabled=true;
    if(b.querySelector("span:last-child").textContent.toLowerCase()===correct.toLowerCase()) b.classList.add("correct");
  });
  if(!ok) btn.classList.add("wrong");
  finishPhotoAnswer(ok, ok?"good":"again", p, `<span class="sol">${solutionLine(c)}</span>`);
}

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
/* ---------- Lernstand einer Art (für die Info-Karte) ----------
   Beim Nachschlagen sieht man direkt, wie gut die Pflanze schon sitzt: Stufe,
   nächste Fälligkeit und die bisherige Bilanz. Quelle ist derselbe Leitner-Stand
   wie überall (pget) – es wird nichts zusätzlich gespeichert. */
function faellig(due){
  if(!due) return "";
  const heute = todayISO();
  if(due<=heute) return "heute dran";
  const t = Math.round((new Date(due+"T00:00:00") - new Date(heute+"T00:00:00"))/86400000);
  return t===1 ? "morgen wieder dran" : `in ${t} Tagen wieder dran`;
}
function learnStateHTML(card){
  const p = pget(card.key||"");
  const box = p.box||0;
  const pips = [1,2,3,4,5].map(i=>`<i class="${i<=box?(box>=4?"on fest":"on"):""}"></i>`).join("");
  const kopf = box>=4 ? `<b>Sitzt sicher</b> – Stufe ${box} von 5`
    : box ? `Stufe ${box} von 5 · noch ${stepsLeft(box)}× richtig bis <b>»sitzt«</b>`
          : `<b>Noch nicht gelernt</b>`;
  const wann = box ? faellig(p.due) : "kommt in der nächsten Sitzung dran";
  const bilanz = (p.seen||0) ? `${p.correct||0} richtig · ${p.wrong||0} daneben` : "";
  return `<div class="lstate${box>=4?" fest":""}" title="Dein Lernstand für diese Art – dieselbe Stufe wie im Fortschritt und im Herbarium.">
      <span class="pips">${pips}</span>
      <span class="ls-t">${kopf}${wann?` <span class="ls-due">· ${esc(wann)}</span>`:""}</span>
      ${bilanz?`<span class="ls-b">${esc(bilanz)}</span>`:""}
    </div>`;
}
/* ---------- Platzhalter »'Sorte'« / »Hybriden« in der Info-Karte ----------
   Die GaLaBau-Listen schreiben bei 25 Arten »'Sorte'« (die Fachwerker-Liste »Weigela
   Cultivars«, Zierpflanzenbau »Fuchsia Hybriden«): gemeint ist die Art in irgendeiner
   Gartensorte – in der Prüfung steht eine beliebige Sorte vor dir, bewertet wird die Art.
   Die Karte erklärt das und nennt typische Handelssorten zum Wiedererkennen. Die
   Beispiele sind kuratiert/erzeugt und ohne Gewähr – Sortennamen fragt die Prüfung nicht. */
const SORTEN_BEISPIELE = {
  "Achillea filipendulina":      ["Cloth of Gold", "Parker's Variety", "Altgold", "Coronation Gold"],
  "Aster dumosus":               ["Kristina", "Prof. Anton Kippenberg", "Herbstgruß vom Bresserhof", "Lady in Blue"],
  "Astilbe arendsii":            ["Fanal", "Brautschleier", "Amethyst", "Weiße Gloria", "Cattleya"],
  "Chrysanthemum grandiflorum":  ["Anastasia", "Hebe", "Mei-kyo", "Nebelrose", "Kleiner Bernstein"],
  "Coreopsis verticillata":      ["Moonbeam", "Zagreb", "Grandiflora"],
  "Gypsophila repens":           ["Rosea", "Alba", "Rosa Schönheit", "Letchworth Rose"],
  "Heliopsis helianthoides":     ["Sommersonne", "Spitzentänzerin", "Goldgefieder", "Venus"],
  "Heuchera brizoides":          ["Pluie de Feu", "Schneewittchen", "Leuchtkäfer", "Weserlachs"],
  "Juniperus pfitzeriana":       ["Pfitzeriana Aurea", "Mint Julep", "Old Gold", "Pfitzeriana Compacta"],
  "Leucanthemum superbum":       ["Alaska", "Becky", "Wirral Supreme", "Gruppenstolz", "Snow Lady"],
  "Malus":                       ["Evereste", "Red Sentinel", "Golden Hornet", "Rudolph", "John Downie", "Professor Sprenger"],
  "Paeonia lactiflora":          ["Sarah Bernhardt", "Duchesse de Nemours", "Festiva Maxima", "Bowl of Beauty", "Karl Rosenfield"],
  "Paeonia officinalis":         ["Rubra Plena", "Rosea Plena", "Alba Plena"],
  "Papaver orientale":           ["Beauty of Livermere", "Perry's White", "Patty's Plum", "Türkenlouis", "Princess Victoria Louise"],
  "Phlox paniculata":            ["Bright Eyes", "Orange Perfection", "Düsterlohe", "Pax", "Starfire", "Blue Paradise"],
  "Phlox subulata":              ["Emerald Cushion Blue", "Candy Stripe", "McDaniel's Cushion", "Scarlet Flame", "White Delight"],
  "Primula denticulata":         ["Alba", "Rubin", "Lilac", "Cashmeriana"],
  "Prunus":                      ["Kanzan", "Accolade", "Amanogawa", "Shirotae", "Autumnalis", "Royal Burgundy"],
  "Rhododendron forrestii":      ["Scarlet Wonder", "Baden-Baden", "Elisabeth Hobbie", "Bad Eilsen"],
  "Salvia nemorosa":             ["Caradonna", "Ostfriesland", "Mainacht", "Schneehügel", "Blauhügel"],
  "Saxifraga arendsii":          ["Peter Pan", "Purpurteppich", "Schneeteppich", "Blütenteppich", "Pixie"],
  "Spiraea japonica":            ["Little Princess", "Goldflame", "Anthony Waterer", "Albiflora", "Shirobana"],
  "Weigela":                     ["Bristol Ruby", "Eva Rathke", "Red Prince", "Nana Variegata", "Candida"],
};
function sortenInfoHTML(card){
  if(cultivarKind(card.a)!=="placeholder") return "";
  const epi = binomEpithet(card.a);
  const taxon = (epi && !GRP_RE.test(epi)) ? norm(card.g+" "+epi) : card.g;   // »Fuchsia Hybriden« → Gattung
  const was = /sorte/i.test(card.a) ? "'Sorte'" : /cultivar/i.test(card.a) ? "Cultivars" : /hybrid/i.test(card.a) ? "Hybriden" : "diese Gruppenangabe";
  const bsp = SORTEN_BEISPIELE[taxon] || [];
  return `<div class="sorten">
    <h3>${ico("info","sorten-ic")} Was heißt »${esc(was)}«?</h3>
    <p>Die Prüfungsliste nennt hier <b>keine bestimmte Sorte</b>: In der Prüfung steht eine beliebige
      Gartensorte vor dir – bewertet wird <i>${esc(taxon)}</i>. Das Lern-Tool zeigt den Platzhalter
      deshalb als »in Sorten«; beim Eingeben zählt <i>${esc(taxon)}</i> als vollständig richtig.</p>
    ${bsp.length ? `<p class="sorten-bsp"><b>Typische Gartensorten</b> zum Wiedererkennen: ${bsp.map(s=>"'"+esc(s)+"'").join(", ")}</p>` : ""}
    <div class="sorten-note">Sortenbeispiele automatisch zusammengestellt – ohne Gewähr; Sortennamen fragt die Prüfung nicht ab.</div>
  </div>`;
}
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
  const scrim = el("div","scrim"); scrim.id="infoScrim";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Pflanzen-Info">
     <button class="modal-x" id="infoClose" aria-label="Schließen" title="Schließen">×</button>
     <div class="modal-head">
       <div class="mh-bot">${esc(botName(card))}</div>
       ${card.de?`<div class="mh-de">${esc(card.de)}</div>`:""}
       ${fam?`<div class="mh-fam">${esc(fam)}</div>`:""}
       <div class="mh-src" title="Gattung, Art, Familie, deutscher Name und Synonyme stehen unverändert so in der amtlichen Prüfungsliste. Namensherkunft und Thema sind automatisch erzeugt (teils mit KI), die Online-Infos stammen von Wikipedia.">${ico("check")}Name aus der amtlichen Prüfungsliste</div>
     </div>
     ${etyHTML}
     ${sortenInfoHTML(card)}
     <div class="srcblock">
       <div class="srclabel">Nachschlagen · öffnet neuen Tab</div>
       <div class="srcgrid">${links}</div>
     </div>
     <div class="wpblock">
       <button class="btn primary" id="wpLoad" title="Kurztext und Bild von der deutschen Wikipedia laden (nur online)">${ico("globe")}Online-Infos laden (Wikipedia)</button>
       <div class="wphost" id="wpHost"></div>
     </div>
     ${learnStateHTML(card)}
   </div>`;
  document.body.appendChild(scrim); infoEl=scrim;
  scrim.addEventListener("click", e=>{ if(e.target===scrim) closeInfo(); });
  const etyD = scrim.querySelector("details.etym");                // Auf-/Zuklappen global merken
  if(etyD) etyD.addEventListener("toggle", ()=>store.set(LS_PREFIX+"etyopen", etyD.open?"1":"0"));
  $("#infoClose").onclick = closeInfo;
  const host = scrim.querySelector("#wpHost"), btn = scrim.querySelector("#wpLoad");
  const cached = wikiCache.get(card.key);
  if(cached){ renderWiki(host, cached); btn.remove(); }
  else if(cached===null){ host.innerHTML='<div class="wp-note">'+WP_NONE+'</div>'; btn.remove(); }
  else btn.onclick = ()=>loadWiki(card, host, btn);
  document.addEventListener("keydown", infoKey);
  infoReturnFocus = document.activeElement;                       // Fokus nach dem Schließen zurückgeben
  try{ $("#infoClose").focus(); }catch(e){}
}
const infoBtnHTML = label => `<button class="btn ghost infobtn" id="infoBtn" title="Quellen &amp; Online-Infos zu dieser Pflanze">ℹ ${esc(label||"Mehr")}</button>`;
function wireInfoBtn(){ const b=$("#infoBtn"); if(b) b.onclick=e=>{ e.stopPropagation(); openInfo(current); }; }

/* Familien-Steckbrief als Modal (offline, kuratiert) – gemeinsame Merkmale + Lerntipp */
function openFamilyInfo(famStr){
  closeInfo();
  const lat = famKey(famStr), info = FAM_INFO[lat], de = (info&&info.de) || famGerman(famStr);
  const body = info
    ? `<div class="fam-sec"><h3>Was die Arten gemeinsam haben</h3><p>${esc(info.m)}</p></div>
       <div class="fam-sec"><h3>Erkennen &amp; merken</h3><p>${esc(info.t)}</p></div>`
    : `<div class="fam-sec"><p class="fam-none">Zu dieser Familie liegt noch kein Steckbrief vor.</p>
       <p>Allgemeiner Lerntipp: Achte auf <b>Blütenaufbau</b> (Zahl der Blütenblätter, Symmetrie),
       <b>Blattstellung</b> (wechsel- oder gegenständig) und die <b>Frucht</b> – diese Merkmale verraten
       die Familie oft zuverlässiger als die Blütenfarbe.</p></div>`;
  const scrim = el("div","scrim"); scrim.id="infoScrim";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Familien-Steckbrief">
     <button class="modal-x" id="infoClose" aria-label="Schließen" title="Schließen">×</button>
     <div class="modal-head">
       <div class="mh-bot fam">${esc(lat)}</div>
       ${de?`<div class="mh-de">${esc(de)}</div>`:""}
       <div class="mh-fam">Pflanzenfamilie · Steckbrief</div>
     </div>
     <div class="fambody">${body}</div>
     <div class="famfoot">Familienwissen spart Lernarbeit: Arten einer Familie teilen oft Bauplan, Standort- und Pflegeansprüche.</div>
   </div>`;
  document.body.appendChild(scrim); infoEl=scrim;
  scrim.addEventListener("click", e=>{ if(e.target===scrim) closeInfo(); });
  scrim.querySelector("#infoClose").onclick = closeInfo;
  document.addEventListener("keydown", infoKey);
  infoReturnFocus = document.activeElement;
  try{ scrim.querySelector("#infoClose").focus(); }catch(e){}
}

/* ---------- Sammel-Herbarium (Gamification, didaktisch) ----------
   Je Thema des Profils eine Sammelseite: Sitzt JEDE Art des Themas sicher
   (Box 4–5, gleiche Schwelle wie »sitzt« im Fortschritt), gilt das Thema als
   gemeistert – die gepresste Pflanze wird farbig, mit »Gemeistert«-Stempel,
   und das wird EINMAL gefeiert (Feier-Liste je Profil im localStorage; der
   Stand selbst wird immer live aus dem Leitner-Fortschritt berechnet).
   Motiviert, ALLE Themen zu lernen statt nur die Lieblingsthemen. */
const HERB_ART = [
  `<svg viewBox="0 0 64 64" fill="currentColor"><path d="M32 58V20M32 34c-6-2-11-7-12-14 7 1 11 5 12 10zm0-8c1-6 5-11 12-13-1 8-6 12-12 13zM32 46c-5-1-9-5-10-11 6 1 9 4 10 8zm0-2c1-5 4-9 10-10-1 6-5 9-10 10z" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M32 58V26M32 26 18 12M32 26 32 8M32 26 46 12"/><circle cx="18" cy="12" r="3.4" fill="currentColor" stroke="none"/><circle cx="32" cy="8" r="3.4" fill="currentColor" stroke="none"/><circle cx="46" cy="12" r="3.4" fill="currentColor" stroke="none"/></svg>`,
  `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M32 58C32 40 30 24 24 10M32 58c0-16 3-30 10-44M32 58C32 44 32 28 32 14"/></svg>`,
  `<svg viewBox="0 0 64 64" fill="currentColor"><circle cx="32" cy="22" r="5"/><path d="M32 10a6 6 0 0 1 6 6 6 6 0 0 1 6 6 6 6 0 0 1-6 6 6 6 0 0 1-6 6 6 6 0 0 1-6-6 6 6 0 0 1-6-6 6 6 0 0 1 6-6 6 6 0 0 1 6-6z" opacity=".45"/><path d="M32 34v24M32 46c-4-1-7-4-8-9 5 1 7 4 8 9z" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M32 58C30 38 30 22 34 8M34 12c-5 2-8 6-9 11M33 20c-6 2-9 6-10 12M33 30c-6 2-9 6-9 11M34 16c4 1 7 4 8 8M33 26c5 1 8 4 9 9M32 36c5 1 8 4 9 9"/></svg>`,
  `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M30 58C28 40 30 24 38 10M35 22c-5-1-9-4-10-9M33 32c-6 0-10-3-12-8"/><circle cx="44" cy="20" r="3.2" fill="currentColor" stroke="none"/><circle cx="47" cy="28" r="3.2" fill="currentColor" stroke="none"/><circle cx="41" cy="27" r="3.2" fill="currentColor" stroke="none"/></svg>`
];
function herbData(){                                    // je Thema: [name, {n, fest, offen:[Karten]}]
  const m=new Map();
  allCards.forEach(c=>{ const t=c.thema||"Sonstiges";
    if(!m.has(t)) m.set(t,{n:0,fest:0,offen:[]});
    const e=m.get(t); e.n++;
    if((pget(c.key).box||0)>=4) e.fest++; else e.offen.push(c);   // was dem Thema noch fehlt
  });
  return [...m.entries()].sort((a,b)=> themeRank(a[0])-themeRank(b[0]) || a[0].localeCompare(b[0],"de"));
}
/* Sicher ohne Foto: Der Bild-Cache merkt sich »null«, wenn die Suche erfolglos war.
   Solche Arten kamen früher im Bilder-Modus nie dran – heute weichen sie aufs Quiz aus,
   und im Herbarium steht der Hinweis dabei. */
function photoless(key){ try{ return photoStoreLoad()[key]===null; }catch(e){ return false; } }
function herbKey(){ return LS_PREFIX+"herb."+profileId; }
function herbSeen(){ try{ const a=JSON.parse(store.get(herbKey())||"[]"); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function herbCheck(){                                   // neu gemeisterte Themen einmalig feiern
  try{
    const seen=new Set(herbSeen()), neu=[];
    herbData().forEach(([t,e])=>{ if(e.n>0 && e.fest===e.n && !seen.has(t)){ seen.add(t); neu.push(t); } });
    if(neu.length){
      store.set(herbKey(), JSON.stringify([...seen]));
      toast(`Neues Blatt im Herbarium: ${neu.join(", ")}`);
      celebrate($("#stage")||document.body, 2);
    }
    return neu;
  }catch(e){ return []; }
}
function openHerbarium(){
  closeInfo();
  herbCheck();                                          // beim Öffnen ggf. Neues feiern
  const rows=herbData(), done=rows.filter(([,e])=>e.n>0&&e.fest===e.n).length;
  const cards=rows.map(([t,e],i)=>{
    const fertig=e.n>0&&e.fest===e.n;
    // Was fehlt noch? Nur bei angefangenen Themen (sonst wäre es die ganze Liste) und
    // gedeckelt auf sechs Namen. Arten ohne Foto werden markiert – sie kommen im
    // Bilder-Modus als Quizfrage, damit hier niemand unsichtbar hängen bleibt.
    const zeigOffen = !fertig && e.fest>0 && e.offen.length<=12;
    const liste = zeigOffen ? e.offen.slice(0,6).map(c=>{
      const kein=photoless(c.key);
      return `<li${kein?` class="no-photo" title="Für diese Art gibt es kein brauchbares Foto – im Bilder-Modus kommt sie als Quizfrage"`:""}>`+
        `${esc(deMain(c)||botName(c))}${kein?` <span class="np-tag">ohne Foto</span>`:""}</li>`;
    }).join("") : "";
    return `<div class="herbcard${fertig?" done":""}">
       <div class="hc-art">${HERB_ART[i%HERB_ART.length]}</div>
       ${fertig?`<div class="hc-stamp">Gemeistert</div>`:""}
       <div class="hc-name">${esc(t)}</div>
       <div class="hc-bar"><i style="width:${e.n?Math.round(e.fest/e.n*100):0}%"></i></div>
       <div class="hc-n">${e.fest}/${e.n} sitzt</div>
       <button type="button" class="btn small hc-learn" data-t="${esc(t)}" title="Geführte Lektion nur mit den Arten dieses Themas">${fertig?"Wiederholen":"Thema üben"}</button>
       ${zeigOffen?`<div class="hc-open"><div class="hc-open-h">Es fehlen noch</div>
         <ul>${liste}</ul>${e.offen.length>6?`<div class="hc-more">+ ${e.offen.length-6} weitere</div>`:""}</div>`:""}
     </div>`; }).join("");
  const scrim = el("div","scrim"); scrim.id="infoScrim";
  scrim.innerHTML = `<div class="modal herbmodal" role="dialog" aria-modal="true" aria-label="Mein Herbarium">
     <button class="modal-x" id="infoClose" aria-label="Schließen" title="Schließen">×</button>
     <div class="modal-head">
       <div class="mh-bot fam">Mein Herbarium</div>
       <div class="mh-fam">${done}/${rows.length} Themen gemeistert</div>
     </div>
     <div class="herb-how">${ico("info")}<span>Ein Thema ist gemeistert, wenn <b>jede</b> Art darin »sitzt«.
       <button class="linklike" id="herbHow">Wie eine Art auf »sitzt« kommt</button></span></div>
     <div class="herbgrid">${cards}</div>
     <div class="famfoot">Jedes gemeisterte Thema legt eine gepresste Pflanze in deine Sammlung – so siehst du auf einen Blick, welche Themen noch Pflege brauchen.</div>
   </div>`;
  document.body.appendChild(scrim); infoEl=scrim;
  scrim.addEventListener("click", e=>{ if(e.target===scrim) closeInfo(); });
  scrim.querySelector("#infoClose").onclick = closeInfo;
  const hh=scrim.querySelector("#herbHow"); if(hh) hh.onclick=openHowModal;
  scrim.querySelectorAll(".hc-learn").forEach(b=>{ b.onclick=()=>learnTheme(b.dataset.t); });
  document.addEventListener("keydown", infoKey);
  infoReturnFocus = document.activeElement;
  try{ scrim.querySelector("#infoClose").focus(); }catch(e){}
}
/* Aus dem Herbarium direkt üben (Nutzerfrage »nur Gräser lernen?«): Lernstoff auf dieses Thema
   stellen – dasselbe Feld wie Optionen · Lernstoff, dort bleibt es sichtbar und umstellbar –
   und eine geführte Lektion starten. */
function learnTheme(t){
  const sel=$("#cat");
  if(sel){ const v="t:"+t; sel.value = [...sel.options].some(o=>o.value===v) ? v : ""; sel.dispatchEvent(new Event("change")); }   // wie eine Wahl unter Optionen · Lernstoff
  closeInfo();
  startGuided();
}

/* ---------- »So wächst dein Fortschritt« als Grafik statt Textwand ----------
   Die fünf Stufen als Leiter: Punkte, Kurzlabel, Intervall. Erreichbar über das
   ℹ an der Fortschritts-Legende, aus dem Herbarium und aus der Erst-Einweisung –
   so bleibt die Startansicht frei von Erklärabsätzen. */
const STEP_LABEL = ["neu", "wackelig", "kommt", "sitzt", "sicher"];
function openHowModal(){
  closeInfo();
  const rows = [0,1,2,3,4,5].filter(i=>i>0).map(b=>{
    const pips=[1,2,3,4,5].map(i=>`<i class="${i<=b?(b>=4?"on fest":"on"):""}"></i>`).join("");
    return `<div class="how-row${b>=4?" fest":""}">
      <span class="pips">${pips}</span>
      <span class="how-lab">${esc(STEP_LABEL[b-1]||"")}</span>
      <span class="how-int">nach ${BOX_DAYS[b-1]} ${BOX_DAYS[b-1]===1?"Tag":"Tagen"} wieder dran</span>
    </div>`;
  }).join("");
  const scrim = el("div","scrim"); scrim.id="infoScrim";
  scrim.innerHTML = `<div class="modal howmodal" role="dialog" aria-modal="true" aria-label="So wächst dein Fortschritt">
     <button class="modal-x" id="infoClose" aria-label="Schließen" title="Schließen">×</button>
     <div class="modal-head">
       <div class="mh-bot fam">So wächst dein Fortschritt</div>
       <div class="mh-fam">Fünf Stufen je Pflanze · ab Stufe 4 gilt sie als gemerkt</div>
     </div>
     <div class="howgrid">${rows}</div>
     <div class="how-legend">
       <div><span class="hl-ic ok">${ico("check")}</span><span><b>Richtig</b> – eine Stufe weiter</span></div>
       <div><span class="hl-ic hold">${ico("sliders")}</span><span><b>Fast / unsicher</b> – Stufe bleibt</span></div>
       <div><span class="hl-ic back">${ico("info")}</span><span><b>Falsch</b> – zurück auf Stufe 1</span></div>
     </div>
     <div class="famfoot">Von »neu« sind es <b>drei</b> richtige Antworten bis »sitzt« – in jedem Modus gleich viel wert.
       Die Pausen dazwischen sind Absicht: So bleiben die Namen dauerhaft hängen. Am ersten Tag ist »sitzt« deshalb
       normal noch nicht dabei – dass Pflanzen von <i>neu</i> zu <i>am Lernen</i> wandern, ist bereits der Fortschritt.</div>
   </div>`;
  document.body.appendChild(scrim); infoEl=scrim;
  scrim.addEventListener("click", e=>{ if(e.target===scrim) closeInfo(); });
  scrim.querySelector("#infoClose").onclick = closeInfo;
  document.addEventListener("keydown", infoKey);
  infoReturnFocus = document.activeElement;
  try{ scrim.querySelector("#infoClose").focus(); }catch(e){}
}
/* ---------- Profil-Wechsel ---------- */
function loadProfile(id){
  if(!(typeof SEEDS!=="undefined" && SEEDS[id])) id = SEEDS && SEEDS["gemuesebau_gaertner"] ? "gemuesebau_gaertner" : Object.keys(SEEDS||{})[0];
  profileId = id;
  allCards = cardsFor(id); atMemo.clear();
  loadProgress();
  if($("#listSearch")) $("#listSearch").value="";   // Suche beim Profilwechsel zurücksetzen
  listCats.clear();                                  // Kategorie-Tags beim Profilwechsel zurücksetzen
  refreshKat();
  buildDeIndex();                                    // Grundwörter zählen (für »Rhabarber« statt »Krauser Rhabarber«)
  buildBinomIndex();                                 // Arten je Binom zählen (Sorte + Art beide in der Liste?)
  loadExamFields();                                  // Prüfungsfelder gelten je Profil (Bogen der Fachrichtung)
  syncExamOnlyUI();                                  // »nur Prüfungsstoff«-Schalter nur bei Fachwerker zeigen
  normalizeSort();                                   // ggf. Familien-Ansicht verlassen, wenn ausgeblendet
  applyMode();                                       // Ansicht passend zum aktuellen Modus (inkl. Liste)
  syncProfileChip();
  store.set(LS_PREFIX+"profile", id);
}
function refreshKat(){   // Auswahl der Lernsitzung: alles · ein Thema · eine Familie
  const count = keyf => { const m=new Map(); allCards.forEach(c=>{ const k=keyf(c); if(k) m.set(k,(m.get(k)||0)+1); }); return m; };
  const themen = [...count(c=>c.thema).entries()].sort((a,b)=>themeRank(a[0])-themeRank(b[0])||a[0].localeCompare(b[0],"de"));
  const fams   = [...count(c=>famKey(c.fam)).entries()].sort((a,b)=>a[0].localeCompare(b[0],"de"));
  const opt = (v,l,n)=>`<option value="${esc(v)}">${esc(l)} (${n})</option>`;
  const cur=$("#cat").value;
  $("#cat").innerHTML = `<option value="">alle Arten (${allCards.length})</option>`+
    (themen.length?`<optgroup label="Thema">`+themen.map(([k,n])=>opt("t:"+k,k,n)).join("")+`</optgroup>`:"")+
    (fams.length  ?`<optgroup label="Pflanzenfamilie">`+fams.map(([k,n])=>opt("f:"+k,famName(k),n)).join("")+`</optgroup>`:"");
  const have=[...$("#cat").options].some(o=>o.value===cur);
  $("#cat").value = have ? cur : "";
}
/* Antwortarten im Bilder-Quiz – ANGEBOTEN werden zwei: aus vier vollen Namen auswählen oder
   die Namen selbst eingeben (wie in der Prüfung: ein Feld je bewerteter Spalte, mit Punkten).
   Das frühere »Namen tippen« (EIN Feld, nur botanisch oder nur deutsch) steckt noch in älteren
   Duell-Links und bleibt dafür spielbar – zur Wahl steht es nicht mehr. Die Reihenfolge von
   CH_PHA (mc · type · exam) bleibt davon unberührt. */
const PH_ANSWER = { mc:"Auswahl (4 Namen)", exam:"Selbst eingeben (wie in der Prüfung)" };
const PH_ANSWER_LEGACY = { type:"Namen eingeben (älterer Duell-Link)" };
const own = (o,k)=> Object.prototype.hasOwnProperty.call(o,k);   // Audit: »constructor« aus Link/Speicher ist keine Antwortart/Richtung
function phLabel(k){ return (own(PH_ANSWER,k)&&PH_ANSWER[k]) || (own(PH_ANSWER_LEGACY,k)&&PH_ANSWER_LEGACY[k]) || k; }
function loadPrefs(){                       // gespeicherte Abfrage-Einstellungen – nur noch angebotene Werte
  dirText  = DIRS_TEXT.includes(store.get(LS_PREFIX+"dirtext")) ? store.get(LS_PREFIX+"dirtext") : "de2bot";
  dirPhoto = dirsFor("photo").includes(store.get(LS_PREFIX+"dirphoto")) ? store.get(LS_PREFIX+"dirphoto") : "img2both";
  const pa = store.get(LS_PREFIX+"phanswer");
  photoAnswer = own(PH_ANSWER,pa) ? pa : (pa==="type" ? "exam" : "mc");   // früheres »Namen tippen« → Eingabe bleibt Eingabe
}
/* Ein Duell-Link gibt Richtung und Antwortart für GENAU diese Aufgabe vor – auch ältere,
   nicht mehr angebotene. Sobald eine eigene Sitzung startet oder man selbst etwas
   umstellt, gelten wieder die eigenen Einstellungen. */
let chOverride = false;
function applyChallengePrefs(ch){
  if(ch.a && phLabel(ch.a)!==ch.a) photoAnswer = ch.a;
  if(ch.r && own(DIRS,ch.r)){ if(DIRS_PHOTO.includes(ch.r)) dirPhoto=ch.r; else dirText=ch.r; }
  if(ch.m==="guided" && ch.rp && DIRS_PHOTO.includes(ch.rp)) dirPhoto = ch.rp;   // Bild-Karten der geführten Lektion
  chOverride = true;
}
function endChallengeOverride(){ if(!chOverride) return; chOverride=false; loadPrefs(); syncDirUI(); }
/* Abfragerichtung + (im Bilder-Quiz) Antwortart und die selbst bestimmten
   Prüfungsfelder. Nur zeigen, was zum Modus passt. */
function syncDirUI(){
  const sel=$("#dir"); if(!sel) return;
  const isPhoto = mode==="photo", isList = mode==="list";
  const paw=$("#phAnswerField"); if(paw) paw.hidden = !isPhoto;
  const pas=$("#phAnswer"); if(pas){
    const keys = Object.keys(PH_ANSWER).concat(own(PH_ANSWER,photoAnswer) ? [] : [photoAnswer]);   // ältere Antwortart (Duell-Link) sichtbar halten
    pas.innerHTML = keys.map(k=>`<option value="${k}">${esc(phLabel(k))}</option>`).join("");
    pas.value = photoAnswer;
  }
  // Richtung ist gegenstandslos, wenn es nur eine gibt (Bilder-Quiz: voller Name) oder
  // ohnehin alle Prüfungsfelder abgefragt werden
  const dirOff = isList || dirsFor().length<2 || (isPhoto && photoAnswer==="exam");
  const wrap=$("#dirField"); if(wrap) wrap.hidden = dirOff;
  sel.innerHTML = dirsFor().map(k=>`<option value="${k}">${esc(DIRS[k].label)}</option>`).join("");
  sel.value = curDir();
  syncExamFieldsUI();
}
function syncExamFieldsUI(){
  const row=$("#examFieldsRow"); if(!row) return;
  const show = mode==="type" || (mode==="photo" && photoAnswer==="exam");   // Tippen fragt jetzt den ganzen Bogen ab
  row.hidden = !show;
  if(!show) return;
  if(!examFields) loadExamFields();
  const std=defaultExamFields();
  row.innerHTML = `<span class="exf-lab">Felder</span>`+
    FIELD_ORDER.map(k=>`<label class="exf${examFields.includes(k)?" on":""}">
      <input type="checkbox" data-k="${k}"${examFields.includes(k)?" checked":""}>
      ${esc(FIELD_LABEL[k])}${std.includes(k)?`<span class="exf-p">${nfmt(examPts(k))}</span>`:""}</label>`).join("")+
    `<span class="exf-hint">Standard = Bogen dieser Fachrichtung</span>`;
  row.querySelectorAll("input[type=checkbox]").forEach(cb=>cb.onchange=()=>{
    const k=cb.dataset.k;
    const next = cb.checked ? examFields.concat([k]) : examFields.filter(x=>x!==k);
    if(!next.length){ cb.checked=true; toast("Mindestens ein Feld muss abgefragt werden",true); return; }
    examFields = FIELD_ORDER.filter(x=>next.includes(x));
    saveExamFields(); syncExamFieldsUI();
  });
}
function profilLabel(){                                   // »Gemüsebau · Gärtner/in« (Chip, Listen-Quelle)
  const fr=$("#frSelect"), nv=$("#nivSelect");
  const frL = fr && fr.selectedIndex>=0 ? fr.options[fr.selectedIndex].textContent : "";
  const nvL = nv && nv.selectedIndex>=0 ? nv.options[nv.selectedIndex].textContent : "";
  return frL && nvL ? frL+" · "+nvL : "";
}
function syncProfileChip(){
  const t=$("#profChipText"); if(!t) return;
  t.textContent = profilLabel() || "Beruf wählen";
}
function profSub(){
  const fr = FR_LIST.find(f=>slug(f)===$("#frSelect").value)||"";
  const niv = (NIVEAUS.find(n=>n.key===$("#nivSelect").value)||{}).label||"";
  $("#profSub").textContent = `${allCards.length} Arten · ${fr} · ${niv}`;
}
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
function applyProfile(){
  const id=$("#frSelect").value+"_"+$("#nivSelect").value;
  vt(()=>{ loadProfile(id); profSub(); syncOptsSummary(); });
}

/* ---------- Verdrahtung ---------- */
function wire(){
  const refreshView = ()=>{ syncOptsSummary(); vt(()=>{ if(mode==="list"){ renderListControls(); renderList(); } else renderProgress(); }); };
  const dgl=$("#dayGoal");                       // Tagesziel der Lernserie (global, Standard 20)
  if(dgl){ dgl.value=String(streakGoal());
    dgl.onchange=()=>{ const s=streakLoad(); s.g=+dgl.value||20; streakSave(s); renderProgress(); }; }
  const lsr=$("#listSearchRow");   // Listen-Suche klebt beim Scrollen oben; »stuck« nur, wenn wirklich angepinnt (dezenter Schatten)
  if(lsr){ const upd=()=>lsr.classList.toggle("stuck", !lsr.hidden && lsr.getBoundingClientRect().top<=0.5);
    window.addEventListener("scroll", upd, {passive:true}); window.addEventListener("resize", upd, {passive:true}); }
  $("#frSelect").onchange=applyProfile;
  $("#nivSelect").onchange=applyProfile;
  $("#cat").onchange=refreshView;
  if($("#phAnswer")) $("#phAnswer").onchange=()=>{
    const v=$("#phAnswer").value; endChallengeOverride();     // Wert VOR dem Zurücksetzen lesen
    photoAnswer=v; store.set(LS_PREFIX+"phanswer",photoAnswer);
    syncDirUI(); refreshView();
  };
  if($("#dir")) $("#dir").onchange=()=>{
    const v=$("#dir").value; endChallengeOverride();
    if(mode==="photo"){ dirPhoto=v; store.set(LS_PREFIX+"dirphoto",dirPhoto); }
    else { dirText=v; store.set(LS_PREFIX+"dirtext",dirText); }
    syncDirUI(); refreshView();
  };
  $("#onlyzp").onchange=refreshView;
  if($("#sessLen")) $("#sessLen").oninput=syncOptsSummary;
  document.addEventListener("keydown", cardKeys);   // Tastatur-Bedienung der Karteikarten
  if($("#examOnly")) $("#examOnly").onchange=()=>{
    examOnly=$("#examOnly").checked; store.set(LS_PREFIX+"examonly", examOnly?"1":"0");
    normalizeSort(); refreshView();
  };
  $("#listSearch").oninput=()=>{ if(mode==="list") renderList(); };
  if($("#btnPrintList")) $("#btnPrintList").onclick=printList;
  // Druckoptionen (Spalten, Namensherkunft) leben im Listen-Akkordeon (renderListControls)
  $("#modeTabs").querySelectorAll("button").forEach(b=>b.onclick=()=>{
    if(b.dataset.mode==="list" && mode!=="list") lastLearnMode=mode;   // Rückweg aus der Liste
    mode=b.dataset.mode; store.set(LS_PREFIX+"mode",mode);
    syncModeTabs();
    vt(applyMode);   // Moduswechsel blendet weich über
  });
  $("#btnStart").onclick=startSession;
  if($("#btnGo")) $("#btnGo").onclick=startGuided;
  if($("#btnList")) $("#btnList").onclick=()=>{             // Liste rein/raus ohne die Klappe zu öffnen
    const target = mode==="list" ? (lastLearnMode||"photo") : "list";
    if(mode!=="list") lastLearnMode=mode;
    mode=target; store.set(LS_PREFIX+"mode",mode);
    syncModeTabs();
    vt(applyMode);
  };
  const chip=$("#profileChip"), ps=$("#profScrim");         // Beruf: Chip öffnet das Profil-Modal
  if(chip && ps){
    const openP=()=>{ ps.hidden=false; try{ $("#profClose").focus(); }catch(e){} };
    const closeP=()=>{ ps.hidden=true; store.set(LS_PREFIX+"profilechosen","1"); try{ chip.focus(); }catch(e){} };
    chip.onclick=openP;
    $("#profClose").onclick=closeP;
    $("#profDone").onclick=closeP;
    ps.addEventListener("click",e=>{ if(e.target===ps) closeP(); });
    document.addEventListener("keydown",e=>{ if(e.key==="Escape" && !ps.hidden) closeP(); });
    window.openProfile=openP;                               // Erstbesuch: nach dem Intro einmalig öffnen
  }
  $("#btnHelp").onclick=()=>{ if($("#helpScrim").hidden) openHelp(); else closeHelp(); };
  $("#helpClose").onclick=closeHelp;
  $("#helpScrim").addEventListener("click",e=>{ if(e.target===$("#helpScrim")) closeHelp(); });
}

/* ---------- Hilfe als Dialog ----------
   Wie im Prüfungswerkzeug: ×, Esc oder Klick daneben schließen, der Fokus wandert hinein
   und beim Schließen zurück zum Hilfe-Knopf (Fokusfalle wie bei der Info-Karte). Vorher
   klappte die ~2 000 Wörter lange Hilfe in die Seite auf und ließ sich nur über den
   Hilfe-Knopf ganz oben wieder schließen (Audit-Fund). */
let helpReturnFocus=null;
function helpKey(e){
  if(e.key==="Escape"){ closeHelp(); return; }
  if(e.key==="Tab"){
    const h=$("#helpPanel");
    const f=[...h.querySelectorAll('a[href],button:not([disabled]),summary,input,select,[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);
    if(!f.length) return;
    const first=f[0], last=f[f.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  }
}
function openHelp(){
  const s=$("#helpScrim"), b=$("#btnHelp"); if(!s || !s.hidden) return;
  helpReturnFocus=document.activeElement;
  s.hidden=false; b.classList.add("active"); b.setAttribute("aria-pressed","true");
  document.addEventListener("keydown", helpKey);
  try{ $("#helpClose").focus(); }catch(e){}
}
function closeHelp(){
  const s=$("#helpScrim"), b=$("#btnHelp"); if(!s || s.hidden) return;
  s.hidden=true; b.classList.remove("active"); b.setAttribute("aria-pressed","false");
  document.removeEventListener("keydown", helpKey);
  if(helpReturnFocus && helpReturnFocus.focus){ try{ helpReturnFocus.focus(); }catch(e){} }
  helpReturnFocus=null;
}

/* ---------- Start ---------- */
/* Erst-Einweisung: einmalig beim ersten Besuch (danach über den »So funktioniert
   der Lernpfad«-Link), zeigt den Weg von leicht bis prüfungsreif. Reines Overlay,
   offline; merkt sich »gesehen« im localStorage, damit die Hinweise nicht im Weg sind. */
function openIntro(auto, onClose){
  const prev = document.activeElement;
  const scrim = el("div","scrim"); scrim.id="introScrim";
  scrim.innerHTML = `<div class="modal intro" role="dialog" aria-modal="true" aria-labelledby="introTtl">
    <button class="modal-x" id="introClose" aria-label="Schließen" title="Schließen">×</button>
    <h2 class="intro-h" id="introTtl">So wirst du prüfungsreif</h2>
    <p class="intro-lead">Am einfachsten: <b>»Weiter lernen«</b> – die passende Stufe wird automatisch nach deinem Lernstand gewählt. Wer selbst wählt: die Stufen sind nach Schwierigkeit sortiert, vom Erkennen bis zum freien Schreiben:</p>
    <ol class="intro-steps">
      <li>${ico("image","is-ic")}<div><b>Bilder</b><span class="is-tag">leicht</span><br>Pflanze am Foto erkennen und den richtigen Namen wählen.</div></li>
      <li>${ico("check","is-ic")}<div><b>Quiz</b><span class="is-tag">leicht</span><br>Zum deutschen Namen den richtigen botanischen aus vier Optionen wählen.</div></li>
      <li>${ico("cards","is-ic")}<div><b>Karteikarten</b><span class="is-tag">mittel</span><br>Selbst abrufen und ehrlich bewerten – Wiederholung nach Plan (Spaced Repetition).</div></li>
      <li>${ico("keys","is-ic")}<div><b>Selbst eingeben</b><span class="is-tag">prüfungsnah</span><br>Die Namen per Tastatur selbst schreiben – ein Feld je bewerteter Spalte (Gattung, Art, Familie), mit Punkten wie in der Prüfungstabelle.</div></li>
    </ol>
    <p class="intro-tip">${ico("sliders")} Jede Stufe kannst du unter <b>»Optionen«</b> feiner einstellen: was gefragt wird – vom <b>deutschen Namen</b> allein bis zur prüfungsechten Abfrage von <b>Gattung, Art und Familie</b> (Felder einzeln wählbar) – dazu Lernstoff, ZP-Filter und Sitzungslänge.</p>
    <p class="intro-tip">${ico("sprout")} <b>Fortschritt:</b> Jede richtige Antwort bringt eine Pflanze eine Stufe weiter –
      ab Stufe 4 »sitzt« sie. <button class="linklike" id="introHow">Die fünf Stufen ansehen</button></p>
    <p class="intro-foot"><b>Ziel:</b> Du benennst Gattung, Art und Familie sicher. Diese Einführung findest du jederzeit über <b>»So funktioniert der Lernpfad«</b> wieder.</p>
    <div class="intro-real">${ico("leaf")}<div><b>Ehrlich gesagt:</b> Pflanzen lernt man draußen – mit Erde unter den Fingernägeln,
      nicht mit dem Daumen auf dem Display. Das ersetzt diese App nicht, und das will sie auch nicht. Sie hilft dir, die
      <b>botanischen Namen</b> zu wiederholen und schnell nachzuschlagen – damit sie sitzen, wenn du vor der echten Pflanze stehst.</div></div>
    <div class="intro-cta"><button class="btn primary" id="introGo">Los geht's</button></div>
  </div>`;
  document.body.appendChild(scrim);
  const close=()=>{ try{ store.set(LS_PREFIX+"introSeen","1"); }catch(e){}
    document.removeEventListener("keydown", key); scrim.remove();
    if(prev && prev.focus){ try{ prev.focus(); }catch(e){} }
    if(onClose){ try{ onClose(); }catch(e){} } };
  const key=e=>{ if(e.key==="Escape") close(); };
  scrim.addEventListener("click", e=>{ if(e.target===scrim) close(); });
  scrim.querySelector("#introClose").onclick=close;
  scrim.querySelector("#introGo").onclick=close;
  const ih=scrim.querySelector("#introHow"); if(ih) ih.onclick=()=>{ close(); openHowModal(); };
  document.addEventListener("keydown", key);
  try{ scrim.querySelector("#introGo").focus(); }catch(e){}
}
(function boot(){
  try{
    $("#frSelect").innerHTML=FR_LIST.map(f=>`<option value="${slug(f)}">${esc(f)}</option>`).join("");
    $("#nivSelect").innerHTML=NIVEAUS.map(n=>`<option value="${n.key}">${esc(n.label)}</option>`).join("");
    listSort = store.get(LS_PREFIX+"listsort") || "thema";    // Standardansicht: nach Thema gruppiert
    if(listSort==="kategorie") listSort="thema";              // frühere Ansicht »Wuchsform/Kategorie«
    if(!SORT_LABEL[listSort]) listSort="thema";
    examOnly = store.get(LS_PREFIX+"examonly")==="1";
    loadPrefs();
    mode = store.get(LS_PREFIX+"mode") || "photo";   // neue Nutzer starten beim leichtesten Modus (Bilder)
    let pid = store.get(LS_PREFIX+"profile");
    const hadProfile = !!pid;                          // vor loadProfile lesen – das setzt den Store
    if(!(typeof SEEDS!=="undefined" && SEEDS[pid])) pid="gemuesebau_gaertner";
    // Eingehende Herausforderung (#c=…) übernimmt Profil und Modus
    const cm = (location.hash||"").match(/[#&]c=([^&]+)/);
    const ch = cm ? chDecode(cm[1]) : null;   // neues kompaktes Format, alte JSON-Links weiterhin lesbar
    if(ch && ch.p && Array.isArray(ch.i) && ch.i.length && (typeof SEEDS!=="undefined" && SEEDS[ch.p])){
      pendingChallenge = ch; pid = ch.p;
      if(ch.m==="quiz"||ch.m==="type"||ch.m==="photo") mode = ch.m;
      applyChallengePrefs(ch);                     // Banner und Auswahlfelder zeigen gleich die Aufgabe des Links
    }
    syncModeTabs();
    const parts = pid.match(/^(.*)_(gaertner|fachwerker)$/);
    if(parts){ $("#frSelect").value=parts[1]; $("#nivSelect").value=parts[2]; }
    wire();
    loadProfile(pid); profSub();
    if(pendingChallenge) showChallengeBanner(pendingChallenge);
    const bi=$("#btnIntro"); if(bi) bi.onclick=()=>openIntro(false);
    if(hadProfile) store.set(LS_PREFIX+"profilechosen","1");   // Bestandsnutzer: Beruf gilt als gewählt
    const firstRun = !pendingChallenge && !store.get(LS_PREFIX+"introSeen");
    if(firstRun) openIntro(true, ()=>{                 // Erst-Einweisung, danach einmalig die Berufswahl
      if(!store.get(LS_PREFIX+"profilechosen") && window.openProfile) window.openProfile();
    });
  }catch(e){
    document.body.innerHTML='<div style="max-width:640px;margin:80px auto;font-family:sans-serif;color:#22352b">'+
      '<h2>Start fehlgeschlagen</h2><pre>'+esc(e.message)+'</pre></div>';
  }
})();
/* für Tests / Konsole */
window.startSession=startSession;
window.startGuided=startGuided;
window.guidedForm=guidedForm;
window.openIntro=openIntro;
window.openInfo=openInfo;
window.closeInfo=closeInfo;
/* ---------- Neue Version sofort aktiv ----------
   Der Service Worker liefert die Seite cache-first: Beim ersten Aufruf nach einer
   Aktualisierung steht noch die alte Seite, während die neue im Hintergrund installiert
   wird. Sobald sie übernimmt (controllerchange, Snippet im <head>), laden wir neu – aber
   nur, wenn gerade nichts läuft (keine Sitzung, kein Dialog); sonst ein Hinweis mit Knopf.
   Sonst heißt es »ich sehe die Änderung nicht«, obwohl sie längst online ist. */
let swReload = ()=>{ try{ location.reload(); }catch(e){} };
function swIdle(){ return !sess.active && !document.querySelector(".scrim:not([hidden]), .lbscrim") && document.visibilityState!=="hidden"; }
function swUpdate(){
  if(swIdle()) return swReload();
  if($("#swNote")) return;
  const n = el("div"); n.id="swNote"; n.className="swnote"; n.setAttribute("role","status");
  n.innerHTML = `Neue Version geladen – wird beim nächsten Aufruf aktiv. <button class="btn small" id="swGo" type="button">Jetzt neu laden</button>`;
  document.body.appendChild(n);
  $("#swGo").onclick = ()=>swReload();
}
window.__swUpdate=swUpdate; window.__swReloadHook=fn=>{ swReload = fn || (()=>{ try{ location.reload(); }catch(e){} }); };
window.wikiCandidates=wikiCandidates;
window.searchName=searchName;
window.buildPrintList=buildPrintList;
window.themeOf=themeOf;
window.usablePhoto=usablePhoto;
window.wikiCandidates=wikiCandidates;
window.deArticleTitles=deArticleTitles;
window.photoSteps=photoSteps;
window.fileMentionsOther=fileMentionsOther;
window.pageFitsCard=pageFitsCard;
window.looksIllustration=looksIllustration;
window.looksDamage=looksDamage;
window.openLightbox=openLightbox;
window.lbBig=lbBig; window.__lbChain=lbChain;
window.streakState=streakState;   // für Tests: Lernserie/Tagesziel
window.streakBump=streakBump;
window.streakGoal=streakGoal;
window.herbCheck=herbCheck;       // für Tests: Sammel-Herbarium
window.herbData=herbData;
window.openHerbarium=openHerbarium;
window.xpTotal=xpTotal;           // für Tests: XP, Ränge, Combo
window.xpAdd=xpAdd;
window.rankOf=rankOf;
window.comboBonus=comboBonus;
window.RANKS=RANKS;
window.isCultivarName=isCultivarName;
window.cultivarName=cultivarName;       // für Tests: Sorten-Erkennung, Artbild-Regel, Tafel-Filter
window.cultivarKind=cultivarKind;
window.descriptiveCultivar=descriptiveCultivar;
window.looksArtwork=looksArtwork;
window.artKind=artKind; window.bestArt=bestArt;   // Notnagel-Zeichnung (für Tests)
window.binomEpithet=binomEpithet;
window.clean=clean;
window.checkTyped=checkTyped;
window.wikiGallery=wikiGallery;
window.photoFor=photoFor;
window.artShown=artShown;             // für Tests: Platzhalter »'Sorte'« → »in Sorten«, Bildvielfalt, Info-Karte
window.photoVariant=photoVariant;
window.sortenInfoHTML=sortenInfoHTML;
window.infraEpithet=infraEpithet;
window.artLevelOk=artLevelOk;
window.pickCommons=pickCommons;
window.fieldOk=fieldOk;
window.checkDeName=checkDeName;
window.judgeTyped=judgeTyped;
window.fieldJudge=fieldJudge;
window.markDiff=markDiff;
window.celebrate=celebrate;
window.deHeadCounts=()=>deHeadCount;   // für Tests: Grundwort → Artenzahl im Profil
window.deForms=deForms;
window.deMain=deMain;
window.nameEtymology=nameEtymology;   // für Tests: botanische Namensherleitung
window.examFieldList=examFieldList;
window.wikiPhoto=wikiPhoto;
window.wikiGenusCandidates=wikiGenusCandidates;   // für Tests: Gattungs-Notnagel der Info-Karte, Sektionen/Hybriden in der Bildsuche
window.genusArticleOk=genusArticleOk;
window.taxonName=taxonName;
window.sectName=sectName;
window.synCards=synCards;
window.pureGroupName=pureGroupName;
/* Bild-Quelle austauschbar + Bild-Cache leerbar: Die Tests laufen ohne Netz. */
window.__setPhotoSource=fn=>{ photoSource = fn || wikiPhoto; };
window.__setPhotoWait=ms=>{ phWaitMs = ms || 6000; };   // für Tests: Takt des Wartebildschirms
window.__setImgRetryWait=ms=>{ phImgRetryMs = ms || 1500; };   // für Tests: Pause vor der zweiten Bild-Runde
window.__imgChain=imgChain; window.__hostAlt=hostAlt;
window.__setJsonp=fn=>{ jsonp = fn || ((...a)=>jsonpGet(...a)); };   // API-Antworten für Tests vorgeben
window.__clearPhotoCache=()=>{ photoStore={}; photoTmp.clear(); photoSeenStore={}; photoMoreTried.clear(); try{ store.set(LS_PHOTOS,"{}"); store.set(LS_SEEN,"{}"); }catch(e){} };
window.__getPhotoSeen=photoSeenGet; window.__setPhotoSeen=photoSeenSet;   // für Tests: zuletzt gezeigte Ansicht je Art
window.__rememberPhoto=photoRemember;   // für Tests: »für diese Art gibt es kein Bild« (null) vormerken
window.__masteryReset=masteryReset; window.masteryBest=masteryBest; window.masteryOf=masteryOf; window.gateNeed=gateNeed; window.rankCheck=rankCheck;
window.photoless=photoless;
window.stepsLeft=stepsLeft;   // für Tests: Treffer bis »sitzt«
window.stepHTML=stepHTML;
window.renderListControls=renderListControls;
window.openFamilyInfo=openFamilyInfo;
window.shareChallenge=shareChallenge;
window.startChallenge=startChallenge;
window.challengeURL=challengeURL;
window.showChallengeBanner=showChallengeBanner;
window.b64urlEnc=b64urlEnc;
window.b64urlDec=b64urlDec;
window.chEncode=chEncode;
window.chDecode=chDecode;
window.fmtDur=fmtDur;
window.famName=famName;
