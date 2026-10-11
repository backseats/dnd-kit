import type {ClientRect} from '../../types';

/**
 * Numeric comparison of two rects, used instead of serializing them.
 * Reads `top`, `left`, `width`, `height`, `bottom` and `right` (which, for a
 * `Rect`, already include the scroll adjustment).
 */
export function areRectsEqual(
  a: ClientRect | null,
  b: ClientRect | null
): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height &&
    a.bottom === b.bottom &&
    a.right === b.right
  );
}
