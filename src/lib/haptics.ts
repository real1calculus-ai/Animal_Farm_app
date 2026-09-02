/**
 * Thin wrapper around the Vibration API. iOS Safari has never implemented
 * it (Apple hasn't shipped it), so this silently no-ops there — it only
 * produces real feedback on Android Chrome. Treat it as a bonus for
 * Android staff, not a feedback channel every user gets.
 */
function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(pattern);
}

export const haptics = {
  success: () => vibrate(15),
  error: () => vibrate([15, 60, 15]),
};
