import React from 'react';
import {act} from '@testing-library/react';

import {useDraggable, useDroppable} from '../src';

export interface TestRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * jsdom has no PointerEvent. Polyfill it with a MouseEvent subclass that
 * exposes the properties the sensors rely on.
 */
export function installPointerEventPolyfill() {
  if (typeof (window as any).PointerEvent === 'function') {
    return;
  }

  class PointerEventPolyfill extends MouseEvent {
    public isPrimary: boolean;
    public pointerId: number;
    public pointerType: string;

    constructor(type: string, init: any = {}) {
      super(type, init);
      this.isPrimary = init.isPrimary ?? true;
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }

  (window as any).PointerEvent = PointerEventPolyfill;
  (globalThis as any).PointerEvent = PointerEventPolyfill;
}

installPointerEventPolyfill();

const rectSpies = new WeakMap<Element, jest.Mock>();

/**
 * jsdom returns zero-size rects. Stub `getBoundingClientRect` per element.
 * Calling it again for the same element updates the rect and keeps the same
 * spy (so call counts survive re-renders that re-run ref callbacks).
 */
export function stubRect(
  element: Element,
  {top, left, width, height}: TestRect
): jest.Mock {
  const implementation = () => ({
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {},
  });
  let spy = rectSpies.get(element);

  if (spy) {
    spy.mockImplementation(implementation);
  } else {
    spy = jest.fn(implementation);
    rectSpies.set(element, spy);
    (element as any).getBoundingClientRect = spy;
  }

  return spy;
}

export function createPointerEvent(
  type: string,
  x: number,
  y: number,
  init: Record<string, any> = {}
) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    isPrimary: true,
    ...init,
  } as any);
}

/** Dispatches a pointer event wrapped in `act()` (React flushes afterwards). */
export function firePointer(
  target: EventTarget,
  type: string,
  x: number,
  y: number,
  init?: Record<string, any>
) {
  act(() => {
    target.dispatchEvent(createPointerEvent(type, x, y, init));
  });
}

/**
 * Dispatches a pointer event synchronously with no `act()` flush, which is
 * how a real browser delivers consecutive events within the same task.
 */
export function firePointerRaw(
  target: EventTarget,
  type: string,
  x: number,
  y: number,
  init?: Record<string, any>
) {
  target.dispatchEvent(createPointerEvent(type, x, y, init));
}

/** Run `callback` with React's act environment checks disabled. */
export async function withoutActEnvironment<T>(callback: () => T | Promise<T>) {
  const g = globalThis as any;
  const previous = g.IS_REACT_ACT_ENVIRONMENT;

  g.IS_REACT_ACT_ENVIRONMENT = false;

  try {
    return await callback();
  } finally {
    g.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

export function Draggable({
  id,
  rect,
  children,
}: {
  id: string;
  rect?: TestRect;
  children?: React.ReactNode;
}) {
  const {setNodeRef, listeners, attributes} = useDraggable({id});

  return (
    <button
      data-testid={`draggable-${id}`}
      ref={(node) => {
        if (node && rect) {
          stubRect(node, rect);
        }
        setNodeRef(node);
      }}
      {...listeners}
      {...attributes}
    >
      {children ?? id}
    </button>
  );
}

export function Droppable({
  id,
  rect,
  disabled,
  onMeasure,
}: {
  id: string;
  rect: TestRect;
  disabled?: boolean;
  onMeasure?: (spy: jest.Mock) => void;
}) {
  const {setNodeRef, isOver} = useDroppable({id, disabled});

  return (
    <div
      data-testid={`droppable-${id}`}
      data-over={isOver ? 'true' : 'false'}
      ref={(node) => {
        if (node) {
          const spy = stubRect(node, rect);
          onMeasure?.(spy);
        }
        setNodeRef(node);
      }}
    />
  );
}

/** Rects for a row of equally sized droppables laid out horizontally. */
export function rowRect(index: number, size = 100, top = 200): TestRect {
  return {top, left: index * size, width: size, height: size};
}
