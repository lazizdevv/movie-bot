const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const fs = require("fs");

// ENV
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = 813057663; // ⚠️ O'ZGARTIR!

// BOT
const bot = new TelegramBot(TOKEN, { polling: true });

// EXPRESS (Railway uchun)
const app = express();
app.get("/", (req, res) => res.send("Bot ishlayapti 🚀"));
app.listen(process.env.PORT || 3000, () => {
  console.log("Server running...");
});

// DB FUNKSIYALAR
const readDB = () => {
  try {
    return JSON.parse(fs.readFileSync("./db.json"));
  } catch {
    return { movies: [] };
  }
};

const writeDB = (data) => {
  fs.writeFileSync("./db.json", JSON.stringify(data, null, 2));
};

// START
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "🎬 Kino botga xush kelibsiz!\nKod yuboring:");
});

// 🔍 USER SEARCH (kod bo‘yicha)
bot.on("message", (msg) => {
  if (msg.text && !msg.text.startsWith("/")) {
    const db = readDB();
    const movie = db.movies.find(m => m.code === msg.text);

    if (!movie) {
      return bot.sendMessage(msg.chat.id, "❌ Kino topilmadi");
    }

    bot.sendVideo(msg.chat.id, movie.file_id, {
      caption: `🎬 ${movie.name}`
    });
  }
});

// 🎬 ADMIN LOGIC
let waitingMovie = {};

bot.on("message", (msg) => {
  if (msg.from.id !== ADMIN_ID) return;

  // /add
  if (msg.text === "/add") {
    waitingMovie[msg.from.id] = {};
    return bot.sendMessage(msg.chat.id, "🎬 Kino nomini yozing:");
  }

  // nom
  if (waitingMovie[msg.from.id] && !waitingMovie[msg.from.id].name) {
    waitingMovie[msg.from.id].name = msg.text;
    return bot.sendMessage(msg.chat.id, "🔢 Kino kodi yozing:");
  }

  // kod
  if (waitingMovie[msg.from.id] && !waitingMovie[msg.from.id].code) {
    waitingMovie[msg.from.id].code = msg.text;
    return bot.sendMessage(msg.chat.id, "📹 Endi videoni yuboring:");
  }

  // video
  if (msg.video && waitingMovie[msg.from.id]) {
    const file_id = msg.video.file_id;

    const db = readDB();
    db.movies.push({
      name: waitingMovie[msg.from.id].name,
      code: waitingMovie[msg.from.id].code,
      file_id
    });

    writeDB(db);
    delete waitingMovie[msg.from.id];

    return bot.sendMessage(msg.chat.id, "✅ Kino qo‘shildi!");
  }
});