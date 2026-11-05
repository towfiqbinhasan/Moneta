import confetti from 'canvas-confetti';

/** Milestone celebration; bigger burst at 100%. */
export function celebrate(milestone: number) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const big = milestone >= 100;
  confetti({ particleCount: big ? 220 : 90, spread: big ? 110 : 70, origin: { y: 0.7 }, disableForReducedMotion: true });
  if (big) setTimeout(() => confetti({ particleCount: 140, angle: 60, spread: 70, origin: { x: 0 } }), 250);
  if (big) setTimeout(() => confetti({ particleCount: 140, angle: 120, spread: 70, origin: { x: 1 } }), 400);
}

export const MILESTONES = [25, 50, 75, 100];
