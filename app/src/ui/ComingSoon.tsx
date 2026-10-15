import { AppText } from './AppText';
import { Card } from './Card';

/** Placeholder card for a tab whose phase is not built yet. Plain and honest. */
export function ComingSoon({ phase, what }: { phase: number; what: string }) {
  return (
    <Card>
      <AppText variant="label" color="muted">
        {`REBUILD PHASE ${phase}`}
      </AppText>
      <AppText>{what}</AppText>
    </Card>
  );
}
