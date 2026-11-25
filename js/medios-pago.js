const params = new URLSearchParams(window.location.search);
const serviceName = params.get("servicio") || "Servicio seleccionado";
const serviceLogoPath = params.get("logo") || "";
const locationName = params.get("ubicacion") || "Colombia";
const nameWords = (serviceName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[A-Za-z0-9]+/g) || [])
  .filter(word => !["DE", "DEL", "LA", "LAS", "EL", "LOS", "Y", "SA", "SAS", "ESP"].includes(word.toUpperCase()));
const serviceInitials = nameWords.slice(0, 2).map(word => word[0]).join("").toUpperCase() || "?";
const displayServiceName = serviceName
  .toLocaleLowerCase("es-CO")
  .replace(/(^|[\s-])(\S)/g, (_, separator, character) => `${separator}${character.toLocaleUpperCase("es-CO")}`);

document.querySelector("#service-name").textContent = displayServiceName;
document.querySelector("#service-summary-name").textContent = displayServiceName;
document.querySelector("#service-location").textContent = locationName;
document.title = `${displayServiceName} | Realiza tu pago`;

const serviceLogo = document.querySelector("#service-logo");
const serviceLogoFallback = document.querySelector("#service-logo-fallback");
serviceLogoFallback.textContent = serviceInitials;

if (serviceLogoPath.startsWith("assets/images/") && !serviceLogoPath.includes("..")) {
  serviceLogo.alt = `Logo de ${displayServiceName}`;
  serviceLogo.addEventListener("load", () => {
    serviceLogoFallback.hidden = true;
  }, { once: true });
  serviceLogo.addEventListener("error", () => {
    serviceLogo.hidden = true;
    serviceLogoFallback.hidden = false;
  }, { once: true });
  serviceLogo.src = serviceLogoPath;
} else {
  serviceLogo.hidden = true;
  serviceLogoFallback.hidden = false;
}

document.querySelectorAll("[data-logo-src]").forEach(image => {
  const fallback = image.nextElementSibling;
  image.addEventListener("load", () => {
    fallback.hidden = true;
  }, { once: true });
  image.addEventListener("error", () => {
    image.hidden = true;
  }, { once: true });
  image.src = image.dataset.logoSrc;
});

const paymentForm = document.querySelector("#payment-form");
const formMessage = document.querySelector("#form-message");
const confirmationDialog = document.querySelector("#payment-confirmation");
let paymentDestination = "";

function showFormMessage(message) {
  formMessage.textContent = message;
}

function closeConfirmation() {
  if (confirmationDialog.open) {
    confirmationDialog.close();
  }
  paymentDestination = "";
}

function readPaymentDestination() {
  const selectedMethod = paymentForm.querySelector('input[name="medio"]:checked');
  if (!selectedMethod) {
    showFormMessage("Selecciona un medio de pago para continuar.");
    return "";
  }
  const paymentCard = selectedMethod.closest(".payment-method-card");
  const paymentUrl = paymentCard.dataset.paymentUrl;

  if (!paymentUrl || paymentUrl === "PEGA_AQUI_EL_ENLACE_DE_PAGO") {
    showFormMessage("Agrega tu enlace de pago en data-payment-url para el medio seleccionado.");
    return "";
  }

  let destination;
  try {
    destination = new URL(paymentUrl);
  } catch {
    showFormMessage("El enlace de pago no es válido. Usa una dirección completa que comience con https:// o http://.");
    return "";
  }

  if (destination.protocol !== "https:" && destination.protocol !== "http:") {
    showFormMessage("El enlace de pago debe comenzar con https:// o http://.");
    return "";
  }

  return destination.href;
}

function fillConfirmation() {
  const selectedMethod = paymentForm.querySelector('input[name="medio"]:checked');
  const paymentCard = selectedMethod.closest(".payment-method-card");
  const methodLabel = paymentCard.querySelector(".payment-method-fallback").textContent;
  const values = {
    "confirm-service": displayServiceName,
    "confirm-reference": paymentForm.elements.referencia.value.trim(),
    "confirm-name": paymentForm.elements.nombre.value.trim(),
    "confirm-email": paymentForm.elements.correo.value.trim(),
    "confirm-id": paymentForm.elements.cedula.value.trim(),
    "confirm-method": methodLabel
  };

  Object.entries(values).forEach(([id, value]) => {
    document.getElementById(id).textContent = value;
  });
}

paymentForm.addEventListener("input", () => {
  showFormMessage("");
});

paymentForm.addEventListener("submit", event => {
  event.preventDefault();

  const destination = readPaymentDestination();
  if (!destination) return;

  paymentDestination = destination;
  fillConfirmation();
  confirmationDialog.showModal();
});

document.querySelector("#cancel-payment").addEventListener("click", closeConfirmation);
document.querySelector("#close-confirmation").addEventListener("click", closeConfirmation);
confirmationDialog.addEventListener("cancel", event => {
  event.preventDefault();
  closeConfirmation();
});
document.querySelector("#confirm-payment").addEventListener("click", () => {
  if (paymentDestination) {
    window.location.assign(paymentDestination);
  }
});
