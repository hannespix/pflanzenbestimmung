# themes_check.py – Referenz & Prüfwerkzeug für die Lern-Themen (M2/M3/M4).
# Bildet die krautigen Seed-Kategorien (Stauden/Gemüse/Zimmer, plus Obst-Sammel-
# kategorien) auf die feineren
# Lern-Themen ab – kuratierte REFERENZ für die entsprechenden Zweige von themeOf()
# in src/learn.js (die Gehölz-/Obst-Vorrangregeln dort sind eigenständig). Zweck:
#   python3 tools/themes_check.py            # Verteilung aller Themen
#   python3 tools/themes_check.py Stauden    # Mitglieder eines Themas (Review)
# Die Seeds und das Prüfungswerkzeug bleiben unberührt; die Themen entstehen NUR
# zur Laufzeit im Lern-Tool. Bei Änderungen: hier UND in learn.js gleich halten
# (tests/learn.mjs prüft 14 Referenz-Zuordnungen).
import json, glob, os, collections, re

def epi(a):
    for w in (a or "").split():
        if w and not re.fullmatch(r'[×x]|var\.|subsp\.|ssp\.|f\.|cv\.|convar\.', w, re.I): return w.lower()
    return ""

# ---------- M2: Stauden → Lebensbereiche ----------
ST_WASSER = set("""Butomus Calla Caltha Hippuris Nuphar Nymphaea Menyanthes Pontederia
 Sagittaria Stratiotes Alisma Lythrum Ligularia Filipendula Trollius Chelone""".split())
ST_STEIN = set("""Acaena Alyssum Arabis Armeria Aubrieta Aurinia Azorella Cerastium Delosperma
 Dryas Globularia Leontopodium Lithospermum Raoulia Sagina Saxifraga Sedum Sempervivum Antennaria
 Dianthus Pulsatilla Iberis Thymus Santolina Gentiana Acantholimon Draba Aethionema Silene Dryas""".split())
ST_SCHATTEN = set("""Aconitum Actaea Aruncus Asarum Astilbe Astilboides Bergenia Brunnera Cimicifuga
 Convallaria Dicentra Digitalis Epimedium Helleborus Hepatica Hosta Lamium Omphalodes Pachysandra
 Podophyllum Polygonatum Pulmonaria Rodgersia Symphytum Tiarella Vinca Waldsteinia Ajuga Galium
 Glechoma Soleirolia Mitchella Heuchera Aegopodium Anemone Primula Tricyrtis Tellima Corydalis
 Uvularia Disporum Anemonopsis""".split())
# Art-Ausnahmen (Gattung|epitheton -> Thema)
ST_SPEC = {
 "Gypsophila|repens":"Steingarten- & Polsterstauden",
 "Phlox|subulata":"Steingarten- & Polsterstauden", "Phlox|douglasii":"Steingarten- & Polsterstauden",
 "Veronica|prostrata":"Steingarten- & Polsterstauden", "Veronica|spicata":"Beet- & Prachtstauden",
 "Campanula|portenschlagiana":"Steingarten- & Polsterstauden","Campanula|poscharskyana":"Steingarten- & Polsterstauden",
 "Campanula|cochleariifolia":"Steingarten- & Polsterstauden","Campanula|carpatica":"Steingarten- & Polsterstauden",
 "Euphorbia|myrsinites":"Steingarten- & Polsterstauden","Euphorbia|polychroma":"Beet- & Prachtstauden",
 "Primula|auricula":"Steingarten- & Polsterstauden","Primula|marginata":"Steingarten- & Polsterstauden",
 "Saxifraga|umbrosa":"Schatten- & Gehölzrandstauden",
 "Gentiana|asclepiadea":"Schatten- & Gehölzrandstauden",
 "Anemone|blanda":"Beet- & Prachtstauden",  # eig. Zwiebel, aber falls hier
 "Lysimachia|nummularia":"Wasser- & Uferstauden","Lysimachia|punctata":"Beet- & Prachtstauden",
 "Iris|pseudacorus":"Wasser- & Uferstauden",
 "Sedum|telephium":"Beet- & Prachtstauden","Sedum|spectabile":"Beet- & Prachtstauden",
 "Myosotis|palustris":"Wasser- & Uferstauden","Mentha|aquatica":"Wasser- & Uferstauden","Salvia|nemorosa":"Beet- & Prachtstauden",
}
def theme_staude(g, e):
    key=g+"|"+e
    if key in ST_SPEC: return ST_SPEC[key]
    if g in ST_WASSER: return "Wasser- & Uferstauden"
    if g in ST_STEIN:  return "Steingarten- & Polsterstauden"
    if g in ST_SCHATTEN: return "Schatten- & Gehölzrandstauden"
    return "Beet- & Prachtstauden"

