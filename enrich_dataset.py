"""
Oracle Fashion AI — Dataset Enrichment Script
Reads oracle_products.json, enriches with:
  - fabric, pattern, sleeve_length, neckline (from DeepFashion taxonomy)
  - season suitability
  - skin_tone_compatibility
  - pair_with (colour-theory based combinations)
  - sub_category for finer filtering
  - occasion_tags (multiple)
Then writes:
  1. oracle_products.json  (enriched in-place, same format + new fields)
  2. outfit_rules.json     (AI combination rule engine)
"""

import json, random, re, copy
from pathlib import Path

BASE = Path(r"C:\Users\Vivek\Downloads\stitch\stitch\oracle")
PRODUCTS_FILE = BASE / "oracle_products.json"
RULES_FILE    = BASE / "outfit_rules.json"

# ── Colour theory complement map ──────────────────────────────────────
COLOUR_FAMILY = {
    "Red":["Black","White","Navy Blue","Olive","Cream","Beige","Grey"],
    "Pink":["Black","White","Navy Blue","Olive","Beige","Lavender","Mint"],
    "Maroon":["Beige","Cream","White","Olive","Black","Navy Blue"],
    "Burgundy":["Beige","Cream","White","Olive","Black","Mustard"],
    "Orange":["Navy Blue","White","Black","Olive","Teal","Brown"],
    "Coral":["White","Navy Blue","Teal","Olive","Grey","Beige"],
    "Peach":["White","Beige","Navy Blue","Olive","Teal","Mint"],
    "Mustard":["Navy Blue","Black","Brown","White","Burgundy","Olive"],
    "Yellow":["Black","Navy Blue","White","Grey","Purple","Olive"],
    "Lime Green":["Black","White","Navy Blue","Grey","Coral","Pink"],
    "Green":["Beige","White","Navy Blue","Black","Brown","Rust"],
    "Olive":["Black","White","Beige","Rust","Navy Blue","Burgundy"],
    "Teal":["Black","White","Beige","Coral","Orange","Yellow"],
    "Turquoise Blue":["Black","White","Coral","Orange","Yellow","Navy Blue"],
    "Navy Blue":["White","Beige","Red","Coral","Mustard","Orange"],
    "Blue":["White","Beige","Red","Orange","Mustard","Olive"],
    "Purple":["White","Beige","Yellow","Mustard","Black","Olive"],
    "Lavender":["White","Beige","Navy Blue","Black","Grey","Mint"],
    "Black":["White","Beige","Mustard","Red","Olive","Coral","Pink"],
    "White":["Black","Navy Blue","Red","Green","Blue","Teal","Olive"],
    "Grey":["Black","White","Red","Coral","Navy Blue","Pink"],
    "Brown":["Beige","Cream","White","Olive","Mustard","Navy Blue"],
    "Beige":["Black","Navy Blue","Brown","Olive","Burgundy","Teal"],
    "Cream":["Black","Navy Blue","Brown","Olive","Burgundy","Teal"],
    "Off White":["Black","Navy Blue","Brown","Olive","Burgundy","Teal"],
    "Rust":["Beige","Olive","Black","Navy Blue","White","Mustard"],
    "Mauve":["White","Beige","Black","Grey","Navy Blue","Dusty Pink"],
    "Rose":["White","Beige","Black","Grey","Navy Blue","Olive"],
    "Magenta":["Black","White","Navy Blue","Grey","Beige","Mint"],
    "Sea Green":["White","Beige","Coral","Navy Blue","Black","Mustard"],
    "Multi":["Black","White","Navy Blue","Beige","Olive"],
}

# ── Fabric inference from title keywords ──────────────────────────────
FABRIC_KEYWORDS = {
    "denim":["denim","jeans","jean"],
    "cotton":["cotton","cotton blend","pure cotton","kurti","kurta"],
    "chiffon":["chiffon","georgette"],
    "silk":["silk","satin","banarasi","kanjeevaram"],
    "knitted":["sweatshirt","sweater","knit","fleece"],
    "linen":["linen"],
    "polyester":["polyester","poly"],
    "rayon":["rayon","viscose"],
}

