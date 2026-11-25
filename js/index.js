
  // Reemplaza cada nombre por la ruta o URL de tu imagen.
  // Orden: imagen grande izquierda, imagen superior derecha, imagen inferior derecha.
  const benefitSlides = [
    {
      images: ["assets/images/imagen de mujer.png", "assets/images/imagen2.png", "assets/images/imagen3.png"],
      alts: [
        "Persona usando sus medios de pago",
        "Persona pagando en un restaurante",
        "Mujer usando su teléfono"
      ],
      title: "En un sólo lugar",
      description: "Accede a más de 25 mil convenios públicos y privados para pago a nivel nacional 24 horas disponibles."
    },
    {
      // Imágenes de la diapositiva "Tus medios de pago preferidos".
      images: ["assets/images/muerenavion.png", "assets/images/hombrebar.png", "assets/images/mujercel.png"],
      alts: [
        "Persona usando una tarjeta y un teléfono",
        "Cliente pagando en un restaurante",
        "Mujer mostrando su teléfono"
      ],
      title: "Tus medios de pago preferidos",
      description: "Realiza tus pagos con tus productos Aval, Tarjetas de Crédito de cualquier entidad financiera y PSE en un solo lugar sin costos adicionales y de forma segura."
    },
    {
      // Imágenes de la diapositiva "Gratis, disponible y seguro".
      images: ["assets/images/abuela.png", "assets/images/enfermera.png", "assets/images/datafono.png"],
      alts: [
        "Persona usando el servicio desde su teléfono",
        "Pago digital en un establecimiento",
        "Pago con tarjeta en una terminal"
      ],
      title: "Gratis, disponible y seguro",
      description: "Encuentra un servicio disponible las 24 horas, con procesos simples y seguros a 0 costo."
    }
  ];

  const benefitImages = document.querySelectorAll(".benefits-images img");
  const benefitTitle = document.querySelector(".benefits-text h3");
  const benefitDescription = document.querySelector(".benefits-text p");
  const benefitDots = document.querySelectorAll(".benefits-pagination button");
  const benefitSlideElements = [
    document.querySelector(".benefits-images"),
    document.querySelector(".benefit-slide-copy")
  ];
  let currentBenefit = 0;

  function animateCarouselElements(elements, direction) {
    if (direction === 0) return;

    const animationClass = direction > 0
      ? "carousel-slide-in-next"
      : "carousel-slide-in-previous";
    const animationClasses = [
      "carousel-slide-in-next",
      "carousel-slide-in-previous"
    ];

    elements.forEach(element => {
      element.classList.remove(...animationClasses);
      void element.offsetWidth;
      element.classList.add(animationClass);
    });
  }

  function showBenefit(index, direction = 0) {
    currentBenefit = (index + benefitSlides.length) % benefitSlides.length;
    const slide = benefitSlides[currentBenefit];

    animateCarouselElements(benefitSlideElements, direction);
    benefitImages.forEach((image, imageIndex) => {
      image.src = slide.images[imageIndex];
      image.alt = slide.alts[imageIndex];
    });
    benefitTitle.textContent = slide.title;
    benefitDescription.textContent = slide.description;
    benefitDots.forEach((dot, dotIndex) => {
      dot.setAttribute("aria-current", String(dotIndex === currentBenefit));
    });
  }

  document.querySelector("[data-benefit-prev]").addEventListener("click", () => {
    showBenefit(currentBenefit - 1, -1);
  });
  document.querySelector("[data-benefit-next]").addEventListener("click", () => {
    showBenefit(currentBenefit + 1, 1);
  });
  benefitDots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      showBenefit(index, Math.sign(index - currentBenefit));
    });
  });

  showBenefit(0);

  const reminderSlides = [
    {
      image: "assets/images/banner-No olvides.png",
      alt: "Persona consultando su teléfono",
      title: "No olvides",
      description: "Tener a la mano el número de referencia de pago o datos de tu obligación y recursos disponibles para realizar tu pago de manera ágil.",
      link: "#"
    },
    {
      image: "assets/images/banner-Nos importa tu seguridad.png",
      alt: "Mujer registrándose desde su teléfono",
      title: "Regístrate y accede con seguridad",
      description: "Cuentas con un portal de pagos con usuario y contraseña donde estará protegida tu información personal y financiera.",
      link: "#"
    },
    {
      image: "assets/images/banner-boton-aval.png",
      alt: "Personas celebrando junto a los logos de los Bancos Aval",
      title: "Si haces parte de los Bancos Aval recuerda que:",
      description: "Puedes hacer pagos a través del botón Aval usando tus cuentas de ahorros y cuentas corrientes.",
      link: "#"
    }
  ];

  const reminderImage = document.querySelector("[data-reminder-image]");
  const reminderTitle = document.querySelector("[data-reminder-title]");
  const reminderDescription = document.querySelector("[data-reminder-description]");
  const reminderLink = document.querySelector("[data-reminder-link]");
  const reminderDots = document.querySelectorAll(".reminder-pagination button");
  const reminderSlideElements = [
    document.querySelector(".reminder-copy"),
    reminderImage
  ];
  let currentReminder = 0;

  function showReminder(index, direction = 0) {
    currentReminder = (index + reminderSlides.length) % reminderSlides.length;
    const slide = reminderSlides[currentReminder];

    animateCarouselElements(reminderSlideElements, direction);
    reminderImage.src = slide.image;
    reminderImage.alt = slide.alt;
    reminderTitle.textContent = slide.title;
    reminderDescription.textContent = slide.description;
    reminderLink.href = slide.link;
    reminderDots.forEach((dot, dotIndex) => {
      dot.setAttribute("aria-current", String(dotIndex === currentReminder));
    });
  }

  document.querySelector("[data-reminder-prev]").addEventListener("click", () => {
    showReminder(currentReminder - 1, -1);
  });
  document.querySelector("[data-reminder-next]").addEventListener("click", () => {
    showReminder(currentReminder + 1, 1);
  });
  reminderDots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      showReminder(index, Math.sign(index - currentReminder));
    });
  });

  showReminder(0);
