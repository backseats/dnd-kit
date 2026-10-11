# Chonks fork of dnd-kit (`@dnd-kit/core` v6)

This is a fork of [clauderic/dnd-kit](https://github.com/clauderic/dnd-kit)
used by Chonks (`/fit` drags Traits onto a Chonk, `/lootboxes` drags a Loot Box
onto one of many Chonks). Opening a Loot Box is irreversible on-chain, so the
drop target reported by the library must be exactly what the pointer was over
at release.

- Branch: `chonks/v6`
- Upstream base: tag `@dnd-kit/core@6.3.1` (commit `e9215e8`)
- Package: `@dnd-kit/core`, version `6.3.1-chonks.1`
- Only `packages/core` changes (plus this file and test devDependencies in the
  root `package.json` / `yarn.lock`). The authoritative spec is
  `CHONKS_FORK_SPEC.md`.
- No public API or type changes. `dist/index.d.ts` is byte-identical to the
  upstream build. The only other declaration differences are in internal
  modules that `index.d.ts` does not export (two new files, `sensors/teardown`
  and `utilities/rect/areRectsEqual`; an `OrientationChange` member of the
  internal `EventName` enum; the internal `commitDroppableContainers` store
  helper) and three new `private` members on `AbstractPointerSensor`
  (`lastCoordinates`, `initialWindowWidth`, `handleResize`), which show up as
  `private` lines in its declaration.

## Fixes

| Id | Summary |
| --- | --- |
| F1 | `over` / `collisions` / `delta` at drag end are computed synchronously from the latest sensor coordinates (including `pointerup` / `touchend`), not from possibly-uncommitted React state. Also applies to `cancelDrop` and `onDragCancel`. |
| F2 | Pointer sensors cancel on `resize` only if `innerWidth` changed (or on `orientationchange`). Height-only resizes keep the drag and re-measure droppables. |
| F3 | Unmounting `DndContext` mid-drag detaches the active sensor's listeners. No user callbacks fire on teardown. |
| F4 | Pointer moves are coalesced to one `DragMove` dispatch per animation frame and flushed before end/cancel. Keyboard moves stay immediate. |
| F5 | `collisions` keeps its reference when shallow-equal, so `useDndContext` consumers stop re-rendering on every move. |
| F6 | Registrations in one commit cost one map copy; only new/changed containers are measured; toggling `disabled` re-measures nothing. |
| F7 | Measurement requests cost one render; numeric rect compare; `useRect` observes the parent instead of the `document.body` subtree; no `JSON.stringify` in effect deps. |
| F8 | Scroll offset updates are coalesced per frame; auto-scroll runs on `requestAnimationFrame` with time-scaled steps (`interval` is the reference step). |

## Notes and deviations from the spec

- **F3 teardown is internal.** The `SensorInstance` type (public) is not
  changed. Sensors register a teardown in a module-private `WeakMap`
  (`src/sensors/teardown.ts`); custom sensors that do not register one are
  simply not torn down.
- **F1 sensor hook.** `SensorProps.onEnd()` has no coordinates argument (public
  type), so `AbstractPointerSensor` calls `onMove(finalCoordinates)` just
  before `onEnd()` when the end event's coordinates differ from the last move.
  `DndContext` then resolves `over` from the latest coordinates.
- **F2 re-measure** is done by `DndContext` (its own window `resize` listener
  while dragging), because `SensorContext` (public type) has no access to
  `measureDroppableContainers`.
- **F6 queue fix.** In upstream, a "measure everything" request
  (`measureDroppableContainers()` with no ids) left an empty queue that was
  never cleared, so every later container change re-measured everything. F6
  needed that fixed to meet its goal (F7 then replaced the queue with a
  ref + version counter). In the new queue, a "measure everything" request wins
  over a list of ids; upstream silently dropped it.
- **F6 reducer.** The reducer updates a containers map in place only while that
  map has not been committed yet (tracked in a `WeakSet`, cleared from a layout
  effect in `DndContext`). Committed maps are never mutated, so
  `droppableContainers` identity semantics are unchanged for consumers.
- **F7 trade-off.** `useRect` now observes only the active node's parent for
  `childList` changes (as the spec requires). Previously any DOM insertion or
  removal anywhere in `document.body` re-measured the active node, which also
  caught layout shifts caused by unrelated elements. Those are now picked up
  only by the next ResizeObserver / measuring pass. Pages that insert content
  above a dragged node mid-drag should rely on `measuring`/layout-shift
  compensation.
- **F7 `measuringScheduled`** (public context value) is `true` for the render
  that applies a measurement request and `false` otherwise. Upstream it was
  effectively `true` forever after the first request (see the queue bug above).
  Nothing in this repo reads it.
- **F8 auto-scroll** scales the first frame as one reference step and clamps a
  single frame's elapsed time to 10 reference steps, so a long stall does not
  produce a jump (`setInterval` never "caught up" either).
- **Tooling.** Tests use `@testing-library/react@13.4.0` (React 18.1 in this
  workspace) and `jest` `testEnvironment: "jsdom"` set in
  `packages/core/package.json`. `tsdx build`/`tsdx test` work on Node 22 with no
  changes. `yarn install` needs `--ignore-engines` on Node 22. Building
  `@dnd-kit/core` first requires the sibling packages to be built
  (`@dnd-kit/utilities`, `@dnd-kit/accessibility`), since they resolve through
  their `dist`. The plain `tsc --noEmit` type check needs
  `--importHelpers false` here because `packages/core/node_modules/tslib`
  (2.0.1) predates `__spreadArray`; this already fails on upstream.

## Running the tests

```sh
yarn install --frozen-lockfile --ignore-engines
yarn workspace @dnd-kit/utilities build
yarn workspace @dnd-kit/accessibility build
yarn workspace @dnd-kit/core test
```

## Cutting a release

1. Make sure the version in `packages/core/package.json` and the entry in
   `packages/core/CHANGELOG.md` are right (currently `6.3.1-chonks.1`).
2. Build the dependencies and core (the build produces `dist/index.js`,
   `dist/core.esm.js`, the cjs dev/prod bundles and the `.d.ts` files):

   ```sh
   yarn workspace @dnd-kit/utilities build
   yarn workspace @dnd-kit/accessibility build
   yarn workspace @dnd-kit/core build
   ```

3. Run `yarn workspace @dnd-kit/core test`.
4. Package it from the package directory (`dist` is gitignored and is included
   through the `files` field):

   ```sh
   cd packages/core
   npm pack --dry-run   # check that dist/ is included
   npm pack             # produces dnd-kit-core-6.3.1-chonks.1.tgz
   ```

5. Install the tarball in the Chonks app (for example
   `npm i ./dnd-kit-core-6.3.1-chonks.1.tgz`). `@dnd-kit/utilities` and
   `@dnd-kit/accessibility` stay on their published versions.
