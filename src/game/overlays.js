import { AppState } from "../core/appState.js";

export function initOverlays({ onStart, onContinue }) {
  const title = document.getElementById("titleOverlay");
  const start = document.getElementById("startButton");
  const modal = document.getElementById("levelOverlay");
  const modalTitle = document.getElementById("overlayTitle");
  const modalBody = document.getElementById("overlayBody");
  const modalButton = document.getElementById("overlayButton");
  start.addEventListener("click", onStart);
  modalButton.addEventListener("click", onContinue);
  return { title, modal, modalTitle, modalBody, modalButton };
}

export function showTitle(overlays, show) {
  overlays.title.classList.toggle("hidden", !show);
}

export function showLevelComplete(overlays, level) {
  overlays.modalTitle.textContent = `Level ${level.id} cleared`;
  overlays.modalBody.textContent = `${level.name} restored.`;
  overlays.modalButton.textContent = "Next";
  overlays.modal.classList.remove("hidden");
}

export function showGameComplete(overlays) {
  overlays.modalTitle.textContent = "AFTERGLOW RESTORED";
  overlays.modalBody.textContent = "All light paths are stable.";
  overlays.modalButton.textContent = "Restart";
  overlays.modal.classList.remove("hidden");
}

export function hideModal(overlays) {
  overlays.modal.classList.add("hidden");
}

export function syncOverlays(overlays, state) {
  showTitle(overlays, state === AppState.TITLE);
}

