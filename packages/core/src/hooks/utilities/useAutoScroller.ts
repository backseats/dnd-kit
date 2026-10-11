import {useCallback, useEffect, useMemo, useRef} from 'react';
import {useInterval, useLazyMemo, usePrevious} from '@dnd-kit/utilities';

import {getScrollDirectionAndSpeed} from '../../utilities';
import {Direction} from '../../types';
import type {Coordinates, ClientRect} from '../../types';

export type ScrollAncestorSortingFn = (ancestors: Element[]) => Element[];

export enum AutoScrollActivator {
  Pointer,
  DraggableRect,
}

export interface Options {
  acceleration?: number;
  activator?: AutoScrollActivator;
  canScroll?: CanScroll;
  enabled?: boolean;
  interval?: number;
  layoutShiftCompensation?:
    | boolean
    | {
        x: boolean;
        y: boolean;
      };
  order?: TraversalOrder;
  threshold?: {
    x: number;
    y: number;
  };
}

interface Arguments extends Options {
  draggingRect: ClientRect | null;
  enabled: boolean;
  pointerCoordinates: Coordinates | null;
  scrollableAncestors: Element[];
  scrollableAncestorRects: ClientRect[];
  delta: Coordinates;
}

export type CanScroll = (element: Element) => boolean;

export enum TraversalOrder {
  TreeOrder,
  ReversedTreeOrder,
}

interface ScrollDirection {
  x: 0 | Direction;
  y: 0 | Direction;
}

export function useAutoScroller({
  acceleration,
  activator = AutoScrollActivator.Pointer,
  canScroll,
  draggingRect,
  enabled,
  interval = 5,
  order = TraversalOrder.TreeOrder,
  pointerCoordinates,
  scrollableAncestors,
  scrollableAncestorRects,
  delta,
  threshold,
}: Arguments) {
  const scrollIntent = useScrollIntent({delta, disabled: !enabled});
  const scrollIntentKey = getScrollIntentKey(scrollIntent);
  const [setAutoScrollInterval, clearAutoScrollInterval] = useInterval();
  const autoScrollFrame = useRef<number | null>(null);
  const autoScrollInterval = useRef(interval);

  autoScrollInterval.current = interval;
  const scrollSpeed = useRef<Coordinates>({x: 0, y: 0});
  const scrollDirection = useRef<ScrollDirection>({x: 0, y: 0});
  const rect = useMemo(() => {
    switch (activator) {
      case AutoScrollActivator.Pointer:
        return pointerCoordinates
          ? {
              top: pointerCoordinates.y,
              bottom: pointerCoordinates.y,
              left: pointerCoordinates.x,
              right: pointerCoordinates.x,
            }
          : null;
      case AutoScrollActivator.DraggableRect:
        return draggingRect;
    }
  }, [activator, draggingRect, pointerCoordinates]);
  const scrollContainerRef = useRef<Element | null>(null);
  const lastFrameTime = useRef<number | null>(null);
  const autoScroll = useCallback((elapsedRatio = 1) => {
    const scrollContainer = scrollContainerRef.current;

    if (!scrollContainer) {
      return;
    }

    const scrollLeft =
      scrollSpeed.current.x * scrollDirection.current.x * elapsedRatio;
    const scrollTop =
      scrollSpeed.current.y * scrollDirection.current.y * elapsedRatio;

    scrollContainer.scrollBy(scrollLeft, scrollTop);
  }, []);
  // Drives auto-scrolling from animation frames, scaling the scroll step by
  // the time elapsed since the previous frame. `interval` is the reference
  // step duration: the speed is the distance scrolled per `interval` ms.
  const startAutoScroll = useCallback(() => {
    if (typeof requestAnimationFrame !== 'function') {
      clearAutoScrollInterval();
      setAutoScrollInterval(autoScroll, autoScrollInterval.current);
      return;
    }

    if (autoScrollFrame.current !== null) {
      // Already running, the next frame picks up the new speed and direction
      return;
    }

    const onFrame = (time: number) => {
      const reference = autoScrollInterval.current;
      const elapsed =
        lastFrameTime.current === null
          ? reference
          : time - lastFrameTime.current;

      lastFrameTime.current = time;
      // Do not jump after a long stall
      autoScroll(Math.min(elapsed, reference * 10) / reference);
      autoScrollFrame.current = requestAnimationFrame(onFrame);
    };

    autoScrollFrame.current = requestAnimationFrame(onFrame);
  }, [autoScroll, clearAutoScrollInterval, setAutoScrollInterval]);
  const stopAutoScroll = useCallback(() => {
    clearAutoScrollInterval();

    if (autoScrollFrame.current !== null) {
      cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }

    lastFrameTime.current = null;
  }, [clearAutoScrollInterval]);

  // Never leave a frame or interval running after unmounting
  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const sortedScrollableAncestors = useMemo(
    () =>
      order === TraversalOrder.TreeOrder
        ? [...scrollableAncestors].reverse()
        : scrollableAncestors,
    [order, scrollableAncestors]
  );

  useEffect(
    () => {
      if (!enabled || !scrollableAncestors.length || !rect) {
        stopAutoScroll();
        return;
      }

      for (const scrollContainer of sortedScrollableAncestors) {
        if (canScroll?.(scrollContainer) === false) {
          continue;
        }

        const index = scrollableAncestors.indexOf(scrollContainer);
        const scrollContainerRect = scrollableAncestorRects[index];

        if (!scrollContainerRect) {
          continue;
        }

        const {direction, speed} = getScrollDirectionAndSpeed(
          scrollContainer,
          scrollContainerRect,
          rect,
          acceleration,
          threshold
        );

        for (const axis of ['x', 'y'] as const) {
          if (!scrollIntent[axis][direction[axis] as Direction]) {
            speed[axis] = 0;
            direction[axis] = 0;
          }
        }

        if (speed.x > 0 || speed.y > 0) {
          scrollContainerRef.current = scrollContainer;
          scrollSpeed.current = speed;
          scrollDirection.current = direction;

          startAutoScroll();

          return;
        }
      }

      scrollSpeed.current = {x: 0, y: 0};
      scrollDirection.current = {x: 0, y: 0};
      stopAutoScroll();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      acceleration,
      canScroll,
      enabled,
      interval,
      rect?.top,
      rect?.bottom,
      rect?.left,
      rect?.right,
      scrollIntentKey,
      startAutoScroll,
      stopAutoScroll,
      scrollableAncestors,
      sortedScrollableAncestors,
      scrollableAncestorRects,
      threshold?.x,
      threshold?.y,
    ]
  );
}

