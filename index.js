const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');
const whatsapp = require('./whatsappService');

const token = process.env.TELEGRAM_BOT_TOKEN || '8351126929:AAGxUlqKBpRNedRugObQnYY54OXxPtDDdl0';
const adminId = parseInt(process.env.ADMIN_ID) || 458204971;

const bot = new TelegramBot(token, { polling: true });

function isAdmin(chatId) {
  return chatId == adminId;
}

const userStates = new Map();

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `مرحبًا بك في بوت إدارة حسابات واتساب.\nالأوامر المتاحة:\n/add - إضافة حساب واتساب جديد\n/list - عرض الحسابات المضافة\n/remove [رقم الهاتف] - حذف حساب\n/send [رقم الهاتف] [الرسالة] - إرسال رسالة عبر حساب معين\n/status - حالة البوت`);
});

bot.onText(/\/add/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ غير مسموح لك بإضافة حسابات. هذا الأمر مخصص للمشرف فقط.');
    return;
  }
  userStates.set(userId, { step: 'awaiting_phone' });
  bot.sendMessage(chatId, '📱 أرسل رقم الهاتف مع رمز البلد، مثال: +201234567890');
});

bot.onText(/^\/list$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const accounts = await db.getAccountsByUser(userId);
  if (accounts.length === 0) {
    bot.sendMessage(chatId, 'لا توجد حسابات واتساب مسجلة.');
  } else {
    let text = 'حسابات واتساب المسجلة:\n';
    accounts.forEach(acc => {
      text += `📞 ${acc.phone_number} - الحالة: ${acc.status}\n`;
    });
    bot.sendMessage(chatId, text);
  }
});

bot.onText(/\/remove (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const phone = match[1].trim();
  const account = await db.getAccountByPhone(phone);
  if (!account || account.user_id != userId) {
    bot.sendMessage(chatId, 'الحساب غير موجود أو لا تملك صلاحية حذفه.');
    return;
  }
  await db.removeAccount(phone);
  await whatsapp.deleteSession(phone);
  bot.sendMessage(chatId, `✅ تم حذف حساب ${phone}`);
});

bot.onText(/\/send (.+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const phone = match[1].trim();
  const message = match[2];
  const account = await db.getAccountByPhone(phone);
  if (!account || account.user_id != userId) {
    bot.sendMessage(chatId, 'الحساب غير موجود أو لا تملك صلاحية الإرسال منه.');
    return;
  }
  bot.sendMessage(chatId, 'جاري الإرسال...');
  try {
    await whatsapp.sendMessage(phone, message);
    bot.sendMessage(chatId, `✅ تم إرسال الرسالة إلى ${phone}`);
  } catch (err) {
    bot.sendMessage(chatId, `❌ فشل الإرسال: ${err.message}`);
  }
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const accounts = await db.getAllAccounts();
  bot.sendMessage(chatId, `البوت يعمل. عدد الحسابات المسجلة: ${accounts.length}`);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;

  const state = userStates.get(userId);
  if (state && state.step === 'awaiting_phone') {
    const phone = text.trim();
    if (!/^\+?\d{10,15}$/.test(phone)) {
      bot.sendMessage(chatId, '⚠️ صيغة الرقم غير صحيحة. يجب أن يحتوي على رمز البلد وأرقام فقط، مثال: +201234567890');
      return;
    }
    const existing = await db.getAccountByPhone(phone);
    if (existing) {
      bot.sendMessage(chatId, '⚠️ هذا الحساب موجود بالفعل.');
      userStates.delete(userId);
      return;
    }
    userStates.set(userId, { step: 'awaiting_code', phone });
    bot.sendMessage(chatId, `📲 جاري إنشاء جلسة للرقم ${phone}. ستصلك رسالة تحتوي على رمز الاقتران. قم بإدخال هذا الرمز في تطبيق واتساب (الإعدادات > الأجهزة المرتبطة > ربط جهاز). انتظر قليلاً...`);
    try {
      const pairingCode = await whatsapp.initiatePairing(phone, userId);
      bot.sendMessage(chatId, `🔢 رمز الاقتران: ${pairingCode}\nقم بإدخال هذا الرمز في واتساب خلال 5 دقائق. بعد إدخاله، سيتم تأكيد الربط تلقائيًا.`);
      whatsapp.addListener(phone, (success, error) => {
        if (success) {
          bot.sendMessage(chatId, `✅ تم تسجيل حساب ${phone} بنجاح!`);
          userStates.delete(userId);
        } else {
          bot.sendMessage(chatId, `❌ فشل تسجيل الحساب: ${error}`);
          userStates.delete(userId);
        }
        whatsapp.removeListener(phone);
      });
    } catch (err) {
      bot.sendMessage(chatId, `❌ خطأ: ${err.message}`);
      userStates.delete(userId);
    }
  }
});

console.log('Bot is running...');