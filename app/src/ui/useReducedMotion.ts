import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True when the person asked for less motion (iOS/Android setting; prefers-reduced-motion on the web,
 * which react-native-web reads). Screen transitions are skipped then.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (live) setReduced(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value: boolean) => setReduced(value));
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}
