import React, {useState} from 'react';
import {render, screen, act} from '@testing-library/react';

import {DndContext} from '../src';
import {DroppableContainersMap} from '../src/store/constructors';
import {Draggable, Droppable, firePointer, rowRect} from './utils';

/** Counts `new DroppableContainersMap(existingMap)` style copies. */
function countMapCopies() {
  const original = Map.prototype[Symbol.iterator];
  let copies = 0;

  Map.prototype[Symbol.iterator] = function (this: Map<any, any>) {
    if (this instanceof DroppableContainersMap) {
      copies++;
    }

    return original.call(this);
  } as any;

  return {
    get copies() {
      return copies;
    },
    restore() {
      Map.prototype[Symbol.iterator] = original;
    },
  };
}

describe('F6: droppable registration and measuring', () => {
  it('copies the containers map at most twice when mounting 200 droppables', () => {
    const counter = countMapCopies();

    try {
      render(
        <DndContext>
          {Array.from({length: 200}, (_, index) => (
            <Droppable key={index} id={`d${index}`} rect={rowRect(index, 10)} />
          ))}
        </DndContext>
      );
    } finally {
      counter.restore();
    }

    expect(counter.copies).toBeLessThanOrEqual(2);
  });

  it('registers all droppables so the right one is reported', () => {
    const onDragEnd = jest.fn();

    render(
      <DndContext onDragEnd={onDragEnd}>
        <Draggable id="item" rect={{top: 0, left: 0, width: 5, height: 5}} />
        {Array.from({length: 50}, (_, index) => (
          <Droppable key={index} id={`d${index}`} rect={rowRect(index, 10)} />
        ))}
      </DndContext>
    );

    firePointer(screen.getByTestId('draggable-item'), 'pointerdown', 2, 2);
    firePointer(document, 'pointermove', 372, 202);
    firePointer(document, 'pointerup', 372, 202);

    expect(onDragEnd.mock.calls[0][0].over?.id).toBe('d37');
  });

  it('does not re-measure any droppable when one is disabled mid-drag', () => {
    const spies: Record<string, jest.Mock> = {};
    let setDisabled: (value: boolean) => void = () => {};

    function App() {
      const [disabled, set] = useState(false);
      setDisabled = set;

      return (
        <DndContext>
          <Draggable
            id="item"
            rect={{top: 0, left: 0, width: 50, height: 50}}
          />
          {['A', 'B', 'C', 'D'].map((id, index) => (
            <Droppable
              key={id}
              id={id}
              rect={rowRect(index)}
              disabled={id === 'C' ? disabled : false}
              onMeasure={(spy) => (spies[id] = spy)}
            />
          ))}
        </DndContext>
      );
    }

    render(<App />);
    firePointer(screen.getByTestId('draggable-item'), 'pointerdown', 25, 25);
    firePointer(document, 'pointermove', 150, 250);

    Object.values(spies).forEach((spy) => spy.mockClear());
    expect(Object.keys(spies)).toHaveLength(4);

    act(() => setDisabled(true));

    for (const id of Object.keys(spies)) {
      expect([id, spies[id].mock.calls.length]).toEqual([id, 0]);
    }
  });

  it('measures only newly registered droppables, reusing existing rects', () => {
    const spies: Record<string, jest.Mock> = {};
    let addExtra: () => void = () => {};

    function App() {
      const [extra, setExtra] = useState(false);
      addExtra = () => setExtra(true);

      return (
        <DndContext>
          <Draggable
            id="item"
            rect={{top: 0, left: 0, width: 50, height: 50}}
          />
          {['A', 'B', ...(extra ? ['X'] : [])].map((id, index) => (
            <Droppable
              key={id}
              id={id}
              rect={rowRect(index)}
              onMeasure={(spy) => (spies[id] = spy)}
            />
          ))}
        </DndContext>
      );
    }

    render(<App />);
    firePointer(screen.getByTestId('draggable-item'), 'pointerdown', 25, 25);
    firePointer(document, 'pointermove', 150, 250);
    Object.values(spies).forEach((spy) => spy.mockClear());

    act(() => addExtra());

    expect(spies.X.mock.calls.length).toBeGreaterThan(0);
    expect(spies.A.mock.calls.length).toBe(0);
    expect(spies.B.mock.calls.length).toBe(0);
  });
});
