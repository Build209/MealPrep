import { ComingSoon } from '../../ui/ComingSoon';
import { Screen } from '../../ui/Screen';

export default function PantryScreen() {
  return (
    <Screen title="Pantry">
      <ComingSoon phase={1} what="Your shelves, photo scan and receipt scan." />
    </Screen>
  );
}
