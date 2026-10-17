#!/usr/bin/env python3
"""Turn the owner-supplied Wikibooks Cookbook scrape into loader-ready rows.

Usage:
    python3 -I db/scripts/wikibooks/parse_wikibooks.py <recipes_parsed.mini.json> [out.json]

The source file (about 10 MB) is NOT committed. The output (default
db/data/wikibooks-recipes.json) is committed and is what load.mjs reads.

Recipe text stays as written. The only things this script does are:
  * split an ingredient line into quantity / unit / name / note,
  * clean the category into a lowercase tag,
  * drop image captions that slipped into the steps (conservative heuristic),
  * leave servings null when the page has none (the loader defaults them).
"""
import json
import os
import re
import sys
import unicodedata
import urllib.parse

FR = {'¼': .25, '½': .5, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': .125, '⅜': .375,
      '⅝': .625, '⅞': .875, '⅙': 1 / 6, '⅕': .2}
FRC = ''.join(FR)

UNITS = {
    'cup': 'cup', 'cups': 'cup', 'c': 'cup',
    'tablespoon': 'tablespoon', 'tablespoons': 'tablespoon', 'tbsp': 'tablespoon', 'tbs': 'tablespoon',
    'tbsps': 'tablespoon', 'tbl': 'tablespoon',
    'teaspoon': 'teaspoon', 'teaspoons': 'teaspoon', 'tsp': 'teaspoon', 'tsps': 'teaspoon',
    'ounce': 'ounce', 'ounces': 'ounce', 'oz': 'ounce',
    'pound': 'pound', 'pounds': 'pound', 'lb': 'pound', 'lbs': 'pound',
    'gram': 'gram', 'grams': 'gram', 'g': 'gram', 'kilogram': 'kilogram', 'kilograms': 'kilogram', 'kg': 'kilogram',
    'milliliter': 'milliliter', 'milliliters': 'milliliter', 'ml': 'milliliter',
    'liter': 'liter', 'liters': 'liter', 'litre': 'liter', 'litres': 'liter', 'l': 'liter',
    'pinch': 'pinch', 'pinches': 'pinch', 'dash': 'dash', 'dashes': 'dash',
    'clove': 'clove', 'cloves': 'clove', 'can': 'can', 'cans': 'can', 'slice': 'slice', 'slices': 'slice',
    'quart': 'quart', 'quarts': 'quart', 'pint': 'pint', 'pints': 'pint', 'gallon': 'gallon', 'gallons': 'gallon',
    'stick': 'stick', 'sticks': 'stick', 'package': 'package', 'packages': 'package',
    'bunch': 'bunch', 'bunches': 'bunch', 'sprig': 'sprig', 'sprigs': 'sprig',
    'head': 'head', 'heads': 'head', 'piece': 'piece', 'pieces': 'piece',
}
# "clove" is a garlic (or shallot) unit. "3 cloves red onion" would make a shopping list read
# "3 cloves of red onion", so for anything else the unit is dropped and the word kept in the note.
CLOVE_OK = re.compile(r'garlic|shallot', re.I)

NUM = (r'(?:\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?\s*[' + FRC + r']|[' + FRC + r']|\d+(?:\.\d+)?)')
QTY = re.compile(r'^\s*(' + NUM + r')(?:\s*(?:-|–|—|to)\s*(' + NUM + r'))?\s*(.*)$', re.I)
APPROX = re.compile(r'^(about|approximately|approx\.?|around|~)\s*(?=[\d' + FRC + r'])', re.I)

COUNT_WORDS = r'ea|each|small|medium|large|big|stalk|stalks|whole'
ING_SECTIONS = {'ingredients', 'ingredient', 'ingredients:'}
STEP_SECTIONS = {'procedure', 'procedures', 'preparation', 'directions', 'method', 'instructions', 'process'}


def num(s):
    s = s.strip()
    m = re.match(r'^(\d+)\s+(\d+)/(\d+)$', s)
    if m:
        return int(m[1]) + int(m[2]) / int(m[3])
    m = re.match(r'^(\d+)/(\d+)$', s)
    if m:
        return int(m[1]) / int(m[2])
    m = re.match(r'^(\d+(?:\.\d+)?)\s*([' + FRC + r'])$', s)
    if m:
        return float(m[1]) + FR[m[2]]
    if s in FR:
        return FR[s]
    return float(s)


def split_top_level(text, sep=','):
    """Split once on the first `sep` outside parentheses. Returns (head, tail or None)."""
    depth = 0
    for i, ch in enumerate(text):
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth = max(0, depth - 1)
        elif ch == sep and depth == 0:
            return text[:i], text[i + 1:]
    return text, None


def take_leading_paren(text):
    """If text starts with a balanced '(...)', return (paren, rest). Otherwise (None, text)."""
    if not text.startswith('('):
        return None, text
    depth = 0
    for i, ch in enumerate(text):
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0:
                return text[:i + 1], text[i + 1:].strip()
    return None, text


