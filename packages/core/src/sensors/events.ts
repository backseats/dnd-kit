export enum EventName {
  Click = 'click',
  DragStart = 'dragstart',
  Keydown = 'keydown',
  OrientationChange = 'orientationchange',
  ContextMenu = 'contextmenu',
  Resize = 'resize',
  SelectionChange = 'selectionchange',
  VisibilityChange = 'visibilitychange',
}

export function preventDefault(event: Event) {
  event.preventDefault();
}

export function stopPropagation(event: Event) {
  event.stopPropagation();
}
