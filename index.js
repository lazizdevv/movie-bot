const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const fs = require("fs");

// ═══════════════════════════════════════════
//  ENV & CONFIG
// ═══════════════════════════════════════════
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || "813057663")
  .split(",")
  .map((id) => parseInt(id.trim()));

const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || ""; // "@yourchannel" majburiy obuna

// ═══════════════════════════════════════════
//  BOT & SERVER
// ═══════════════════════════════════════════
const bot = new TelegramBot(TOKEN, { polling: true });

const app = express();
app.get("/", (req, res) => res.send("🎬 Movie Bot ishlayapti!"));
app.listen(process.env.PORT || 3000, () => console.log("Server running..."));

// ═══════════════════════════════════════════
//  JANRLAR
// ═══════════════════════════════════════════
const GENRES = [
  { id: "action",      emoji: "💥", name: "Jangovar" },
  { id: "comedy",      emoji: "😂", name: "Komediya" },
  { id: "drama",       emoji: "🎭", name: "Drama" },
  { id: "horror",      emoji: "👻", name: "Dahshat" },
  { id: "romance",     emoji: "💕", name: "Sevgi" },
  { id: "animation",   emoji: "🎨", name: "Multfilm" },
  { id: "thriller",    emoji: "🔪", name: "Triller" },
  { id: "fantasy",     emoji: "🧙", name: "Fantastika" },
  { id: "documentary", emoji: "📽",  name: "Hujjatli" },
  { id: "scifi",       emoji: "🚀", name: "Ilmiy-fantastika" },
];

// ═══════════════════════════════════════════
//  DB
// ═══════════════════════════════════════════
const readDB = () => {
  try {
    return JSON.parse(fs.readFileSync("./db.json"));
  } catch {
    return { movies: [], users: {}, stats: { totalSends: 0 } };
  }
};

const writeDB = (data) => {
  fs.writeFileSync("./db.json", JSON.stringify(data, null, 2));
};

const registerUser = (msg) => {
  const db = readDB();
  if (!db.users) db.users = {};
  const uid = String(msg.from.id);
  if (!db.users[uid]) {
    db.users[uid] = {
      id: msg.from.id,
      username: msg.from.username || "",
      first_name: msg.from.first_name || "",
      joined: new Date().toISOString(),
      searches: 0,
    };
    writeDB(db);
  }
};

// ═══════════════════════════════════════════
//  OBUNA TEKSHIRISH
// ═══════════════════════════════════════════
const checkSubscription = async (userId) => {
  if (!CHANNEL_USERNAME) return true;
  try {
    const member = await bot.getChatMember(CHANNEL_USERNAME, userId);
    return ["member", "administrator", "creator"].includes(member.status);
  } catch {
    return true;
  }
};

// ═══════════════════════════════════════════
//  KLAVIATURALAR
// ═══════════════════════════════════════════
const mainKeyboard = {
  keyboard: [
    ["🎬 Janr bo'yicha", "🔍 Kod bilan qidirish"],
    ["📊 Statistika",    "ℹ️ Yordam"],
  ],
  resize_keyboard: true,
};

const genreKeyboard = () => {
  const keyboard = [];
  for (let i = 0; i < GENRES.length; i += 2) {
    const row = [{ text: `${GENRES[i].emoji} ${GENRES[i].name}`, callback_data: `genre_${GENRES[i].id}` }];
    if (GENRES[i + 1]) {
      row.push({ text: `${GENRES[i+1].emoji} ${GENRES[i+1].name}`, callback_data: `genre_${GENRES[i+1].id}` });
    }
    keyboard.push(row);
  }
  return { inline_keyboard: keyboard };
};

// ═══════════════════════════════════════════
//  HOLATLAR
// ═══════════════════════════════════════════
const userState    = {};  // admin kino qo'shish jarayoni
const waitingCode  = {};  // user kod kutmoqda

