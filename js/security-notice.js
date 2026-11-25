const securityNotice = document.querySelector("#security-notice");

document.querySelectorAll("[data-dismiss-security-notice]").forEach(button => {
  button.addEventListener("click", () => securityNotice.close());
});

document.querySelectorAll("[data-open-security-notice]").forEach(button => {
  button.addEventListener("click", () => {
    if (!securityNotice.open) {
      securityNotice.showModal();
    }
  });
});

securityNotice.showModal();
