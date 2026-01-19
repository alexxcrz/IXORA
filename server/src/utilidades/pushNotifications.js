import admin from "firebase-admin";
import fs from "fs";

let firebaseReady = false;
let firebaseInitError = null;

function getServiceAccount() {
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonEnv) {
    try {
      return JSON.parse(jsonEnv);
    } catch (err) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON inválido");
    }
  }

  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (pathEnv && fs.existsSync(pathEnv)) {
    const raw = fs.readFileSync(pathEnv, "utf-8");
    return JSON.parse(raw);
  }

  return null;
}

export function initFirebaseAdmin() {
  if (firebaseReady || firebaseInitError) {
    return firebaseReady;
  }

  try {
    const serviceAccount = getServiceAccount();
    if (!serviceAccount) {
      firebaseInitError = new Error("No hay credenciales de Firebase");
      return false;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    firebaseReady = true;
    return true;
  } catch (err) {
    firebaseInitError = err;
    return false;
  }
}

export async function sendPushToTokens(tokens, payload) {
  if (!tokens || tokens.length === 0) return { ok: false, error: "No tokens" };
  if (!initFirebaseAdmin()) {
    return { ok: false, error: firebaseInitError?.message || "Firebase no inicializado" };
  }

  const data = payload?.data || {};
  const dataString = {};
  Object.keys(data).forEach((key) => {
    const value = data[key];
    if (value === undefined || value === null) return;
    dataString[key] = String(value);
  });

  dataString.title = payload?.title || "IXORA";
  dataString.body = payload?.body || "";

  const message = {
    tokens,
    data: dataString,
    android: {
      priority: "high",
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    return { ok: true, response };
  } catch (err) {
    return { ok: false, error: err.message || "Error enviando push" };
  }
}
