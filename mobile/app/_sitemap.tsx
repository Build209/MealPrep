import { Redirect } from 'expo-router';
import { APP_ROUTES } from '../config/appRoutes';

/**
 * Replaces the router's built-in /_sitemap page, a developer screen that listed the app's
 * source files and framework version to anyone who opened the address.
 */
export default function SitemapRedirect() {
  return <Redirect href={APP_ROUTES.home} />;
}
