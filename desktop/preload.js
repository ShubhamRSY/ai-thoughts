// Keep renderer isolated — no Node APIs exposed to the web app.
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.aitoDesktop = "1";
});
