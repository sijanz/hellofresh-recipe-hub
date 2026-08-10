/**
 * Recipe filtering utility for HelloFresh recipes.
 * Filters out recipes containing land meat (beef, pork, poultry, etc.)
 * while allowing vegetarian, vegan, and pescatarian (fish & seafood) recipes.
 */

// Land meat ingredient families returned by HelloFresh API
const PROHIBITED_FAMILIES = new Set([
  "beef",
  "chicken",
  "pork",
  "meat",
  "poultry",
  "lamb",
  "turkey",
  "duck",
  "veal",
  "game",
]);

// Meat keywords across EN, DE, FR locales
const PROHIBITED_KEYWORDS = [
  // English
  "chicken", "beef", "pork", "turkey", "bacon", "sausage", "steak",
  "prosciutto", "pancetta", "ham", "duck", "lamb", "veal", "venison",
  "salami", "chorizo", "meatball", "meatloaf", "pepperoni", "lardons",
  "bolognese", "mortadella", "ragu", "ragù", "pastrami", "ribs", "sirloin",
  "tenderloin", "brisket", "proscuitto",
  // German
  "hähnchen", "haehnchen", "rind", "rinder", "schwein", "schweine", "speck",
  "wurst", "würstchen", "pute", "puten", "hackfleisch", "ente", "lamm",
  "geflügel", "gefluegel", "schinken", "filetstreifen", "geschnetzeltes",
  // French
  "poulet", "boeuf", "bœuf", "porc", "lardon", "lardons", "saucisse",
  "jambon", "canard", "agneau", "veau", "dinde", "mortadelle", "bolognaise"
];

// Compile regex for exact word boundary match for each prohibited keyword
const PROHIBITED_REGEXES = PROHIBITED_KEYWORDS.map(
  (kw) => new RegExp(`\\b${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i")
);

// Keywords indicating plant-based or vegetarian substitutes
const PLANT_BASED_KEYWORDS = [
  "plant-based", "plant based", "veggie", "vegetarian", "vegan",
  "meatless", "beyond", "impossible", "pflanzlich", "vegetarisch",
  "végétarien", "veggie-bacon", "vegan-bacon", "veggie-hack", "pilz-ragù",
  "pilz-ragu", "mushroom ragu", "mushroom ragù"
];

/**
 * Helper to check if a string contains any prohibited meat terms
 * without being qualified as a plant-based alternative.
 */
function containsLandMeat(text) {
  if (!text) return false;
  const lower = text.toLowerCase();

  for (const regex of PROHIBITED_REGEXES) {
    if (regex.test(lower)) {
      // Check if it's explicitly marked as plant-based
      const isPlantBased = PLANT_BASED_KEYWORDS.some((pb) => lower.includes(pb));
      if (!isPlantBased) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Determines whether a recipe is free of land meat (allows vegetarian, vegan, fish & seafood).
 * @param {Object} recipe - HelloFresh recipe object from API search.
 * @returns {boolean} True if recipe contains no land meat.
 */
function isMeatFree(recipe) {
  if (!recipe) return false;

  // 1. Check Recipe Title & Headline
  if (containsLandMeat(recipe.name) || containsLandMeat(recipe.headline)) {
    return false;
  }

  // 2. Check Ingredients
  if (Array.isArray(recipe.ingredients)) {
    for (const ing of recipe.ingredients) {
      const ingName = ing.name || "";
      const familySlug = (ing.family && ing.family.slug ? ing.family.slug : "").toLowerCase();

      // Check prohibited ingredient family
      if (PROHIBITED_FAMILIES.has(familySlug)) {
        const isPlantBased = PLANT_BASED_KEYWORDS.some((pb) => ingName.toLowerCase().includes(pb));
        if (!isPlantBased) {
          return false;
        }
      }

      // Check ingredient name
      if (containsLandMeat(ingName)) {
        return false;
      }
    }
  }

  return true;
}

module.exports = {
  isMeatFree,
  PROHIBITED_FAMILIES,
  PROHIBITED_KEYWORDS,
  PLANT_BASED_KEYWORDS,
};
