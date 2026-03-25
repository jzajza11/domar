const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const SESSIONS_DIR = process.env.SESSIONS_DIR || '/data/sessions';
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

const activeClients = new Map();
const listeners = new Map();

function addListener(phone, callback) {
  listeners.set(phone, callback);
}

function removeListener(phone) {
  listeners.delete(phone);
}

async function initiatePairing(phone, userId) {
  return new Promise(async (resolve, reject) => {
    if (activeClients.has(phone)) {
      reject(new Error('جلسة لهذا الرقم قيد الإنشاء بالفعل. انتظر قليلاً.'));
      return;
    }

    const sessionPath = path.join(SESSIONS_DIR, phone);
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        dataPath: SESSIONS_DIR,
        clientId: phone,
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    activeClients.set(phone, client);

    let pairingCode = null;
    let pairingCodeResolved = false;
    let timeoutId = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      client.destroy();
      activeClients.delete(phone);
    };

    const onPairingCode = (code) => {
      pairingCode = code;
      pairingCodeResolved = true;
      resolve(code);
    };

    const onAuthenticated = async () => {
      await db.addAccount(phone, userId, 'active');
      const listener = listeners.get(phone);
      if (listener) listener(true, null);
      cleanup();
    };

    const onAuthFailure = (msg) => {
      if (!pairingCodeResolved) {
        reject(new Error(`فشل المصادقة: ${msg}`));
      } else {
        const listener = listeners.get(phone);
        if (listener) listener(false, msg);
      }
      cleanup();
    };

    const onDisconnected = (reason) => {
      if (!pairingCodeResolved) {
        reject(new Error(`انقطع الاتصال: ${reason}`));
      } else {
        const listener = listeners.get(phone);
        if (listener) listener(false, reason);
      }
      cleanup();
    };

    client.on('pairing_code', onPairingCode);
    client.on('authenticated', onAuthenticated);
    client.on('auth_failure', onAuthFailure);
    client.on('disconnected', onDisconnected);

    timeoutId = setTimeout(() => {
      if (!pairingCodeResolved) {
        reject(new Error('انتهى الوقت، لم يتم استلام رمز الاقتران.'));
      } else {
        const listener = listeners.get(phone);
        if (listener) listener(false, 'انتهى الوقت دون تأكيد الربط.');
      }
      cleanup();
    }, 5 * 60 * 1000);

    await client.initialize();
  });
}

async function sendMessage(phone, message) {
  const sessionPath = path.join(SESSIONS_DIR, phone);
  if (!fs.existsSync(sessionPath)) {
    throw new Error(`جلسة الرقم ${phone} غير موجودة. أضف الحساب أولاً.`);
  }
  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: SESSIONS_DIR,
      clientId: phone,
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });
  try {
    await client.initialize();
    await new Promise((resolve, reject) => {
      client.on('ready', resolve);
      client.on('auth_failure', reject);
      setTimeout(() => reject(new Error('Timeout waiting for ready')), 30000);
    });
    const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
    await client.sendMessage(chatId, message);
    await client.destroy();
  } catch (err) {
    await client.destroy();
    throw err;
  }
}

async function deleteSession(phone) {
  const sessionPath = path.join(SESSIONS_DIR, phone);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }
  await db.removeAccount(phone);
}

module.exports = {
  initiatePairing,
  sendMessage,
  deleteSession,
  addListener,
  removeListener,
};