const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error("Define TELEGRAM_BOT_TOKEN con el token de BotFather.");
}

async function getChatIds() {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/getUpdates`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed_updates: ["message", "channel_post"] })
    }
  );
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram respondió HTTP ${response.status}`);
  }

  const seen = new Map();
  for (const update of result.result) {
    const message = update.message || update.channel_post;
    if (!message?.chat) continue;
    seen.set(String(message.chat.id), {
      id: message.chat.id,
      title: message.chat.title,
      username: message.chat.username,
      type: message.chat.type
    });
  }

  if (seen.size === 0) {
    console.log("No se encontraron chats.");
    console.log("Envíale /start al bot o agrega el bot al canal/grupo y escribe un mensaje.");
  } else {
    console.log(JSON.stringify([...seen.values()], null, 2));
  }
}

getChatIds().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
