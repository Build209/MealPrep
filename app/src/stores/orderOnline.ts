/**
 * The "Order online" section on the Stores page: three plain links, one per service, each opening
 * that service's online ordering area (new tab on the web, the browser on a phone).
 *
 * Compliance rule 5 (claude/MealPlanatic compliance.md): the other company's name only says what a
 * link does ("Order from DoorDash"). No logos or brand colours, never "partner", never "free
 * delivery", no savings figures. No agreement, API, affiliate tag or earnings with any of them; affiliate
 * tags are to be added only after agreements are in place.
 *
 * NOT VERIFIED: these sites refuse automated checks, so no URL here has been opened by a program.
 * DoorDash points at its home page: its grocery page (/convenience/) could not be confirmed.
 */
export type OrderOnlineService = { id: 'doordash' | 'instacart' | 'walmart'; name: string; label: string; url: string; testID: string };

export const ORDER_ONLINE_SERVICES: readonly OrderOnlineService[] = [
  { id: 'doordash', name: 'DoorDash', label: 'Order from DoorDash', url: 'https://www.doordash.com/', testID: 'order-online-doordash' },
  { id: 'instacart', name: 'Instacart', label: 'Order from Instacart', url: 'https://www.instacart.com/', testID: 'order-online-instacart' },
  { id: 'walmart', name: 'Walmart', label: 'Order from Walmart', url: 'https://www.walmart.com/cp/grocery/976759', testID: 'order-online-walmart' },
];
