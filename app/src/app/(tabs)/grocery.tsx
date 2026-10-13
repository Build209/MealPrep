import { ComingSoon } from '../../ui/ComingSoon';
import { Screen } from '../../ui/Screen';

export default function GroceryScreen() {
  return (
    <Screen title="Grocery">
      <ComingSoon phase={2} what="Your list. Tick an item and it moves into the pantry, with undo." />
    </Screen>
  );
}