# ---------- M3: Gemüse → Nutzungsgruppen ----------
GEM_FRUCHT = set("Capsicum Cucumis Cucurbita Citrullus Cyphomandra Cynara Zea".split())
GEM_HUELSE = set("Phaseolus Pisum Vicia Lens Glycine".split())
GEM_ZWIEBEL = set("Allium".split())
GEM_WURZEL = set("Daucus Pastinaca Scorzonera Armoracia Raphanus".split())
GEM_BLATT = set("""Lactuca Spinacia Valerianella Eruca Diplotaxis Portulaca Claytonia Tetragonia
 Lepidium Asparagus Rheum""".split())
def theme_gemuese(g, e, a):
    if g=="Solanum":
        return "Wurzel- & Knollengemüse" if e=="tuberosum" else "Fruchtgemüse"
    if g=="Physalis": return "Fruchtgemüse"
    if g=="Brassica":
        if e=="oleracea": return "Kohlgemüse"
        if e=="rapa":
            return "Kohlgemüse" if re.search(r'chinensis|pekinensis|nipposinica|narinosa', a, re.I) else "Wurzel- & Knollengemüse"
        if e=="napus": return "Wurzel- & Knollengemüse"     # Steckrübe
        return "Blatt- & Salatgemüse"                        # Senf/Rauke-artige
    if g=="Beta":  return "Wurzel- & Knollengemüse" if re.search(r'vulgaris', a) and not re.search(r'cicla|flavescens', a) else "Blatt- & Salatgemüse"
    if g=="Apium": return "Wurzel- & Knollengemüse" if re.search(r'rapaceum', a) else "Blatt- & Salatgemüse"
    if g=="Cichorium": return "Blatt- & Salatgemüse"
    if g in GEM_FRUCHT: return "Fruchtgemüse"
    if g in GEM_HUELSE: return "Hülsenfrüchte"
    if g in GEM_ZWIEBEL: return "Zwiebelgemüse"
    if g in GEM_WURZEL: return "Wurzel- & Knollengemüse"
    if g in GEM_BLATT:  return "Blatt- & Salatgemüse"
    if g=="Helianthus": return "Wurzel- & Knollengemüse"  # tuberosus Topinambur
    return "Blatt- & Salatgemüse"

# ---------- M3: Obst ----------
# Die Quell-Kategorien Kern-/Stein-/Beeren-/Schalen-/Wildobst sind bereits korrekt
# kuratiert (die Quelle weiß z. B., dass die Mandel Schalenobst ist) → UNVERÄNDERT.
# Nur die generischen Sammel-Kategorien »Obst«, »Zitrusfrüchte« und die
# »Unterlage«-Marker werden nach Gattung aufgelöst.
OBST_FINE = {"Kernobst","Steinobst","Beerenobst","Schalenobst","Wildobst"}
OB_KERN = set("Malus Pyrus Cydonia Mespilus Sorbus".split())
OB_STEIN = set("Prunus".split())
OB_BEERE = set("Ribes Rubus Vaccinium Fragaria".split())
OB_SCHALE = set("Juglans Corylus Castanea".split())
OB_EXOT = set("Citrus Diospyros Ficus Actinidia Musa Punica Asimina".split())
OBST_KATS = {"Beerenobst","Kernobst","Steinobst","Schalenobst","Wildobst","Obst","Zitrusfrüchte",
             "Unterlage für Kaki","Steinobst, Unterlage","Unterlage, Steinobst"}