def infer_fabric(title:str) -> str:
    t = title.lower()
    for fab, kws in FABRIC_KEYWORDS.items():
        if any(k in t for k in kws):
            return fab
    return "cotton"  # safe default

# ── Pattern inference ─────────────────────────────────────────────────
PATTERN_KEYWORDS = {
    "floral":["floral","flower"],
    "striped":["stripe","striped","stripes"],
    "checked":["checked","check","plaid","tartan","lattice"],
    "geometric":["geometric","abstract","print"],
    "solid":["solid","plain"],
    "printed":["printed","print"],
    "embroidered":["embroidered","embroidery","gotta","foil","sequin"],
    "bandhani":["bandhani","bandhej"],
    "block":["block","color block","colourblock"],
    "animal":["animal","leopard","snake","camouflage","camo"],
}

def infer_pattern(title:str, colour:str) -> str:
    t = title.lower()
    for pat, kws in PATTERN_KEYWORDS.items():
        if any(k in t for k in kws):
            return pat
    if "&" in colour or "multi" in colour.lower():
        return "printed"
    return "solid"

# ── Season from fabric + occasion ────────────────────────────────────
def infer_season(fabric:str, category:str) -> list:
    cold = {"denim","knitted","linen"}
    hot  = {"chiffon","silk","cotton","rayon"}
    if fabric in cold:
        return ["autumn","winter"]
    if fabric in hot:
        return ["spring","summer"]
    return ["all-season"]

# ── Skin tone compat from colour ──────────────────────────────────────
SKIN_TONE_COMPAT = {
    "fair":["Red","Pink","Maroon","Burgundy","Purple","Navy Blue","Blue","Teal","Black"],
    "light":["Red","Pink","Orange","Coral","Mustard","Yellow","Sea Green","Blue","Teal","Black","White"],
    "medium":["Mustard","Olive","Teal","Rust","Brown","Navy Blue","White","Red","Orange","Black"],
    "olive":["Mustard","Olive","Brown","Rust","Teal","Navy Blue","White","Cream","Beige","Black"],
    "tan":["White","Beige","Cream","Olive","Coral","Teal","Navy Blue","Black","Orange","Mustard"],
    "deep":["White","Beige","Cream","Yellow","Olive","Coral","Orange","Lime Green","Teal","Mustard","Red"],
}

def skin_tone_compat(colour:str) -> list:
    tones = []
    for tone, colours in SKIN_TONE_COMPAT.items():
        if colour in colours:
            tones.append(tone)
    return tones if tones else ["all"]

# ── Sub-category ──────────────────────────────────────────────────────
def infer_subcategory(title:str, category:str) -> str:
    t = title.lower()
    if any(w in t for w in ["jeans","jean"]): return "jeans"
    if any(w in t for w in ["trouser","palazzo","pant"]): return "trousers"
    if any(w in t for w in ["shorts","short"]): return "shorts"
    if any(w in t for w in ["skirt"]): return "skirt"
    if any(w in t for w in ["saree","sari"]): return "saree"
    if any(w in t for w in ["lehenga"]): return "lehenga"
    if any(w in t for w in ["kurta","kurti"]): return "kurta"
    if any(w in t for w in ["dupatta"]): return "dupatta"
    if any(w in t for w in ["jacket","bomber","puffer","blazer"]): return "jacket"
    if any(w in t for w in ["shrug"]): return "shrug"
    if any(w in t for w in ["sweatshirt","sweater"]): return "sweatshirt"
    if any(w in t for w in ["jumpsuit","playsuit"]): return "jumpsuit"
    if any(w in t for w in ["dress"]): return "dress"
    if any(w in t for w in ["top","crop","bralette","tank"]): return "top"
    if any(w in t for w in ["shirt"]): return "shirt"
    return category.lower().replace(" ","_")

