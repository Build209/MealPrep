import { PantryScreen } from '../../pantry/PantryScreen';
import { ScanButton } from '../../scan';

/**
 * The Pantry tab. The screen lives in src/pantry/; the Scan button (with this month's allowance)
 * sits next to "Add item" in the header and in the empty state.
 */
export default function PantryRoute() {
  return <PantryScreen headerActions={<ScanButton style={{ flexGrow: 1 }} />} emptyActions={<ScanButton />} />;
}
