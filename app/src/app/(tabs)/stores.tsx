import { ComingSoon } from '../../ui/ComingSoon';
import { Screen } from '../../ui/Screen';

export default function StoresScreen() {
  return (
    <Screen title="Stores">
      <ComingSoon phase={5} what="Stores near you and their weekly ads." />
    </Screen>
  );
}
