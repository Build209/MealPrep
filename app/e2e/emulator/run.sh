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

# Read the list first: `grep -q` closing the pipe early fails the whole pipe under pipefail.
has_chrome() { local pkgs; pkgs="$(adb shell pm list packages | tr -d '\r')"; grep -qx 'package:com.android.chrome' <<< "$pkgs"; }
if ! has_chrome; then
  # Some images carry Chrome but do not install it for the user: try that before giving up.
  adb shell cmd package install-existing com.android.chrome || true
fi
if ! has_chrome; then
  echo "Image: $(adb shell getprop ro.build.fingerprint | tr -d '\r')"
  echo "Browser-like packages (all users, incl. uninstalled):"
  adb shell pm list packages -u | tr -d '\r' | grep -iE 'chrome|webview|browser|chromium' || echo "(none)"
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
  if grep -q chrome_devtools_remote <<< "$(adb shell cat /proc/net/unix)"; then break; fi
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

screen_size() {
  local cur
  cur="$(adb shell dumpsys window displays | tr -d '\r' | grep -m1 -oE 'cur=[0-9]+x[0-9]+' | cut -d= -f2)"
  if [ -n "$cur" ]; then echo "$cur"; return; fi
  adb shell wm size | tr -d '\r' | awk -F': ' '/Override size/ {o=$2} /Physical size/ {p=$2} END {print (o != "" ? o : p)}'
}

set_posture() {
  case "$1" in
    portrait | landscape)
      adb shell settings put system accelerometer_rotation 0
      adb shell settings put system user_rotation "$([ "$1" = landscape ] && echo 1 || echo 0)"
      ;;
    folded | unfolded)
      # Foldables: try each way to move the hinge until the screen size actually changes.
      # The emulator's states are 1 CLOSED, 2 HALF_OPENED, 3 OPENED (print-states, 2026-10-15 run).
      # (First run: `adb emu fold` returned OK but the tour still saw the 1769px inner screen.)
      local before after
      before="$(screen_size)"
      if [ "$1" = folded ]; then
        try_cmds=("adb shell cmd device_state state 1" "adb emu fold" "adb emu posture 1")
      else
        try_cmds=("adb shell cmd device_state state 3" "adb emu unfold" "adb emu posture 3")
      fi
      adb shell cmd device_state print-states || true
      for c in "${try_cmds[@]}"; do
        echo "posture $1: $c"
        $c || true
        sleep 4
        after="$(screen_size)"
        echo "  screen: $before -> $after"
        if [ "$after" != "$before" ]; then break; fi
      done
      if [ "$after" = "$before" ]; then
        echo "::warning title=Android emulator::Posture '$1' did not change the screen size on $DEVICE ($after). Screens are labelled with the real size."
      fi
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
  # Label with the posture asked for and the screen size actually in use, so a fold that did
  # not happen can never pass for a folded screen.
  label="emulator-${DEVICE//_/-}-${posture}-$(screen_size | tr 'x' 'x')"
  # Fresh Chrome for each posture, so one posture's trouble never carries into the next.
  adb shell am force-stop com.android.chrome
  adb shell am start -a android.intent.action.VIEW -d about:blank com.android.chrome >/dev/null
  sleep 5
  adb forward tcp:9222 localabstract:chrome_devtools_remote
  echo "== Tour: $label"
  if EMULATOR_LABEL="$label" npx playwright test -c playwright.emulator.config.ts; then
    echo "$label passed" >> "$RESULT_FILE"
  else
    echo "$label FAILED" >> "$RESULT_FILE"
    # Why Chrome went away, if it did (crash or low memory).
    adb logcat -d -b crash | tail -40 || true
    adb shell dumpsys meminfo | grep -iE 'Total RAM|Free RAM|chrome' | head -10 || true
  fi
done
cat "$RESULT_FILE"