// ═══════════════════════════════════════════
//  /start
// ═══════════════════════════════════════════
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  registerUser(msg);

  const isSub = await checkSubscription(msg.from.id);
  if (!isSub) {
    return bot.sendMessage(chatId, "⚠️ Botdan foydalanish uchun kanalimizga obuna bo'ling!", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📢 Kanalga o'tish", url: `https://t.me/${CHANNEL_USERNAME.replace("@","")}` }],
          [{ text: "✅ Obuna bo'ldim", callback_data: "check_sub" }],
        ],
      },
    });
  }

  bot.sendMessage(chatId, "🎬 *Kino Botga Xush Kelibsiz!*\n\nQuyidagi tugmalardan foydalaning:", {
    parse_mode: "Markdown",
    reply_markup: mainKeyboard,
  });
});

// ═══════════════════════════════════════════
//  CALLBACK QUERY
// ═══════════════════════════════════════════
bot.on("callback_query", async (query) => {
  const chatId  = query.message.chat.id;
  const data    = query.data;
  const userId  = query.from.id;

  // Obuna tekshirish
  if (data === "check_sub") {
    const isSub = await checkSubscription(userId);
    if (isSub) {
      bot.answerCallbackQuery(query.id, { text: "✅ Rahmat! Endi foydalanishingiz mumkin." });
      bot.sendMessage(chatId, "🎬 *Kino Botga Xush Kelibsiz!*", {
        parse_mode: "Markdown", reply_markup: mainKeyboard,
      });
    } else {
      bot.answerCallbackQuery(query.id, { text: "❌ Hali obuna bo'lmadingiz!", show_alert: true });
    }
    return;
  }

  // Janr tanlash — kinolar ro'yxati
  if (data.startsWith("genre_")) {
    const genreId = data.replace("genre_", "");
    const genre   = GENRES.find((g) => g.id === genreId);
    const db      = readDB();
    const movies  = db.movies.filter((m) => m.genre === genreId);

    bot.answerCallbackQuery(query.id);

    if (!movies.length) {
      return bot.sendMessage(chatId, `😔 ${genre.emoji} *${genre.name}* janrida hali kino yo'q.`, { parse_mode: "Markdown" });
    }

    const movieButtons = movies.map((m) => [
      { text: `🎬 ${m.name}  👁${m.views||0}`, callback_data: `send_${m.code}` },
    ]);

    bot.sendMessage(
      chatId,
      `${genre.emoji} *${genre.name}* — ${movies.length} ta kino:\n\nBirini tanlang:`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: movieButtons } }
    );
    return;
  }

  // Kinoni yuborish
  if (data.startsWith("send_")) {
    const code  = data.replace("send_", "");
    const db    = readDB();
    const movie = db.movies.find((m) => m.code === code);

    if (!movie) {
      return bot.answerCallbackQuery(query.id, { text: "❌ Kino topilmadi", show_alert: true });
    }

    if (!db.stats) db.stats = {};
    db.stats.totalSends = (db.stats.totalSends || 0) + 1;
    movie.views = (movie.views || 0) + 1;
    writeDB(db);

    bot.answerCallbackQuery(query.id);
    const genre = GENRES.find((g) => g.id === movie.genre);
    bot.sendVideo(chatId, movie.file_id, {
      caption: `🎬 *${movie.name}*\n${genre ? genre.emoji+" "+genre.name : ""}\n👁 ${movie.views} marta ko'rilgan`,
      parse_mode: "Markdown",
      protect_content: true,
    });
    return;
  }

  // Admin janr tanlash (kino qo'shishda)
  if (data.startsWith("setgenre_")) {
    if (!ADMIN_IDS.includes(userId)) return;
    const parts   = data.split("_");
    const ownerId = parseInt(parts[1]);
    const genreId = parts[2];

    if (userState[ownerId]) {
      userState[ownerId].data.genre = genreId;
      userState[ownerId].step = "video";
      bot.answerCallbackQuery(query.id, { text: "✅ Janr tanlandi!" });
      bot.sendMessage(chatId, "📹 Endi videoni yuboring:");
    }
    return;
  }

  bot.answerCallbackQuery(query.id);
});