interface ScrollIntent {
  x: Record<Direction, boolean>;
  y: Record<Direction, boolean>;
}

/** A stable numeric key for a scroll intent, usable as a dependency. */
function getScrollIntentKey(intent: ScrollIntent): number {
  return (
    (intent.x[Direction.Backward] ? 1 : 0) |
    (intent.x[Direction.Forward] ? 2 : 0) |
    (intent.y[Direction.Backward] ? 4 : 0) |
    (intent.y[Direction.Forward] ? 8 : 0)
  );
}

const defaultScrollIntent: ScrollIntent = {
  x: {[Direction.Backward]: false, [Direction.Forward]: false},
  y: {[Direction.Backward]: false, [Direction.Forward]: false},
};

function useScrollIntent({
  delta,
  disabled,
}: {
  delta: Coordinates;
  disabled: boolean;
}): ScrollIntent {
  const previousDelta = usePrevious(delta);

  return useLazyMemo<ScrollIntent>(
    (previousIntent) => {
      if (disabled || !previousDelta || !previousIntent) {
        // Reset scroll intent tracking when auto-scrolling is disabled
        return defaultScrollIntent;
      }

      const direction = {
        x: Math.sign(delta.x - previousDelta.x),
        y: Math.sign(delta.y - previousDelta.y),
      };

      // Keep track of the user intent to scroll in each direction for both axis
      return {
        x: {
          [Direction.Backward]:
            previousIntent.x[Direction.Backward] || direction.x === -1,
          [Direction.Forward]:
            previousIntent.x[Direction.Forward] || direction.x === 1,
        },
        y: {
          [Direction.Backward]:
            previousIntent.y[Direction.Backward] || direction.y === -1,
          [Direction.Forward]:
            previousIntent.y[Direction.Forward] || direction.y === 1,
        },
      };
    },
    [disabled, delta, previousDelta]
  );
}
