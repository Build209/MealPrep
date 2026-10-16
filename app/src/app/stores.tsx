import { Redirect } from 'expo-router';

/**
 * /stores: Stores joined the Grocery tab (owner, 2026-10-15). Old links, the /smart-shop and
 * /app/stores redirect stubs (scripts/build-site.sh) and bookmarks land on its Stores view.
 */
export default function StoresRedirect() {
  return <Redirect href="/grocery?view=stores" />;
}