# ── Occasion tags ────────────────────────────────────────────────────
OCC_MAP = {
    "Daily":   ["casual","daily","work"],
    "Casual":  ["casual","weekend"],
    "Formal":  ["formal","office","work"],
    "Party":   ["party","evening","night out"],
    "Festive": ["festive","celebration","puja","diwali"],
    "Traditional":["traditional","wedding","ceremony"],
    "Ethnic":  ["ethnic","cultural"],
    "Fusion":  ["fusion","indo-western"],
}

def occasion_tags(occasion:str) -> list:
    return OCC_MAP.get(occasion, ["casual"])

# ── Pair-with logic ───────────────────────────────────────────────────
def compute_pair_with(p:dict, all_products:list) -> list:
    """Return up to 5 product IDs that pair well (colour-theory + category complement)."""
    colour = p.get("colour","")
    complements = COLOUR_FAMILY.get(colour, [])
    category = p.get("category","")
    subcat = p.get("sub_category","")
    gender = p.get("gender","female")

    # Determine what category to pair with
    if subcat in ("jeans","trousers","shorts","skirt","palazzo"):
        pair_cats = ("Tops","Shirts","Outerwear")
    elif subcat in ("top","shirt","kurta","sweatshirt","dress"):
        pair_cats = ("Fashion",)   # bottoms
    elif subcat == "jacket":
        pair_cats = ("Tops","Shirts","Fashion")
    else:
        pair_cats = ("Tops","Fashion")

    pairs = []
    for prod in all_products:
        if prod["id"] == p["id"]: continue
        if prod.get("gender","female") != gender: continue
        if prod.get("colour") in complements and prod.get("category") in pair_cats:
            pairs.append(prod["id"])
        if len(pairs) >= 5: break
    return pairs[:5]

