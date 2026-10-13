// The data layer's public surface. Screens import from '../data' (or '@/data' once an alias exists).
export { DataError, messages, type DataErrorKind } from './errors';
export { keys, mutationKeys } from './keys';
export { OFFLINE_MESSAGE, useIsOnline } from './online';
export { usePantryItems, useUpdatePantryQuantity, type UpdatePantryQuantityVars } from './pantry';
export { useProfile } from './profile';
export { hasPaidAccess, type PantryItem, type Profile } from './rows';
export { useSessionUserId } from './session';
