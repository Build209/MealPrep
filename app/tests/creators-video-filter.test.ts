/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isLowQualityFeedVideo, isRecipeLikeVideo } from '../src/creators/videoFilter';

// The old app's checks (now supabase/scripts/creator-video-filter-check.ts), unchanged.

const JUNK_TITLES = [
  'I Tried 100 Years of Spicy Challenges',
  'Does a Higher Price Mean a Better Blender?',
  'Our Top Knives Cost Less Than $50',
  "I'm taking a break my friends",
  'Thank you to our 3 million subscribers!',
  'Beat Bobby Flay Full Episode Recap',
  '14 Air Fryer Hacks You Need to Know',
  'I Ranked EVERY Food at Costco',
  '$1 vs $100,000 Hotel Food',
  'Why I Started Growing My Own Cigars',
  'Mystery Cooking Challenge',
  'USA vs Turkey Food',
  'I Cooked YouTubers Their Last Meals',
  '$20 vs $200 vs $300 Steak',
  'Shawarma Vs. Picanha Cooking Challenge',
  "Jackass vs. the World's Hottest Peppers",
  'We Put an Air Fryer Through 7 Cooking Challenges | Gear Heads',
  '8 Budget Kitchen Tools That Rival High-End Ones | Gear Heads',
  'The 9 Kitchen Tools Serious Home Cooks MUST Have',
  'This Robot Cooking Gadget Cooks EVERYTHING',
  'Butcher Explains Which Ground Beef to Buy',
  '8 Levels of Tasters Rate Mac and Cheese',
  'LIVE: Food Network Chefs Cozy Fall Recipes',
  "Scott's takes on controversial cooking question",
  "What Does 'Confit' Mean?",
  'How to Pick a Ripe Mango',
  "Answering the Internet's Most Asked Chicken Questions",
  'The Easiest Way to Peel Potatoes',
  'I tested viral TikTok recipes — do they actually work?',
];

const KEEP_TITLES = [
  'Better Than Beef Bolognese!',
  'Easy Sheet Pan Chicken with Caramelized Vegetables',
  "Chef John's Perfect One Egg Shakshuka",
  '8 Tasty 3-Ingredient Recipes | Cheap Meals',
  '$25 Grocery Challenge | 7 Cheap Dinners',
  'Budget Turkey and Pork Ragù',
  "The Best Steak Tacos You'll Ever Make",
  'Orange Chicken - Chicken Tenders',
  'One $5 Chicken. Seven Days of Meals.',
  'I Fed My Family for $25 This Week',
  'The $1 Meal I Make With 1 Potato',
  'No Ice Cream Machine Needed Vanilla Ice Cream',
  'Best Steak Tacos',
  'For More Tender Fish, Poach in Oil',
  'Weeknight Chicken Bolognese',
  'Cheeseburger Meat Pie',
  'The Perfect Chocolate Cake Recipe',
  'Restaurant-Quality Lasagna on a Budget',
  'Croque Monsieur',
  '5 Lazy Back-to-School Dinners',
  'Easy one pan dinner',
  '15 Freezer Dinners for $75',
  'Aglio e Olio',
  'The $8 Pork Roast',
];

test('non-recipe titles are dropped', () => {
  for (const title of JUNK_TITLES) assert.equal(isRecipeLikeVideo(title, ''), false, `expected junk: ${title}`);
});

test('recipe titles are kept', () => {
  for (const title of KEEP_TITLES) assert.equal(isRecipeLikeVideo(title, ''), true, `expected keep: ${title}`);
});

test('descriptions: an ingredient list qualifies; boilerplate and merch links do not exclude', () => {
  assert.equal(isRecipeLikeVideo('Tuesday Night Dinner', 'Ingredients\n2 cups flour\n1 tbsp salt'), true);
  assert.equal(isRecipeLikeVideo('Easy Chicken Dinner', 'Thanks for watching! We now have 5 million subscribers on this channel.'), true);
  assert.equal(isRecipeLikeVideo('Sunday Pot Roast Recipe', 'Merch: https://example.com/shop?utm_content=merch-shop-promo'), true);
});

test('feed rule: junk is low quality, recipes are not; a Short needs a dish', () => {
  assert.equal(isLowQualityFeedVideo('14 Air Fryer Hacks You Need to Know', ''), true);
  assert.equal(isLowQualityFeedVideo('Weeknight Chicken Bolognese', ''), false);
  assert.equal(isLowQualityFeedVideo('Wait for it', '', { isShort: true }), true);
  assert.equal(isLowQualityFeedVideo('Wait for it', '', { isShort: false }), false);
  assert.equal(isLowQualityFeedVideo('Crispy potatoes', '', { isShort: true }), false);
  assert.equal(isLowQualityFeedVideo('', ''), true);
});

// The old app's manual hide list: the title rule should catch most of what was hidden by hand
// (the new app can't read the hide list itself). The list lives with the creator-videos function.
const fixture = path.join(__dirname, '..', '..', 'supabase', 'functions', 'creator-videos', 'fixtures', 'manual-hide-videos.json');
test('catches at least 85% of the old manual hides', () => {
  const hides = JSON.parse(fs.readFileSync(fixture, 'utf8')) as { title: string }[];
  assert.ok(hides.length >= 200);
  const caught = hides.filter((row) => !isRecipeLikeVideo(row.title, '')).length;
  assert.ok(caught / hides.length >= 0.85, `caught ${caught} of ${hides.length}`);
});
