#!/usr/bin/env bash
# Runs the phone tour in the real Chrome app on a booted Android emulator, once per posture.
# Called from app/ by .github/workflows/app-android-emulator.yml (inside android-emulator-runner).
#
#   DEVICE=pixel_fold POSTURES="folded unfolded" bash e2e/emulator/run.sh
#
# Postures: portrait, landscape (rotation), folded, unfolded (foldables).
# Exit code: non-zero only when the emulator or Chrome could not be set up. Test failures are
# written to $EMULATOR_RESULT (report-only for now, like the iPhone pass) so the workflow can flag them.
set -euo pipefail

DEVICE="${DEVICE:?set DEVICE}"
POSTURES="${POSTURES:-portrait}"
RESULT_FILE="${EMULATOR_RESULT:-emulator-result.txt}"
APP_PORT="${E2E_PORT:-4173}"
API_PORT="$(echo "${E2E_SUPABASE_URL:?set E2E_SUPABASE_URL}" | sed -E 's#^https?://[^:/]+:([0-9]+).*#\1#')"

echo "== Emulator: $(adb shell getprop ro.product.model | tr -d '\r'), Android $(adb shell getprop ro.build.version.release | tr -d '\r')"
adb shell wm size

if ! adb shell pm list packages | tr -d '\r' | grep -qx 'package:com.android.chrome'; then
  echo "::error title=Android emulator::Chrome is not installed on this emulator image."
  exit 2
fi

# Keep the screen awake (Playwright's Android notes), and start Chrome fresh so it reads the flags.
adb shell svc power stayon true
adb shell am force-stop com.android.chrome

# Skip Chrome's first-run screens: Chrome reads this flags file when it is set as the debug app.
adb shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run --disable-features=SigninPromo,PrivacySandboxSettings4" > /data/local/tmp/chrome-command-line'
adb shell am set-debug-app --persistent com.android.chrome

# The emulator's 127.0.0.1:<port> becomes this machine's: same addresses as the desktop tests.
adb reverse "tcp:${APP_PORT}" "tcp:${APP_PORT}"
adb reverse "tcp:${API_PORT}" "tcp:${API_PORT}"

adb shell am start -a android.intent.action.VIEW -d about:blank com.android.chrome >/dev/null
for _ in $(seq 1 60); do
  if adb shell cat /proc/net/unix | grep -q chrome_devtools_remote; then break; fi
  sleep 2
done
adb forward tcp:9222 localabstract:chrome_devtools_remote
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:9222/json/version >/dev/null; then break; fi
  sleep 2
done
if ! curl -sf http://127.0.0.1:9222/json/version; then
  echo "::error title=Android emulator::Could not reach Chrome's DevTools on the emulator."
  exit 2
fi
echo
export EMULATOR_CDP_URL=http://127.0.0.1:9222

set_posture() {
  case "$1" in
    portrait | landscape)
      adb shell settings put system accelerometer_rotation 0
      adb shell settings put system user_rotation "$([ "$1" = landscape ] && echo 1 || echo 0)"
      ;;
    folded | unfolded)
      # Foldables: the emulator console moves the hinge itself; Android's device-state service as fallback.
      adb shell cmd device_state print-states || true
      if [ "$1" = folded ]; then
        adb emu fold || adb shell cmd device_state state 0
      else
        adb emu unfold || adb shell cmd device_state state reset
      fi
      adb shell cmd device_state print-state || true
      ;;
    *)
      echo "::error::Unknown posture $1"
      exit 2
      ;;
  esac
  sleep 4
  adb shell dumpsys window displays | grep -m2 -E 'cur=|init=' || true
}

: > "$RESULT_FILE"
for posture in $POSTURES; do
  set_posture "$posture"
  label="emulator-${DEVICE//_/-}-${posture}"
  echo "== Tour: $label"
  if EMULATOR_LABEL="$label" npx playwright test -c playwright.emulator.config.ts; then
    echo "$label passed" >> "$RESULT_FILE"
  else
    echo "$label FAILED" >> "$RESULT_FILE"
  fi
done
cat "$RESULT_FILE"