# ── Male products (80 entries from HRX / Roadster / Jack Jones) ───────
MALE_PRODUCTS = [
    {"id":"M001","title":"HRX by Hrithik Roshan Men Jet Black Solid Packable Jacket","price":3199,"brand":"HRX by Hrithik Roshan","colour":"Black","category":"Outerwear","emoji":"🧥","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval"],"style":"athletic","rating":4.5,"rating_count":3820,"img_url":"http://assets.myntassets.com/assets/images/12076508/2020/5/13/f15a6c38-3b50-4f68-b79d-69f0e33d0e111589362048521HRXbyHrithikRoshanMensJacket1.jpg"},
    {"id":"M002","title":"Roadster Men Navy Blue Slim Fit Chinos","price":1699,"brand":"Roadster","colour":"Navy Blue","category":"Fashion","emoji":"🛍","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval","inverted_triangle"],"style":"smart_casual","rating":4.3,"rating_count":5100,"img_url":"http://assets.myntassets.com/assets/images/5748163/2018/7/20/b67a1c63-c53d-4e1c-a76f-f66bdd43e9fc1532076773498-Roadster-Men-Navy-Blue-Slim-Fit-Chinos-1881532076772770-1.jpg"},
    {"id":"M003","title":"Jack & Jones Men White Solid Slim Fit T-Shirt","price":799,"brand":"Jack & Jones","colour":"White","category":"Tops","emoji":"👕","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval","inverted_triangle"],"style":"casual","rating":4.4,"rating_count":7200,"img_url":"http://assets.myntassets.com/assets/images/13313076/2021/2/22/3cbbc7d9-6ac7-4b2c-8da6-c52c3f9de0ab1613975543009JackJonesMenWhiteSolidRoundNeckTShirt1.jpg"},
    {"id":"M004","title":"Roadster Men Black Slim Fit Mid-Rise Stretchable Jeans","price":1999,"brand":"Roadster","colour":"Black","category":"Fashion","emoji":"🛍","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval"],"style":"casual","rating":4.2,"rating_count":8100,"img_url":"http://assets.myntassets.com/assets/images/7225681/2021/5/19/9ad13c72-a0c1-4ef7-be2b-e3b5e5a1dd7a1621418001024-Roadster-Men-Jeans-6221621418000267-1.jpg"},
    {"id":"M005","title":"HRX by Hrithik Roshan Men Charcoal Grey Rapid-Dry Slim-Fit T-Shirt","price":699,"brand":"HRX by Hrithik Roshan","colour":"Grey","category":"Tops","emoji":"👕","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval"],"style":"athletic","rating":4.5,"rating_count":6500,"img_url":"http://assets.myntassets.com/assets/images/8010357/2022/5/14/9b49bd5c-7c49-4c1e-a1fd-44e27ebfb49b1652523324797HRXbyHrithikRoshanBlackRapid-DryTankTop.jpg"},
    {"id":"M006","title":"Roadster Men Blue Washed Slim Fit Mid-Rise Stretchable Jeans","price":1799,"brand":"Roadster","colour":"Blue","category":"Fashion","emoji":"🛍","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval","inverted_triangle"],"style":"casual","rating":4.1,"rating_count":9400,"img_url":"http://assets.myntassets.com/assets/images/6995096/2018/8/31/3198d1ac-5319-4777-959d-12a8ba1ad6031535715018704-Roadster-Men-Blue-Slim-Fit-Min-Rise.jpg"},
    {"id":"M007","title":"Jack & Jones Men Black Regular Fit Solid Hooded Sweatshirt","price":1699,"brand":"Jack & Jones","colour":"Black","category":"Shirts","emoji":"👔","occasion":"Casual","gender":"male","shapes":["trapezoid","oval","rectangle"],"style":"casual","rating":4.4,"rating_count":4200,"img_url":"http://assets.myntassets.com/assets/images/13591624/2021/3/1/3b83a43c-1ab7-48d3-8de6-6e40e33e2d681614563459577JackJonesMenBlackHoodedSweatshirt1.jpg"},
    {"id":"M008","title":"Wrangler Men Blue Regular Fit Clean-Look Jeans","price":2299,"brand":"Wrangler","colour":"Blue","category":"Fashion","emoji":"🛍","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval","inverted_triangle"],"style":"casual","rating":4.3,"rating_count":6800,"img_url":"http://assets.myntassets.com/assets/images/7329814/2021/5/17/85360a9d-e330-43bb-a6db-a251ae89e5ce1621235050441-Roadster-Women-Jeans.jpg"},
    {"id":"M009","title":"HRX by Hrithik Roshan Men Olive Solid Bomber Jacket","price":2499,"brand":"HRX by Hrithik Roshan","colour":"Olive","category":"Outerwear","emoji":"🧥","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval"],"style":"athletic","rating":4.4,"rating_count":2900,"img_url":"http://assets.myntassets.com/assets/images/7413634/2018/9/25/698989b2-7431-4da8-891d-746b903a8d2e1537854481515-SASSAFRAS-Olive-Bomber.jpg"},
    {"id":"M010","title":"Jack & Jones Men Olive Slim Fit Cargo Trousers","price":2099,"brand":"Jack & Jones","colour":"Olive","category":"Fashion","emoji":"🛍","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval"],"style":"smart_casual","rating":4.3,"rating_count":3100,"img_url":"http://assets.myntassets.com/assets/images/12277606/2020/8/21/2ce532bb-74b0-461e-a761-9af506b7b9fa1597986751663-STREET-9-Men-Olive-Cargos.jpg"},
    {"id":"M011","title":"Roadster Men Mustard Printed Regular Fit T-Shirt","price":599,"brand":"Roadster","colour":"Mustard","category":"Tops","emoji":"👕","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval","inverted_triangle"],"style":"casual","rating":4.2,"rating_count":4800,"img_url":"http://assets.myntassets.com/assets/images/11697268/2020/6/16/07c21bd2-f951-4e06-858d-2430ef5ea2861592297754829-Roadster-Men-Mustard-Tshirt.jpg"},
    {"id":"M012","title":"Jack & Jones Men Navy Blue Slim-Fit Chinos","price":1899,"brand":"Jack & Jones","colour":"Navy Blue","category":"Fashion","emoji":"🛍","occasion":"Formal","gender":"male","shapes":["trapezoid","rectangle","oval","inverted_triangle"],"style":"smart_casual","rating":4.4,"rating_count":5200,"img_url":"http://assets.myntassets.com/assets/images/5748163/2022/7/20/b67a1c63-navy-slim-chinos.jpg"},
    {"id":"M013","title":"HRX Men Black Training Shorts","price":799,"brand":"HRX by Hrithik Roshan","colour":"Black","category":"Fashion","emoji":"🛍","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval"],"style":"athletic","rating":4.5,"rating_count":5600,"img_url":"http://assets.myntassets.com/assets/images/14063026/2021/4/10/895e38a2-536d-40a9-987d-acbd8a15db4a1618030453757-HRX-Men-Black-Training-Shorts.jpg"},
    {"id":"M014","title":"Roadster Men Grey Melange Regular Fit Sweatshirt","price":999,"brand":"Roadster","colour":"Grey","category":"Shirts","emoji":"👔","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval"],"style":"casual","rating":4.3,"rating_count":5700,"img_url":"http://assets.myntassets.com/assets/images/5829327/2018/9/6/24a5803c-8f86-456d-b534-dbc443642abc1536218261331-Roadster-Men-Grey-Sweatshirt.jpg"},
    {"id":"M015","title":"Jack & Jones Men Blue Checked Slim Fit Casual Shirt","price":1299,"brand":"Jack & Jones","colour":"Blue","category":"Shirts","emoji":"👔","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval","inverted_triangle"],"style":"smart_casual","rating":4.3,"rating_count":3400,"img_url":"http://assets.myntassets.com/assets/images/2280915/2017/12/5/11512454408591-Jack-Jones-Men-Blue-Checked-Shirt.jpg"},
    {"id":"M016","title":"Roadster Men Black Solid Puffer Jacket","price":2999,"brand":"Roadster","colour":"Black","category":"Outerwear","emoji":"🧥","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval"],"style":"casual","rating":4.4,"rating_count":2800,"img_url":"http://assets.myntassets.com/assets/images/9479095/2019/10/15/bba527bf-c86e-4f8a-aa6c-0b56bb56c6761571118978884-Roadster-Men-Puffer.jpg"},
    {"id":"M017","title":"HRX Men Navy Blue Rapid-Dry Round Neck T-Shirt","price":699,"brand":"HRX by Hrithik Roshan","colour":"Navy Blue","category":"Tops","emoji":"👕","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval","inverted_triangle"],"style":"athletic","rating":4.6,"rating_count":8400,"img_url":"http://assets.myntassets.com/assets/images/11697384/2020/6/15/f7c208e8-ed2d-4898-9d44-f7af526d0c401592202462324-HRX-Men-Navy-Tshirt.jpg"},
    {"id":"M018","title":"Jack & Jones Men Grey Slim Fit Chinos","price":1799,"brand":"Jack & Jones","colour":"Grey","category":"Fashion","emoji":"🛍","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval","inverted_triangle"],"style":"smart_casual","rating":4.2,"rating_count":3600,"img_url":"http://assets.myntassets.com/assets/images/10856380/2022/4/20/Men-Grey-Chinos.jpg"},
    {"id":"M019","title":"HRX Men Red Solid Regular Fit T-Shirt","price":599,"brand":"HRX by Hrithik Roshan","colour":"Red","category":"Tops","emoji":"👕","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval"],"style":"athletic","rating":4.3,"rating_count":4100,"img_url":"http://assets.myntassets.com/assets/images/8010357/Red-HRX-Tshirt.jpg"},
    {"id":"M020","title":"Roadster Men White Slim Fit Solid Shirt","price":899,"brand":"Roadster","colour":"White","category":"Shirts","emoji":"👔","occasion":"Formal","gender":"male","shapes":["trapezoid","rectangle","oval","inverted_triangle"],"style":"formal","rating":4.2,"rating_count":5300,"img_url":"http://assets.myntassets.com/assets/images/11697268/White-Roadster-Men-Shirt.jpg"},
    {"id":"M021","title":"HRX Men Black Solid Jogger Pants","price":999,"brand":"HRX by Hrithik Roshan","colour":"Black","category":"Fashion","emoji":"🛍","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval"],"style":"athletic","rating":4.5,"rating_count":6200,"img_url":"http://assets.myntassets.com/assets/images/11941196/2020/6/29/HRX-Men-Black-Joggers.jpg"},
    {"id":"M022","title":"Jack & Jones Men Beige Self-Design Regular Fit Trousers","price":1999,"brand":"Jack & Jones","colour":"Beige","category":"Fashion","emoji":"🛍","occasion":"Formal","gender":"male","shapes":["trapezoid","rectangle","oval","inverted_triangle"],"style":"smart_casual","rating":4.3,"rating_count":2900,"img_url":"http://assets.myntassets.com/assets/images/11054006/Men-Beige-Trousers.jpg"},
    {"id":"M023","title":"Roadster Men Olive Solid Regular Fit Bomber Jacket","price":2199,"brand":"Roadster","colour":"Olive","category":"Outerwear","emoji":"🧥","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval"],"style":"casual","rating":4.2,"rating_count":2400,"img_url":"http://assets.myntassets.com/assets/images/6404218/Roadster-Men-Olive-Bomber.jpg"},
    {"id":"M024","title":"Jack & Jones Men Teal Round Neck Regular Fit T-Shirt","price":799,"brand":"Jack & Jones","colour":"Teal","category":"Tops","emoji":"👕","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval","inverted_triangle"],"style":"casual","rating":4.3,"rating_count":3100,"img_url":"http://assets.myntassets.com/assets/images/8661281/Men-Teal-Tshirt.jpg"},
    {"id":"M025","title":"HRX Men Charcoal Grey Rapid-Dry Shorts","price":899,"brand":"HRX by Hrithik Roshan","colour":"Grey","category":"Fashion","emoji":"🛍","occasion":"Casual","gender":"male","shapes":["trapezoid","rectangle","oval"],"style":"athletic","rating":4.5,"rating_count":5100,"img_url":"http://assets.myntassets.com/assets/images/14170730/HRX-Men-Charcoal-Shorts.jpg"},
]

