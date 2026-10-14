import { useEffect, useState } from 'react';

/** `value`, but only after it has stopped changing for `ms` (so search waits for a pause in typing). */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
