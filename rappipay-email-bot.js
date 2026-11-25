const { createHash, randomUUID } = require("node:crypto");
const Imap = require("imap");
const { simpleParser } = require("mailparser");
const mysql = require("mysql2/promise");

const {
  GMAIL_EMAIL,
  GMAIL_APP_PASSWORD,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  MYSQL_HOST,
  MYSQL_PORT = "3306",
  MYSQL_USER,
  MYSQL_PASSWORD,
  MYSQL_DATABASE,
  IMAP_HOST = "imap.gmail.com",
  IMAP_PORT = "993",
  RAPPIPAY_FROM = "noreply@rappipay.co",
  RAPPIPAY_SUBJECT = "Resumen de transferencia con link Pse",
  RAPPIPAY_POLL_SECONDS = "60"
} = process.env;

const requiredEnvironment = {
  GMAIL_EMAIL,
  GMAIL_APP_PASSWORD,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  MYSQL_HOST,
  MYSQL_USER,
  MYSQL_PASSWORD,
  MYSQL_DATABASE
};
const missingEnvironment = Object.entries(requiredEnvironment)
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missingEnvironment.length > 0) {
  throw new Error(`Define las variables requeridas para el monitor: ${missingEnvironment.join(", ")}.`);
}

const mysqlPort = Number(MYSQL_PORT);
if (!Number.isInteger(mysqlPort) || mysqlPort < 1 || mysqlPort > 65535) {
  throw new Error("MYSQL_PORT debe ser un entero entre 1 y 65535.");
}

const pollSeconds = Number(RAPPIPAY_POLL_SECONDS);
if (!Number.isInteger(pollSeconds) || pollSeconds < 5 || pollSeconds > 3600) {
  throw new Error("RAPPIPAY_POLL_SECONDS debe ser un entero entre 5 y 3600.");
}

const mailboxHash = createHash("sha256")
  .update(GMAIL_EMAIL.toLowerCase())
  .digest("hex");
const processedTable = "rappipay_processed_emails";
let pool;
let currentImap;
let pollTimer;
let reconnectTimer;
let reconnectDelay = 5000;
let pollInProgress = false;
let stopping = false;
let startupPromise;
let loggedInitialMailboxScan = false;

function createDatabasePool() {
  return mysql.createPool({
    host: MYSQL_HOST,
    port: mysqlPort,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 3,
    queueLimit: 0
  });
}

async function ensureProcessedTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${processedTable} (
      mailbox_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      uid_validity BIGINT UNSIGNED NOT NULL,
      uid BIGINT UNSIGNED NOT NULL,
      state ENUM('processing', 'sent') NOT NULL,
      claim_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      lease_until DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (mailbox_hash, uid_validity, uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function cleanText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return cleanText(match[1]);
  }
  return "No disponible";
}

const paymentFieldLabels = [
  /^(?:Monto|Valor)\b/i,
  /^Tipo\s+de\s+transacci[oó]n\b/i,
  /^Banco(?:\s+origen)?\b/i,
  /^N[uú]mero\s+de\s+aprobaci[oó]n\b/i,
  /^(?:Fecha\s+de\s+la\s+transacci[oó]n|Fecha|Date)\b/i,
  /^(?:Hora\s+de\s+la\s+transacci[oó]n|Hora|Time)\b/i,
  /^(?:Comprador|Cliente|Pagador)\b/i,
  /^(?:ID\s*(?:de\s*)?[Tt]ransacci[oó]n|Transaction\s*ID)\b/i,
  /^(?:Referencia|Reference)\b/i
];

function isPaymentFieldLabel(line) {
  return paymentFieldLabels.some(pattern => pattern.test(line));
}

function findFieldValue(text, labelPattern) {
  const lines = cleanText(text).split("\n").map(line => line.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(
      new RegExp(`^(?:${labelPattern})(?:\\s*[:\\-–]\\s*|\\s+)?(.*)$`, "i")
    );
    if (!match) continue;

    const value = cleanText(match[1]);
    if (value) return value;

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      if (isPaymentFieldLabel(lines[nextIndex])) break;
      return lines[nextIndex];
    }
  }

  return "No disponible";
}

