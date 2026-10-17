import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parse_wikibooks as p  # noqa: E402


class Numbers(unittest.TestCase):
    def test_fractions(self):
        self.assertEqual(p.parse_ing('1/2 cup flour')['quantity'], 0.5)
        self.assertEqual(p.parse_ing('1 1/2 cups flour')['quantity'], 1.5)
        self.assertEqual(p.parse_ing('1 ½ cups flour')['quantity'], 1.5)
        self.assertEqual(p.parse_ing('¾ cup mayonnaise')['quantity'], 0.75)
        self.assertEqual(p.parse_ing('⅓ cup sugar')['quantity'], 0.3333)

    def test_range_keeps_lower_bound_and_original(self):
        i = p.parse_ing('2-3 tablespoons vegetable oil')
        self.assertEqual((i['quantity'], i['unit'], i['name']), (2.0, 'tablespoon', 'vegetable oil'))
        self.assertIn('original amount: 2-3', i['note'])
        self.assertEqual(p.parse_ing('1 to 2 cloves garlic')['quantity'], 1.0)

    def test_no_quantity_is_raw(self):
        i = p.parse_ing('Salt to taste')
        self.assertEqual((i['name'], i['unit'], i['quantity']), ('Salt to taste', None, 0))

    def test_compound_number_is_not_an_amount(self):
        self.assertEqual(p.parse_ing('3-inch cinnamon stick')['quantity'], 0)


class Units(unittest.TestCase):
    def test_units(self):
        for line, unit in [('2 tsp. salt', 'teaspoon'), ('3 Tbsp butter', 'tablespoon'), ('1 lb beef', 'pound'),
                           ('250 g flour', 'gram'), ('1 can tomatoes', 'can'), ('1 pinch salt', 'pinch')]:
            self.assertEqual(p.parse_ing(line)['unit'], unit, line)

    def test_count_has_no_unit(self):
        i = p.parse_ing('3 eggs, beaten')
        self.assertEqual((i['name'], i['unit'], i['quantity'], i['note']), ('eggs', None, 3.0, 'beaten'))

    def test_clove_only_for_garlic(self):
        g = p.parse_ing('3 cloves garlic, minced')
        self.assertEqual((g['unit'], g['name']), ('clove', 'garlic'))
        o = p.parse_ing('3 cloves red onion, minced')
        self.assertIsNone(o['unit'])
        self.assertEqual(o['name'], 'red onion')
        self.assertIn('cloves', o['note'])

    def test_unit_word_alone_stays_raw(self):
        self.assertEqual(p.parse_ing('6 cloves (loung)')['quantity'], 0)
        self.assertEqual(p.parse_ing('3 cloves')['quantity'], 0)


class Parentheticals(unittest.TestCase):
    def test_leading_parenthetical_amount(self):
        i = p.parse_ing('(240 ml) milk')
        self.assertEqual((i['name'], i['note'], i['quantity']), ('milk', '(240 ml)', 0))
        i = p.parse_ing('(4 ea.) boneless chicken')
        self.assertEqual((i['name'], i['note']), ('boneless chicken', '(4 ea.)'))

    def test_parenthetical_after_unit_and_before_unit(self):
        i = p.parse_ing('1 cup (240 ml) milk')
        self.assertEqual((i['unit'], i['name'], i['note']), ('cup', 'milk', '(240 ml)'))
        i = p.parse_ing('1 (14 oz) can diced tomatoes')
        self.assertEqual((i['unit'], i['name'], i['note']), ('can', 'diced tomatoes', '(14 oz)'))

    def test_comma_inside_parentheses_is_not_a_split(self):
        i = p.parse_ing('1 can (16 oz, 450 g) refried beans, warmed')
        self.assertEqual((i['unit'], i['name']), ('can', 'refried beans'))
        self.assertEqual(i['note'], '(16 oz, 450 g); warmed')

    def test_ea_dropped(self):
        i = p.parse_ing('2 ea. (250 g / 8.8 oz) carrots, shredded')
        self.assertEqual((i['name'], i['quantity'], i['unit']), ('carrots', 2.0, None))

    def test_inner_parenthetical_stays_in_name(self):
        self.assertEqual(p.parse_ing('1 tablespoon achiote (annatto)')['name'], 'achiote (annatto)')


class Tags(unittest.TestCase):
    def test_redlink_fragment(self):
        self.assertEqual(p.clean_tag('/w/index.php?title=Category:American_dessert_recipes&action=edit&redlink=1'),
                         'american dessert')
        self.assertEqual(p.clean_tag('american dessert recipes&action=edit&redlink=1'), 'american dessert')

    def test_plain(self):
        self.assertEqual(p.clean_tag('/wiki/Category:Salad_dressing_recipes'), 'salad dressing')
        self.assertEqual(p.clean_tag('/wiki/Category:Soup_recipe'), 'soup')
        self.assertEqual(p.clean_tag('/wiki/Category:Nigerian_recipes'), 'nigerian')

    def test_empty(self):
        self.assertIsNone(p.clean_tag(None))
        self.assertIsNone(p.clean_tag('/wiki/Category:Recipes'))


class Captions(unittest.TestCase):
    def test_captions_dropped(self):
        for t in ['Dough rolled into a ball', 'Pies in the oven', '5. meat, mustard, salt, and pepper', 'Step one']:
            self.assertTrue(p.is_caption(t), t)

    def test_real_steps_kept(self):
        for t in ['Add the vinegar and soy sauce', 'Preheat the oven to 350°F (175°C)', 'Mix well.',
                  'Wings: 10 minutes', 'Step 8: Pan-fry the pot stickers in a little oil',
                  'Hard boil the eggs, refresh and set aside to cool',
                  'A step that is longer than sixty characters is never treated as a caption at all']:
            self.assertFalse(p.is_caption(t), t)


class Servings(unittest.TestCase):
    def test_servings(self):
        self.assertEqual(p.parse_servings('6-8'), 6)
        self.assertIsNone(p.parse_servings('0'))
        self.assertIsNone(p.parse_servings(None))
        self.assertIsNone(p.parse_servings('many'))


if __name__ == '__main__':
    unittest.main()
