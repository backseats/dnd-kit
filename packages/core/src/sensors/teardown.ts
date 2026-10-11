/**
 * Internal registry that lets `DndContext` detach a sensor's event listeners
 * when it unmounts mid-drag, without adding any member to the public
 * `SensorInstance` type or to the sensor classes' declarations.
 *
 * Tearing down does not invoke any of the sensor's callbacks.
 */
const teardowns = new WeakMap<object, () => void>();

export function registerSensorTeardown(sensor: object, teardown: () => void) {
  teardowns.set(sensor, teardown);
}

export function teardownSensor(sensor: object | null | undefined) {
  if (!sensor) {
    return;
  }

  const teardown = teardowns.get(sensor);

  if (teardown) {
    teardowns.delete(sensor);
    teardown();
  }
}
