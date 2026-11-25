const mobileMenuToggle = document.querySelector(".mobile-menu-toggle");
const mobileNavigation = document.querySelector("#mobile-navigation");

function setMobileMenuOpen(isOpen) {
  mobileMenuToggle.setAttribute("aria-expanded", String(isOpen));
  mobileNavigation.hidden = !isOpen;
  mobileMenuToggle.querySelector("[data-menu-label]").textContent = isOpen ? "Cerrar" : "Menú";
}

mobileMenuToggle.addEventListener("click", () => {
  setMobileMenuOpen(mobileMenuToggle.getAttribute("aria-expanded") !== "true");
});

mobileNavigation.addEventListener("click", event => {
  if (event.target.closest("a")) {
    setMobileMenuOpen(false);
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && mobileMenuToggle.getAttribute("aria-expanded") === "true") {
    setMobileMenuOpen(false);
    mobileMenuToggle.focus();
  }
});
