/**
 * Hand-written USDA FoodData Central search responses in the real shape (foods[].foodNutrients[]
 * with nutrientId / nutrientNumber / unitName / value, per 100 g). Values are approximate SR Legacy
 * figures typed in by hand; they were NOT fetched from the live service.
 */
const n = (nutrientId: number, nutrientNumber: string, nutrientName: string, unitName: string, value: number) => ({
  nutrientId,
  nutrientNumber,
  nutrientName,
  unitName,
  value,
});

export const facts = (kcal: number, protein: number, fat: number, carbs: number) => [
  n(1003, '203', 'Protein', 'G', protein),
  n(1004, '204', 'Total lipid (fat)', 'G', fat),
  n(1005, '205', 'Carbohydrate, by difference', 'G', carbs),
  n(1008, '208', 'Energy', 'KCAL', kcal),
  n(1093, '307', 'Sodium, Na', 'MG', 10),
];

const food = (fdcId: number, description: string, dataType: string, foodNutrients: unknown[]) => ({ fdcId, description, dataType, foodNutrients });

export const SEARCH: Record<string, unknown> = {
  'chicken breast': {
    totalHits: 3,
    foods: [
      food(171477, 'Chicken, broilers or fryers, breast, meat and skin, cooked, roasted', 'SR Legacy', facts(197, 29.8, 7.8, 0)),
      food(171077, 'Chicken, broilers or fryers, breast, meat only, raw', 'SR Legacy', facts(120, 22.5, 2.6, 0)),
      food(172385, 'Chicken, canned, meat only, with broth', 'SR Legacy', facts(185, 25.2, 8.2, 0)),
    ],
  },
  'olive oil': { foods: [food(171413, 'Oil, olive, salad or cooking', 'SR Legacy', facts(884, 0, 100, 0))] },
  'all-purpose flour': {
    foods: [
      food(169761, 'Wheat flour, white, all-purpose, enriched, bleached', 'SR Legacy', facts(364, 10.3, 1, 76.3)),
      food(168894, 'Bread, white, commercially prepared', 'SR Legacy', facts(266, 8.9, 3.3, 50.6)),
    ],
  },
  butter: { foods: [food(173430, 'Butter, without salt', 'SR Legacy', facts(717, 0.85, 81.1, 0.06))] },
  egg: {
    foods: [
      food(172184, 'Egg, whole, cooked, hard-boiled', 'SR Legacy', facts(155, 12.6, 10.6, 1.1)),
      food(171287, 'Egg, whole, raw, fresh', 'SR Legacy', facts(143, 12.6, 9.5, 0.7)),
    ],
  },
  'whole milk': { foods: [food(171265, 'Milk, whole, 3.25% milkfat, with added vitamin D', 'SR Legacy', facts(61, 3.2, 3.3, 4.8))] },
  sugar: { foods: [food(169655, 'Sugars, granulated', 'SR Legacy', facts(387, 0, 0, 99.8))] },
  'clove garlic': { foods: [food(169230, 'Garlic, raw', 'SR Legacy', facts(149, 6.4, 0.5, 33.1))] },
  'yellow onion': { foods: [food(170000, 'Onions, raw', 'SR Legacy', facts(40, 1.1, 0.1, 9.3))] },
  'long grain rice': { foods: [food(169756, 'Rice, white, long-grain, regular, raw, enriched', 'SR Legacy', facts(365, 7.1, 0.7, 80))] },
  'kosher salt': { foods: [food(173468, 'Salt, table', 'SR Legacy', facts(0, 0, 0, 0))] },
  saffron: { foods: [food(170927, 'Spices, saffron', 'SR Legacy', facts(310, 11.4, 5.9, 65.4))] },
  // no usable match: nothing shares a word with the query
  'dragon fruit puree': { foods: [food(1, 'Beef, ground, raw', 'SR Legacy', facts(250, 17, 20, 0))] },
  // right words, but the nutrient list lacks carbohydrate
  'mystery flour': { foods: [food(2, 'Flour, mystery', 'Foundation', [n(1008, '208', 'Energy', 'KCAL', 300), n(1003, '203', 'Protein', 'G', 5), n(1004, '204', 'Total lipid (fat)', 'G', 1)])] },
};

/** Foundation foods often have no 1008 energy row, only Atwater (2047/2048) or kJ (1062). */
export const FOUNDATION_ATWATER = [
  n(1003, '203', 'Protein', 'G', 3.2),
  n(1004, '204', 'Total lipid (fat)', 'G', 3.5),
  n(1005, '205', 'Carbohydrate, by difference', 'G', 4.9),
  n(2047, '957', 'Energy (Atwater General Factors)', 'KCAL', 62),
  n(2048, '958', 'Energy (Atwater Specific Factors)', 'KCAL', 60),
];

export const KJ_ONLY = [
  n(1003, '203', 'Protein', 'G', 10),
  n(1004, '204', 'Total lipid (fat)', 'G', 5),
  n(1005, '205', 'Carbohydrate, by difference', 'G', 20),
  n(1062, '268', 'Energy', 'kJ', 418.4),
];

/** The /food/{id} detail shape nests the nutrient. */
export const DETAIL_SHAPE = [
  { nutrient: { id: 1003, number: '203', name: 'Protein', unitName: 'g' }, amount: 22.5 },
  { nutrient: { id: 1004, number: '204', name: 'Total lipid (fat)', unitName: 'g' }, amount: 2.6 },
  { nutrient: { id: 1005, number: '205', name: 'Carbohydrate, by difference', unitName: 'g' }, amount: 0 },
  { nutrient: { id: 1008, number: '208', name: 'Energy', unitName: 'kcal' }, amount: 120 },
];
