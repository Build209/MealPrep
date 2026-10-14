import type { Href } from 'expo-router';

/** The recipe detail page (helper F's src/app/recipe/[id].tsx): ids are r_<uuid> or l_<uuid>. */
export function recipeHref(routeId: string): Href {
  return `/recipe/${encodeURIComponent(routeId)}` as Href;
}
