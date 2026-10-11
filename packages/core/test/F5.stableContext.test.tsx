import React from 'react';
import {render, screen, act} from '@testing-library/react';

import {DndContext, useDndContext} from '../src';
import {Draggable, Droppable, firePointer, rowRect} from './utils';

describe('F5: stable collisions and context value', () => {
  let frames: FrameRequestCallback[];
  let raf: jest.SpyInstance;

  beforeEach(() => {
    frames = [];
    raf = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => frames.push(callback));
  });

  afterEach(() => {
    raf.mockRestore();
  });

  function runFrames() {
    act(() => {
      const pending = frames;
      frames = [];
      pending.forEach((callback) => callback(performance.now()));
    });
  }

  it('does not re-render useDndContext consumers while the collision result is unchanged', () => {
    let renders = 0;
    const seenCollisions = new Set<unknown>();
    const seenContexts = new Set<unknown>();

    function Consumer() {
      const context = useDndContext();
      renders++;
      seenCollisions.add(context.collisions);
      seenContexts.add(context);
      return null;
    }

    render(
      <DndContext>
        <Consumer />
        <Draggable id="item" rect={{top: 0, left: 0, width: 50, height: 50}} />
        <Droppable id="A" rect={rowRect(0)} />
        <Droppable id="B" rect={rowRect(1)} />
      </DndContext>
    );

    firePointer(screen.getByTestId('draggable-item'), 'pointerdown', 25, 25);
    runFrames();
    // Settle fully inside B: the 50x50 rect stays inside the 100x100 target,
    // so the intersection ratio (collision value) does not change.
    firePointer(document, 'pointermove', 140, 250);
    runFrames();

    const rendersBefore = renders;
    const collisionsBefore = seenCollisions.size;
    const contextsBefore = seenContexts.size;

    for (let x = 141; x <= 160; x += 1) {
      firePointer(document, 'pointermove', x, 250);
      runFrames();
    }

    expect(renders).toBe(rendersBefore);
    expect(seenCollisions.size).toBe(collisionsBefore);
    expect(seenContexts.size).toBe(contextsBefore);
  });

  it('still updates when the collision result changes', () => {
    let latest: ReturnType<typeof useDndContext> | undefined;

    function Consumer() {
      latest = useDndContext();
      return null;
    }

    render(
      <DndContext>
        <Consumer />
        <Draggable id="item" rect={{top: 0, left: 0, width: 50, height: 50}} />
        <Droppable id="A" rect={rowRect(0)} />
        <Droppable id="B" rect={rowRect(1)} />
      </DndContext>
    );

    firePointer(screen.getByTestId('draggable-item'), 'pointerdown', 25, 25);
    firePointer(document, 'pointermove', 50, 250);
    runFrames();
    expect(latest!.collisions?.[0]?.id).toBe('A');
    expect(latest!.over?.id).toBe('A');

    firePointer(document, 'pointermove', 150, 250);
    runFrames();
    expect(latest!.collisions?.[0]?.id).toBe('B');
    expect(latest!.over?.id).toBe('B');
  });
});
