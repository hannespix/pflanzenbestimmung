#!/usr/bin/env python3
"""
Kategorien (Wuchsform) für die Profile OHNE Kategorien nachtragen.

Die vier Profile, die aus den Excel-Quelllisten bereits Kategorien mitbringen
(Gemüsebau, Obstbau-Gärtner, Friedhof-Fachwerker), werden NICHT angetastet.
Für die übrigen zehn Profile wird das Kategorie-Feld (Index 4 der Seed-Zeile)
anhand einer botanisch kuratierten Systematik gesetzt:

  Nadelgehölze · Laubgehölze · Kletterpflanzen · Stauden · Gräser · Farne ·
  Zwiebel- und Knollenpflanzen · Ein- und zweijährige · Zimmerpflanzen

Bestimmt wird die Kategorie in dieser Reihenfolge (spezifisch vor allgemein):
  1. Art-Ausnahme (SPECIES)     – Gattung + Art-Präfix (Grenzfälle)
  2. Gattung (GENUS)            – deckt gemischte Familien ab
  3. Familie (FAMILY)           – eindeutige Familien
  4. Fallback                   – Stauden (krautig-ausdauernd)

Aufruf:  python3 tools/categorize_seeds.py           (schreibt seeds/*.json)
         python3 tools/categorize_seeds.py --check    (nur Report, kein Schreiben)

Das Skript ist reproduzierbar und wird von tools/rebuild_seeds.sh nach der
Excel-Konvertierung aufgerufen, damit die Kategorien einen Neubau überleben.
"""
import json, pathlib, sys, collections

ROOT = pathlib.Path(__file__).parent.parent
SEEDS = ROOT / "seeds"

# Profile, deren Kategorien aus den Quelllisten stammen – unangetastet lassen.
KEEP = {"gemuesebau_gaertner", "gemuesebau_fachwerker",
        "obstbau_gaertner", "friedhofsgaertnerei_fachwerker"}

NADEL, LAUB, KLETT, STAUDE, GRAS, FARN, ZWIEBEL, EINJ, ZIMMER = (
    "Nadelgehölze", "Laubgehölze", "Kletterpflanzen", "Stauden", "Gräser",
    "Farne", "Zwiebel- und Knollenpflanzen", "Ein- und zweijährige", "Zimmerpflanzen")

# Reihenfolge für die Anzeige (analog KAT_ORDER in app.js/learn.js)
ORDER = [NADEL, LAUB, KLETT, STAUDE, GRAS, FARN, ZWIEBEL, EINJ, ZIMMER]

# ---- Familien mit eindeutiger Wuchsform (lateinischer Familienname) ----
FAMILY = {}
def _fam(cat, *names):
    for n in names: FAMILY[n] = cat
_fam(NADEL, "Pinaceae", "Cupressaceae", "Taxaceae", "Ginkgoaceae", "Araucariaceae",
     "Sciadopityaceae", "Sciadopityacaea", "Cephalotaxaceae", "Podocarpaceae", "Cycadaceae")
_fam(GRAS, "Poaceae", "Cyperaceae", "Juncaceae", "Typhaceae")
_fam(FARN, "Aspleniaceae", "Polypodiaceae", "Dryopteridaceae", "Osmundaceae",
     "Pteridaceae", "Woodsiaceae", "Blechnaceae", "Equisetaceae")
# überwiegend verholzend (Ausnahmen unten per Gattung/Art)
_fam(LAUB, "Betulaceae", "Fagaceae", "Nothofagaceae", "Salicaceae", "Juglandaceae",
     "Ulmaceae", "Platanaceae", "Cercidiphyllaceae", "Altingiaceae", "Hamamelidaceae",
     "Magnoliaceae", "Anacardiaceae", "Elaeagnaceae", "Lythraceae", "Punicaceae",
     "Tamaricaceae", "Thymelaeaceae", "Thymelaceae", "Calycanthaceae", "Buddlejaceae",
     "Paulowniaceae", "Simaroubaceae", "Aquifoliaceae", "Cornaceae", "Buxaceae",
     "Grossulariaceae", "Hamamelidaceae", "Lauraceae", "Pittosperaceae", "Garryaceae")

# ---- Gattungen (decken gemischte Familien ab; überschreiben FAMILY) ----
GENUS = {}
def _gen(cat, names):
    for n in names.split(): GENUS[n] = cat

