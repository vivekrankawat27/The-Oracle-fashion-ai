"""
Oracle Dataset Builder
Converts Fashion Dataset v2.csv → oracle_products.json
Filters, cleans, and structures data for client-side matching.

Body Shape ID mapping (from p_attributes):
443 = Hourglass, 333 = Rectangle, 424 = Pear (wider hips),
354 = Apple, 234 = Inv. Triangle

Run: python build_dataset.py
Output: oracle_products.json  (~500-800 items, clean & compact)
"""

import csv, json, re, os, ast

CSV_PATH = r"C:\Users\Vivek\OneDrive\Desktop\cloth dataset\Fashion Dataset v2.csv"
IMG_DIR  = r"C:\Users\Vivek\OneDrive\Desktop\cloth dataset\Images"
OUT_FILE = r"C:\Users\Vivek\Downloads\stitch\stitch\oracle\oracle_products.json"

MAX_PRICE = 50000
MIN_RATING = 3.5

# Body shape ID → shape key map
SHAPE_MAP = {
    '443': 'hourglass',
    '333': 'rectangle',
    '424': 'pear',
    '354': 'apple',
    '234': 'inverted',
    '324': 'pear',
    # also capture broader combos
}

# Top types to style persona map
STYLE_MAP = {
    'kurta': 'ethnic',
    'saree': 'ethnic',
    'lehenga': 'ethnic',
    'salwar': 'ethnic',
    'dress': 'feminine',
    'gown': 'feminine',
    'top': 'casual',
    'shirt': 'classic',
    'blazer': 'formal',
    'jacket': 'street',
    'jeans': 'casual',
    'trouser': 'formal',
    'leggings': 'sporty',
    'jumpsuit': 'minimal',
    'co-ord': 'minimal',
}

OCCASION_MAP = {
    'festive': 'Festive',
    'party': 'Party',
    'casual': 'Casual',
    'daily': 'Daily',
    'office': 'Office',
    'formal': 'Formal',
    'wedding': 'Wedding',
    'sport': 'Sport',
    'lounge': 'Lounge',
    'ethnic': 'Ethnic',
    'fusion': 'Fusion',
    'beach': 'Vacation',
}

def local_img_exists(pid):
    return os.path.exists(os.path.join(IMG_DIR, f"{pid}.jpg"))

def parse_attrs(raw):
    try:
        s = raw.strip()
        if s.startswith("'") or s.startswith('"'):
            s = s.replace("'", '"')
        return ast.literal_eval(raw) if "'" in raw else json.loads(raw)
    except:
        return {}

def get_shapes(attrs):
    shape_str = attrs.get('Body Shape ID', '')
    if not shape_str or shape_str == 'NA':
        return []
    shapes = []
    for code in re.findall(r'\d+', shape_str):
        if code in SHAPE_MAP:
            shapes.append(SHAPE_MAP[code])
    return list(set(shapes))

def get_style_tag(attrs):
    top = attrs.get('Top Type', '').lower()
    bottom = attrs.get('Bottom Type', '').lower()
    combined = top + ' ' + bottom
    for key, tag in STYLE_MAP.items():
        if key in combined:
            return tag
    return 'casual'

def get_occasion(attrs):
    occ = attrs.get('Occasion', '').lower()
    if not occ or occ == 'na':
        return 'Daily'
    for key, label in OCCASION_MAP.items():
        if key in occ:
            return label
    return occ.title()

def make_sparkline(price):
    """Generate realistic 12-point sparkline around the current price."""
    import random
    random.seed(hash(price))
    points = []
    v = price * (0.85 + random.random() * 0.3)
    for _ in range(12):
        v += random.uniform(-price * 0.08, price * 0.08)
        v = max(price * 0.5, min(price * 1.5, v))
        points.append(round(v))
    points[-1] = price  # last point is current real price
    return points