def raw_ing(line):
    return {'name': line, 'unit': None, 'quantity': 0}


def parse_ing(line):
    line = re.sub(r'\s+', ' ', line).strip()
    notes = []
    work = line
    am = APPROX.match(work)
    if am:
        notes.append(am[1].lower().rstrip('.'))
        work = work[am.end():]

    # Leading parenthetical amount, no quantity: "(240 ml) milk", "(4 ea.) boneless chicken".
    paren, after = take_leading_paren(work)
    if paren and after:
        return _build(line, None, notes, [paren], after)

    m = QTY.match(work)
    if not m:
        return raw_ing(line)
    rest = m[3].strip()
    # "3-inch piece", "2x4": the number belongs to a compound word, not an amount.
    if re.match(r'^-\s*[A-Za-z]', rest) or re.match(r'^x\b', rest, re.I):
        return raw_ing(line)
    try:
        q = num(m[1])
    except ValueError:
        return raw_ing(line)
    if m[2]:
        notes.insert(0, f'original amount: {m[1].strip()}-{m[2].strip()}')
    return _build(line, q, notes, [], rest)


def _build(line, q, notes, parens, rest):
    unit = None
    unit_word = None
    if q is not None and re.match(r'^ea\.?\s+\S', rest, re.I):  # "4 ea. (24 oz) steaks": "ea." only means "each"
        rest = re.sub(r'^ea\.?\s+', '', rest, flags=re.I)
    # A parenthetical may sit before the unit ("1 (14 oz) can tomatoes") or after it ("1 cup (240 ml) milk").
    p, rest = take_leading_paren(rest)
    if p:
        parens.append(p)
    um = re.match(r'^([A-Za-z]+)\.?(?:\s+|(?=[(/])|$)(.*)$', rest)
    if q is not None and um and um[1].lower() in UNITS:
        unit_word, unit, rest = um[1], UNITS[um[1].lower()], um[2].strip()
        p, rest = take_leading_paren(rest)
        if p:
            parens.append(p)
    rest = re.sub(r'^of\s+', '', rest, flags=re.I)
    # "2 ea. (~2 cups) chopped carrots", "1 medium (8 oz) potato": a count/size word, then an amount in parentheses.
    cm = re.match(r'^(' + COUNT_WORDS + r')\.?\s+(\(.*)$', rest, re.I) if q is not None else None
    if cm:
        p, after = take_leading_paren(cm[2])
        if p and after:
            parens.append(p)
            rest = after if cm[1].lower() in ('ea', 'each') else f'{cm[1]} {after}'
    if parens and rest.startswith(','):
        # "3 lbs (1350 g), chicken parts": the comma only separated the amount from the name
        rest = rest[1:].strip()
        if re.match(r'(plus|or|and|more|if|about)\b', rest, re.I):
            return raw_ing(line)
    head, tail = split_top_level(rest, ',')
    name = head.strip()
    tail = (tail or '').strip()
    if not name or name.startswith('('):
        # nothing sensible left to call the ingredient (e.g. "6 cloves (loung)"): keep the line as written
        return raw_ing(line)
    if unit == 'clove' and not CLOVE_OK.search(name):
        notes.append(unit_word.lower())
        unit = None
    out = {'name': name, 'unit': unit, 'quantity': round(q, 4) if q is not None else 0}
    note = '; '.join(x for x in notes + parens + ([tail] if tail else []) if x)
    if note:
        out['note'] = note
    return out


def slugify(t):
    t = unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().lower()
    t = re.sub(r'[^a-z0-9]+', '-', t).strip('-')
    return t[:70].strip('-') or 'recipe'


def clean_tag(c):
    """'/wiki/Category:American_dessert_recipes&action=edit&redlink=1' -> 'american dessert'."""
    if not c:
        return None
    c = urllib.parse.unquote(c.rsplit('Category:', 1)[-1])
    c = re.split(r'[&?#]', c, maxsplit=1)[0].replace('_', ' ')
    c = re.sub(r'\s+', ' ', c).strip().lower()
    c = re.sub(r'\s*\brecipes?$', '', c).strip()
    return c or None


def parse_servings(s):
    m = re.search(r'\d+', s or '')
    if not m:
        return None
    n = int(m[0])
    return n if 1 <= n <= 100 else None


