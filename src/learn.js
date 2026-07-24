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
const KAT_ORDER = ["Nadelgehölze","Laubgehölze","Gehölze","Kletterpflanzen","Stauden","Gräser","Farne","Zwiebel- und Knollenpflanzen","Ein- und zweijährige","Zimmerpflanzen","Gemüsepflanzen","Gewürzkräuter","Bei-, Wild- oder Unkräuter","Gründüngungspflanzen","Zierpflanzen","Obstgehölze"];
function katRank(k){ const i=KAT_ORDER.indexOf(k); return i<0?99:i; }

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
    key:((r[0]||"")+"|"+(r[1]||"")+"|"+(r[3]||"")).toLowerCase()
  })).filter(c=>c.g);
}

/* ---------- Zustand ---------- */
let profileId = "gemuesebau_gaertner";
let allCards = [];           // alle Arten des Profils
let progress = {};           // key -> {box(1..5), due(YYYY-MM-DD), seen, correct, wrong}
let mode = "cards";          // cards | quiz | type | list
let queue = [], qi = 0, current = null, flipped = false;
let sess = { total:0, done:0, correct:0, active:false };
let listCats = new Set();     // aktive Filter-Tags der laufenden Dimension (leer = alle)
let listSort = "bot";         // Ansicht: bot | de | kategorie | familie (Standard: alphabetisch, ohne Gruppen)
let pendingChallenge = null;  // aus der URL (#c=…) dekodierte, noch nicht angenommene Herausforderung
let examOnly = false;         // opt-in: nur Prüfungsstoff (Fachwerker) – Familie/Synonyme ausblenden

/* Nur-Prüfungsstoff-Modus: Die Fachwerker-Abschlussprüfung bewertet ausschließlich
   Deutscher Name, Gattung und Art (keine Familie). Diese opt-in Option blendet in
   Karteikarten und Liste alles außer diesen Feldern aus (Info-Links bleiben) –
   weniger Lernstoff, nur das Geprüfte. Nur bei Fachwerker-Profilen aktivierbar. */
