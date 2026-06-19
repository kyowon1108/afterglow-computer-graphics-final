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
  overlays.modalTitle.textContent = `${level.id}단계 통과`;
  overlays.modalBody.textContent = `${level.name} — 빛길을 완성했습니다.`;
  overlays.modalButton.textContent = "다음";
  overlays.modal.classList.remove("hidden");
}

export function showGameComplete(overlays) {
  overlays.modalTitle.textContent = "모든 빛길이 안정되었습니다";
  overlays.modalBody.textContent = "모든 단계를 끝냈습니다.";
  overlays.modalButton.textContent = "다시 시작";
  overlays.modal.classList.remove("hidden");
}

export function hideModal(overlays) {
  overlays.modal.classList.add("hidden");
}

export function syncOverlays(overlays, state) {
  showTitle(overlays, state === AppState.TITLE);
}