# A short, unpunctuated line that does not start with a cooking verb (or a quantity) is an image
# caption such as "Dough rolled into a ball". Real steps start with one of these.
VERBS = set('''add adjust allow arrange assemble bake barbecue baste beat blanch blend boil bone braise bread break bring broil
brown brush build butter carve chill chop clean coat combine cook cool cover crack cream crush cube cut deep-fry deglaze
dice dip discard dissolve divide drain dredge dress drizzle dry dust empty enjoy fill flip fold freeze fry garnish glaze grate
grease grill grind halve heat hold ice increase insert keep knead layer leave let lightly line lower make marinate mash
measure melt mince mix moisten mound open pan-fry pare pat peel pierce pinch pit place poach pop pound pour powder preheat
prepare press prick process pull pulse punch put quarter reduce refrigerate remove repeat reserve rest return rinse rise
roast roll rub salt sauté saute scald scoop scrape scrub sear season separate serve set shake shape sieve sift simmer skim
slice slide smash soak soften spoon spread sprinkle squeeze steam steep stir strain stuff sweeten take taste thaw thicken
thread tie toast toss transfer trim turn twist uncover unmold unwrap use wait wash watch whip whisk wipe wrap wring zest
also and but then next now once after before when while if finally meanwhile continue carefully gently slowly quickly
do don't dont ensure be check consider try using on in at to for with from remember note optionally optional
first second third lastly otherwise alternatively as so stand sit pass skewer smoke spritz stew sweat swirl tent temper tilt
top unfold unroll whizz zap crimp cure curl decorate devein dock flatten flour fluff gather hand ladle lift
mold mould nestle pack paint pipe plate pre-heat prep proof pulverize puree purée rehydrate render rewarm roughly scatter
score shred shuck skin slit snip splash spray stack stir-fry strip swish tear tuck wet
permit pick raise hard evenly finish reheat sweat slowly lightly generously immediately'''.split())
STEP_END = re.compile(r'[.!?;:,)\]"”\']\s*(\[\d+\])*\s*$')


def is_caption(text):
    t = text.strip()
    if not t or len(t) > 60 or STEP_END.search(t):
        return False
    if re.match(r'^step\s+\w+\s*:\s*\S', t, re.I) or re.search(r'\d', t) and ':' in t:  # "Step 8: Pan-fry...", "Wings: 10 minutes"
        return False
    if re.match(r'^\d+\.\s', t):  # "5. meat, mustard, salt, and pepper": caption of a numbered photo
        return True
    if re.match(r'^[\d' + FRC + r'(]', t):  # leading quantity: a stray ingredient line, not a caption
        return False
    first = re.split(r'[\s,]+', t, maxsplit=1)[0].lower().strip('.:;')
    return first not in VERBS


def sec_key(s):
    return re.sub(r'\[\d+\]', '', s or '').strip().lower()


def parse(src_path):
    with open(src_path, encoding='utf-8') as f:
        data = json.load(f)
    rows, seen = [], set()
    stats = {'source_recipes': len(data), 'skipped_no_ingredients': 0, 'skipped_no_steps': 0,
             'skipped_duplicate_url': 0, 'captions_dropped': 0}
    dropped = []
    for it in data:
        r = it['recipe_data']
        lines = r['text_lines']
        ing = [l['text'] for l in lines if sec_key(l['section']) in ING_SECTIONS and l['line_type'] in ('ul', 'ol')]
        raw_steps = [l['text'] for l in lines if sec_key(l['section']) in STEP_SECTIONS and l['line_type'] in ('ol', 'ul', 'p')]
        steps = []
        for s in raw_steps:
            s = re.sub(r'\s+', ' ', s).strip()
            if not s:
                continue
            if is_caption(s):
                stats['captions_dropped'] += 1
                dropped.append(s)
                continue
            steps.append(s)
        if not ing:
            stats['skipped_no_ingredients'] += 1
            continue
        if not steps:
            stats['skipped_no_steps'] += 1
            continue
        title = re.sub(r'\s+', ' ', r['title']).strip()
        url = r['url']
        if url in seen:
            stats['skipped_duplicate_url'] += 1
            continue
        seen.add(url)
        info = r.get('infobox') or {}
        rows.append({'slug': 'wb-' + slugify(title), 'title': title, 'url': url,
                     'servings': parse_servings(info.get('servings')),
                     'tag': clean_tag(info.get('category')),
                     'ingredients': [parse_ing(x) for x in ing if x.strip()],
                     'steps': steps})
    count = {}
    for x in rows:
        count[x['slug']] = count.get(x['slug'], 0) + 1
        if count[x['slug']] > 1:
            x['slug'] += f"-{count[x['slug']]}"
    return rows, stats, dropped


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    src = argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    out = argv[2] if len(argv) > 2 else os.path.join(here, '..', '..', 'data', 'wikibooks-recipes.json')
    rows, stats, dropped = parse(src)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')
    ings = [i for r in rows for i in r['ingredients']]
    stats.update({
        'rows': len(rows),
        'servings_missing': sum(1 for r in rows if r['servings'] is None),
        'rows_without_tag': sum(1 for r in rows if not r['tag']),
        'ingredient_lines': len(ings),
        'with_quantity': sum(1 for i in ings if i['quantity'] > 0),
        'with_unit': sum(1 for i in ings if i['unit']),
        'raw_no_quantity': sum(1 for i in ings if i['quantity'] == 0),
        'bytes': os.path.getsize(out),
    })
    print(json.dumps(stats, indent=2))
    if os.environ.get('SHOW_DROPPED'):
        print('\n'.join(dropped))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