function isFachwerker(){ return /_fachwerker$/.test(profileId); }
function examOnlyActive(){ return examOnly && isFachwerker(); }
function normalizeSort(){ if(examOnlyActive() && listSort==="familie"){ listSort="bot"; store.set(LS_PREFIX+"listsort",listSort); } }
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
function loadProgress(){ try{ const raw=store.get(progKey()); progress=raw?JSON.parse(raw):{}; if(typeof progress!=="object"||!progress) progress={}; }catch(e){ progress={}; } }
function saveProgress(){ store.set(progKey(), JSON.stringify(progress)); }
function pget(key){ return progress[key] || {box:0,due:"",seen:0,correct:0,wrong:0}; }
function grade(card, g){ // g: 'again' | 'hard' | 'good'
  const p = pget(card.key);
  p.seen = (p.seen||0)+1;
  const nb = boxAfter(p.box||0, g);
  p.box = nb;
  if(g==="again"){ p.wrong=(p.wrong||0)+1; p.due=todayISO(); }        // heute nochmal fällig
  else { p.correct=(p.correct||0)+1; p.due=addDays(todayISO(), BOX_DAYS[nb-1]); }
  progress[card.key]=p; saveProgress();
  if(sess.active) renderProgress();            // Fortschritt sofort sichtbar aktualisieren
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

/* ---------- Lernrichtung: Deutscher Name → botanische Identität ----------
   Lern-didaktisch sinnvoll ist genau die Prüfungssituation: Man erkennt die
   Pflanze (der greifbarste Anker ohne Bild ist ihr deutscher Name) und muss
   Gattung, Art und Familie nennen. Deshalb fragt das Tool durchgängig in dieser
   einen Richtung – Vorderseite deutscher Name, Rückseite die vollständige
   botanische Identität. (Botanisch→Deutsch und Art→Familie sind fachlich nicht
   sinnvoll und wurden entfernt.) Die Familie ist Teil der Rückseite; zusätzlich
   lässt sie sich über Liste + Familien-Steckbriefe vertiefen. */
function famName(f){                              // "Fabaceae · Schmetterlingsblütler" (dt. Name aus Daten oder FAM_INFO)
  const lat=famKey(f); if(!lat) return f||"";
  const de=famGerman(f) || (FAM_INFO[lat] && FAM_INFO[lat].de) || "";
  return de ? lat+" · "+de : lat;
}
function promptHTML(c){ return esc(c.de||"—"); }                 // Vorderseite: nur deutscher Name
function promptSub(c){ return ""; }                              // kein Hinweis vorne (nur der Name)
function answerText(c){ return norm(c.g+" "+c.a); }              // gesucht: botanischer Name (Gattung + Art)
function answerLabel(){ return "Botanischer Name"; }
function promptLabel(){ return "Deutscher Name"; }
/* Rückseite: Gattung, Art und Familie klar getrennt (wie im Prüfungsbogen bewertet).
   Botanische Werte kursiv (Gattung/Art/Synonyme), Familiennamen aufrecht. */
function answerMeta(c){
  const row=(lab,val,it)=>`<span class="mf"><b>${lab}</b>${it?"<i>"+esc(val)+"</i>":esc(val)}</span>`;
  const bits=[];
  if(c.g)   bits.push(row("Gattung", c.g, true));
  if(c.a)   bits.push(row("Art", c.a, true));
  if(!examOnlyActive()){                          // im Prüfungsstoff-Modus (Fachwerker) Familie/Synonyme weglassen
    if(c.fam) bits.push(row("Familie", famName(c.fam), false));
    if(c.syn) bits.push(row("Syn.", c.syn, true));
  }
  return bits.join("");
}

/* ---------- Distraktoren fürs Quiz ---------- */
function distractors(c, n){
  const want = answerText(c).toLowerCase();
  const same = allCards.filter(x=>x.key!==c.key && answerText(x).toLowerCase()!==want && x.kat===c.kat);
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
  // Gattung + Art getrennt prüfen (tippfehlertolerant)
  const parts=clean(input).split(" ");
  const gi=parts.shift()||""; const ai=parts.join(" ");
  const gOk=closeEnough(gi, c.g);
  const aOk = !norm(c.a) || closeEnough(ai, c.a) || (c.a.toLowerCase().indexOf(ai)===0 && ai.length>=3);
  return gOk && aOk;
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
     </div>`;
  const due = p.filter(c=>{ const pr=pget(c.key); return !pr.box || !pr.due || pr.due<=todayISO(); }).length;
  $("#startHint").textContent = p.length ? `${due} Karten heute dran · ${answerLabel()} gefragt` : "Keine Arten im aktuellen Filter.";
  $("#btnStart").disabled = !p.length;
}

/* ---------- Ergebnis teilen · Lernduell (Herausforderung) ----------
   Eine abgeschlossene Quiz-/Tipp-Sitzung lässt sich als Herausforderung teilen:
   Profil, Modus und die EXAKTE Kartenauswahl (als Indizes in
   cardsFor(profil)) plus das erreichte Ergebnis werden kompakt base64-kodiert an
   die URL gehängt (#c=…). Wer den Link öffnet, bekommt genau dieselben Karten und
   Fragen und versucht, die Trefferquote zu schlagen. Alles offline – kein Netz-
   abruf; geteilt wird per Web-Share (mobil inkl. WhatsApp), WhatsApp-Deeplink
   (wa.me, neuer Tab) oder Link-Kopieren. */
function b64urlEnc(obj){
  const s = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  return s.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function b64urlDec(s){
  try{ s=String(s).replace(/-/g,"+").replace(/_/g,"/"); while(s.length%4) s+="=";
    return JSON.parse(decodeURIComponent(escape(atob(s)))); }catch(e){ return null; }
}
function duelName(v){                    // Name des Herausforderers (optional, im Browser gemerkt)
  if(v!=null) store.set(LS_PREFIX+"name", String(v).slice(0,40));
  return store.get(LS_PREFIX+"name") || "";
}
function sessAcc(){ return sess.done ? Math.round(sess.correct/sess.done*100) : 0; }
function scoreable(){ return mode==="quiz" || mode==="type"; }   // nur Modi mit echter Trefferquote
function frNameOf(pid){ const s=(pid.match(/^(.*)_(gaertner|fachwerker)$/)||[])[1]; return FR_LIST.find(f=>slug(f)===s)||""; }
function nivNameOf(pid){ return /_fachwerker$/.test(pid)?"Fachwerker/in":"Gärtner/in"; }

function challengeURL(){                  // aktuelle Sitzung als Herausforderungs-Link kodieren
  const idx = (sess.cards||[]).map(c=>allCards.indexOf(c)).filter(i=>i>=0);
  const payload = { v:1, p:profileId, m:mode, i:idx, s:sess.correct, t:sess.done, n:duelName() };
  return location.href.split("#")[0] + "#c=" + b64urlEnc(payload);
}
function duelMessage(url){
  const who = duelName().trim();
  const modeLabel = mode==="quiz" ? "Quiz" : "Tippen";
  const fr = frNameOf(profileId);
  return `🌱 Pflanzen-Lernduell (${modeLabel}${fr?" · "+fr:""})\n`+
    `${who?who+" hat":"Ich habe"} ${sess.correct} von ${sess.done} richtig (${sessAcc()} %). Schaffst du mehr?\n`+
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
  const done = ()=>toast("Link kopiert – jetzt an Kollegen schicken");
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
    <p class="share-h">Fordere Azubi-Kollegen heraus</p>
    <p class="share-sub">Verschick genau diese Lektion – gleiche Karten, gleiche Fragen. Wer den Link öffnet, versucht deine Trefferquote zu schlagen und kann dir sein Ergebnis zurückschicken.</p>
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
  const modeLabel = ch.m==="quiz" ? "Quiz" : "Tippen";
  const n=(ch.i||[]).length;
  b.innerHTML = `<div class="duel-ic" aria-hidden="true">🌱</div>
    <div class="duel-txt">
      <p class="duel-title">${who?esc(who)+" fordert dich heraus!":"Lernduell – Herausforderung"}</p>
      <p class="duel-meta">${modeLabel} · ${esc(frNameOf(ch.p))} · ${esc(nivNameOf(ch.p))} · ${n} Karten · Zielwert <b>${theirAcc} %</b> (${ch.s}/${ch.t} richtig)</p>
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
  const cards = (ch.i||[]).map(i=>allCards[i]).filter(Boolean);
  if(!cards.length){ toast("Karten dieser Herausforderung nicht gefunden",true); return; }
  const b=$("#duelBanner"); if(b) b.hidden=true;
  queue = cards.slice(); qi = 0;
  sess = { total:queue.length, done:0, correct:0, active:true, cards:cards.slice(), challenge:ch };
  nextCard();
}

/* ---------- Sitzung / Bühne ---------- */
function startSession(){
  queue = buildQueue(); qi = 0;
  sess = { total:queue.length, done:0, correct:0, active:true, cards:queue.slice(), challenge:null };
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
function requeueCurrent(){ // "Nochmal"/falsch: Karte in dieser Sitzung später erneut zeigen
  const pos = Math.min(queue.length, qi + 3 + Math.floor(Math.random()*3)); // 3–5 Karten später
  queue.splice(pos, 0, current); sess.total++;
}

function finishSession(){
  sess.active=false;
  const acc = sessAcc();
  const ch = sess.challenge;                     // angenommene Herausforderung (falls vorhanden)
  let extra = "";
  if(ch){                                        // Vergleich Du ↔ Herausforderer
    const theirAcc = ch.t ? Math.round(ch.s/ch.t*100) : 0;
    const who = (ch.n||"").trim() || "Herausforderer";
    const verdict = acc>theirAcc ? `<b class="duel-win">Du hast gewonnen! 🎉</b>`
      : acc<theirAcc ? `<b class="duel-lose">Knapp – ${esc(who)} liegt vorn. Nochmal versuchen?</b>`
      : `<b>Gleichstand!</b>`;
    extra = `<div class="duel-result">
      <div class="duel-row"><span>Du</span><span class="duel-pct">${acc} %</span><span class="duel-raw">${sess.correct}/${sess.done}</span></div>
      <div class="duel-row"><span>${esc(who)}</span><span class="duel-pct">${theirAcc} %</span><span class="duel-raw">${ch.s}/${ch.t}</span></div>
      <p class="duel-verdict">${verdict}</p></div>`;
  }
  const share = scoreable() ? shareBlockHTML(ch ? "Mein Ergebnis zurückschicken" : "Ergebnis teilen · herausfordern") : "";
  const stage=$("#stage");
  stage.innerHTML = `<div class="stage-empty">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6L9 17l-5-5"/></svg>
    <h2>Sitzung geschafft</h2>
    <p>${sess.done} Karten gelernt${mode!=="cards"?` · ${sess.correct} richtig (${acc} %)`:""}.</p>
    ${extra}
    ${share}
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px">
      <button class="btn primary" id="againBtn">Weiter lernen</button>
    </div></div>`;
  wireShareBlock();
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
  rate.querySelector(".r-again").onclick=()=>{ grade(c,"again"); requeueCurrent(); advance(); };
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
  grade(c, ok?"good":"again"); if(ok) sess.correct++; else requeueCurrent();
  $("#fb").innerHTML = ok ? `<span class="good">Richtig!</span>`
    : `<span class="bad">Leider falsch.</span> <span class="sol">Richtig: ${esc(correct)}</span>`;
  const nav=$("#nav"); nav.innerHTML=infoBtnHTML("Mehr")+`<button class="btn primary" id="wt">Weiter</button>`;
  wireInfoBtn(); $("#wt").onclick=advance; $("#wt").focus();
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
  grade(c, ok?"good":"again"); if(ok) sess.correct++; else requeueCurrent();
  $("#fb").innerHTML = ok ? `<span class="good">Richtig!</span>`
    : `<span class="bad">Nicht ganz.</span> <span class="sol">Richtig: ${esc(answerText(c))}</span>`;
  const nav=$("#nav"); nav.innerHTML=infoBtnHTML("Mehr")+`<button class="btn primary" id="wt">Weiter</button>`;
  wireInfoBtn(); $("#wt").onclick=advance; $("#wt").focus();
}

function startHintOnly(){
  $("#stage").innerHTML = `<div class="stage-empty">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22V8M12 8C12 8 7 3 4 4c-1 3 4 8 8 8zM12 8c0 0 5-5 8-4 1 3-4 8-8 8z"/></svg>
    <h2>Bereit zum Lernen</h2>
    <p>Modus wählen und »Sitzung starten«. Gefragt wird der <b>deutsche Name → botanische Identität</b> (Gattung, Art, Familie), wie in der Prüfung. Details unter <b>Hilfe</b>.</p>
  </div>`;
}

/* ---------- Liste / Nachschlagen (durchsuchbar, nach Kategorie gruppiert) ---------- */
const deacc = s => (s==null?"":String(s)).normalize("NFD").replace(/[\u0300-\u036f]/g,"");
/* Gefilterte Listen-Menge (Kategorie-/ZP-Filter + Suchfeld) \u2013 auch Basis der Druckliste */
/* Ansichten (Gruppier-/Sortier-Dimensionen). »bot«/»de« sind flach-alphabetisch
   (keine Filter-Tags); »kategorie«/»familie« gruppieren und bieten Filter-Tags
   der jeweiligen Dimension. */
const SORT_LABEL={bot:"A–Z botanisch",de:"A–Z deutsch",kategorie:"Wuchsform/Kategorie",familie:"Familie"};
const groupsView = () => listSort==="kategorie" || listSort==="familie";
const dimKey = c => listSort==="familie" ? (c.fam||"Ohne Familie") : (c.kat||"Ohne Kategorie");
function dimValues(){ // Werte der aktuellen Gruppier-Dimension (+ Anzahl), für die Filter-Tags
  const zp=$("#onlyzp") && $("#onlyzp").checked;
  const set=new Map();
  allCards.forEach(c=>{ if(zp&&!c.zp) return; const k=dimKey(c); set.set(k,(set.get(k)||0)+1); });
  const byFam=listSort==="familie";
  return [...set.entries()].sort((a,b)=> byFam ? a[0].localeCompare(b[0],"de") : (katRank(a[0])-katRank(b[0]) || a[0].localeCompare(b[0],"de")));
}
function listFiltered(){
  const raw = $("#listSearch") ? $("#listSearch").value : "";
  const term = deacc(norm(raw)).toLowerCase();
  let p = pool();  // ZP-Filter; in der Liste filtern die Tags der aktuellen Ansicht, nicht das Dropdown
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
  // Zusammenfassung für die (eingeklappte) Kopfzeile des Akkordions
  const sub = groupsView()
    ? (listCats.size ? `${SORT_LABEL[listSort]} · ${listCats.size} ausgewählt` : `${SORT_LABEL[listSort]} · alle`)
    : SORT_LABEL[listSort];
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
  host.innerHTML=`
    <button class="lc-toggle" id="lcToggle" aria-expanded="${open?"true":"false"}">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M6 12h12M10 18h4"/></svg>
      <span class="lc-title">Ansicht &amp; Filter</span><span class="lc-sub">${esc(sub)}</span>
      <span class="lc-caret" aria-hidden="true">▾</span>
    </button>
    <div class="lc-body"${open?"":" hidden"}>
      <div class="sortrow"><span class="sortlab">Ansicht</span><div class="sortbtns" role="group" aria-label="Ansicht">${sorts}</div></div>
      ${tags}
    </div>`;
  $("#lcToggle").onclick=()=>{ host.dataset.open = open?"0":"1"; renderListControls(); };
  host.querySelectorAll(".sortbtn").forEach(b=>b.onclick=()=>{
    if(listSort!==b.dataset.sort){ listSort=b.dataset.sort; listCats.clear(); store.set(LS_PREFIX+"listsort",listSort); }
    renderListControls(); renderList();
  });
  host.querySelectorAll(".cattag").forEach(b=>b.onclick=()=>{
    const k=b.dataset.cat;
    if(!k) listCats.clear();
    else { if(listCats.has(k)) listCats.delete(k); else listCats.add(k); }
    renderListControls(); renderList();
  });
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
    return `<li class="sprow" data-idx="${idx}" tabindex="0" role="button" aria-label="${esc(norm(c.g+" "+c.a))} – Infos öffnen">
      <div class="sp-main"><span class="sp-bot">${esc(norm(c.g+" "+c.a))}</span>${c.zp?'<span class="sp-zp" title="prüfungsrelevant (ZP)">ZP</span>':""}<span class="sp-go">ℹ</span></div>
      ${sub?`<div class="sp-sub">${sub}</div>`:""}
    </li>`; };
  let html=`<div class="listtop">${p.length} ${p.length===1?"Art":"Arten"}${term?(" · Treffer für »"+esc(raw)+"«"):""} · sortiert nach ${SORT_LABEL[listSort]} · zum Nachschlagen antippen</div>`;
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
    // nach Kategorie oder Familie gruppieren
    const byFam = listSort==="familie";
    const groups=new Map();
    p.forEach(c=>{ const k=(byFam?(c.fam||"Ohne Familie"):(c.kat||"Ohne Kategorie")); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(c); });
    const keys=[...groups.keys()].sort((a,b)=> byFam ? a.localeCompare(b,"de") : (katRank(a)-katRank(b) || a.localeCompare(b,"de")));
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
  stage.querySelectorAll(".sprow").forEach(li=>{
    const c=flat[+li.getAttribute("data-idx")];
    li.onclick=()=>openInfo(c);
    li.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openInfo(c); } };
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
const PRINT_COLS={ // [Feld, Beschriftung, Punktangabe] im Wortlaut der Bögen
  fw:  [["de","Deutscher Name","3 Punkte"],["g","Gattung (botanisch)","0,5 Punkte"],["a","Art (botanisch)","0,5 Punkte"]],
  gala:[["g","Gattungsname","1 Punkt (G)"],["a","Artname","1 Punkt (G)"],["de","Deutscher Name","2 Punkte (G)"]],
  prod:[["g","Gattungsname","3 Punkte (G)"],["a","Artname","3 Punkte (G)"],["fam","Familienname","1 Punkt (G)"],["de","Deutscher Name","3 Punkte (G)"]]
};
function buildPrintList(){
  const host=$("#printList"); if(!host) return 0;
  const fam=printFamily();
  const cols=PRINT_COLS[fam];
  const { p, raw, term } = listFiltered();
  const frLabel=$("#frSelect").selectedOptions[0]?$("#frSelect").selectedOptions[0].textContent:"";
  const nivLabel=$("#nivSelect").selectedOptions[0]?$("#nivSelect").selectedOptions[0].textContent:"";
  const title= fam==="gala" ? "Abschlussprüfung Pflanzenbestimmung im Gartenbau GALA"
             : fam==="prod" ? "Abschlussprüfung Pflanzenbestimmung im Gartenbau"
             : "Abschlussprüfung Pflanzenbestimmung";
  const heute=new Date().toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"});
  const filt=[];
  if(groupsView() && listCats.size) filt.push((listSort==="familie"?"Familie: ":"Kategorie: ")+[...listCats].join(", "));
  if($("#onlyzp").checked) filt.push("nur ZP-relevant");
  if(term) filt.push("Suche: »"+raw+"«");

  const heads=`<th class="pnum"></th>`+
    cols.map(c=>`<th>${esc(c[1])}<span class="pp">${esc(c[2])}</span></th>`).join("")+
    `<th class="pzp" title="prüfungsrelevant für die Zwischenprüfung">ZP</th>`;
  let n=0, rows="";
  const band = label => `<tr class="pcat"><td colspan="${cols.length+2}">${esc(label)}</td></tr>`;
  const rowFor = c => { n++; return `<tr><td class="pnum">${n}</td>`+
    cols.map(k=>`<td class="${k[0]==="g"||k[0]==="a"?"bot":""}">${esc(c[k[0]]||"")}</td>`).join("")+
    `<td class="pzp">${c.zp?"×":""}</td></tr>`; };

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
    // nach Wuchsform/Kategorie oder botanischer Familie gruppieren
    const byFam=listSort==="familie";
    const groups=new Map();
    p.forEach(c=>{ const k=dimKey(c); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(c); });
    const keys=[...groups.keys()].sort((a,b)=> byFam ? a.localeCompare(b,"de") : (katRank(a)-katRank(b) || a.localeCompare(b,"de")));
    for(const k of keys){
      const arr=groups.get(k).slice().sort((a,b)=> norm(a.g+" "+a.a).localeCompare(norm(b.g+" "+b.a),"de"));
      rows+=band(`${k} · ${arr.length} ${arr.length===1?"Art":"Arten"}`);
      for(const c of arr) rows+=rowFor(c);
    }
  }
  const hasZP = p.some(c=>c.zp);
  host.innerHTML=`
    <h1 class="ptitle${fam==="fw"?" pb":""}">${esc(title)} — Lernliste</h1>
    ${fam==="fw"?`<div class="psub">Gartenbaufachwerker/in</div>`:""}
    <div class="pmeta">Fachrichtung ${esc(frLabel)} · ${esc(nivLabel)} · ${n} ${n===1?"Art":"Arten"}
      · sortiert nach ${esc(SORT_LABEL[listSort]||"Kategorie")}${filt.length?` · ${esc(filt.join(" · "))}`:""} · Stand ${esc(heute)}</div>
    <table class="ptab"><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>
    <div class="pfoot">${hasZP?"ZP = für die Zwischenprüfung relevant · ":""}Pflanzenkenntnis · Lernliste in der Form des Prüfungsbogens (Spalten und Punkte wie in der Prüfung)</div>`;
  return n;
}
function printList(){
  const n=buildPrintList();
  if(!n){ toast("Keine Arten im aktuellen Filter",true); return; }
  window.print();
}

/* Modus anwenden: Liste zeigt sofort die Nachschlage-Liste (ohne »Sitzung starten«) */
function applyMode(){
  const isList = mode==="list";
  const sr=$("#startRow"), lsr=$("#listSearchRow"), lc=$("#listControls");
  if(sr) sr.hidden = isList;
  if(lsr) lsr.hidden = !isList;
  if(lc) lc.hidden = !isList;
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
function binomEpithet(a){
  return (norm(a).split(" ").filter(w=> w && !/^([×x]|var\.|subsp\.|ssp\.|f\.|cv\.|convar\.)$/i.test(w))[0]) || "";
}
function searchName(c){ return norm(c.g+" "+binomEpithet(c.a)); }
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
let __wpN = 0;
function wikiJSONP(title){
  return new Promise((resolve,reject)=>{
    const cb = "__wpcb"+(++__wpN);
    const sc = document.createElement("script");
    let done = false;
    const cleanup = ()=>{ try{ delete window[cb]; }catch(e){ window[cb]=undefined; } if(sc.parentNode) sc.parentNode.removeChild(sc); };
    const to = setTimeout(()=>{ if(done) return; done=true; cleanup(); reject(new Error("timeout")); }, 7000);
    window[cb] = d=>{ if(done) return; done=true; clearTimeout(to); cleanup(); resolve(d); };
    sc.onerror = ()=>{ if(done) return; done=true; clearTimeout(to); cleanup(); reject(new Error("network")); };
    sc.src = "https://de.wikipedia.org/w/api.php?action=query&format=json&prop=extracts%7Cpageimages"+
      "&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=320&redirects=1&titles="+
      encodeURIComponent(title)+"&callback="+cb;
    document.head.appendChild(sc);
  });
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
}
/* Kandidaten in sinnvoller Reihenfolge – bewusst OHNE bloße Gattung.
   Grund: viele Gattungsnamen sind auf Wikipedia mehrdeutig (»Beta« = griech.
   Buchstabe, »Iris« = u. a. Auge). Sorten-/Gruppen-Einträge (»Beta vulgaris
   Conditiva-Grp.«) haben keinen eigenen Artikel → wir treffen über das reine
   Binom (»Beta vulgaris« → »Rübe«) bzw. den deutschen Namen. */
function wikiCandidates(card){
  const cands=[], seen=new Set();
  const add=s=>{ s=norm(s); if(s && !seen.has(s.toLowerCase())){ seen.add(s.toLowerCase()); cands.push(s); } };
  add(card.g+" "+card.a);                               // voller Name (z. B. mit Sorte/Gruppe)
  add(searchName(card));                                // reines Binom ohne Zusatz (»Beta vulgaris«)
  add((card.de||"").split(/[,;/]/)[0]);                 // deutscher Name (oft der echte Artikeltitel)
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
      btn.disabled=false; btn.textContent="🌐 Erneut versuchen";
    }
    return;
  }
  const data = { title:pg.title, extract:shortenExtract(pg.extract),
    thumb: pg.thumbnail && pg.thumbnail.source,
    url: "https://de.wikipedia.org/wiki/"+encodeURIComponent(pg.title.replace(/ /g,"_")) };
  wikiCache.set(card.key, data); renderWiki(host, data); if(btn.parentNode) btn.remove();
}
let infoEl=null;
function infoKey(e){ if(e.key==="Escape") closeInfo(); }
function closeInfo(){ if(infoEl){ infoEl.remove(); infoEl=null; document.removeEventListener("keydown", infoKey); } }
function openInfo(card){
  if(!card) return;
  closeInfo();
  const links = deepLinks(card).map(l=>
    `<a href="${esc(l.u)}" target="_blank" rel="noopener">${esc(l.n)}<span class="ext">↗</span></a>`).join("");
  const fam = [card.fam, card.kat].filter(Boolean).join(" · ");
  const scrim = el("div","scrim"); scrim.id="infoScrim";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Pflanzen-Info">
     <button class="modal-x" id="infoClose" aria-label="Schließen" title="Schließen">×</button>
     <div class="modal-head">
       <div class="mh-bot">${esc(norm(card.g+" "+card.a))}</div>
       ${card.de?`<div class="mh-de">${esc(card.de)}</div>`:""}
       ${fam?`<div class="mh-fam">${esc(fam)}</div>`:""}
     </div>
     <div class="srcblock">
       <div class="srclabel">Nachschlagen · öffnet neuen Tab</div>
       <div class="srcgrid">${links}</div>
     </div>
     <div class="wpblock">
       <button class="btn primary" id="wpLoad" title="Kurztext und Bild von der deutschen Wikipedia laden (nur online)">🌐 Online-Infos laden (Wikipedia)</button>
       <div class="wphost" id="wpHost"></div>
     </div>
   </div>`;
  document.body.appendChild(scrim); infoEl=scrim;
  scrim.addEventListener("click", e=>{ if(e.target===scrim) closeInfo(); });
  $("#infoClose").onclick = closeInfo;
  const host = scrim.querySelector("#wpHost"), btn = scrim.querySelector("#wpLoad");
  const cached = wikiCache.get(card.key);
  if(cached){ renderWiki(host, cached); btn.remove(); }
  else if(cached===null){ host.innerHTML='<div class="wp-note">Kein deutscher Wikipedia-Artikel gefunden. Die Links oben führen dich weiter.</div>'; btn.remove(); }
  else btn.onclick = ()=>loadWiki(card, host, btn);
  document.addEventListener("keydown", infoKey);
}
const infoBtnHTML = label => `<button class="btn ghost infobtn" id="infoBtn" title="Quellen &amp; Online-Infos zu dieser Pflanze">ℹ ${esc(label||"Mehr")}</button>`;
function wireInfoBtn(){ const b=$("#infoBtn"); if(b) b.onclick=e=>{ e.stopPropagation(); openInfo(current); }; }

/* Familien-Steckbrief als Modal (offline, kuratiert) – gemeinsame Merkmale + Lerntipp */
function openFamilyInfo(famStr){
  closeInfo();
  const lat = famKey(famStr), info = FAM_INFO[lat], de = (info&&info.de) || famGerman(famStr);
  const body = info
    ? `<div class="fam-sec"><h4>Was die Arten gemeinsam haben</h4><p>${esc(info.m)}</p></div>
       <div class="fam-sec"><h4>Erkennen &amp; merken</h4><p>${esc(info.t)}</p></div>`
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
}

/* ---------- Profil-Wechsel ---------- */
function loadProfile(id){
  if(!(typeof SEEDS!=="undefined" && SEEDS[id])) id = SEEDS && SEEDS["gemuesebau_gaertner"] ? "gemuesebau_gaertner" : Object.keys(SEEDS||{})[0];
  profileId = id;
  allCards = cardsFor(id);
  loadProgress();
  if($("#listSearch")) $("#listSearch").value="";   // Suche beim Profilwechsel zurücksetzen
  listCats.clear();                                  // Kategorie-Tags beim Profilwechsel zurücksetzen
  refreshKat();
  syncExamOnlyUI();                                  // »nur Prüfungsstoff«-Schalter nur bei Fachwerker zeigen
  normalizeSort();                                   // ggf. Familien-Ansicht verlassen, wenn ausgeblendet
  applyMode();                                       // Ansicht passend zum aktuellen Modus (inkl. Liste)
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
  const refreshView = ()=>{ if(mode==="list"){ renderListControls(); renderList(); } else renderProgress(); };
  $("#frSelect").onchange=applyProfile;
  $("#nivSelect").onchange=applyProfile;
  $("#cat").onchange=refreshView;
  $("#onlyzp").onchange=refreshView;
  if($("#examOnly")) $("#examOnly").onchange=()=>{
    examOnly=$("#examOnly").checked; store.set(LS_PREFIX+"examonly", examOnly?"1":"0");
    normalizeSort(); refreshView();
  };
  $("#listSearch").oninput=()=>{ if(mode==="list") renderList(); };
  if($("#btnPrintList")) $("#btnPrintList").onclick=printList;
  $("#modeTabs").querySelectorAll("button").forEach(b=>b.onclick=()=>{
    mode=b.dataset.mode; store.set(LS_PREFIX+"mode",mode);
    $("#modeTabs").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));
    applyMode();
  });
  $("#btnStart").onclick=startSession;
  $("#btnHelp").onclick=()=>{
    const h=$("#helpPanel"), b=$("#btnHelp"), willOpen=h.hidden;
    h.hidden=!willOpen; b.classList.toggle("active",willOpen); b.setAttribute("aria-pressed",String(willOpen));
    if(willOpen) h.scrollIntoView({behavior:"smooth",block:"nearest"});
  };
}

/* ---------- Start ---------- */
(function boot(){
  try{
    $("#frSelect").innerHTML=FR_LIST.map(f=>`<option value="${slug(f)}">${esc(f)}</option>`).join("");
    $("#nivSelect").innerHTML=NIVEAUS.map(n=>`<option value="${n.key}">${esc(n.label)}</option>`).join("");
    listSort = store.get(LS_PREFIX+"listsort") || "bot";
    examOnly = store.get(LS_PREFIX+"examonly")==="1";
    mode = store.get(LS_PREFIX+"mode") || "cards";
    let pid = store.get(LS_PREFIX+"profile");
    if(!(typeof SEEDS!=="undefined" && SEEDS[pid])) pid="gemuesebau_gaertner";
    // Eingehende Herausforderung (#c=…) übernimmt Profil und Modus
    const cm = (location.hash||"").match(/[#&]c=([^&]+)/);
    const ch = cm ? b64urlDec(cm[1]) : null;
    if(ch && ch.p && Array.isArray(ch.i) && ch.i.length && (typeof SEEDS!=="undefined" && SEEDS[ch.p])){
      pendingChallenge = ch; pid = ch.p;
      if(ch.m==="quiz"||ch.m==="type") mode = ch.m;
    }
    $("#modeTabs").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x.dataset.mode===mode));
    const parts = pid.match(/^(.*)_(gaertner|fachwerker)$/);
    if(parts){ $("#frSelect").value=parts[1]; $("#nivSelect").value=parts[2]; }
    wire();
    loadProfile(pid); profSub();
    if(pendingChallenge) showChallengeBanner(pendingChallenge);
  }catch(e){
    document.body.innerHTML='<div style="max-width:640px;margin:80px auto;font-family:sans-serif;color:#22352b">'+
      '<h2>Start fehlgeschlagen</h2><pre>'+esc(e.message)+'</pre></div>';
  }
})();
/* für Tests / Konsole */
window.startSession=startSession;
window.openInfo=openInfo;
window.closeInfo=closeInfo;
window.wikiCandidates=wikiCandidates;
window.searchName=searchName;
window.buildPrintList=buildPrintList;
window.renderListControls=renderListControls;
window.openFamilyInfo=openFamilyInfo;
window.shareChallenge=shareChallenge;
window.startChallenge=startChallenge;
window.challengeURL=challengeURL;
window.showChallengeBanner=showChallengeBanner;
window.b64urlEnc=b64urlEnc;
window.b64urlDec=b64urlDec;
window.famName=famName;