_gen(KLETT, "Clematis Hedera Parthenocissus Ampelopsis Wisteria Humulus Vitis "
            "Campsis Akebia Celastrus Aristolochia Passiflora Actinidia Fallopia "
            "Lonicera Jasminum Lardizabala Schizophragma Pileostegia "
            "Calystegia Cobaea Lathyrus Muehlenbeckia Thunbergia")
# Laubgehölze aus gemischten Familien (Rosaceae, Caprifoliaceae, Oleaceae, Ericaceae, …)
_gen(LAUB, "Amelanchier Aronia Chaenomeles Cotoneaster Crataegus Cydonia Dasiphora "
           "Kerria Malus Mespilus Neillia Photinia Prunus Pyracantha Pyrus Rosa Rubus "
           "Sorbus Scandosorbus Spiraea Stephanandra Physocarpus "
           "Abelia Kolkwitzia Sambucus Symphoricarpos Viburnum Weigela Diervilla Leycesteria "
           "Forsythia Fraxinus Ligustrum Olea Osmanthus Syringa Chionanthus "
           "Arbutus Calluna Erica Gaultheria Pieris Rhododendron Vaccinium Empetrum Enkianthus Kalmia "
           "Deutzia Philadelphus Hydrangea "
           "Berberis Mahonia Nandina "
           "Buxus Callicarpa Caryopteris Perovskia Vitex "
           "Acer Aesculus Koelreuteria Cotinus Rhus Cornus Aucuba "
           "Buddleja Catalpa Ribes Citrus Choisya Poncirus Ptelea Skimmia "
           "Morus Ficus Broussonetia Maclura "
           "Cistus Halimium Helianthemum Daphne Lespedeza Cytisus Genista Laburnum Robinia "
           "Caragana Colutea Cladrastis Gleditsia Sophora Styphnolobium Wisteria "
           "Clethra Corylopsis Fothergilla Liquidambar Parrotia Disanthus "
           "Magnolia Liriodendron Michelia Calycanthus Chimonanthus Lindera Sassafras "
           "Elaeagnus Hippophae Shepherdia Lagerstroemia Punica Tamarix Myrtus "
           "Nerium Cercis Amorpha Indigofera Sorbaria Exochorda Holodiscus Rhodotypos "
           "Aralia Kalopanax Eleutherococcus Fatsia Hedera "
           "Euonymus Celastrus Paxistima "
           "Salix Populus Betula Alnus Carpinus Corylus Ostrya "
           "Quercus Fagus Castanea Nothofagus "
           "Juglans Carya Pterocarya Platycarya "
           "Ilex Nemopanthus "
           "Viburnum Sambucus "
           "Pittosporum Griselinia Sarcococca Pachysandra "
           "Yucca Cordyline "
           "Albizia Callistemon Camellia Celtis Eucalyptus Hebe Tilia")
# Berberidaceae/Buxaceae-Stauden trotz LAUB-Gattungen: per Gattung/Art unten korrigiert.

