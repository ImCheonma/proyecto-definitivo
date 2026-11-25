const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = __dirname;
const catalogPath = path.join(root, "data", "catalogs.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const categoryNames = {
  "servicios-publicos": "Servicios Públicos",
  "obligaciones-aval": "Obligaciones Aval"
};
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webp": "image/webp"
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function readRequestBody(request, maximumBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let exceededLimit = false;
    const chunks = [];

    request.on("data", chunk => {
      size += chunk.length;
      if (size > maximumBytes) {
        exceededLimit = true;
        chunks.length = 0;
        return;
      }

      if (!exceededLimit) chunks.push(chunk);
    });

    request.on("end", () => {
      resolve(exceededLimit ? null : Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

async function handleTelegramWebhook(request, response, telegramBot) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Método no permitido." });
    return;
  }

  if (!telegramBot.isValidWebhookSecret(request.headers["x-telegram-bot-api-secret-token"])) {
    sendJson(response, 403, { error: "Solicitud no autorizada." });
    return;
  }

  let body;
  try {
    body = await readRequestBody(request, 1024 * 1024);
  } catch {
    sendJson(response, 400, { error: "No se pudo leer la solicitud." });
    return;
  }

  if (body === null) {
    sendJson(response, 413, { error: "La solicitud es demasiado grande." });
    return;
  }

  let update;
  try {
    update = JSON.parse(body);
  } catch {
    sendJson(response, 400, { error: "El contenido JSON no es válido." });
    return;
  }

  if (!update || !Number.isSafeInteger(update.update_id)) {
    sendJson(response, 400, { error: "La actualización de Telegram no es válida." });
    return;
  }

  try {
    await telegramBot.handleUpdate(update);
    sendJson(response, 200, { ok: true });
  } catch (error) {
    console.error(`Error al procesar actualización de Telegram ${update.update_id}: ${error.message}`);
    sendJson(response, 500, { error: "No se pudo procesar la actualización." });
  }
}

function normalizeText(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function parsePositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

function handleApi(request, response, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendJson(response, 405, { error: "Método no permitido." });
    return;
  }

  if (url.pathname === "/api/v1/categories") {
    sendJson(response, 200, {
      data: Object.entries(categoryNames).map(([id, name]) => ({
        id,
        name,
        serviceCount: catalog.services.filter(service => service.category === id).length
      }))
    });
    return;
  }

  if (url.pathname === "/api/v1/services") {
    const category = url.searchParams.get("category");
    if (category && !Object.hasOwn(categoryNames, category)) {
      sendJson(response, 400, { error: "La categoría indicada no existe." });
      return;
    }

    const page = parsePositiveInteger(url.searchParams.get("page"), 1);
    const limit = parsePositiveInteger(url.searchParams.get("limit"), 10, 100);
    if (page === null || limit === null) {
      sendJson(response, 400, { error: "Los parámetros page y limit deben ser enteros positivos; limit no puede superar 100." });
      return;
    }

    const query = normalizeText((url.searchParams.get("search") || "").trim());
    const matches = catalog.services.filter(service => {
      const matchesCategory = !category || service.category === category;
      const matchesSearch = !query
        || normalizeText(`${service.name} ${service.provider}`).includes(query);
      return matchesCategory && matchesSearch;
    });
    const totalPages = Math.ceil(matches.length / limit);
    const start = (page - 1) * limit;
    sendJson(response, 200, {
      data: matches.slice(start, start + limit),
      pagination: {
        page,
        limit,
        total: matches.length,
        totalPages
      }
    });
    return;
  }

  const serviceMatch = url.pathname.match(/^\/api\/v1\/services\/([^/]+)$/);
  if (serviceMatch) {
    let id;
    try {
      id = decodeURIComponent(serviceMatch[1]);
    } catch {
      sendJson(response, 400, { error: "El identificador del convenio no es válido." });
      return;
    }

    const service = catalog.services.find(item => item.id === id);
    if (!service) {
      sendJson(response, 404, { error: "No se encontró el convenio." });
      return;
    }

    sendJson(response, 200, { data: service });
    return;
  }

  sendJson(response, 404, { error: "Endpoint no encontrado." });
}

function serveStaticFile(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    response.writeHead(405);
    response.end();
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400);
    response.end("Ruta no válida.");
    return;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    response.end("Acceso denegado.");
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      if (error.code !== "ENOENT" && error.code !== "EISDIR") {
        console.error(`Error al leer ${filePath}:`, error);
        response.writeHead(500);
        response.end("Error interno del servidor.");
        return;
      }
      response.writeHead(404);
      response.end("No se encontró el archivo.");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  });
}

