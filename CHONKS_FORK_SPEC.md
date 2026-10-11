# Chonks fork of @dnd-kit/core 6.3.1 — spec

Branch: `chonks/v6`, cut from upstream tag `@dnd-kit/core@6.3.1`.
Package to change: `packages/core` only. Release version: `6.3.1-chonks.1`.

## Why

Chonks uses `@dnd-kit/core` on two pages (`/fit` drags Traits onto a Chonk,
`/lootboxes` drags a Loot Box onto one of many Chonks). Opening a Loot Box is an
irreversible on-chain action, so the reported drop target must be exactly what
the pointer was over at release. An audit of 6.3.1 found reliability bugs and
avoidable render and layout work. This fork fixes them without changing the
public API.

## Hard constraints

- **No public API changes.** Every export, prop, hook return shape, event
  payload and TypeScript type stays the same. Existing callers must compile and
  behave the same except for the bug fixes below.
- Keep the existing build (`tsdx build`) and its outputs (`dist/index.js`,
  `dist/core.esm.js`, `dist/index.d.ts`, cjs dev/prod builds).
- React 16.8+ through React 19 must keep working (peer range unchanged). Do not
  use `useSyncExternalStore` unless you add the shim; prefer plain refs/state.
- No new runtime dependencies.
- Each fix is its own commit, with a test that fails before and passes after.
- Match the existing code style (prettier config in the repo).

## Fixes

### F1 — Drop target must match the latest collision (reliability, highest priority)

Today `over` is React state set in a passive `useEffect` keyed on `overId`
(`DndContext.tsx`), then copied into `sensorContext.current` in a layout
effect. `onDragEnd` reads `sensorContext.current.over`. A pointer release that
lands before those two commits finish reports the previous droppable (or
`null`).

Required behaviour:
- When `onDragEnd` / `onDragCancel` fire, `event.over` is the first collision
  computed from the **latest** pointer coordinates the sensor delivered,
  including the final `pointerup` / `touchend` coordinates. If the sensor's end
  event carries coordinates that differ from the last move, apply them before
  resolving `over`.
- Implementation guidance: keep the collision inputs in refs; on end, run
  `collisionDetection` once synchronously against the current droppable rects
  and the final translated collision rect / pointer coordinates, and build
  `over` from that result. `onDragOver` and `isOver` must still update as today.
- `cancelDrop` receives the same corrected event.

Test: render a grid of droppables, start a drag, move over A then over B and
release in the same tick (no `act` flush between the last move and the up).
`onDragEnd` must report B. Also: release outside all droppables right after
being over A → `over` is `null`.

### F2 — Don't cancel touch drags on vertical-only viewport resizes

`AbstractPointerSensor` cancels on every window `resize`. iOS Safari fires
`resize` when the address bar collapses mid-drag, killing the drag.

Required behaviour: cancel on `resize` only when `window.innerWidth` changes,
or on `orientationchange`. Height-only resizes keep the drag alive and trigger
a re-measure of droppables instead (call `measureDroppableContainers` through
the existing context mechanism, or let the ResizeObserver path handle it).

Test: start a pointer drag, dispatch a `resize` with only `innerHeight`
changed → drag continues and ends normally with `onDragEnd`. Change
`innerWidth` → `onDragCancel` fires.

### F3 — Tear down the active sensor on unmount

If `DndContext` unmounts mid-drag, the sensor's window/document listeners stay
attached until the next pointer up and then dispatch into an unmounted tree.

Required behaviour: on `DndContext` unmount, detach the active sensor's
listeners (add a `teardown`/`detach` path that does **not** fire user
callbacks, or fires `onDragCancel` only while still mounted — pick one and
document it in the CHANGELOG). No React warnings, no listener leaks.

Test: start a drag, unmount, then dispatch `pointermove` / `pointerup` on
`document` → no handler calls, no console errors; spy on
`removeEventListener` to confirm cleanup.

### F4 — At most one drag-move render per animation frame

Each `pointermove` dispatches `DragMove` and re-renders `DndContext`.
High-rate pointers (120 Hz+, coalesced events) render more often than the
screen paints.

Required behaviour: coalesce `onMove` coordinates and dispatch the latest one
once per `requestAnimationFrame`. Flush any pending move synchronously before
`onEnd` / `onCancel` so F1 and `delta` see the final position. Keyboard sensor
moves stay immediate (they are discrete). Fall back to immediate dispatch when
`requestAnimationFrame` is unavailable (SSR/test env without it).

