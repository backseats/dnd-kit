import React from 'react';
import {render, screen, act} from '@testing-library/react';

import {DndContext, useDndContext} from '../src';
import {areRectsEqual} from '../src/utilities/rect/areRectsEqual';
import {Draggable, Droppable, firePointer, rowRect} from './utils';

describe('F7: cheaper measuring loop', () => {
  describe('areRectsEqual', () => {
    const base = {
      top: 10,
      left: 20,
      width: 30,
      height: 40,
      bottom: 50,
      right: 50,
    };

    it('compares null values', () => {
      expect(areRectsEqual(null, null)).toBe(true);
      expect(areRectsEqual(base, null)).toBe(false);
      expect(areRectsEqual(null, base)).toBe(false);
    });

    it('is true for equal rects and false when any measurement differs', () => {
      expect(areRectsEqual(base, {...base})).toBe(true);

      for (const key of Object.keys(base) as (keyof typeof base)[]) {
        expect(areRectsEqual(base, {...base, [key]: base[key] + 1})).toBe(
          false
        );
      }
    });
  });

  it('observes the active node parent, not document.body', () => {
    const observed: Array<[Node, MutationObserverInit | undefined]> = [];
    const OriginalMutationObserver = window.MutationObserver;

    class SpyMutationObserver extends OriginalMutationObserver {
      observe(target: Node, options?: MutationObserverInit) {
        observed.push([target, options]);
        return super.observe(target, options);
      }
    }

    window.MutationObserver = SpyMutationObserver;

    try {
      render(
        <DndContext>
          <div data-testid="parent">
            <Draggable
              id="item"
              rect={{top: 0, left: 0, width: 50, height: 50}}
            />
          </div>
          <Droppable id="A" rect={rowRect(0)} />
        </DndContext>
      );
      firePointer(screen.getByTestId('draggable-item'), 'pointerdown', 25, 25);
      firePointer(document, 'pointermove', 50, 250);
    } finally {
      window.MutationObserver = OriginalMutationObserver;
    }

    const parent = screen.getByTestId('parent');

    expect(observed.length).toBeGreaterThan(0);
    // Nothing observes the whole subtree of the body
    expect(observed.filter(([, options]) => options?.subtree === true)).toEqual(
      []
    );
    // The active node is observed through its parent
    expect(observed.some(([target]) => target === parent)).toBe(true);
  });

  it('does not use JSON.stringify while dragging', () => {
    render(
      <DndContext>
        <Draggable id="item" rect={{top: 0, left: 0, width: 50, height: 50}} />
        <Droppable id="A" rect={rowRect(0)} />
      </DndContext>
    );
    firePointer(screen.getByTestId('draggable-item'), 'pointerdown', 25, 25);

    const stringify = jest.spyOn(JSON, 'stringify');
    let calls = 0;

    try {
      firePointer(document, 'pointermove', 50, 250);
      firePointer(document, 'pointermove', 60, 250);
      firePointer(document, 'pointerup', 60, 250);
    } finally {
      calls = stringify.mock.calls.length;
      stringify.mockRestore();
    }

    expect(calls).toBe(0);
  });

  it('renders once per measurement request', () => {
    let renders = 0;
    let measure: (ids: string[]) => void = () => {};

    function Consumer() {
      const context = useDndContext();
      measure = context.measureDroppableContainers;
      renders++;
      return null;
    }

    render(
      <DndContext>
        <Consumer />
        <Draggable id="item" rect={{top: 0, left: 0, width: 50, height: 50}} />
        <Droppable id="A" rect={rowRect(0)} />
      </DndContext>
    );
    firePointer(screen.getByTestId('draggable-item'), 'pointerdown', 25, 25);
    firePointer(document, 'pointermove', 50, 250);

    const before = renders;

    act(() => measure(['A']));

    expect(renders - before).toBe(1);
  });
});
