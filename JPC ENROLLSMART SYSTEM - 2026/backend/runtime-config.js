const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const DATA_DIR = path.join(__dirname, "data");
const RUNTIME_FILE = path.join(DATA_DIR, "runtime-config.json");
const CREDENTIALS_FILE = path.join(DATA_DIR, "first-run-admin.txt");

function readRuntime() {
  try {
    return JSON.parse(fs.readFileSync(RUNTIME_FILE, "utf8"));
  } catch {
    return {};
  }
}

function createRuntime() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const adminPassword = `JPC-${crypto.randomBytes(9).toString("base64url")}`;
  const runtime = {
    jwtSecret: crypto.randomBytes(48).toString("base64url"),
    adminUsername: "admin",
    adminPasswordHash: bcrypt.hashSync(adminPassword, 12)
  };
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify(runtime, null, 2), { mode: 0o600 });
  fs.writeFileSync(CREDENTIALS_FILE, `JPC ENROLLSMART first-run administrator\nUsername: ${runtime.adminUsername}\nPassword: ${adminPassword}\n`, { mode: 0o600 });
  console.log(`First-run administrator created. Credentials saved to ${CREDENTIALS_FILE}`);
  console.log(`Username: ${runtime.adminUsername}`);
  console.log(`Password: ${adminPassword}`);
  return runtime;
}

const runtime = readRuntime();
const local = runtime.jwtSecret && runtime.adminUsername && runtime.adminPasswordHash ? runtime : createRuntime();

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 4000),
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || "http://localhost:4000,http://localhost:5173,http://127.0.0.1:5173",
  JWT_SECRET: process.env.JWT_SECRET || local.jwtSecret,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || local.adminUsername,
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || local.adminPasswordHash,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS || "",
  TRUST_PROXY: process.env.TRUST_PROXY || "",
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || ""
};
