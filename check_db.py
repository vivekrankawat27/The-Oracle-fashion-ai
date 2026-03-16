import json, os
d = json.load(open("oracle_products.json", encoding="utf-8"))
p = d["products"]
print("Total products:", d["count"])
print("Male:", sum(1 for x in p if x.get("gender")=="male"))
print("Female:", sum(1 for x in p if x.get("gender")=="female"))
fp = p[0]
print("Fields:", list(fp.keys()))
print("Sample fabric:", fp.get("fabric"))
print("Sample pattern:", fp.get("pattern"))
print("Sample season:", fp.get("season"))
print("Sample skin_tone:", fp.get("skin_tone"))
print("Sample pair_with:", fp.get("pair_with"))
print("Sample sub_category:", fp.get("sub_category"))
print("outfit_rules.json exists:", os.path.exists("outfit_rules.json"))
if os.path.exists("outfit_rules.json"):
    r = json.load(open("outfit_rules.json", encoding="utf-8"))
    print("Rules version:", r.get("version"))
    print("Rules keys:", list(r.keys()))
