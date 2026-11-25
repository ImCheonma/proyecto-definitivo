const paymentUrl = process.env.TELEGRAM_PAYMENT_URL;
const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const webhookPath = "/telegram/webhook";

if (!token) {
  throw new Error("Define la variable TELEGRAM_BOT_TOKEN con el token de BotFather.");
}

if (!paymentUrl) {
  throw new Error("Define TELEGRAM_PAYMENT_URL con el enlace oficial de pago.");
}

if (!webhookUrl) {
  throw new Error("Define TELEGRAM_WEBHOOK_URL con la URL HTTPS del webhook.");
}

if (!webhookSecret || !/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
  throw new Error("Define TELEGRAM_WEBHOOK_SECRET con un secreto de 1 a 256 caracteres alfanuméricos, guion o guion bajo.");
}

let parsedPaymentUrl;
try {
  parsedPaymentUrl = new URL(paymentUrl);
} catch {
  throw new Error("TELEGRAM_PAYMENT_URL debe ser una URL válida.");
}

if (parsedPaymentUrl.protocol !== "https:") {
  throw new Error("TELEGRAM_PAYMENT_URL debe comenzar con https://.");
}

let parsedWebhookUrl;
try {
  parsedWebhookUrl = new URL(webhookUrl);
} catch {
  throw new Error("TELEGRAM_WEBHOOK_URL debe ser una URL válida.");
}

if (
  parsedWebhookUrl.protocol !== "https:"
  || parsedWebhookUrl.pathname !== webhookPath
  || parsedWebhookUrl.search
  || parsedWebhookUrl.hash
) {
  throw new Error(`TELEGRAM_WEBHOOK_URL debe usar HTTPS y terminar exactamente en ${webhookPath}.`);
}

const apiUrl = `https://api.telegram.org/bot${token}`;

async function telegramRequest(method, payload) {
  const response = await fetch(`${apiUrl}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram ${method} falló: ${result.description || response.statusText}`);
  }

  return result.result;
}

async function configureWebhook() {
  const currentWebhook = await telegramRequest("getWebhookInfo", {});
  if (currentWebhook.url === parsedWebhookUrl.href) {
    console.log("Webhook de Telegram ya estaba configurado.");
    return;
  }

  await telegramRequest("setWebhook", {
    url: parsedWebhookUrl.href,
    secret_token: webhookSecret,
    allowed_updates: ["message"]
  });
  console.log("Webhook de Telegram configurado.");
}

function isValidWebhookSecret(value) {
  if (typeof value !== "string") return false;

  const provided = Buffer.from(value);
  const expected = Buffer.from(webhookSecret);
  return provided.length === expected.length
    && require("node:crypto").timingSafeEqual(provided, expected);
}

async function sendPaymentLink(chatId, greeting) {
  await telegramRequest("sendMessage", {
    chat_id: chatId,
    text: `${greeting}\n\nEl pago se realiza en la página segura de RappiPay.`,
    reply_markup: {
      inline_keyboard: [[{ text: "Abrir enlace de pago", url: parsedPaymentUrl.href }]]
    }
  });
}

async function handleUpdate(update) {
  const message = update.message;
  if (!message || !message.chat || typeof message.text !== "string") return;

  const command = message.text.trim().split(/\s/, 1)[0].split("@", 1)[0].toLowerCase();
  if (command === "/start") {
    await sendPaymentLink(message.chat.id, "¡Hola! Usa el botón para continuar con tu pago.");
  } else if (command === "/pagar") {
    await sendPaymentLink(message.chat.id, "Aquí tienes el enlace para realizar tu pago.");
  } else if (command === "/chatid") {
    await telegramRequest("sendMessage", {
      chat_id: message.chat.id,
      text: `ID de este chat: ${message.chat.id}`
    });
  }
}

module.exports = {
  configureWebhook,
  handleUpdate,
  isValidWebhookSecret,
  webhookPath
};