# Stauden aus gemischten Familien (Asteraceae, Ranunculaceae, Lamiaceae, Saxifragaceae, …)
_gen(STAUDE, "Acaena Alchemilla Aruncus Dryas Filipendula Fragaria Geum Potentilla "
             "Waldsteinia Sanguisorba Duchesnea "
             "Achillea Ajania Anaphalis Antennaria Artemisia Aster Bellis Carlina Centaurea "
             "Chrysanthemum Coreopsis Doronicum Echinacea Echinops Erigeron Eupatorium "
             "Gaillardia Helenium Helianthus Heliopsis Inula Leontopodium Leucanthemum Liatris "
             "Ligularia Rudbeckia Santolina Solidago Anthemis Buphthalmum Tanacetum Tussilago "
             "Aconitum Actaea Adonis Anemone Aquilegia Caltha Cimicifuga Delphinium Eranthis "
             "Helleborus Hepatica Pulsatilla Ranunculus Trollius Thalictrum Aconogonon "
             "Agastache Ajuga Calamintha Glechoma Hyssopus Lamium Mentha Monarda Nepeta "
             "Origanum Phlomis Physostegia Prunella Salvia Scutellaria Stachys Teucrium Thymus "
             "Lavandula Melissa Marrubium Leonurus Dracocephalum Sideritis Betonica "
             "Astilbe Astilboides Bergenia Heuchera Rodgersia Saxifraga Tiarella Darmera Mukdenia Heucherella "
             "Geranium Erodium Pelargonium "
             "Primula Lysimachia Cyclamen Dodecatheon Androsace Soldanella Cortusa "
             "Campanula Adenophora Platycodon Codonopsis Jasione Phyteuma Edraianthus "
             "Sedum Sempervivum Hylotelephium Rhodiola Jovibarba Rosularia Petrosedum "
             "Dianthus Silene Lychnis Saponaria Gypsophila Cerastium Arenaria Minuartia Stellaria Petrorhagia "
             "Aubrieta Arabis Iberis Alyssum Aurinia Draba Hesperis Lunaria Cardamine Erysimum "
             "Hosta Ophiopogon Anthericum Convallaria Polygonatum Liriope Reineckea Maianthemum "
             "Pulmonaria Brunnera Myosotis Symphytum Anchusa Omphalodes Mertensia Cynoglossum Echium "
             "Bergenia Acanthus Aconitum Aster Astrantia Baptisia Bistorta Persicaria Rheum Rumex Rodgersia "
             "Epimedium Podophyllum Vancouveria Diphylleia Jeffersonia "
             "Pachysandra Sarcococca "
             "Euphorbia Chelone Chamaenerion Oenothera Gaura Circaea "
             "Hemerocallis Kniphofia Asphodeline Asphodelus Eremurus Anthericum "
             "Agapanthus Tricyrtis Uvularia Paradisea "
             "Aster Boltonia Kalimeris Callistephus "
             "Verbascum Digitalis Penstemon Veronica Veronicastrum Linaria Chelone Nemesia "
             "Phlox Polemonium "
             "Paeonia Papaver Meconopsis Sanguinaria Corydalis Dicentra Lamprocapnos Macleaya Chelidonium "
             "Hypericum Viola Sisyrinchium Libertia "
             "Alstroemeria Amsonia Vinca Asclepias Gentiana Armeria Limonium Ceratostigma Plumbago "
             "Aconitum Trollius Ligularia Rodgersia Darmera Filipendula Astilboides Cimicifuga "
             "Bergenia Brunnera Pulmonaria Symphytum Omphalodes "
             "Sedum Sempervivum Delosperma "
             "Ajuga Vinca Lamium Waldsteinia Pachysandra "
             "Iris Sisyrinchium Belamcanda Crocosmia Schizostylis Hesperantha "
             "Aquilegia Anemone Pulsatilla Helleborus Trollius "
             "Hemerocallis Hosta Astilbe Heuchera Tiarella Bergenia "
             "Anemone Aster Chrysanthemum Sedum Solidago "
             "Bletilla Cypripedium Dactylorhiza Epipactis "
             "Nymphaea Nuphar Nelumbo "
             "Caltha Ranunculus Menyanthes Butomus Alisma Sagittaria Pontederia Hippuris "
             "Acorus Lysichiton Orontium Calla Zantedeschia Arum Arisaema Pinellia Dracunculus "
             "Houttuynia Saururus Ligularia Astilboides Darmera Rodgersia Rheum Gunnera "
             "Hylomecon Stylophorum Glaucidium "
             "Bergenia Rodgersia Astilboides Darmera Mukdenia "
             "Aster Symphyotrichum Vernonia Boltonia "
             "Nepeta Perovskia Agastache Calamintha "
             "Sanguisorba Filipendula Aruncus "
             "Trifolium Lotus Coronilla Anthyllis Galega Baptisia Thermopsis Lupinus Vicia "
             "Adonis Aconitum "
             "Bergenia Heuchera "
             "Sedum Sempervivum Jovibarba "
             "Stachys Lamium Betonica "
             "Salvia Nepeta Perovskia "
             "Achillea Anthemis Tanacetum "
             "Geranium Erodium "
             "Campanula Adenophora "
             "Dianthus Silene "
             "Primula Lysimachia "
             "Aster Solidago "
             "Iris Hemerocallis "
             "Bergenia Heuchera Tiarella")
# Zwiebel- und Knollenpflanzen
_gen(ZWIEBEL, "Tulipa Narcissus Crocus Hyacinthus Muscari Galanthus Leucojum Fritillaria Lilium "
              "Allium Camassia Ornithogalum Scilla Chionodoxa Puschkinia Ipheion Erythronium "
              "Colchicum Anemone Eranthis Cyclamen Dahlia Gladiolus Canna Begonia Ranunculus "
              "Hippeastrum Nerine Amaryllis Crinum Zephyranthes Sternbergia Iris "
              "Dracunculus Arum Arisaema Zantedeschia Sauromatum Tigridia Freesia Ixia Crocosmia "
              "Oxalis Cyclamen Corydalis Eremurus Liatris Incarvillea Anemone")