Test: with fake timers / a mocked rAF, fire 10 `pointermove`s in one frame →
exactly one `DragMove` render (count renders of a child using
`useDndContext`), and the frame's state equals the last coordinates. Ending
the drag before the frame fires still reports the final delta.

### F5 — Stable `collisions` so context consumers don't re-render on every move

`collisions` is a new array on every render and is in the public context memo
deps, so every `useDndContext` consumer re-renders on every move.

Required behaviour: keep the previous `collisions` array reference when the
new result is shallow-equal (same length, same `id`s in order, same
`data.value`). Same for `over` (already state) — make sure the context value
object identity only changes when one of its inputs really changes.

Test: a `useDndContext` consumer's render count does not grow while the
pointer moves inside one droppable without changing the collision result.
(With F4 this is measured per frame.)

### F6 — Don't re-measure every droppable when one registers or toggles

The reducer copies the whole `DroppableContainersMap` for each
register/unregister/`disabled` change, and `useDroppableMeasuring` re-measures
**all** containers whenever the map identity changes. Mounting N droppables is
O(N²) map copying, and toggling one `disabled` flag at drag start re-measures
everything.

Required behaviour:
- Batch registrations: many droppables mounting in one commit cost one map
  copy, not N (e.g. queue registrations in a ref and flush once per commit,
  or mutate a stable map and bump a version counter — keep `droppableContainers`
  identity semantics consistent for consumers that read it).
- When the container set changes, only measure containers that are new or
  whose node changed, and reuse existing `rect.current` for the rest. Toggling
  `disabled` must not re-measure anything.

Test: mount 200 droppables → reducer map copies ≤ 2 (instrument via a spy on
the `DroppableContainersMap` constructor or a test hook). Toggle `disabled` on
one during a drag → `getBoundingClientRect` is not called on the others.

### F7 — Cheaper measuring loop

- `useDroppableMeasuring`: a measurement request currently costs two renders
  (enqueue, then clear) and uses `JSON.stringify(queue)` as an effect dep.
  Make it one render, no stringify.
- `useRect`: replace `JSON.stringify(currentRect) === JSON.stringify(newRect)`
  with a numeric compare of `top/left/width/height/bottom/right`.
- `useRect`'s `MutationObserver` watches all of `document.body` with
  `subtree: true` for the whole drag, twice (active node and its parent).
  Observe only `element.parentElement` (childList) — that is enough to detect
  the active node being moved/removed — and fall back to body only when there
  is no parent.
- `useAutoScroller` uses `JSON.stringify(scrollIntent)` as an effect dep;
  replace with a stable compare.

Test: unit tests for the rect compare and that the MutationObserver is
attached to the parent, not `document.body`.

### F8 — Throttle scroll offset updates and frame-align auto-scroll

- `useScrollOffsets.handleScroll` sets new Map state on every `scroll` event
  (there is a "To-do: Throttle" comment). Coalesce to one update per animation
  frame.
- `useAutoScroller` ticks on `setInterval(…, 5)`. Drive it with
  `requestAnimationFrame` instead, scaling the scroll step by elapsed time so
  scroll speed stays the same. Keep the `interval` option working (treat it as
  the reference step duration).

Test: 20 scroll events in one frame → one state update. Auto-scroll test
with mocked rAF scrolls by the expected distance.

## Out of scope

Sortable/modifiers/utilities packages, the accessibility package, new
features, the docs site, storybook.

## Test infrastructure

`packages/core/test/core.test.tsx` is a placeholder. Add real tests with
Jest (already via `tsdx test`) + `@testing-library/react` + jsdom. jsdom
returns zero-size rects, so tests must stub `getBoundingClientRect` per
element and use `PointerEvent` (polyfill with `MouseEvent` if jsdom lacks it).
Put shared helpers in `packages/core/test/utils.tsx`.

`yarn workspace @dnd-kit/core test` and `yarn workspace @dnd-kit/core build`
must both pass. Run the repo's TypeScript check for the package too.

## Deliverables

1. Commits on `chonks/v6`, one per fix (F1–F8) plus one for test infra.
2. `packages/core/package.json` version `6.3.1-chonks.1`.
3. `packages/core/CHANGELOG.md` entry `6.3.1-chonks.1` listing each fix.
4. `FORK.md` at the repo root: what the fork is, the upstream base, the fix
   list, and how to cut a release.
5. A built `packages/core/dist` produced by `tsdx build` (not committed on
   `chonks/v6`; the release step packages it).
