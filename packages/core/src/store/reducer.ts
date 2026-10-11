import {Action, Actions} from './actions';
import {DroppableContainersMap} from './constructors';
import type {State} from './types';

/**
 * Maps created by the reducer that have not been committed yet. Consecutive
 * register / unregister / disabled actions that are processed together (for
 * example, when many droppables mount in the same commit) can safely update
 * such a map in place, since nothing outside the reducer has observed it.
 * This turns N registrations from N map copies into a single copy.
 */
const uncommittedContainers = new WeakSet<DroppableContainersMap>();

function getWritableContainers(
  containers: DroppableContainersMap
): DroppableContainersMap {
  if (uncommittedContainers.has(containers)) {
    return containers;
  }

  const copy = new DroppableContainersMap(containers);

  uncommittedContainers.add(copy);

  return copy;
}

/** Marks the containers map as observed: further updates must copy it. */
export function commitDroppableContainers(containers: DroppableContainersMap) {
  uncommittedContainers.delete(containers);
}

export function getInitialState(): State {
  return {
    draggable: {
      active: null,
      initialCoordinates: {x: 0, y: 0},
      nodes: new Map(),
      translate: {x: 0, y: 0},
    },
    droppable: {
      containers: new DroppableContainersMap(),
    },
  };
}

export function reducer(state: State, action: Actions): State {
  switch (action.type) {
    case Action.DragStart:
      return {
        ...state,
        draggable: {
          ...state.draggable,
          initialCoordinates: action.initialCoordinates,
          active: action.active,
        },
      };
    case Action.DragMove:
      if (state.draggable.active == null) {
        return state;
      }

      return {
        ...state,
        draggable: {
          ...state.draggable,
          translate: {
            x: action.coordinates.x - state.draggable.initialCoordinates.x,
            y: action.coordinates.y - state.draggable.initialCoordinates.y,
          },
        },
      };
    case Action.DragEnd:
    case Action.DragCancel:
      return {
        ...state,
        draggable: {
          ...state.draggable,
          active: null,
          initialCoordinates: {x: 0, y: 0},
          translate: {x: 0, y: 0},
        },
      };

    case Action.RegisterDroppable: {
      const {element} = action;
      const {id} = element;
      const containers = getWritableContainers(state.droppable.containers);
      containers.set(id, element);

      return {
        ...state,
        droppable: {
          ...state.droppable,
          containers,
        },
      };
    }

    case Action.SetDroppableDisabled: {
      const {id, key, disabled} = action;
      const element = state.droppable.containers.get(id);

      if (!element || key !== element.key) {
        return state;
      }

      const containers = getWritableContainers(state.droppable.containers);
      containers.set(id, {
        ...element,
        disabled,
      });

      return {
        ...state,
        droppable: {
          ...state.droppable,
          containers,
        },
      };
    }

    case Action.UnregisterDroppable: {
      const {id, key} = action;
      const element = state.droppable.containers.get(id);

      if (!element || key !== element.key) {
        return state;
      }

      const containers = getWritableContainers(state.droppable.containers);
      containers.delete(id);

      return {
        ...state,
        droppable: {
          ...state.droppable,
          containers,
        },
      };
    }

    default: {
      return state;
    }
  }
}