# Ein- und zweijährige (Sommerblumen / Beetpflanzen)
_gen(EINJ, "Tagetes Zinnia Ageratum Callistephus Cosmos Sanvitalia Calendula Helichrysum "
           "Gazania Brachyscome Osteospermum Argyranthemum Pericallis Bidens Cotula Leucophyta "
           "Pallenis Ambrosia Xerochrysum Rhodanthe "
           "Petunia Calibrachoa Nicotiana Salpiglossis Nierembergia Solanum Browallia Schizanthus "
           "Impatiens Begonia Viola Antirrhinum Nemesia Diascia Bacopa Sutera Torenia Mimulus Linaria "
           "Lobelia Lobularia Iberis Matthiola Erysimum Cheiranthus Cleome Cosmos Reseda "
           "Tropaeolum Nasturtium Helianthus Cuphea Fuchsia Verbena Lantana Heliotropium "
           "Pelargonium Plectranthus Coleus Solenostemon Gomphrena Celosia Amaranthus "
           "Portulaca Dorotheanthus Mesembryanthemum Dianthus Godetia Clarkia Nigella "
           "Consolida Centaurea Papaver Eschscholzia Phacelia Nemophila Convolvulus Ipomoea "
           "Ricinus Kochia Bassia Zea Ocimum Petroselinum Anethum "
           "Salvia Verbena Angelonia Scaevola Sutera Bracteantha Ammi Orlaya Bupleurum "
           "Dahlia Canna Ipomoea "
           "Alternanthera Capsella Capsicum Eustoma Galinsoga Thlaspi Petunie")
# Zimmerpflanzen (nicht winterhart, v. a. Zierpflanzenbau) – NUR Gattungen ohne
# häufige Freiland-Arten; gemischte Gattungen (Euphorbia, Primula, Cyclamen,
# Begonia, Impatiens, Fuchsia, Yucca, Aralia, Nerium …) laufen über ihren
# Freiland-Default und werden per SPECIES für die Zimmer-Art übersteuert.
_gen(ZIMMER, "Ficus Dracaena Beaucarnea Chlorophytum Clivia Aspidistra Sansevieria "
             "Philodendron Monstera Epipremnum Scindapsus Dieffenbachia Aglaonema Spathiphyllum "
             "Anthurium Syngonium Calathea Maranta Ctenanthe Stromanthe "
             "Codiaeum Peperomia Fittonia Hypoestes "
             "Saintpaulia Streptocarpus Sinningia Gloxinia Columnea Nematanthus Aeschynanthus "
             "Echeveria Haworthia Gasteria Aeonium Ceropegia Aichryson "
             "Schlumbergera Rhipsalis Epiphyllum Zygocactus Mammillaria Echinocactus Rhipsalidopsis "
             "Cineraria Exacum "
             "Nephrolepis Platycerium Davallia Pteris "
             "Chamaedorea Howea Kentia Areca Dypsis Phoenix Livistona Washingtonia "
             "Cycas Zamia Nolina "
             "Bromelia Guzmania Vriesea Aechmea Tillandsia Neoregelia Billbergia "
             "Phalaenopsis Cattleya Dendrobium Cymbidium Oncidium Paphiopedilum Vanda "
             "Bougainvillea Mandevilla Dipladenia Stephanotis Hoya "
             "Datura Brugmansia Abutilon "
             "Strelitzia Musa Heliconia Alpinia "
             "Tradescantia Zebrina Setcreasea Callisia "
             "Schefflera Fatsia Radermachera Polyscias "
             "Gardenia Ixora Pentas Serissa "
             "Cissus Medinilla Pilea Zamioculcas Aphelandra")
GENUS["×Fatshedera"] = ZIMMER

# --- Schluss-Overrides (gewinnen gegen die Listen oben) ---
# Sukkulenten/Kübel ohne Freiland-Arten -> Zimmer; winterharte Palmen -> Laubgehölz;
# eindeutige Beet-/Freiland-Zuordnungen für sonst mehrdeutige Gattungen.
for _g in "Kalanchoe Crassula Aloe Agave Cordyline Calceolaria Sansevieria Opuntia".split():
    GENUS[_g] = ZIMMER
for _g in "Trachycarpus Chamaerops Hibiscus Citrus".split():
    GENUS[_g] = LAUB
for _g in "Gerbera Begonia Fuchsia Impatiens".split():
    GENUS[_g] = EINJ
