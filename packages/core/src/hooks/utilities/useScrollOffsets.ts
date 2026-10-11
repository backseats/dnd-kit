import {useState, useCallback, useMemo, useRef, useEffect} from 'react';
import {add} from '@dnd-kit/utilities';

import {
  defaultCoordinates,
  getScrollableElement,
  getScrollCoordinates,
  getScrollOffsets,
} from '../../utilities';
import type {Coordinates} from '../../types';

type ScrollCoordinates = Map<HTMLElement | Window, Coordinates>;

export function useScrollOffsets(elements: Element[]): Coordinates {
  const [scrollCoordinates, setScrollCoordinates] =
    useState<ScrollCoordinates | null>(null);
  const prevElements = useRef(elements);

  const pendingElements = useRef<Set<Element | (Window & typeof globalThis)>>(
    new Set()
  );
  const frameId = useRef<number | null>(null);
  const flushScrollUpdates = useCallback(() => {
    frameId.current = null;

    const scrollingElements = Array.from(pendingElements.current);

    pendingElements.current.clear();

    if (!scrollingElements.length) {
      return;
    }

    setScrollCoordinates((scrollCoordinates) => {
      if (!scrollCoordinates) {
        return null;
      }

      for (const scrollingElement of scrollingElements) {
        scrollCoordinates.set(
          scrollingElement as HTMLElement | Window,
          getScrollCoordinates(scrollingElement)
        );
      }

      return new Map(scrollCoordinates);
    });
  }, []);

  // Scroll events are coalesced: at most one state update per animation frame
  const handleScroll = useCallback(
    (event: Event) => {
      const scrollingElement = getScrollableElement(event.target);

      if (!scrollingElement) {
        return;
      }

      pendingElements.current.add(scrollingElement);

      if (typeof requestAnimationFrame !== 'function') {
        flushScrollUpdates();
        return;
      }

      if (frameId.current === null) {
        frameId.current = requestAnimationFrame(flushScrollUpdates);
      }
    },
    [flushScrollUpdates]
  );

  useEffect(
    () => () => {
      if (frameId.current !== null) {
        cancelAnimationFrame(frameId.current);
        frameId.current = null;
      }

      pendingElements.current.clear();
    },
    []
  );

  useEffect(() => {
    const previousElements = prevElements.current;

    if (elements !== previousElements) {
      cleanup(previousElements);

      const entries = elements
        .map((element) => {
          const scrollableElement = getScrollableElement(element);

          if (scrollableElement) {
            scrollableElement.addEventListener('scroll', handleScroll, {
              passive: true,
            });

            return [
              scrollableElement,
              getScrollCoordinates(scrollableElement),
            ] as const;
          }

          return null;
        })
        .filter(
          (
            entry
          ): entry is [
            HTMLElement | (Window & typeof globalThis),
            Coordinates
          ] => entry != null
        );

      setScrollCoordinates(entries.length ? new Map(entries) : null);

      prevElements.current = elements;
    }

    return () => {
      cleanup(elements);
      cleanup(previousElements);
    };

    function cleanup(elements: Element[]) {
      elements.forEach((element) => {
        const scrollableElement = getScrollableElement(element);

        scrollableElement?.removeEventListener('scroll', handleScroll);
      });
    }
  }, [handleScroll, elements]);

  return useMemo(() => {
    if (elements.length) {
      return scrollCoordinates
        ? Array.from(scrollCoordinates.values()).reduce(
            (acc, coordinates) => add(acc, coordinates),
            defaultCoordinates
          )
        : getScrollOffsets(elements);
    }

    return defaultCoordinates;
  }, [elements, scrollCoordinates]);
}
