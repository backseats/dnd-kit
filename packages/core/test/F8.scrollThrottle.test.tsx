import React, {Profiler} from 'react';
import {render, screen, act} from '@testing-library/react';

import {DndContext} from '../src';
import {Draggable, Droppable, firePointer, rowRect, stubRect} from './utils';

describe('F8: throttled scroll offsets and frame-aligned auto-scroll', () => {
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
    caf = jest
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((id) => {
        frames.delete(id);
      });
  });

  afterEach(() => {
    raf.mockRestore();
    caf.mockRestore();
  });

  /** Runs the callbacks that are queued right now, at the given time. */
  function runFrame(time: number) {
    act(() => {
      const pending = Array.from(frames.entries());
      frames.clear();
      pending.forEach(([, callback]) => callback(time));
    });
  }

  function renderScrollContainer(
    onRender: () => void = () => {}
  ): HTMLDivElement {
    render(
      <Profiler id="dnd" onRender={onRender}>
        <DndContext>
          <div data-testid="scroller" style={{overflow: 'auto'}}>
            <Draggable
              id="item"
              rect={{top: 0, left: 0, width: 50, height: 50}}
            />
            <Droppable id="A" rect={rowRect(0)} />
          </div>
        </DndContext>
      </Profiler>
    );

    const scroller = screen.getByTestId('scroller') as HTMLDivElement;

    stubRect(scroller, {top: 0, left: 0, width: 400, height: 400});
    Object.defineProperties(scroller, {
      clientHeight: {value: 400, configurable: true},
      clientWidth: {value: 400, configurable: true},
      scrollHeight: {value: 2000, configurable: true},
      scrollWidth: {value: 400, configurable: true},
    });

    return scroller;
  }

  it('applies 20 scroll events in one frame as a single update', () => {
    let commits = 0;
    const scroller = renderScrollContainer(() => commits++);

    firePointer(screen.getByTestId('draggable-item'), 'pointerdown', 25, 25);
    firePointer(document, 'pointermove', 50, 100);
    runFrame(1000);

    const before = commits;

    for (let i = 1; i <= 20; i++) {
      scroller.scrollTop = i * 10;
      // Each scroll event is delivered as its own task, like in a browser
      act(() => {
        scroller.dispatchEvent(new Event('scroll'));
      });
    }

    expect(commits).toBe(before);

    runFrame(1016);

    // One state update for the frame (plus at most one derived re-render),
    // instead of one per scroll event
    expect(commits - before).toBeGreaterThan(0);
    expect(commits - before).toBeLessThanOrEqual(2);
  });

  it('auto-scrolls by an elapsed-time scaled step per animation frame', () => {
    const scroller = renderScrollContainer();
    const scrollBy = jest.fn();

    (scroller as any).scrollBy = scrollBy;

    firePointer(screen.getByTestId('draggable-item'), 'pointerdown', 25, 25);
    // Pointer near the bottom edge of the 400px container: speed is
    // acceleration (10) * |(400 - 80 - 390) / 80| = 8.75 per reference step
    firePointer(document, 'pointermove', 25, 390);
    runFrame(1000); // dispatches the coalesced move

    expect(scrollBy).not.toHaveBeenCalled();

    runFrame(1016); // first auto-scroll frame
    runFrame(1032);
    runFrame(1048);

    expect(scrollBy.mock.calls.length).toBe(3);

    const steps = scrollBy.mock.calls.map(([, top]) => top as number);
    const perReferenceStep = 8.75;

    // Subsequent frames are 16ms apart and the reference step is 5ms
    expect(steps[1]).toBeCloseTo((perReferenceStep * 16) / 5, 5);
    expect(steps[2]).toBeCloseTo((perReferenceStep * 16) / 5, 5);
    // A frame never scrolls horizontally here
    expect(scrollBy.mock.calls.every(([left]) => left === 0)).toBe(true);
  });

  it('stops auto-scrolling when the drag ends', () => {
    const scroller = renderScrollContainer();
    const scrollBy = jest.fn();

    (scroller as any).scrollBy = scrollBy;

    firePointer(screen.getByTestId('draggable-item'), 'pointerdown', 25, 25);
    firePointer(document, 'pointermove', 25, 390);
    runFrame(1000);
    runFrame(1016);
    firePointer(document, 'pointerup', 25, 390);

    const calls = scrollBy.mock.calls.length;

    runFrame(1032);
    runFrame(1048);

    expect(scrollBy.mock.calls.length).toBe(calls);
    expect(frames.size).toBe(0);
  });
});
