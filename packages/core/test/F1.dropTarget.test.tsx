import React from 'react';
import {render, screen, act} from '@testing-library/react';

import {DndContext} from '../src';
import type {DragEndEvent, DragCancelEvent} from '../src';
import {
  Draggable,
  Droppable,
  firePointer,
  firePointerRaw,
  rowRect,
  withoutActEnvironment,
} from './utils';

function setup(
  props: {
    onDragEnd?: (e: DragEndEvent) => void;
    onDragCancel?: (e: DragCancelEvent) => void;
    cancelDrop?: any;
  } = {}
) {
  render(
    <DndContext {...props}>
      <Draggable id="item" rect={{top: 0, left: 0, width: 50, height: 50}} />
      <Droppable id="A" rect={rowRect(0)} />
      <Droppable id="B" rect={rowRect(1)} />
      <Droppable id="C" rect={rowRect(2)} />
    </DndContext>
  );

  return screen.getByTestId('draggable-item');
}

describe('F1: drop target matches the latest collision', () => {
  it('reports B when moving over B and releasing in the same tick', async () => {
    const onDragEnd = jest.fn<void, [DragEndEvent]>();
    const draggable = setup({onDragEnd});

    firePointer(draggable, 'pointerdown', 25, 25);
    firePointer(document, 'pointermove', 50, 250); // over A (settled)

    await withoutActEnvironment(() => {
      firePointerRaw(document, 'pointermove', 150, 250); // over B, no flush
      firePointerRaw(document, 'pointerup', 150, 250);
    });

    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onDragEnd.mock.calls[0][0].over?.id).toBe('B');
    expect(onDragEnd.mock.calls[0][0].collisions?.[0]?.id).toBe('B');
  });

  it('uses the pointerup coordinates when they differ from the last move', async () => {
    const onDragEnd = jest.fn<void, [DragEndEvent]>();
    const draggable = setup({onDragEnd});

    firePointer(draggable, 'pointerdown', 25, 25);
    firePointer(document, 'pointermove', 50, 250); // over A

    await withoutActEnvironment(() => {
      firePointerRaw(document, 'pointerup', 250, 250); // released over C
    });

    expect(onDragEnd.mock.calls[0][0].over?.id).toBe('C');
  });

  it('reports null when released outside all droppables right after A', async () => {
    const onDragEnd = jest.fn<void, [DragEndEvent]>();
    const draggable = setup({onDragEnd});

    firePointer(draggable, 'pointerdown', 25, 25);
    firePointer(document, 'pointermove', 50, 250); // over A (settled)

    await withoutActEnvironment(() => {
      firePointerRaw(document, 'pointermove', 50, 900); // far outside
      firePointerRaw(document, 'pointerup', 50, 900);
    });

    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onDragEnd.mock.calls[0][0].over).toBeNull();
  });

  it('passes the corrected event to cancelDrop and onDragCancel', async () => {
    const onDragCancel = jest.fn<void, [DragCancelEvent]>();
    const cancelDrop = jest.fn(() => true);
    const draggable = setup({onDragCancel, cancelDrop});

    firePointer(draggable, 'pointerdown', 25, 25);
    firePointer(document, 'pointermove', 50, 250);

    await withoutActEnvironment(async () => {
      firePointerRaw(document, 'pointermove', 150, 250);
      firePointerRaw(document, 'pointerup', 150, 250);
    });
    await act(async () => {});

    expect(cancelDrop).toHaveBeenCalledTimes(1);
    expect((cancelDrop.mock.calls[0] as any)[0].over?.id).toBe('B');
    expect(onDragCancel).toHaveBeenCalledTimes(1);
    expect(onDragCancel.mock.calls[0][0].over?.id).toBe('B');
  });
});
