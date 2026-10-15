// Copied from the old app's mobile/test-fixtures/live-recipes.json (master recipes read from live).
// Used by tests/kitchen-recipe-match.test.ts, as in mobile/scripts/recipe-match-regression.ts.
export type FixtureRecipe = {
  slug: string;
  name: string;
  ingredients: { name: string; unit: string; quantity: number; ingredientId: string; notes?: string }[];
};

export const LIVE_RECIPES: FixtureRecipe[] = [
  {
    "slug": "brisket",
    "name": "Smoked Lean Brisket & Sweet Potato",
    "ingredients": [
      {
        "name": "Smoked brisket",
        "unit": "oz",
        "quantity": 24,
        "ingredientId": "brisket-meat"
      },
      {
        "name": "Sweet potato",
        "unit": "each",
        "quantity": 2,
        "ingredientId": "sweet-potato"
      },
      {
        "name": "Green beans",
        "unit": "oz",
        "quantity": 12,
        "ingredientId": "green-beans"
      }
    ]
  },
  {
    "slug": "korean-beef",
    "name": "Korean BBQ Beef",
    "ingredients": [
      {
        "name": "Marinated smoked beef",
        "unit": "oz",
        "quantity": 24,
        "ingredientId": "korean-beef"
      },
      {
        "name": "Steamed rice",
        "unit": "cups",
        "quantity": 2,
        "ingredientId": "jasmine-rice"
      },
      {
        "name": "Sesame broccoli",
        "unit": "oz",
        "quantity": 16,
        "ingredientId": "broccoli"
      },
      {
        "name": "Gochujang glaze",
        "unit": "oz",
        "quantity": 4,
        "ingredientId": "gochujang"
      }
    ]
  },
  {
    "slug": "lemon-chicken",
    "name": "Grilled Lemon Herb Chicken",
    "ingredients": [
      {
        "name": "Chicken breast",
        "unit": "oz",
        "quantity": 24,
        "ingredientId": "chicken-breast"
      },
      {
        "name": "Jasmine rice",
        "unit": "cups",
        "quantity": 2,
        "ingredientId": "jasmine-rice"
      },
      {
        "name": "Broccoli",
        "unit": "oz",
        "quantity": 16,
        "ingredientId": "broccoli"
      }
    ]
  },
  {
    "slug": "pulled-pork",
    "name": "Pulled Pork Bowl",
    "ingredients": [
      {
        "name": "Pulled pork",
        "unit": "oz",
        "quantity": 20,
        "ingredientId": "pulled-pork"
      },
      {
        "name": "Cauliflower rice",
        "unit": "cups",
        "quantity": 4,
        "ingredientId": "cauliflower-rice"
      },
      {
        "name": "Limes",
        "unit": "each",
        "quantity": 2,
        "ingredientId": "lime"
      }
    ]
  },
  {
    "slug": "smash-burger",
    "name": "Smash Burger Bowl",
    "ingredients": [
      {
        "name": "Seasoned beef",
        "unit": "oz",
        "quantity": 24,
        "ingredientId": "ground-beef"
      },
      {
        "name": "Roasted potatoes",
        "unit": "oz",
        "quantity": 20,
        "ingredientId": "roasted-potatoes"
      },
      {
        "name": "Pickle slaw",
        "unit": "oz",
        "quantity": 12,
        "ingredientId": "pickle-slaw"
      },
      {
        "name": "Special sauce",
        "unit": "oz",
        "quantity": 6,
        "ingredientId": "special-sauce"
      }
    ]
  },
  {
    "slug": "turkey-rice",
    "name": "Smoked Turkey & Wild Rice",
    "ingredients": [
      {
        "name": "Smoked turkey breast",
        "unit": "oz",
        "quantity": 24,
        "ingredientId": "turkey-breast"
      },
      {
        "name": "Wild rice blend",
        "unit": "cups",
        "quantity": 2,
        "ingredientId": "wild-rice"
      },
      {
        "name": "Carrots",
        "unit": "oz",
        "quantity": 12,
        "ingredientId": "carrots"
      },
      {
        "name": "Light herb gravy",
        "unit": "oz",
        "quantity": 8,
        "ingredientId": "herb-gravy"
      }
    ]
  },
  {
    "slug": "chipotle-shrimp",
    "name": "Chipotle Lime Shrimp",
    "ingredients": [
      {
        "name": "Shrimp",
        "unit": "oz",
        "quantity": 20,
        "ingredientId": "shrimp"
      },
      {
        "name": "Cilantro rice",
        "unit": "cups",
        "quantity": 2,
        "ingredientId": "cilantro-rice"
      },
      {
        "name": "Black beans",
        "unit": "cups",
        "quantity": 2,
        "ingredientId": "black-beans"
      },
      {
        "name": "Grilled corn",
        "unit": "cups",
        "quantity": 2,
        "ingredientId": "corn"
      },
      {
        "name": "Avocado salsa",
        "unit": "oz",
        "quantity": 12,
        "ingredientId": "avocado-salsa"
      }
    ]
  },
  {
    "slug": "recipeapi-10879",
    "name": "Abalone and Chicken Congee",
    "ingredients": [
      {
        "name": "Salt",
        "unit": "tsp",
        "notes": "condiment",
        "quantity": 1,
        "ingredientId": "recipeapi-ing-6"
      },
      {
        "name": "Water",
        "unit": "ml",
        "notes": "other",
        "quantity": 2000,
        "ingredientId": "recipeapi-ing-80"
      },
      {
        "name": "Scallion",
        "unit": "bunch",
        "notes": "herb",
        "quantity": 1,
        "ingredientId": "recipeapi-ing-111"
      },
      {
        "name": "Chicken",
        "unit": "g",
        "notes": "poultry",
        "quantity": 500,
        "ingredientId": "recipeapi-ing-125"
      },
      {
        "name": "Coriander",
        "unit": "bunch",
        "notes": "herb",
        "quantity": 1,
        "ingredientId": "recipeapi-ing-155"
      },
      {
        "name": "Rice",
        "unit": "g",
        "notes": "grain",
        "quantity": 150,
        "ingredientId": "recipeapi-ing-239"
      },
      {
        "name": "Ginger",
        "unit": "g",
        "notes": "spice",
        "quantity": 20,
        "ingredientId": "recipeapi-ing-302"
      },
      {
        "name": "White pepper",
        "unit": "tsp",
        "notes": "condiment",
        "quantity": 1,
        "ingredientId": "recipeapi-ing-407"
      },
      {
        "name": "Abalone",
        "unit": "g",
        "notes": "seafood",
        "quantity": 150,
        "ingredientId": "recipeapi-ing-2429"
      }
    ]
  },
  {
    "slug": "herb-salmon",
    "name": "Herb Salmon & Asparagus",
    "ingredients": [
      {
        "name": "Salmon fillet",
        "unit": "oz",
        "quantity": 24,
        "ingredientId": "salmon"
      },
      {
        "name": "Asparagus",
        "unit": "oz",
        "quantity": 16,
        "ingredientId": "asparagus"
      },
      {
        "name": "Lemon quinoa",
        "unit": "cups",
        "quantity": 2,
        "ingredientId": "quinoa"
      },
      {
        "name": "Dill yogurt sauce",
        "unit": "oz",
        "quantity": 8,
        "ingredientId": "dill-yogurt"
      }
    ]
  },
  {
    "slug": "steak-tips",
    "name": "Steak Tips & Garlic Potatoes",
    "ingredients": [
      {
        "name": "Smoked sirloin tips",
        "unit": "oz",
        "quantity": 24,
        "ingredientId": "sirloin-tips"
      },
      {
        "name": "Roasted garlic potatoes",
        "unit": "oz",
        "quantity": 24,
        "ingredientId": "garlic-potatoes"
      },
      {
        "name": "Green beans",
        "unit": "oz",
        "quantity": 12,
        "ingredientId": "green-beans"
      },
      {
        "name": "Peppercorn jus",
        "unit": "oz",
        "quantity": 6,
        "ingredientId": "peppercorn-jus"
      }
    ]
  },
  {
    "slug": "buffalo-chicken",
    "name": "Buffalo Chicken Bowl",
    "ingredients": [
      {
        "name": "Grilled chicken",
        "unit": "oz",
        "quantity": 24,
        "ingredientId": "chicken-breast"
      },
      {
        "name": "Buffalo sauce",
        "unit": "oz",
        "quantity": 6,
        "ingredientId": "buffalo-sauce"
      },
      {
        "name": "Rice",
        "unit": "cups",
        "quantity": 2,
        "ingredientId": "jasmine-rice"
      },
      {
        "name": "Celery slaw",
        "unit": "oz",
        "quantity": 12,
        "ingredientId": "celery-slaw"
      },
      {
        "name": "Ranch drizzle",
        "unit": "oz",
        "quantity": 4,
        "ingredientId": "ranch"
      }
    ]
  },
  {
    "slug": "carnitas",
    "name": "Carnitas Street Bowl",
    "ingredients": [
      {
        "name": "Smoked carnitas",
        "unit": "oz",
        "quantity": 22,
        "ingredientId": "carnitas"
      },
      {
        "name": "Cilantro-lime rice",
        "unit": "cups",
        "quantity": 2,
        "ingredientId": "cilantro-rice"
      },
      {
        "name": "Pico de gallo",
        "unit": "oz",
        "quantity": 12,
        "ingredientId": "pico"
      },
      {
        "name": "Pickled onions",
        "unit": "oz",
        "quantity": 6,
        "ingredientId": "pickled-onions"
      }
    ]
  },
  {
    "slug": "veggie-power",
    "name": "Roasted Veggie Power Bowl",
    "ingredients": [
      {
        "name": "Smoked chickpeas",
        "unit": "oz",
        "quantity": 16,
        "ingredientId": "chickpeas"
      },
      {
        "name": "Quinoa",
        "unit": "cups",
        "quantity": 2,
        "ingredientId": "quinoa"
      },
      {
        "name": "Roasted squash",
        "unit": "oz",
        "quantity": 16,
        "ingredientId": "squash"
      },
      {
        "name": "Kale",
        "unit": "oz",
        "quantity": 12,
        "ingredientId": "kale"
      },
      {
        "name": "Tahini lemon dressing",
        "unit": "oz",
        "quantity": 6,
        "ingredientId": "tahini-lemon"
      }
    ]
  }
];