def infer_gender(name, attrs):
    """
    Determine gender from product name and attributes.
    IMPORTANT: Check FEMALE signals before MALE because 'men' is a substring of 'women'.
    """
    nm = name.lower()

    # ── EXPLICIT FEMALE signals FIRST (before male, because 'men' ⊂ 'women') ──
    FEMALE_WORDS = [
        'women', "women's", 'woman', 'female', 'girl', "girls'", 'ladies', 'lady',
        'saree', 'sari', 'lehenga', 'blouse', 'dupatta', 'anarkali', 'sharara',
        'salwar', 'churidar', 'palazzos', 'palazzo', 'kaftan', 'maxi dress',
        'kurti', 'kurta', 'skirt', 'dress', 'gown', 'jumpsuit', 'playsuit',
        'crop top', 'peplum', 'bodycon', 'flared', 'wrap dress', 'midi dress',
        'kanjeevaram', 'banarasi', 'georgette', 'chiffon saree',
        'bralette', 'camisole',
    ]
    for w in FEMALE_WORDS:
        if w in nm:
            return 'female'

    # ── EXPLICIT MALE signals (safe word-boundary regex) ───────────────
    import re as _re
    # Match standalone 'men' or 'men's' (not inside 'women', 'garments' etc)
    if _re.search(r'(?:^|\s)men\'?s?(?:\s|$)', nm):
        return 'male'
    # Match standalone 'man' but not 'mandarin', 'woman' etc
    if _re.search(r'(?:^|\s)man(?:\s|$)', nm):
        return 'male'

    MALE_WORDS_SAFE = [
        'male ', ' male', 'boys ', 'gents', 'sherwani',
        'dhoti', 'nehru jacket', 'mens ',
    ]
    for w in MALE_WORDS_SAFE:
        if w in nm:
            return 'male'

    # ── ATTRIBUTE-BASED detection ──────────────────────────────────────
    top = attrs.get('Top Type', '').lower()
    bottom = attrs.get('Bottom Type', '').lower()

    FEMALE_TOPS = ['kurta', 'saree', 'lehenga', 'blouse', 'gown', 'dress',
                   'skirt', 'kurti', 'dupatta', 'salwar', 'kaftan', 'crop']
    MALE_TOPS   = ['shirt', 'polo', 'tshirt', 't-shirt', 'dhoti']

    for w in FEMALE_TOPS:
        if w in top or w in bottom:
            return 'female'
    for w in MALE_TOPS:
        if w in top:
            return 'male'

    # ── Brands that are exclusively womenswear ─────────────────────────
    FEMALE_BRANDS = [
        'sassafras', 'ahika', 'mitera', 'varanga', 'global desi',
        'libas', 'biba', 'w for woman', 'sangria', 'lakshita',
        'indo era', 'anouk', 'inddus', 'jaipur kurti', 'vishudh',
        'quiero', 'kassually', 'kotty',
    ]
    for b in FEMALE_BRANDS:
        if b in nm:
            return 'female'

    # ── Default: Myntra dataset is ~95% womenswear ──────────────────────
    return 'female'




def categorise(name, attrs):
    top = attrs.get('Top Type', '').lower()
    bottom = attrs.get('Bottom Type', '').lower()
    n = name.lower()
    if any(x in top for x in ['kurta', 'saree', 'lehenga', 'salwar']):
        return 'Ethnic Wear', '🌺'
    if 'dress' in top or 'gown' in top or 'dress' in n:
        return 'Dresses', '👗'
    if 'blazer' in top or 'blazer' in n:
        return 'Workwear', '💼'
    if 'shirt' in top or 'shirt' in n:
        return 'Shirts', '👔'
    if 'top' in top or 'top' in n:
        return 'Tops', '✨'
    if 'jean' in bottom or 'trouser' in bottom:
        return 'Bottoms', '👖'
    if 'jacket' in top or 'jacket' in n:
        return 'Outerwear', '🧥'
    if 'sport' in n or 'athlet' in n:
        return 'Athleisure', '🏃'
    return 'Fashion', '🛍'

print("Loading CSV…")
products = []
seen_ids = set()

with open(CSV_PATH, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        try:
            pid = row['p_id'].strip()
            if pid in seen_ids:
                continue
            seen_ids.add(pid)

            price = float(row['price'] or 0)
            rating = float(row['avg_rating'] or 0)
            rating_count = float(row['ratingCount'] or 0)

            if price <= 0 or price > MAX_PRICE:
                continue
            if rating < MIN_RATING:
                continue
            if rating_count < 50:
                continue

            attrs = parse_attrs(row.get('p_attributes', '{}'))
            shapes = get_shapes(attrs)
            gender = infer_gender(row['name'], attrs)
            style_tag = get_style_tag(attrs)
            occasion = get_occasion(attrs)
            category, emoji = categorise(row['name'], attrs)

            # Prefer local image, fall back to URL
            has_local = local_img_exists(pid)
            img = f"Images/{pid}.jpg" if has_local else row.get('img', '')

            products.append({
                'id': pid,
                'title': row['name'].strip(),
                'price': int(price),
                'price_fmt': f"₹{int(price):,}",
                'brand': row['brand'].strip(),
                'colour': row['colour'].strip(),
                'rating': round(rating, 1),
                'rating_count': int(rating_count),
                'img': img,
                'img_url': row.get('img', ''),
                'category': category,
                'emoji': emoji,
                'occasion': occasion,
                'gender': gender,
                'shapes': shapes,
                'style': style_tag,
                'sparkline': make_sparkline(int(price)),
            })
        except Exception as e:
            continue

print(f"Loaded {len(products)} qualifying products from CSV")

# ---- Sort by rating × log(count) score ----
import math
products.sort(key=lambda p: p['rating'] * math.log1p(p['rating_count']), reverse=True)

# Cap at 3000 best items for reasonable JSON size
products = products[:3000]

output = {
    'version': '1.0',
    'count': len(products),
    'products': products
}

with open(OUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, separators=(',', ':'))

size_kb = os.path.getsize(OUT_FILE) // 1024
print(f"✅ Saved {len(products)} products → oracle_products.json ({size_kb} KB)")
print(f"   Gender breakdown: female={sum(1 for p in products if p['gender']=='female')}, "
      f"male={sum(1 for p in products if p['gender']=='male')}, "
      f"any={sum(1 for p in products if p['gender']=='any')}")
print(f"   Has local images: {sum(1 for p in products if p['img'].startswith('Images/'))}")
