import {useCallback, useEffect, useRef, useState} from 'react';
import {
  useIsomorphicLayoutEffect,
  useLatestValue,
  useLazyMemo,
} from '@dnd-kit/utilities';

import {Rect} from '../../utilities/rect';
import type {DroppableContainer, RectMap} from '../../store/types';
import type {ClientRect, UniqueIdentifier} from '../../types';

interface Arguments {
  dragging: boolean;
  dependencies: any[];
  config: DroppableMeasuring;
}

export enum MeasuringStrategy {
  Always,
  BeforeDragging,
  WhileDragging,
}

export enum MeasuringFrequency {
  Optimized = 'optimized',
}

type MeasuringFunction = (element: HTMLElement) => ClientRect;

export interface DroppableMeasuring {
  measure: MeasuringFunction;
  strategy: MeasuringStrategy;
  frequency: MeasuringFrequency | number;
}

const defaultValue: RectMap = new Map();

// The node each container's `rect` ref was last measured against
const measuredNodes = new WeakMap<DroppableContainer['rect'], HTMLElement>();

export function useDroppableMeasuring(
  containers: DroppableContainer[],
  {dragging, dependencies, config}: Arguments
) {
  // Measurement requests are collected in a ref and signalled through a
  // version counter, so that a request costs a single render. An empty list
  // means that every container has to be measured.
  const [version, setVersion] = useState(0);
  const pendingRequest = useRef<UniqueIdentifier[] | null>(null);
  const requestedVersion = useRef(0);
  const queue = pendingRequest.current;
  const {frequency, measure, strategy} = config;
  const containersRef = useRef(containers);
  const disabled = isDisabled();
  const disabledRef = useLatestValue(disabled);
  const measureDroppableContainers = useCallback(
    (ids: UniqueIdentifier[] = []) => {
      if (disabledRef.current) {
        return;
      }

      const pending = pendingRequest.current;

      if (pending === null) {
        pendingRequest.current = ids.slice();
      } else if (pending.length > 0) {
        // A request to measure everything wins over a list of ids
        pendingRequest.current =
          ids.length === 0
            ? []
            : pending.concat(ids.filter((id) => !pending.includes(id)));
      }

      setVersion(++requestedVersion.current);
    },
    [disabledRef]
  );
  const timeoutId = useRef<NodeJS.Timeout | null>(null);
  const droppableRects = useLazyMemo<RectMap>(
    (previousValue) => {
      if (disabled && !dragging) {
        return defaultValue;
      }

      if (
        !previousValue ||
        previousValue === defaultValue ||
        containersRef.current !== containers ||
        queue != null
      ) {
        // When only the set of containers changed (a droppable registered,
        // unregistered or was toggled), the containers that were already
        // measured against the same node keep their existing rect.
        const measureAll =
          !previousValue || previousValue === defaultValue || queue != null;
        const map: RectMap = new Map();

        for (let container of containers) {
          if (!container) {
            continue;
          }

          const node = container.node.current;

          if (
            queue &&
            queue.length > 0 &&
            !queue.includes(container.id) &&
            container.rect.current
          ) {
            // This container does not need to be re-measured
            map.set(container.id, container.rect.current);
            continue;
          }

          if (
            !measureAll &&
            container.rect.current &&
            measuredNodes.get(container.rect) === node
          ) {
            map.set(container.id, container.rect.current);
            continue;
          }

          const rect = node ? new Rect(measure(node), node) : null;

          container.rect.current = rect;

          if (node) {
            measuredNodes.set(container.rect, node);
          }

          if (rect) {
            map.set(container.id, rect);
          }
        }

        return map;
      }

      return previousValue;
    },
    [containers, version, dragging, disabled, measure]
  );

  useEffect(() => {
    containersRef.current = containers;
  }, [containers]);

  useEffect(
    () => {
      if (disabled) {
        return;
      }

      measureDroppableContainers();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragging, disabled]
  );

  // Once the render that handled the latest request has committed, the
  // request is done
  useIsomorphicLayoutEffect(() => {
    if (version === requestedVersion.current) {
      pendingRequest.current = null;
    }
  });

  useEffect(
    () => {
      if (
        disabled ||
        typeof frequency !== 'number' ||
        timeoutId.current !== null
      ) {
        return;
      }

      timeoutId.current = setTimeout(() => {
        measureDroppableContainers();
        timeoutId.current = null;
      }, frequency);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frequency, disabled, measureDroppableContainers, ...dependencies]
  );

  return {
    droppableRects,
    measureDroppableContainers,
    measuringScheduled: queue != null,
  };

  function isDisabled() {
    switch (strategy) {
      case MeasuringStrategy.Always:
        return false;
      case MeasuringStrategy.BeforeDragging:
        return dragging;
      default:
        return !dragging;
    }
  }
}
