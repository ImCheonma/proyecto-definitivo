document.querySelectorAll(".search-shortcut").forEach((shortcut) => {
  const toggle = shortcut.querySelector(".search-shortcut-toggle");
  const action = shortcut.querySelector(".search-shortcut-action");

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") !== "true";

    shortcut.classList.toggle("is-expanded", expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute(
      "aria-label",
      expanded ? "Ocultar opciones de pago" : "Mostrar opciones de pago"
    );
    action.setAttribute("aria-hidden", String(!expanded));
    action.tabIndex = expanded ? 0 : -1;
  });
});
