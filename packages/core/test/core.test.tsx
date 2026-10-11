import React from 'react';
import {render, screen} from '@testing-library/react';

import {DndContext} from '../src';
import type {DragEndEvent} from '../src';
import {Draggable, Droppable, firePointer, rowRect} from './utils';

describe('@dnd-kit/core', () => {
  it('reports the droppable under the pointer in onDragEnd (PointerSensor)', () => {
    const onDragEnd = jest.fn<void, [DragEndEvent]>();

    render(
      <DndContext onDragEnd={onDragEnd}>
        <Draggable id="item" rect={{top: 0, left: 0, width: 50, height: 50}} />
        <Droppable id="A" rect={rowRect(0)} />
        <Droppable id="B" rect={rowRect(1)} />
      </DndContext>
    );

    const draggable = screen.getByTestId('draggable-item');

    firePointer(draggable, 'pointerdown', 25, 25);
    firePointer(document, 'pointermove', 150, 250);
    firePointer(document, 'pointerup', 150, 250);

    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onDragEnd.mock.calls[0][0].active.id).toBe('item');
    expect(onDragEnd.mock.calls[0][0].over?.id).toBe('B');
  });
});
