/**
 * Keep diagram panning separate from selection and activation.
 * Install once on the persistent stage, rather than on each rendered SVG.
 */
export function installDiagramInteractions(stage: HTMLElement): () => void {
  // Match the upstream viewport's pan threshold so even a short pan cannot
  // activate a node on release.
  const dragThreshold = 4;
  const pointers = new Map<number, { x: number; y: number; dragged: boolean }>();
  const view = stage.ownerDocument.defaultView!;
  const previousUserSelect = stage.style.getPropertyValue('user-select');
  const previousWebkitUserSelect = stage.style.getPropertyValue('-webkit-user-select');
  stage.style.setProperty('user-select', 'none');
  stage.style.setProperty('-webkit-user-select', 'none');

  let suppressPointerClick = false;
  let suppressionTimer: ReturnType<typeof setTimeout> | undefined;

  function clearSuppression() {
    suppressPointerClick = false;
    if (suppressionTimer !== undefined) clearTimeout(suppressionTimer);
    suppressionTimer = undefined;
  }

  function suppressReleaseClick() {
    clearSuppression();
    suppressPointerClick = true;
    // Some touch browsers dispatch a compatibility click after a short delay.
    // A new pointerdown always clears this first, so the next real click works.
    suppressionTimer = setTimeout(clearSuppression, 800);
  }

  function preventNativeSelection(event: Event) {
    event.preventDefault();
  }

  function onPointerDown(event: PointerEvent) {
    // Leave secondary-button gestures and context menus to the browser.
    if (event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, dragged: false });
    if (pointers.size > 1) {
      // A pinch/multitouch gesture must never activate its final node.
      for (const pointer of pointers.values()) pointer.dragged = true;
    }
  }

  function updateTravel(event: PointerEvent) {
    const pointer = pointers.get(event.pointerId);
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >= dragThreshold) {
      pointer.dragged = true;
    }
  }

  function onPointerEnd(event: PointerEvent) {
    // Monitor at window capture phase: release outside the stage and pointer
    // capture by the upstream viewport both still terminate our gesture.
    updateTravel(event);
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    if (pointer.dragged || event.type === 'pointercancel') suppressReleaseClick();
    pointers.delete(event.pointerId);
  }

  function onClick(event: MouseEvent) {
    // Keyboard and assistive-technology activations have detail === 0.
    if (event.detail === 0 || event.button !== 0) return;
    if (!suppressPointerClick && !Array.from(pointers.values()).some(pointer => pointer.dragged)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    clearSuppression();
  }

  function reset() {
    pointers.clear();
    clearSuppression();
  }

  // Clearing on *every* new press (including outside the diagram) prevents a
  // release without a click from swallowing a later intentional activation.
  view.addEventListener('pointerdown', clearSuppression, { capture: true });
  stage.addEventListener('pointerdown', onPointerDown, { capture: true });
  view.addEventListener('pointermove', updateTravel, { capture: true });
  view.addEventListener('pointerup', onPointerEnd, { capture: true });
  view.addEventListener('pointercancel', onPointerEnd, { capture: true });
  view.addEventListener('blur', reset);
  stage.addEventListener('click', onClick, { capture: true });
  stage.addEventListener('selectstart', preventNativeSelection, { capture: true });
  stage.addEventListener('dragstart', preventNativeSelection, { capture: true });

  return () => {
    reset();
    view.removeEventListener('pointerdown', clearSuppression, { capture: true });
    stage.removeEventListener('pointerdown', onPointerDown, { capture: true });
    view.removeEventListener('pointermove', updateTravel, { capture: true });
    view.removeEventListener('pointerup', onPointerEnd, { capture: true });
    view.removeEventListener('pointercancel', onPointerEnd, { capture: true });
    view.removeEventListener('blur', reset);
    stage.removeEventListener('click', onClick, { capture: true });
    stage.removeEventListener('selectstart', preventNativeSelection, { capture: true });
    stage.removeEventListener('dragstart', preventNativeSelection, { capture: true });
    if (previousUserSelect) stage.style.setProperty('user-select', previousUserSelect);
    else stage.style.removeProperty('user-select');
    if (previousWebkitUserSelect) stage.style.setProperty('-webkit-user-select', previousWebkitUserSelect);
    else stage.style.removeProperty('-webkit-user-select');
  };
}
