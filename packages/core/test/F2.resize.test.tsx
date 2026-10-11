import React from 'react';
import {render, screen, act} from '@testing-library/react';

import {DndContext} from '../src';
import {Draggable, Droppable, firePointer, rowRect} from './utils';

function resizeWindow(dimensions: {innerWidth?: number; innerHeight?: number}) {
  act(() => {
    Object.assign(window, dimensions);
    window.dispatchEvent(new Event('resize'));
  });
}

describe('F2: vertical-only viewport resizes do not cancel a drag', () => {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;

  afterEach(() => {
    Object.assign(window, {
      innerWidth: originalWidth,
      innerHeight: originalHeight,
    });
  });

  function setup() {
    const onDragEnd = jest.fn();
    const onDragCancel = jest.fn();

    render(
      <DndContext onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
        <Draggable id="item" rect={{top: 0, left: 0, width: 50, height: 50}} />
        <Droppable id="A" rect={rowRect(0)} />
        <Droppable id="B" rect={rowRect(1)} />
      </DndContext>
    );
    firePointer(screen.getByTestId('draggable-item'), 'pointerdown', 25, 25);

    return {onDragEnd, onDragCancel};
  }

  it('keeps the drag alive on a height-only resize', () => {
    const {onDragEnd, onDragCancel} = setup();

    firePointer(document, 'pointermove', 150, 250);
    resizeWindow({innerHeight: originalHeight - 80});
    firePointer(document, 'pointermove', 160, 250);
    firePointer(document, 'pointerup', 160, 250);

    expect(onDragCancel).not.toHaveBeenCalled();
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onDragEnd.mock.calls[0][0].over?.id).toBe('B');
  });

  it('cancels the drag when the width changes', () => {
    const {onDragEnd, onDragCancel} = setup();

    firePointer(document, 'pointermove', 150, 250);
    resizeWindow({innerWidth: originalWidth + 100});

    expect(onDragCancel).toHaveBeenCalledTimes(1);
    expect(onDragEnd).not.toHaveBeenCalled();
  });

  it('cancels the drag on orientationchange', () => {
    const {onDragEnd, onDragCancel} = setup();

    firePointer(document, 'pointermove', 150, 250);
    act(() => {
      window.dispatchEvent(new Event('orientationchange'));
    });

    expect(onDragCancel).toHaveBeenCalledTimes(1);
    expect(onDragEnd).not.toHaveBeenCalled();
  });

  it('re-measures droppables on a height-only resize', () => {
    let spyA: jest.Mock | undefined;

    render(
      <DndContext>
        <Draggable id="item" rect={{top: 0, left: 0, width: 50, height: 50}} />
        <Droppable id="A" rect={rowRect(0)} onMeasure={(s) => (spyA = s)} />
      </DndContext>
    );
    firePointer(screen.getByTestId('draggable-item'), 'pointerdown', 25, 25);
    firePointer(document, 'pointermove', 50, 250);

    const before = spyA!.mock.calls.length;
    resizeWindow({innerHeight: originalHeight - 80});

    expect(spyA!.mock.calls.length).toBeGreaterThan(before);
  });
});