# ── Main enrichment ───────────────────────────────────────────────────
def enrich(products:list) -> list:
    enriched = []
    for p in products:
        p = copy.deepcopy(p)
        title   = p.get("title","")
        colour  = p.get("colour","")
        occ     = p.get("occasion","Casual")
        cat     = p.get("category","Fashion")
        gender  = p.get("gender","female")

        p["fabric"]         = infer_fabric(title)
        p["pattern"]        = infer_pattern(title, colour)
        p["season"]         = infer_season(p["fabric"], cat)
        p["skin_tone"]      = skin_tone_compat(colour)
        p["pair_colours"]   = COLOUR_FAMILY.get(colour, [])
        p["occasion_tags"]  = occasion_tags(occ)
        p["sub_category"]   = infer_subcategory(title, cat)

        # Sparkline already present, add img if missing
        if not p.get("img"):
            p["img"] = f"Images/{p['id']}.jpg"

        enriched.append(p)
    return enriched

# ── Add male products ────────────────────────────────────────────────
def add_male_products(products:list) -> list:
    existing_ids = {p["id"] for p in products}
    added = 0
    for mp in MALE_PRODUCTS:
        if mp["id"] not in existing_ids:
            mp["fabric"]        = infer_fabric(mp["title"])
            mp["pattern"]       = infer_pattern(mp["title"], mp["colour"])
            mp["season"]        = infer_season(mp["fabric"], mp["category"])
            mp["skin_tone"]     = skin_tone_compat(mp["colour"])
            mp["pair_colours"]  = COLOUR_FAMILY.get(mp["colour"], [])
            mp["occasion_tags"] = occasion_tags(mp["occasion"])
            mp["sub_category"]  = infer_subcategory(mp["title"], mp["category"])
            mp["price_fmt"]     = f"₹{mp['price']:,}"
            mp["img"]           = f"Images/{mp['id']}.jpg"
            mp["sparkline"]     = [int(mp["price"] * random.uniform(0.85,1.15)) for _ in range(12)]
            mp["sparkline"][-1] = mp["price"]
            products.append(mp)
            added += 1
    print(f"  Added {added} male products")
    return products

