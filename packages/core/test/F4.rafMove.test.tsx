import React from 'react';
import {render, screen, act} from '@testing-library/react';

import {DndContext, useDndContext} from '../src';
import type {DragEndEvent, DragMoveEvent} from '../src';
import {Draggable, Droppable, firePointer, rowRect} from './utils';

describe('F4: at most one drag-move render per animation frame', () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextId: number;
  let raf: jest.SpyInstance;
  let caf: jest.SpyInstance;

  beforeEach(() => {
    frames = new Map();
    nextId = 1;
    raf = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        const id = nextId++;
        frames.set(id, callback);
        return id;
      });
    caf = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
  });

  afterEach(() => {
    raf.mockRestore();
    caf.mockRestore();
  });

  function runFrames() {
    act(() => {
      const pending = Array.from(frames.entries());
      frames.clear();
      pending.forEach(([, callback]) => callback(performance.now()));
    });
  }

  function setup() {
    let renders = 0;
    const onDragEnd = jest.fn<void, [DragEndEvent]>();
    const onDragMove = jest.fn<void, [DragMoveEvent]>();

    function Consumer() {
      useDndContext();
      renders++;
      return null;
    }

    render(
      <DndContext onDragEnd={onDragEnd} onDragMove={onDragMove}>
        <Consumer />
        <Draggable id="item" rect={{top: 0, left: 0, width: 50, height: 50}} />
        <Droppable id="A" rect={rowRect(0)} />
        <Droppable id="B" rect={rowRect(1)} />
      </DndContext>
    );
    firePointer(screen.getByTestId('draggable-item'), 'pointerdown', 25, 25);
    runFrames();

    return {getRenders: () => renders, onDragEnd, onDragMove};
  }

  it('renders once for ten pointermoves within a frame', () => {
    const {getRenders, onDragMove} = setup();

    // Settle over B first so that `over` does not change during the frame
    firePointer(document, 'pointermove', 140, 250);
    runFrames();

    const before = getRenders();
    onDragMove.mockClear();

    for (let i = 1; i <= 10; i++) {
      firePointer(document, 'pointermove', 140 + i, 250);
    }

    // Nothing is committed until the frame fires
    expect(getRenders()).toBe(before);

    runFrames();

    expect(getRenders() - before).toBe(1);
    expect(onDragMove).toHaveBeenCalledTimes(1);
    // 150 - 25 (initial pointer x)
    expect(onDragMove.mock.calls[0][0].delta).toMatchObject({x: 125, y: 225});
  });

  it('flushes the pending move before onDragEnd', () => {
    const {onDragEnd} = setup();

    firePointer(document, 'pointermove', 150, 250);
    firePointer(document, 'pointerup', 160, 250);

    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onDragEnd.mock.calls[0][0].delta).toMatchObject({x: 135, y: 225});
    expect(onDragEnd.mock.calls[0][0].over?.id).toBe('B');
    // The stale frame must not dispatch anything after the drag ended
    expect(frames.size).toBe(0);
  });

  it('falls back to immediate dispatch without requestAnimationFrame', () => {
    const original = window.requestAnimationFrame;
    const {getRenders} = setup();

    (window as any).requestAnimationFrame = undefined;

    try {
      const before = getRenders();

      firePointer(document, 'pointermove', 150, 250);

      expect(getRenders()).toBeGreaterThan(before);
    } finally {
      window.requestAnimationFrame = original;
    }
  });
});
