import React from 'react';
import {render, screen} from '@testing-library/react';

import {DndContext} from '../src';
import {Draggable, Droppable, firePointer, rowRect} from './utils';

describe('F3: the active sensor is torn down when DndContext unmounts', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('does not call handlers or warn after unmounting mid-drag', () => {
    const handlers = {
      onDragStart: jest.fn(),
      onDragMove: jest.fn(),
      onDragOver: jest.fn(),
      onDragEnd: jest.fn(),
      onDragCancel: jest.fn(),
    };
    const removeDocument = jest.spyOn(document, 'removeEventListener');
    const removeWindow = jest.spyOn(window, 'removeEventListener');

    const {unmount} = render(
      <DndContext {...handlers}>
        <Draggable id="item" rect={{top: 0, left: 0, width: 50, height: 50}} />
        <Droppable id="A" rect={rowRect(0)} />
      </DndContext>
    );

    firePointer(screen.getByTestId('draggable-item'), 'pointerdown', 25, 25);
    firePointer(document, 'pointermove', 50, 250);
    expect(handlers.onDragStart).toHaveBeenCalledTimes(1);

    removeDocument.mockClear();
    removeWindow.mockClear();
    handlers.onDragMove.mockClear();

    unmount();

    // Listeners were detached from the document (pointermove/up) and window
    const removedOnDocument = removeDocument.mock.calls.map(([name]) => name);
    const removedOnWindow = removeWindow.mock.calls.map(([name]) => name);

    expect(removedOnDocument).toEqual(
      expect.arrayContaining(['pointermove', 'pointerup', 'pointercancel'])
    );
    expect(removedOnWindow).toEqual(
      expect.arrayContaining(['resize', 'visibilitychange'])
    );

    firePointer(document, 'pointermove', 150, 250);
    firePointer(document, 'pointerup', 150, 250);
    window.dispatchEvent(new Event('resize'));

    expect(handlers.onDragMove).not.toHaveBeenCalled();
    expect(handlers.onDragEnd).not.toHaveBeenCalled();
    expect(handlers.onDragCancel).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();

    removeDocument.mockRestore();
    removeWindow.mockRestore();
  });
});