// ═══════════════════════════════════════════
//  MESSAGE HANDLER
// ═══════════════════════════════════════════
bot.on("message", async (msg) => {
  if (!msg.text && !msg.video) return;
  const chatId  = msg.chat.id;
  const userId  = msg.from.id;
  const isAdmin = ADMIN_IDS.includes(userId);
  const text    = msg.text || "";

  registerUser(msg);

  // ── ADMIN KOMANDALAR ──
  if (isAdmin) {

    if (text === "/add") {
      userState[userId] = { step: "name", data: {} };
      return bot.sendMessage(chatId, "🎬 Kino nomini yozing:");
    }

    if (text === "/list") {
      const db = readDB();
      if (!db.movies.length) return bot.sendMessage(chatId, "📭 Kinolar yo'q.");
      const list = db.movies.map((m, i) => {
        const g = GENRES.find((g) => g.id === m.genre);
        return `${i+1}. *${m.name}* — \`${m.code}\` ${g?.emoji||""}  👁${m.views||0}`;
      }).join("\n");
      return bot.sendMessage(chatId, `📋 *Barcha kinolar:*\n\n${list}`, { parse_mode: "Markdown" });
    }

    if (text.startsWith("/delete ")) {
      const code = text.replace("/delete ", "").trim();
      const db   = readDB();
      const prev = db.movies.length;
      db.movies  = db.movies.filter((m) => m.code !== code);
      if (db.movies.length < prev) {
        writeDB(db);
        return bot.sendMessage(chatId, `🗑 \`${code}\` kodli kino o'chirildi.`, { parse_mode: "Markdown" });
      }
      return bot.sendMessage(chatId, `❌ \`${code}\` topilmadi.`, { parse_mode: "Markdown" });
    }

    if (text === "/stats") {
      const db        = readDB();
      const userCount = Object.keys(db.users || {}).length;
      const topMovies = [...db.movies]
        .sort((a, b) => (b.views||0) - (a.views||0))
        .slice(0, 5)
        .map((m, i) => `${i+1}. *${m.name}* — ${m.views||0} ko'rish`)
        .join("\n");
      return bot.sendMessage(
        chatId,
        `📊 *Admin Statistika:*\n\n` +
        `👥 Foydalanuvchilar: ${userCount}\n` +
        `🎬 Kinolar: ${db.movies.length}\n` +
        `📤 Jami yuborishlar: ${db.stats?.totalSends||0}\n\n` +
        `🏆 *Top kinolar:*\n${topMovies||"Yo'q"}`,
        { parse_mode: "Markdown" }
      );
    }

    if (text.startsWith("/broadcast ")) {
      const bText  = text.replace("/broadcast ", "");
      const db     = readDB();
      const users  = Object.values(db.users || {});
      let sent = 0;
      for (const u of users) {
        try {
          await bot.sendMessage(u.id, `📢 *Yangilik:*\n\n${bText}`, { parse_mode: "Markdown" });
          sent++;
        } catch {}
      }
      return bot.sendMessage(chatId, `✅ ${sent} ta foydalanuvchiga yuborildi.`);
    }

    // Admin kino qo'shish state machine
    if (userState[userId]) {
      const state = userState[userId];

      if (state.step === "name" && text && !text.startsWith("/")) {
        state.data.name = text;
        state.step = "code";
        return bot.sendMessage(chatId, "🔢 Kino kodini yozing (masalan: 1001):");
      }

      if (state.step === "code" && text && !text.startsWith("/")) {
        const db = readDB();
        if (db.movies.find((m) => m.code === text.trim())) {
          return bot.sendMessage(chatId, `⚠️ \`${text}\` kodi mavjud! Boshqa kod yozing:`, { parse_mode: "Markdown" });
        }
        state.data.code = text.trim();
        state.step = "genre";

        const keyboard = [];
        for (let i = 0; i < GENRES.length; i += 2) {
          const row = [{ text: `${GENRES[i].emoji} ${GENRES[i].name}`, callback_data: `setgenre_${userId}_${GENRES[i].id}` }];
          if (GENRES[i+1]) row.push({ text: `${GENRES[i+1].emoji} ${GENRES[i+1].name}`, callback_data: `setgenre_${userId}_${GENRES[i+1].id}` });
          keyboard.push(row);
        }
        return bot.sendMessage(chatId, "🎭 Janrni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
      }

      if (state.step === "video" && msg.video) {
        const db = readDB();
        const newMovie = {
          name:    state.data.name,
          code:    state.data.code,
          genre:   state.data.genre,
          file_id: msg.video.file_id,
          views:   0,
          added:   new Date().toISOString(),
        };
        db.movies.push(newMovie);
        writeDB(db);
        delete userState[userId];

        const genre = GENRES.find((g) => g.id === newMovie.genre);
        return bot.sendMessage(
          chatId,
          `✅ *Kino qo'shildi!*\n\n` +
          `🎬 ${newMovie.name}\n🔢 Kod: \`${newMovie.code}\`\n${genre?.emoji||""} ${genre?.name||""}`,
          { parse_mode: "Markdown" }
        );
      }

      if (state.step === "genre") {
        return bot.sendMessage(chatId, "☝️ Iltimos, janrni tugmadan tanlang.");
      }
    }
  }

  // ── USER KOMANDALAR ──
  if (text === "/start") return;

  if (text === "🎬 Janr bo'yicha") {
    return bot.sendMessage(chatId, "🎭 Qaysi janrni ko'rmoqchisiz?", { reply_markup: genreKeyboard() });
  }

  if (text === "🔍 Kod bilan qidirish") {
    waitingCode[userId] = true;
    return bot.sendMessage(chatId, "🔢 Kino kodini yozing:", { reply_markup: { remove_keyboard: true } });
  }

  if (text === "📊 Statistika") {
    const db = readDB();
    const genreStats = GENRES
      .map((g) => {
        const count = db.movies.filter((m) => m.genre === g.id).length;
        return count > 0 ? `${g.emoji} ${g.name}: *${count}* ta` : null;
      })
      .filter(Boolean)
      .join("\n");

    return bot.sendMessage(
      chatId,
      `📊 *Kino Bazasi:*\n\n🎬 Jami: *${db.movies.length}* ta kino\n\n${genreStats||"Hali kino yo'q"}`,
      { parse_mode: "Markdown", reply_markup: mainKeyboard }
    );
  }

  if (text === "ℹ️ Yordam") {
    return bot.sendMessage(
      chatId,
      `ℹ️ *Foydalanish yo'riqnomasi:*\n\n` +
      `🎬 *Janr bo'yicha* — Janr tanlang, kinolar ro'yxatini ko'ring\n` +
      `🔍 *Kod bilan* — Aniq kino kodini kiriting\n` +
      `📊 *Statistika* — Kino bazasi ma'lumotlari\n\n` +
      `Savollar uchun adminlarga murojaat qiling.`,
      { parse_mode: "Markdown", reply_markup: mainKeyboard }
    );
  }

  // Kod orqali qidirish
  if (!text.startsWith("/") && (waitingCode[userId] || /^\d+$/.test(text.trim()))) {
    const code  = text.trim();
    const db    = readDB();
    const movie = db.movies.find((m) => m.code === code);

    delete waitingCode[userId];

    if (!movie) {
      return bot.sendMessage(chatId, "❌ Kino topilmadi. Kodni tekshirib qayta urinib ko'ring.", {
        reply_markup: mainKeyboard,
      });
    }

    if (!db.stats) db.stats = {};
    db.stats.totalSends = (db.stats.totalSends||0) + 1;
    movie.views = (movie.views||0) + 1;
    const uid = String(userId);
    if (db.users?.[uid]) db.users[uid].searches = (db.users[uid].searches||0) + 1;
    writeDB(db);

    const genre = GENRES.find((g) => g.id === movie.genre);
    bot.sendVideo(chatId, movie.file_id, {
      caption: `🎬 *${movie.name}*\n${genre ? genre.emoji+" "+genre.name : ""}\n👁 ${movie.views} marta ko'rilgan`,
      parse_mode: "Markdown",
      protect_content: true,
      reply_markup: mainKeyboard,
    });
  }
});

console.log("🎬 Movie Bot ishga tushdi!");