function parsePayment(emailText, htmlText) {
  const htmlAsText = String(htmlText || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:td|th|tr|p|div|li|h[1-6]|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'");
  const text = cleanText([
    emailText,
    htmlAsText
  ].join("\n"));

  const montoText = findFieldValue(text, "(?:Monto|Valor)(?:\\s+Recibido)?");
  const amountMatch = montoText.match(/\$?\s*([\d.,]+)/) || text.match(/\$\s*([\d.,]+)\s*(?:COP)?/i);
  const monto = amountMatch ? cleanText(amountMatch[1]) : "No disponible";
  const tipoTransaccion = findFieldValue(text, "Tipo\\s+de\\s+transacci[oó]n");
  const banco = findFieldValue(text, "Banco(?:\\s+origen)?");
  const numeroAprobacion = findFieldValue(text, "N[uú]mero\\s+de\\s+aprobaci[oó]n");
  const comprador = findFieldValue(text, "Comprador|Cliente|Pagador") !== "No disponible"
    ? findFieldValue(text, "Comprador|Cliente|Pagador")
    : firstMatch(text, [/¡?\s*Hola,?\s*([^!\n]+)!/i]);
  const transaccion = findFieldValue(
    text,
    "ID\\s*(?:de\\s*)?[Tt]ransacci[oó]n|Transaction\\s*ID"
  );
  const referencia = findFieldValue(text, "Referencia|Reference");
  const fecha = findFieldValue(text, "Fecha\\s+de\\s+la\\s+transacci[oó]n|Fecha|Date");
  const hora = findFieldValue(text, "Hora\\s+de\\s+la\\s+transacci[oó]n|Hora|Time");

  return {
    monto,
    tipoTransaccion,
    banco,
    comprador,
    numeroAprobacion,
    transaccion,
    referencia,
    fecha,
    hora
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTelegramMessage(payment) {
  const details = [
    ["💰 <b>Monto recibido:</b>", payment.monto],
    ["🏷 <b>Tipo de transacción:</b>", payment.tipoTransaccion],
    ["🏦 <b>Banco origen:</b>", payment.banco],
    ["👤 <b>Comprador:</b>", payment.comprador],
    ["🔢 <b>Número de aprobación:</b>", payment.numeroAprobacion],
    ["📄 <b>ID transacción:</b>", payment.transaccion],
    ["🔗 <b>Referencia:</b>", payment.referencia],
    ["📅 <b>Fecha:</b>", payment.fecha],
    ["🕒 <b>Hora:</b>", payment.hora]
  ]
    .filter(([, value]) => value && value !== "No disponible")
    .map(([label, value]) => `${label} ${label.includes("Monto") ? "$" : ""}${escapeHtml(value)}`);

  return [
    "✅ <b>Nuevo recaudo confirmado y pagado</b>",
    "",
    ...details
  ].join("\n");
}

async function sendTelegram(text) {
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML"
      })
    }
  );
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram respondió HTTP ${response.status}`);
  }
}

async function claimEmail(uidValidity, uid) {
  const claimToken = randomUUID();
  await pool.execute(`
    INSERT INTO ${processedTable}
      (mailbox_hash, uid_validity, uid, state, claim_token, lease_until)
    VALUES (?, ?, ?, 'processing', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE))
    ON DUPLICATE KEY UPDATE
      claim_token = IF(
        state = 'processing' AND lease_until < UTC_TIMESTAMP(),
        ?,
        claim_token
      ),
      lease_until = IF(
        state = 'processing' AND lease_until < UTC_TIMESTAMP(),
        DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE),
        lease_until
      )
  `, [mailboxHash, uidValidity, uid, claimToken, claimToken]);

  const [rows] = await pool.execute(`
    SELECT state, claim_token
    FROM ${processedTable}
    WHERE mailbox_hash = ?
      AND uid_validity = ?
      AND uid = ?
  `, [mailboxHash, uidValidity, uid]);
  const claim = rows[0];
  return claim && claim.state === "processing" && claim.claim_token === claimToken
    ? claimToken
    : null;
}

async function markEmailSent(uidValidity, uid, claimToken) {
  const [result] = await pool.execute(`
    UPDATE ${processedTable}
    SET state = 'sent', lease_until = UTC_TIMESTAMP()
    WHERE mailbox_hash = ?
      AND uid_validity = ?
      AND uid = ?
      AND state = 'processing'
      AND claim_token = ?
  `, [mailboxHash, uidValidity, uid, claimToken]);

  if (result.affectedRows !== 1) {
    throw new Error("No se pudo confirmar la reserva del correo en MySQL.");
  }
}

async function emailWasSent(uidValidity, uid) {
  const [rows] = await pool.execute(`
    SELECT state
    FROM ${processedTable}
    WHERE mailbox_hash = ?
      AND uid_validity = ?
      AND uid = ?
  `, [mailboxHash, uidValidity, uid]);

  return rows[0] && rows[0].state === "sent";
}

async function releaseEmailClaim(uidValidity, uid, claimToken) {
  await pool.execute(`
    DELETE FROM ${processedTable}
    WHERE mailbox_hash = ?
      AND uid_validity = ?
      AND uid = ?
      AND state = 'processing'
      AND claim_token = ?
  `, [mailboxHash, uidValidity, uid, claimToken]);
}

function parseAddress(addresses) {
  if (!addresses) return "";
  return (addresses.value || []).map(item => item.address || "").join(", ");
}

function markAsSeen(imap, uid) {
  return new Promise((resolve, reject) => {
    imap.addFlags(uid, ["\\Seen"], error => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function processMessage(imap, uidValidity, uid, parsed) {
  const sender = parseAddress(parsed.from);
  const subject = String(parsed.subject || "");
  const senderMatches = sender.toLowerCase().includes(RAPPIPAY_FROM.toLowerCase());
  const subjectMatches = subject.toLowerCase().includes(RAPPIPAY_SUBJECT.toLowerCase());
  if (!senderMatches || !subjectMatches) {
    console.log(
      `Correo ${uidValidity}/${uid} omitido: remitente coincide=${senderMatches}, asunto coincide=${subjectMatches}.`
    );
    return;
  }

  const claimToken = await claimEmail(uidValidity, uid);
  if (!claimToken) {
    console.log(`Correo ${uidValidity}/${uid} omitido: ya está reservado o procesado en MySQL.`);
    if (await emailWasSent(uidValidity, uid)) {
      try {
        await markAsSeen(imap, uid);
        console.log(`Correo ${uidValidity}/${uid} ya enviado; se marcó como leído sin reenviar el aviso.`);
      } catch (error) {
        console.error(
          `El aviso ya estaba enviado, pero no se pudo marcar el correo ${uidValidity}/${uid} como leído: ${error.message}`
        );
      }
    }
    return;
  }

  let telegramSent = false;
  try {
    const payment = parsePayment(parsed.text || "", parsed.html || "");
    await sendTelegram(formatTelegramMessage(payment));
    telegramSent = true;
    await markEmailSent(uidValidity, uid, claimToken);
    console.log(`Recaudo enviado: ${uidValidity}/${uid}`);

    try {
      await markAsSeen(imap, uid);
    } catch (error) {
      console.error(`El aviso se envió, pero no se pudo marcar el correo como leído: ${error.message}`);
      return;
    }
  } catch (error) {
    if (!telegramSent) {
      try {
        await releaseEmailClaim(uidValidity, uid, claimToken);
      } catch (releaseError) {
        console.error(`No se pudo liberar la reserva del correo ${uid}: ${releaseError.message}`);
      }
    } else {
      console.error(
        `El aviso ya se envió, pero no se pudo confirmar su estado en MySQL para ${uidValidity}/${uid}; se conserva la reserva para evitar un reenvío: ${error.message}`
      );
    }
    throw error;
  }
}

function searchUnseen(imap) {
  return new Promise((resolve, reject) => {
    imap.search([
      "UNSEEN",
      ["FROM", RAPPIPAY_FROM],
      ["SUBJECT", RAPPIPAY_SUBJECT]
    ], (error, results) => {
      if (error) reject(error);
      else resolve(results || []);
    });
  });
}

function fetchUnseen(imap, uidValidity, uids) {
  return new Promise((resolve, reject) => {
    const tasks = [];
    const fetch = imap.fetch(uids, { bodies: "", struct: true });

    fetch.on("message", message => {
      let uid;
      const bodyChunks = [];
      const task = new Promise((resolveMessage, rejectMessage) => {
        message.once("attributes", attributes => {
          uid = String(attributes.uid);
        });
        message.on("body", stream => {
          stream.on("data", chunk => bodyChunks.push(chunk));
          stream.once("error", rejectMessage);
        });
        message.once("error", rejectMessage);
        message.once("end", () => {
          Promise.resolve().then(async () => {
            if (!uid) throw new Error("El mensaje IMAP no incluyó UID.");
            const parsed = await simpleParser(Buffer.concat(bodyChunks));
            await processMessage(imap, uidValidity, uid, parsed);
          }).then(resolveMessage, rejectMessage);
        });
      });
      tasks.push(task);
    });

    fetch.once("error", reject);
    fetch.once("end", async () => {
      const results = await Promise.allSettled(tasks);
      const failure = results.find(result => result.status === "rejected");
      if (failure) reject(failure.reason);
      else resolve();
    });
  });
}

async function pollMailbox(imap, uidValidity) {
  if (pollInProgress || stopping || imap !== currentImap) return;

  pollInProgress = true;
  try {
    const unseen = await searchUnseen(imap);
    if (!loggedInitialMailboxScan || unseen.length > 0) {
      console.log(`Correos de RappiPay no leídos candidatos en INBOX: ${unseen.length}.`);
      loggedInitialMailboxScan = true;
    }
    if (unseen.length > 0) {
      await fetchUnseen(imap, uidValidity, unseen);
    }
  } catch (error) {
    console.error(`Error al revisar el correo: ${error.message}`);
  } finally {
    pollInProgress = false;
  }
}

function scheduleReconnect() {
  if (stopping || reconnectTimer) return;

  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, 60000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    connectImap();
  }, delay);
  console.warn(`Se intentará reconectar a Gmail en ${Math.ceil(delay / 1000)} segundos.`);
}

function connectImap() {
  if (stopping) return;

  const imap = new Imap({
    user: GMAIL_EMAIL,
    password: GMAIL_APP_PASSWORD.replace(/\s/g, ""),
    host: IMAP_HOST,
    port: Number(IMAP_PORT),
    authTimeout: 30000,
    tls: true,
    tlsOptions: {
      servername: IMAP_HOST,
      rejectUnauthorized: true
    }
  });
  currentImap = imap;

  imap.once("ready", () => {
    imap.openBox("INBOX", false, (error, box) => {
      if (error) {
        console.error(`No se pudo abrir INBOX: ${error.message}`);
        imap.end();
        return;
      }

      reconnectDelay = 5000;
      const uidValidity = String(box.uidvalidity);
      loggedInitialMailboxScan = false;
      console.log("Monitor RappiPay conectado a Gmail.");
      pollMailbox(imap, uidValidity);
      pollTimer = setInterval(
        () => pollMailbox(imap, uidValidity),
        pollSeconds * 1000
      );
    });
  });

  imap.once("error", error => {
    console.error(`Error IMAP: ${error.message}`);
  });

  imap.once("end", () => {
    if (currentImap !== imap) return;
    currentImap = undefined;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }

    if (!stopping) scheduleReconnect();
  });

  imap.connect();
}

async function startMonitor() {
  if (startupPromise) return startupPromise;

  startupPromise = (async () => {
    pool = createDatabasePool();
    await ensureProcessedTable();
    console.log("Coordinación de instancias del monitor lista en MySQL.");
    connectImap();
  })();
  return startupPromise;
}

async function stopMonitor() {
  stopping = true;
  if (pollTimer) clearInterval(pollTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (currentImap) {
    const imap = currentImap;
    currentImap = undefined;
    imap.end();
  }
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = { startMonitor, stopMonitor };
