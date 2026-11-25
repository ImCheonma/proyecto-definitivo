const pageLoader = document.querySelector(".page-loader");

if (pageLoader) {
  pageLoader.showModal();

  const hidePageLoader = () => {
    window.setTimeout(() => {
      pageLoader.classList.add("is-hidden");
      window.setTimeout(() => {
        pageLoader.close();
        pageLoader.remove();
      }, 220);
    }, 450);
  };

  if (document.readyState === "complete") {
    hidePageLoader();
  } else {
    window.addEventListener("load", hidePageLoader, { once: true });
  }
}
