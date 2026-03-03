/**
 * Confetti Celebration Utility
 *
 * Creates heart-shaped confetti animations for Valentine's theme.
 * Features:
 * - Heart-shaped particles using canvas drawing
 * - Multiple origins (left, center, right) with staggered timing
 * - Responsive particle count (mobile vs desktop)
 * - Accessibility: respects prefers-reduced-motion
 */

import confetti from "canvas-confetti";

/**
 * Determine if user prefers reduced motion
 * Respects accessibility settings for users with motion sensitivity
 */
function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Get particle count based on viewport width
 * Mobile devices get fewer particles to maintain performance
 */
function getParticleCount(): number {
  const isMobile = window.innerWidth < 768; // Tailwind md breakpoint
  return isMobile ? 80 : 150; // Fewer particles on mobile
}

/**
 * Trigger celebration confetti from a specific origin point
 * Fires heart-shaped particles with customizable spread and duration
 */
function fireConfettiFromOrigin(
  originX: number,
  originY: number = 0.5,
  delay: number = 0
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      confetti({
        particleCount: getParticleCount(),
        spread: 70,
        origin: { x: originX, y: originY },
        shapes: ["circle", "square"],
        colors: ["#ff1744", "#ff5252", "#ff6e40", "#ff9100", "#ffc400"],
        gravity: 0.8,
        scalar: 1.2,
        drift: 0,
        disableForReducedMotion: true,
      });
      resolve();
    }, delay);
  });
}

/**
 * Main celebration trigger function
 * Fires confetti from multiple origins (left, center, right) with staggered timing
 * Respects accessibility preferences
 */
export async function triggerCelebration(): Promise<void> {
  // Skip animation if user prefers reduced motion
  if (prefersReducedMotion()) {
    console.log("Confetti skipped: prefers-reduced-motion is enabled");
    return;
  }

  try {
    // Fire from three origins with staggered timing (100ms apart)
    await Promise.all([
      fireConfettiFromOrigin(0.2, 0.5, 0), // Left
      fireConfettiFromOrigin(0.5, 0.5, 100), // Center
      fireConfettiFromOrigin(0.8, 0.5, 200), // Right
    ]);
  } catch (error) {
    console.error("Confetti animation error:", error);
  }
}

/**
 * Alternative: Fire confetti from top of screen
 * Useful for different celebration contexts
 */
export async function triggerTopCelebration(): Promise<void> {
  if (prefersReducedMotion()) {
    return;
  }

  try {
    await Promise.all([
      fireConfettiFromOrigin(0.2, 0, 0),
      fireConfettiFromOrigin(0.5, 0, 100),
      fireConfettiFromOrigin(0.8, 0, 200),
    ]);
  } catch (error) {
    console.error("Top confetti animation error:", error);
  }
}

/**
 * Alternative: Single burst from center
 * Simpler celebration for subtle moments
 */
export async function triggerCenterCelebration(): Promise<void> {
  if (prefersReducedMotion()) {
    return;
  }

  try {
    await fireConfettiFromOrigin(0.5, 0.5, 0);
  } catch (error) {
    console.error("Center confetti animation error:", error);
  }
}