const server = http.createServer((request, response) => {
  let url;
  try {
    url = new URL(request.url, "http://localhost");
  } catch {
    sendJson(response, 400, { error: "La solicitud no es válida." });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    handleApi(request, response, url);
    return;
  }

  if (telegramBot && url.pathname === telegramBot.webhookPath) {
    handleTelegramWebhook(request, response, telegramBot);
    return;
  }

  serveStaticFile(request, response, url.pathname);
});

const port = parsePositiveInteger(process.env.PORT || null, 3000, 65535);
if (port === null) {
  throw new Error("PORT debe ser un entero entre 1 y 65535.");
}

const telegramEnvironment = [
  process.env.TELEGRAM_BOT_TOKEN,
  process.env.TELEGRAM_PAYMENT_URL,
  process.env.TELEGRAM_WEBHOOK_URL,
  process.env.TELEGRAM_WEBHOOK_SECRET
];
const hasTelegramConfig = telegramEnvironment.some(Boolean);
if (hasTelegramConfig && telegramEnvironment.some(value => !value)) {
  throw new Error("Configura TELEGRAM_BOT_TOKEN, TELEGRAM_PAYMENT_URL, TELEGRAM_WEBHOOK_URL y TELEGRAM_WEBHOOK_SECRET para iniciar el bot.");
}

const telegramBot = hasTelegramConfig ? require("./telegram-bot.js") : null;
const emailMonitorEnvironment = [
  process.env.GMAIL_EMAIL,
  process.env.GMAIL_APP_PASSWORD,
  process.env.TELEGRAM_CHAT_ID
];
const databaseEnvironment = [
  process.env.MYSQL_HOST,
  process.env.MYSQL_USER,
  process.env.MYSQL_PASSWORD,
  process.env.MYSQL_DATABASE
];
const hasEmailMonitorSettings = emailMonitorEnvironment.some(Boolean);
const hasDatabaseSettings = databaseEnvironment.some(Boolean);
if (hasEmailMonitorSettings && emailMonitorEnvironment.some(value => !value)) {
  throw new Error("Configura GMAIL_EMAIL, GMAIL_APP_PASSWORD y TELEGRAM_CHAT_ID para el monitor.");
}
if (hasDatabaseSettings && databaseEnvironment.some(value => !value)) {
  throw new Error("Configura MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD y MYSQL_DATABASE para coordinar el monitor.");
}
if (hasEmailMonitorSettings !== hasDatabaseSettings) {
  console.warn("Monitor de correo desactivado: requiere tanto las variables de Gmail/Telegram como las de MySQL.");
}

const emailMonitor = hasEmailMonitorSettings && hasDatabaseSettings
  ? require("./rappipay-email-bot.js")
  : null;

function stopServices() {
  server.close();
  if (emailMonitor) {
    emailMonitor.stopMonitor().catch(error => {
      console.error(`No se pudo detener el monitor de correo: ${error.message}`);
    });
  }
}

process.once("SIGINT", stopServices);
process.once("SIGTERM", stopServices);

server.listen(port, () => {
  console.log(`Sitio y API disponibles en http://localhost:${port}`);

  if (telegramBot) {
    telegramBot.configureWebhook().catch(error => {
      console.error(`No se pudo configurar el webhook de Telegram: ${error.message}`);
    });
  }

  if (emailMonitor) {
    emailMonitor.startMonitor().catch(error => {
      console.error(`No se pudo iniciar el monitor de correo: ${error.message}`);
      server.close(() => {
        emailMonitor.stopMonitor().catch(stopError => {
          console.error(`No se pudo detener el monitor de correo: ${stopError.message}`);
        }).finally(() => {
          process.exitCode = 1;
        });
      });
    });
  }
});
