// src/utils/gridTunerBus.js
const EVT_OPEN = "nbt:gridtuner:open";
const EVT_RESOLVE = "nbt:gridtuner:resolve";

/**
 * Open the tuner and await user action.
 * payload: { image, frac:{left,top,right,bottom} }
 * resolves with: { frac } on Save, or null on Cancel
 */
export function openGridTunerAwait(payload) {
  return new Promise((resolve) => {
    const onResolve = (e) => {
      window.removeEventListener(EVT_RESOLVE, onResolve);
      resolve(e.detail || null);
    };
    window.addEventListener(EVT_RESOLVE, onResolve, { once: true });
    window.dispatchEvent(new CustomEvent(EVT_OPEN, { detail: payload }));
  });
}

// For the modal to signal back:
export function _resolveGridTuner(detail) {
  window.dispatchEvent(new CustomEvent(EVT_RESOLVE, { detail }));
}
export function _onOpenGridTuner(handler) {
  const fn = (e) => handler(e.detail);
  window.addEventListener(EVT_OPEN, fn);
  return () => window.removeEventListener(EVT_OPEN, fn);
}