# Gemischte Gattungen (Stauden- + einjährige Arten): Default Staude, die
# einjährigen Arten stehen einzeln in SPECIES. Sonst würde z. B. Steppen-Salbei
# oder Stauden-Mohn fälschlich als »einjährig« gelten.
for _g in "Dianthus Helianthus Iberis Papaver Salvia Centaurea Viola Hypericum Chrysanthemum Coreopsis Gaillardia".split():
    GENUS[_g] = STAUDE
# krautige Gattungen aus überwiegend verholzenden Familien (Lythraceae, …)
for _g in "Lythrum Cuphea".split():
    GENUS[_g] = STAUDE

# ---- Art-Ausnahmen: (Gattung, Art-Präfix) -> Kategorie ----
SPECIES = {
    ("Hydrangea", "anomala"): KLETT, ("Hydrangea", "petiolaris"): KLETT,
    ("Euonymus", "fortunei"): KLETT,
    ("Lonicera", "periclymenum"): KLETT, ("Lonicera", "caprifolium"): KLETT,
    ("Lonicera", "henryi"): KLETT, ("Lonicera", "japonica"): KLETT, ("Lonicera", "x heckrottii"): KLETT,
    ("Lonicera", "heckrottii"): KLETT, ("Lonicera", "tellmanniana"): KLETT, ("Lonicera", "brownii"): KLETT,
    ("Jasminum", "nudiflorum"): LAUB, ("Jasminum", "officinale"): KLETT,
    ("Paeonia", "suffruticosa"): LAUB, ("Paeonia", "x suffruticosa"): LAUB, ("Paeonia", "delavayi"): LAUB, ("Paeonia", "rockii"): LAUB,
    ("Vinca", "minor"): STAUDE, ("Vinca", "major"): STAUDE,
    ("Solanum", "jasminoides"): KLETT, ("Solanum", "crispum"): KLETT,
    ("Fallopia", "baldschuanica"): KLETT, ("Fallopia", "aubertii"): KLETT,
    ("Vitis", "vinifera"): KLETT,
    ("Cornus", "canadensis"): STAUDE, ("Cornus", "suecica"): STAUDE,
    ("Cyclamen", "persicum"): ZIMMER,
    ("Begonia", "elatior"): ZIMMER, ("Begonia", "x hiemalis"): ZIMMER, ("Begonia", "hiemalis"): ZIMMER, ("Begonia", "rex"): ZIMMER,
    ("Begonia", "x tuberhybrida"): ZWIEBEL, ("Begonia", "tuberhybrida"): ZWIEBEL,
    ("Hibiscus", "rosa-sinensis"): ZIMMER,
    ("Primula", "obconica"): ZIMMER, ("Primula", "malacoides"): ZIMMER,
    ("Fuchsia", "magellanica"): LAUB,
    ("Euphorbia", "pulcherrima"): ZIMMER, ("Euphorbia", "milii"): ZIMMER, ("Euphorbia", "tirucalli"): ZIMMER,
    ("Senecio", "rowleyanus"): ZIMMER, ("Senecio", "cruentus"): EINJ,
    ("Ipomoea", "batatas"): EINJ, ("Ipomoea", "tricolor"): EINJ, ("Ipomoea", "purpurea"): EINJ,
    ("Asparagus", "densiflorus"): ZIMMER, ("Asparagus", "setaceus"): ZIMMER,
    ("Iris", "reticulata"): ZWIEBEL, ("Iris", "danfordiae"): ZWIEBEL, ("Iris", "hollandica"): ZWIEBEL, ("Iris", "xiphium"): ZWIEBEL,
    ("Anemone", "blanda"): ZWIEBEL, ("Anemone", "nemorosa"): STAUDE, ("Anemone", "coronaria"): ZWIEBEL,
    ("Anemone", "hupehensis"): STAUDE, ("Anemone", "japonica"): STAUDE, ("Anemone", "sylvestris"): STAUDE, ("Anemone", "hybrida"): STAUDE,
    ("Ranunculus", "asiaticus"): ZWIEBEL,
    ("Oxalis", "triangularis"): ZIMMER,
    ("Ficus", "carica"): LAUB,
    ("Salvia", "splendens"): EINJ, ("Salvia", "farinacea"): EINJ, ("Salvia", "coccinea"): EINJ,
    ("Helianthus", "annuus"): EINJ,
    ("Dianthus", "chinensis"): EINJ, ("Dianthus", "barbatus"): EINJ, ("Dianthus", "caryophyllus"): EINJ,
    ("Centaurea", "cyanus"): EINJ,
    ("Papaver", "somniferum"): EINJ, ("Papaver", "rhoeas"): EINJ, ("Papaver", "nudicaule"): EINJ,
    ("Verbena", "bonariensis"): STAUDE,
    ("Pelargonium", "zonale"): EINJ, ("Pelargonium", "peltatum"): EINJ, ("Pelargonium", "grandiflorum"): EINJ,
    ("Euphorbia", "characias"): STAUDE, ("Euphorbia", "polychroma"): STAUDE, ("Euphorbia", "amygdaloides"): STAUDE,
    ("Euphorbia", "myrsinites"): STAUDE, ("Euphorbia", "griffithii"): STAUDE, ("Euphorbia", "cyparissias"): STAUDE,
    ("Solanum", "lycopersicum"): EINJ, ("Solanum", "melongena"): EINJ,
    ("Canna", "indica"): ZWIEBEL,
    ("Nicotiana", "sylvestris"): EINJ,
    ("Aster", "alpinus"): STAUDE,
    ("Viola", "wittrockiana"): EINJ, ("Viola", "x wittrockiana"): EINJ, ("Viola", "tricolor"): EINJ, ("Viola", "cornuta"): STAUDE, ("Viola", "odorata"): STAUDE,
    ("Iberis", "umbellata"): EINJ,
    ("Coreopsis", "tinctoria"): EINJ,
    ("Gaillardia", "pulchella"): EINJ,
    ("Chrysanthemum", "carinatum"): EINJ, ("Chrysanthemum", "coronarium"): EINJ,
    ("Hypericum", "perforatum"): STAUDE, ("Hypericum", "patulum"): LAUB, ("Hypericum", "x moserianum"): LAUB, ("Hypericum", "prolificum"): LAUB,
    ("Lobelia", "cardinalis"): STAUDE, ("Lobelia", "fulgens"): STAUDE,
    ("Potentilla", "fruticosa"): LAUB,
}

