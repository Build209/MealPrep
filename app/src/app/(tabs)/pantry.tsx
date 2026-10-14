import { PantryScreen } from '../../pantry/PantryScreen';

/**
 * The Pantry tab. The screen lives in src/pantry/. The Scan entry point plugs into
 * PantryScreen's `headerActions` and `emptyActions` slots (rebuild phase 1, helper B).
 */
export default function PantryRoute() {
  return <PantryScreen />;
}