def theme_obst(g, kat):
    if kat in OBST_FINE: return kat                     # Quelle korrekt – nicht anfassen
    if g in OB_EXOT:   return "Zitrus- & Exotenobst"
    if g in OB_KERN:   return "Kernobst"
    if g in OB_STEIN:  return "Steinobst"               # Prunus-Unterlagen bleiben Steinobst
    if g in OB_BEERE:  return "Beerenobst"
    if g in OB_SCHALE: return "Schalenobst"
    return kat

# ---------- M4: Zimmerpflanzen ----------
ZI_SUK_GEN = set("Aloe Aichryson Crassula Echeveria Kalanchoe Rhipsalidopsis Schlumbergera".split())
ZI_BROM = set("Bromeliaceae".split())
ZI_GRUEN = set("""Aglaonema Asparagus Beaucarnea Calathea Chlorophytum Cissus Codiaeum Cordyline
 Dieffenbachia Dracaena Epipremnum Fatsia Ficus Maranta Monstera Peperomia Philodendron Pilea
 Sansevieria Schefflera Scindapsus Syngonium Tradescantia Zamioculcas ×Fatshedera Fatshedera""".split())
ZI_BLUEH = set("""Abutilon Aeschynanthus Anthurium Aphelandra Bougainvillea Brugmansia Calceolaria
 Clivia Columnea Cyclamen Exacum Gardenia Hibiscus Hoya Mandevilla Medinilla Primula Saintpaulia
 Sinningia Spathiphyllum Stephanotis Streptocarpus Cuphea""".split())
ZI_PALM = set("Chamaedorea Phoenix Washingtonia Cycas Nephrolepis Platycerium".split())
def theme_zimmer(g, e, fam):
    if fam=="Orchidaceae": return "Orchideen"
    if fam=="Bromeliaceae": return "Bromelien"
    if fam=="Cactaceae": return "Sukkulenten & Kakteen"
    if g=="Echinocactus": return "Sukkulenten & Kakteen"
    if g=="Euphorbia": return "Sukkulenten & Kakteen"  # Zimmer-Euphorbien sind sukkulent
    if g in ZI_SUK_GEN: return "Sukkulenten & Kakteen"
    if g in ZI_PALM: return "Palmen & Zimmerfarne"
    if g in ZI_GRUEN: return "Grün- & Blattschmuckpflanzen"
    if g in ZI_BLUEH: return "Blühende Zimmerpflanzen"
    return "Grün- & Blattschmuckpflanzen"

def themeOf(g, a, kat, fam, pid):
    e=epi(a); kat=(kat or "").strip()
    if kat=="Stauden": return theme_staude(g,e)
    if kat=="Gemüsepflanzen": return theme_gemuese(g,e,a or "")
    if kat=="Zimmerpflanzen": return theme_zimmer(g,e,fam or "")
    if kat in OBST_KATS:
        t=theme_obst(g,kat)
        return t if t else kat
    return kat

if __name__=="__main__":
    groups=collections.defaultdict(list)
    for f in sorted(glob.glob("/home/user/pflanzenbestimmung/seeds/*.json")):
        pid=os.path.basename(f)[:-5]
        for r in json.load(open(f)):
            g,a,fam,de,kat=r[0],r[1],r[2],r[3],(r[4] or "").strip()
            if kat in ("Stauden","Gemüsepflanzen","Zimmerpflanzen") or kat in OBST_KATS:
                t=themeOf(g,a,kat,fam,pid)
                groups[t].append(f"{g} {a}".strip()+f"  «{de}»")
    import sys
    only=sys.argv[1] if len(sys.argv)>1 else None
    for t in sorted(groups, key=lambda k:-len(groups[k])):
        if only and only.lower() not in t.lower(): continue
        mem=sorted(set(groups[t]))
        print(f"\n=== {t} ({len(mem)})")
        for m in mem: print("   ", m)