# Nicht-Gefäßpflanzen (Moose, Flechten/Pilze) – bewusst OHNE Wuchsform-Kategorie
EXCLUDE = {"Cetraria", "Sphagnum", "Cladonia", "Marchantia"}

def categorize(g, art, fam):
    g = (g or "").strip()
    art = (art or "").strip().lower()
    fam = (fam or "").split("/")[0].strip()
    if g in EXCLUDE:
        return None
    # 1) Art-Ausnahme (Präfix-Vergleich, damit Sorten/Unterarten mitgreifen)
    for (gg, pref), cat in SPECIES.items():
        if gg == g and art.startswith(pref.lower()):
            return cat
    # 2) Gattung
    if g in GENUS:
        return GENUS[g]
    # 3) Familie
    if fam in FAMILY:
        return FAMILY[fam]
    # 4) Fallback: krautig-ausdauernd
    return STAUDE

def main():
    check = "--check" in sys.argv
    total = collections.Counter()
    unresolved = collections.defaultdict(list)   # Gattungen, die nur über den Fallback laufen
    resolved_via = collections.Counter()
    for f in sorted(SEEDS.glob("*.json")):
        pid = f.stem
        if pid in KEEP:
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        for r in data:
            g, art, fam = r[0], r[1], r[2]
            cat = categorize(g, art, fam)
            # Kam die Kategorie nur aus dem Fallback (weder Art noch Gattung noch Familie)?
            famL = (fam or "").split("/")[0].strip()
            if cat is not None and g not in GENUS and g not in EXCLUDE and famL not in FAMILY and not any(gg==g and (art or "").lower().startswith(p.lower()) for (gg,p) in SPECIES):
                unresolved[g].append(pid)
            r[4] = cat if cat is not None else ""
            total[cat if cat is not None else "(ohne)"] += 1
        if not check:
            f.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("Kategorie-Verteilung (10 Profile):")
    for c in ORDER:
        if total[c]: print(f"  {total[c]:4d}  {c}")
    other = sum(v for k,v in total.items() if k not in ORDER)
    if other: print(f"  {other:4d}  (sonstige)")
    if unresolved:
        print(f"\nNur über Fallback »Stauden« (bitte botanisch prüfen) – {len(unresolved)} Gattungen:")
        for g in sorted(unresolved): print("   ", g)
    else:
        print("\nAlle Gattungen über Art/Gattung/Familie eindeutig zugeordnet.")

if __name__ == "__main__":
    main()