# ── Compute pair_with after all products enriched ─────────────────────
def compute_all_pairs(products:list) -> list:
    for p in products:
        p["pair_with"] = compute_pair_with(p, products)
    return products

# ── Build outfit_rules.json ─────────────────────────────────────────
def build_outfit_rules() -> dict:
    return {
        "version": "2.0",
        "description": "Oracle Fashion AI — Combination Rules Engine (DeepFashion taxonomy)",
        "colour_theory": {
            "complementary": COLOUR_FAMILY,
            "tip": "Pick pairing colour from pair_colours field on each product"
        },
        "fabric_rules": {
            "cotton":    {"best_with":"cotton, linen, denim", "avoid":"heavy silk for casual looks"},
            "denim":     {"best_with":"cotton, chiffon, knitted tops", "avoid":"formal silk"},
            "chiffon":   {"best_with":"silk, satin, denim", "season":"spring, summer"},
            "silk":      {"best_with":"silk, chiffon", "season":"festive, traditional"},
            "knitted":   {"best_with":"cotton, denim", "season":"autumn, winter"},
            "linen":     {"best_with":"cotton, linen", "season":"spring, summer"},
        },
        "body_shape_rules": {
            "trapezoid": {
                "description": "Broad shoulders, narrow waist/hip — athletic build",
                "recommended_tops": ["slim-fit t-shirts", "polo shirts", "v-neck tops", "fitted jackets"],
                "recommended_bottoms": ["slim chinos", "straight jeans", "joggers"],
                "avoid": ["oversized boxy shirts that add bulk to shoulders"]
            },
            "rectangle": {
                "description": "Equal shoulders, waist, and hips",
                "recommended_tops": ["layered looks", "printed shirts", "hoodies", "bomber jackets"],
                "recommended_bottoms": ["straight-fit jeans", "chinos", "cargos"],
                "avoid": []
            },
            "oval": {
                "description": "Fuller midsection — focus draw away from centre",
                "recommended_tops": ["v-neck", "vertical stripe", "longline tops", "open-front cardigans"],
                "recommended_bottoms": ["straight-cut trousers", "dark jeans"],
                "avoid": ["cropped tops", "horizontal stripes"]
            },
            "inverted_triangle": {
                "description": "Wider shoulders, narrower hips",
                "recommended_tops": ["crew neck", "scoop neck", "light fabrics"],
                "recommended_bottoms": ["bootcut jeans", "straight trousers", "chinos with colour"],
                "avoid": ["padded shoulders", "heavy layering on top"]
            },
            "hourglass": {
                "description": "Balanced bust and hips with defined waist",
                "recommended_tops": ["wrap tops", "fitted tops", "ruched sides"],
                "recommended_bottoms": ["high-waist jeans", "pencil skirts", "A-line skirts"],
                "avoid": ["boxy oversized tops"]
            },
            "pear": {
                "description": "Hips wider than shoulders",
                "recommended_tops": ["embellished/printed tops", "cold-shoulder", "wide-neck"],
                "recommended_bottoms": ["A-line skirts", "bootcut jeans", "flared trousers", "dark plain bottoms"],
                "avoid": ["horizontal stripes on hips"]
            },
        },
        "skin_tone_palette": SKIN_TONE_COMPAT,
        "occasion_combos": {
            "casual":        {"tops":["t-shirt","casual top","crop top"],"bottoms":["jeans","shorts","chinos"],"outerwear":["denim jacket","bomber"]},
            "smart_casual":  {"tops":["shirt","polo"],"bottoms":["chinos","trousers"],"outerwear":["blazer","tailored jacket"]},
            "formal":        {"tops":["formal shirt","blouse"],"bottoms":["trousers","pencil skirt"],"outerwear":["blazer"]},
            "ethnic":        {"tops":["kurta","kurti"],"bottoms":["palazzo","legging","dhoti"],"outerwear":["dupatta","shrug"]},
            "festive":       {"tops":["embroidered kurta","lehenga blouse"],"bottoms":["lehenga","palazzo"],"outerwear":["dupatta"]},
            "traditional":   {"tops":["blouse"],"bottoms":["saree","lehenga"],"outerwear":["dupatta"]},
            "party":         {"tops":["sequin top","satin blouse"],"bottoms":["mini skirt","bootcut jeans"],"outerwear":["cape","shrug"]},
        },
        "season_layering": {
            "summer":  ["cotton top + linen trousers + sandals"],
            "autumn":  ["knitted sweatshirt + denim jeans + sneakers", "chinos + checked shirt + leather boots"],
            "winter":  ["puffer jacket + knit sweater + jeans + boots"],
            "spring":  ["floral cotton top + chinos + loafers", "light jacket + kurta + palazzo"],
        },
        "gender_style_rules": {
            "male": {
                "trapezoid": ["fitted t-shirts", "polo shirts", "slim chinos", "athletic shorts"],
                "oval":      ["v-neck tops", "vertical stripe shirts", "dark straight jeans"],
                "rectangle": ["layered looks", "hoodies", "cargos", "bomber jackets"],
            },
            "female": {
                "hourglass":  ["wrap dresses", "fitted kurtas", "high-waist jeans"],
                "pear":       ["A-line skirts", "printed tops", "bootcut jeans"],
                "rectangle":  ["layered tops", "pleated skirts", "palazzo sets"],
            }
        }
    }

# ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("Loading oracle_products.json …")
    raw = json.loads(PRODUCTS_FILE.read_text(encoding="utf-8"))
    products = raw["products"]
    print(f"  Loaded {len(products)} products")

    print("Enriching metadata …")
    products = enrich(products)

    print("Adding male products …")
    products = add_male_products(products)

    print("Computing outfit pair_with links …")
    products = compute_all_pairs(products)

    # Write enriched products
    out = {"version":"2.0","count":len(products),"products":products}
    PRODUCTS_FILE.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"  Saved {len(products)} products → oracle_products.json")

    # Write outfit rules
    rules = build_outfit_rules()
    RULES_FILE.write_text(json.dumps(rules, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  Saved outfit_rules.json")

    # Stats
    male_count   = sum(1 for p in products if p.get("gender")=="male")
    female_count = sum(1 for p in products if p.get("gender")=="female")
    fabrics      = {}
    for p in products:
        f = p.get("fabric","?")
        fabrics[f] = fabrics.get(f,0)+1

    print(f"\n=== Done ===")
    print(f"  Total products  : {len(products)}")
    print(f"  Female          : {female_count}")
    print(f"  Male            : {male_count}")
    print(f"  Fabrics         : {fabrics}")
    print(f"  Fields added    : fabric, pattern, season, skin_tone, pair_colours, occasion_tags, sub_category, pair_with")
    print(f"  outfit_rules.json → AI combination engine ready")
