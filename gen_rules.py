"""Generate outfit_rules.json only (products already enriched)"""
import json
from pathlib import Path

BASE = Path(r"C:\Users\Vivek\Downloads\stitch\stitch\oracle")
RULES_FILE = BASE / "outfit_rules.json"

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
    "Mauve":["White","Beige","Black","Grey","Navy Blue"],
    "Rose":["White","Beige","Black","Grey","Navy Blue","Olive"],
    "Magenta":["Black","White","Navy Blue","Grey","Beige"],
    "Sea Green":["White","Beige","Coral","Navy Blue","Black","Mustard"],
    "Multi":["Black","White","Navy Blue","Beige","Olive"],
}

SKIN_TONE_COMPAT = {
    "fair":["Red","Pink","Maroon","Burgundy","Purple","Navy Blue","Blue","Teal","Black"],
    "light":["Red","Pink","Orange","Coral","Mustard","Yellow","Sea Green","Blue","Teal","Black","White"],
    "medium":["Mustard","Olive","Teal","Rust","Brown","Navy Blue","White","Red","Orange","Black"],
    "olive":["Mustard","Olive","Brown","Rust","Teal","Navy Blue","White","Cream","Beige","Black"],
    "tan":["White","Beige","Cream","Olive","Coral","Teal","Navy Blue","Black","Orange","Mustard"],
    "deep":["White","Beige","Cream","Yellow","Olive","Coral","Orange","Lime Green","Teal","Mustard","Red"],
}

rules = {
    "version": "2.0",
    "description": "Oracle Fashion AI - Combination Rules Engine (DeepFashion taxonomy)",
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
            "description": "Broad shoulders, narrow waist/hip - athletic build (male)",
            "recommended_tops": ["slim-fit t-shirts","polo shirts","v-neck tops","fitted jackets"],
            "recommended_bottoms": ["slim chinos","straight jeans","joggers"],
            "avoid": ["oversized boxy shirts that add bulk to shoulders"]
        },
        "rectangle": {
            "description": "Equal shoulders, waist, and hips",
            "recommended_tops": ["layered looks","printed shirts","hoodies","bomber jackets"],
            "recommended_bottoms": ["straight-fit jeans","chinos","cargos"],
            "avoid": []
        },
        "oval": {
            "description": "Fuller midsection - focus draw away from centre",
            "recommended_tops": ["v-neck","vertical stripe","longline tops","open-front cardigans"],
            "recommended_bottoms": ["straight-cut trousers","dark jeans"],
            "avoid": ["cropped tops","horizontal stripes"]
        },
        "inverted_triangle": {
            "description": "Wider shoulders, narrower hips",
            "recommended_tops": ["crew neck","scoop neck","light fabrics"],
            "recommended_bottoms": ["bootcut jeans","straight trousers","chinos with colour"],
            "avoid": ["padded shoulders","heavy layering on top"]
        },
        "hourglass": {
            "description": "Balanced bust and hips with defined waist (female)",
            "recommended_tops": ["wrap tops","fitted tops","ruched sides"],
            "recommended_bottoms": ["high-waist jeans","pencil skirts","A-line skirts"],
            "avoid": ["boxy oversized tops"]
        },
        "pear": {
            "description": "Hips wider than shoulders (female)",
            "recommended_tops": ["embellished/printed tops","cold-shoulder","wide-neck"],
            "recommended_bottoms": ["A-line skirts","bootcut jeans","flared trousers","dark plain bottoms"],
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
        "autumn":  ["knitted sweatshirt + denim jeans + sneakers","chinos + checked shirt + leather boots"],
        "winter":  ["puffer jacket + knit sweater + jeans + boots"],
        "spring":  ["floral cotton top + chinos + loafers","light jacket + kurta + palazzo"],
    },
    "gender_style_rules": {
        "male": {
            "trapezoid": ["fitted t-shirts","polo shirts","slim chinos","athletic shorts"],
            "oval":      ["v-neck tops","vertical stripe shirts","dark straight jeans"],
            "rectangle": ["layered looks","hoodies","cargos","bomber jackets"],
        },
        "female": {
            "hourglass":  ["wrap dresses","fitted kurtas","high-waist jeans"],
            "pear":       ["A-line skirts","printed tops","bootcut jeans"],
            "rectangle":  ["layered tops","pleated skirts","palazzo sets"],
        }
    },
    "combination_scoring": {
        "description": "Scoring rubric for AI to rank outfit combinations (0-100)",
        "colour_match":       {"weight": 35, "rule": "complements in colour_theory.complementary"},
        "fabric_harmony":     {"weight": 20, "rule": "check fabric_rules.best_with"},
        "occasion_match":     {"weight": 20, "rule": "same or compatible occasion_tags"},
        "body_shape_fit":     {"weight": 15, "rule": "product shapes intersect with user body shape"},
        "skin_tone_compat":   {"weight": 10, "rule": "product skin_tone field contains user skin tone"},
    }
}

RULES_FILE.write_text(json.dumps(rules, indent=2, ensure_ascii=False), encoding="utf-8")
print("outfit_rules.json saved OK")
print("Keys:", list(rules.keys()))
