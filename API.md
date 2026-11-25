# API de convenios

El catálogo funciona con los convenios y logos incluidos en `data/catalogs.json`.
No consulta obligaciones de clientes ni ejecuta pagos. Para esas operaciones se
requieren integraciones y credenciales oficiales de cada proveedor.

## Iniciar el sitio y la API

Requiere Node.js 18 o posterior. Desde la carpeta del proyecto ejecuta:

```powershell
node server.js
```

Abre `http://localhost:3000`. Para cambiar el puerto, define la variable
`PORT` antes de iniciar el servidor.

## Endpoints

- `GET /api/v1/categories`: lista las categorías disponibles y el número de convenios.
- `GET /api/v1/services?category=servicios-publicos`: consulta convenios de servicios públicos.
- `GET /api/v1/services?category=obligaciones-aval`: consulta obligaciones Aval.
- `GET /api/v1/services?category=servicios-publicos&search=agua&page=1&limit=10`: busca y pagina resultados.
- `GET /api/v1/services/{id}`: obtiene un convenio por su identificador.

Los parámetros `category` y `search` son opcionales. `page` inicia en 1 y
`limit` acepta valores entre 1 y 100. La búsqueda ignora mayúsculas y tildes.
Las respuestas de listas incluyen `data` y metadatos de paginación.

Las páginas de convenios usan sus scripts locales y muestran sus listas aunque
este servidor no esté iniciado. Esta API expone únicamente el catálogo público;
no consulta saldos u obligaciones de clientes ni ejecuta pagos. Una consulta
personalizada requiere documentación oficial y acceso autorizado del proveedor
correspondiente.

En un hosting Node.js, inicia la aplicación con `npm start` o `node server.js`.
Con las cuatro variables `TELEGRAM_BOT_TOKEN`, `TELEGRAM_PAYMENT_URL`,
`TELEGRAM_WEBHOOK_URL` y `TELEGRAM_WEBHOOK_SECRET`, el servidor configura el
webhook de Telegram y recibe actualizaciones en `/telegram/webhook`. Todas las
réplicas deben usar la misma URL HTTPS y el mismo secreto. No ejecutes también
un proceso que use `getUpdates`.

## Bot de Telegram mediante webhook

El bot responde a `/start` y `/pagar` con un botón que abre el enlace de pago.
Este bot solo comparte el enlace; no confirma pagos. Para confirmar recaudos
se necesita una integración oficial de RappiPay, como un webhook o API.

Configura en Hostinger el token de BotFather, el enlace HTTPS de pago, la URL
pública HTTPS que termina en `/telegram/webhook` y un secreto aleatorio. El
servidor registra el webhook al arrancar y valida el encabezado secreto enviado
por Telegram.
Al iniciar, consulta primero el estado del webhook y solo lo registra si la URL
configurada no coincide; así evita repetir `setWebhook` en cada reinicio o réplica.

## Monitor RappiPay por correo

El monitor `rappipay-email-bot.js` revisa periódicamente los mensajes no leídos
de INBOX mediante IMAP. Por defecto filtra el remitente
`noreply@rappipay.co` y el asunto `Resumen de transferencia con link Pse`;
puedes cambiarlos con `RAPPIPAY_FROM` y `RAPPIPAY_SUBJECT`. Envía al chat los
datos que logra extraer del cuerpo del correo. Para ejecutarlo en varias
réplicas, todas deben compartir una base MySQL. La tabla de control se crea
automáticamente y reserva cada correo, identificado por su UID IMAP, para una
sola instancia. Esto no deduplica dos correos distintos que correspondan al
mismo pago; para eso se necesita un identificador estable de la transacción.
Para la plantilla actual extrae monto, tipo de transacción, banco de origen,
comprador indicado en el saludo, número de aprobación, fecha y hora; omite los
campos que no estén presentes. Los registros indican cuántos candidatos no
leídos encuentra y si omite un mensaje porque ya está reservado o procesado.

Instala las dependencias:

```powershell
npm.cmd install
```

Configura `GMAIL_EMAIL`, `GMAIL_APP_PASSWORD`, `TELEGRAM_CHAT_ID`,
`MYSQL_HOST`, `MYSQL_PORT` (opcional; por defecto `3306`), `MYSQL_USER`,
`MYSQL_PASSWORD` y `MYSQL_DATABASE` en el entorno de la aplicación. Si Gmail y
Telegram están configurados pero falta MySQL, el monitor permanece desactivado
para evitar notificaciones duplicadas entre réplicas.

No publiques el token, la contraseña de aplicación ni las credenciales de
MySQL. La tabla compartida evita que varias réplicas anuncien el mismo correo.
