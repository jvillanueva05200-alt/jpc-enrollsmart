const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const admin = require("./firebaseAdmin");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const { initializeApp: initializeFirebaseAdmin, cert: firebaseCert, applicationDefault, getApps: getFirebaseApps } = require("firebase-admin/app");
const { getAuth: getFirebaseAdminAuth } = require("firebase-admin/auth");

const CONFIG = require("./runtime-config");
const app = express();
const PORT = CONFIG.PORT;
const DB_PATH = path.join(__dirname, "data", "db.json");
const DB_TMP = `${DB_PATH}.tmp`;
const DB_BACKUP = path.join(__dirname, "data", "db.backup.json");

const JWT_SECRET = CONFIG.JWT_SECRET;
const ADMIN_USERNAME = CONFIG.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = CONFIG.ADMIN_PASSWORD_HASH;
const ADMIN_EMAILS = CONFIG.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
const TRUST_PROXY = CONFIG.TRUST_PROXY;
const IS_PROD = CONFIG.NODE_ENV === "production";

let firebaseAdminAuth = null;
try {
  let firebaseApp;
  if (getFirebaseApps().length) {
    firebaseApp = getFirebaseApps()[0];
  } else if (CONFIG.FIREBASE_SERVICE_ACCOUNT_JSON) {
    firebaseApp = initializeFirebaseAdmin({ credential: firebaseCert(JSON.parse(CONFIG.FIREBASE_SERVICE_ACCOUNT_JSON)) });
  } else {
    firebaseApp = initializeFirebaseAdmin({ credential: applicationDefault() });
  }
  firebaseAdminAuth = getFirebaseAdminAuth(firebaseApp);
} catch (err) {
  firebaseAdminAuth = null;
}

const FRONTEND_SOURCE_DIR = path.join(__dirname, "..", "ENROLLSMART SYSTEM 2026");
const FRONTEND_DIST_DIR = path.join(FRONTEND_SOURCE_DIR, "dist");
const FRONTEND_PUBLIC_DIR = path.join(FRONTEND_SOURCE_DIR, "public");
const FRONTEND_DIR = fs.existsSync(FRONTEND_DIST_DIR) ? FRONTEND_DIST_DIR : FRONTEND_SOURCE_DIR;

const FRONTEND_ORIGINS = (CONFIG.FRONTEND_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const STUDENT_ID_RE = /^\d{2}-\d-\d{4}$/;
const LEGACY_STUDENT_ID_RE = /^\d{4}-\d{4,6}$/;
const PH_MOBILE_RE = /^09\d{9}$/;
const DEFAULT_TIME_SLOTS = [
  "08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM",
  "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM",
];
const STATUSES = ["Pending", "Enrolled", "Completed", "Cancelled"];

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("FATAL: JWT_SECRET is missing or shorter than 32 characters. Refusing to start.");
  process.exit(1);
}
if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH) {
  console.warn("WARNING: ADMIN_USERNAME / ADMIN_PASSWORD_HASH are not set. Admin login is disabled.");
}
if (IS_PROD && !FRONTEND_ORIGINS.length) {
  console.error("FATAL: FRONTEND_ORIGIN must be set in production. Refusing to start.");
  process.exit(1);
}
if (
  IS_PROD &&
  FRONTEND_ORIGINS.some(
    (o) => o.startsWith("http://") && !o.includes("localhost")
  )
) {
  console.error(
    "FATAL: FRONTEND_ORIGIN must use https:// in production. Refusing to start."
  );
  process.exit(1);
}

if (TRUST_PROXY) {
  app.set("trust proxy", /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY);
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true } : false,
  })
);
const DEV_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",

  "http://localhost:5174",
  "http://127.0.0.1:5174",

  "http://192.168.1.6:5173",
  "http://192.168.1.6:5174",

  "http://localhost:4000",
  "http://127.0.0.1:4000",
]);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "64kb" }));
app.use(express.static(FRONTEND_DIR));
if (FRONTEND_DIR !== FRONTEND_DIST_DIR) app.use(express.static(FRONTEND_PUBLIC_DIR));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts from this network. Please try again in a few minutes." },
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You are sending requests too quickly. Please slow down." },
});

const failedAttempts = new Map();
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;

function isLocked(key) {
  const rec = failedAttempts.get(key);
  if (!rec) return false;
  if (Date.now() > rec.until) {
    failedAttempts.delete(key);
    return false;
  }
  return rec.count >= LOCK_AFTER;
}
function recordFailure(key) {
  const rec = failedAttempts.get(key) || { count: 0, until: 0 };
  rec.count += 1;
  rec.until = Date.now() + LOCK_MS;
  failedAttempts.set(key, rec);
}
function clearFailures(key) {
  failedAttempts.delete(key);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of failedAttempts) if (now > v.until) failedAttempts.delete(k);
}, 5 * 60 * 1000).unref();

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  next();
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);


function signToken(payload) {
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, JWT_SECRET, { expiresIn: "8h" });
}

function verifyToken(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return { error: "Missing or invalid Authorization header." };
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = readDB();
    if (decoded.jti && db.revokedTokens.includes(decoded.jti)) {
      return { error: "This session has been signed out. Please log in again." };
    }
    return { decoded };
  } catch (err) {
    return { error: "Invalid or expired session. Please log in again." };
  }
}

function requireAuth(...allowedRoles) {
  return (req, res, next) => {
    const { decoded, error } = verifyToken(req);
    if (error) return res.status(401).json({ error });
    if (allowedRoles.length && !allowedRoles.includes(decoded.type)) {
      return res.status(403).json({ error: "You do not have permission to perform this action." });
    }
    req.user = decoded;
    next();
  };
}

function requireSelfOrAdmin(req, res, next) {
  const { decoded, error } = verifyToken(req);
  if (error) return res.status(401).json({ error });
  const isAdmin = decoded.type === "admin";
  const isSelf = decoded.type === "student" && String(decoded.id) === String(req.params.id);
  if (!isAdmin && !isSelf) {
    return res.status(403).json({ error: "You do not have permission to perform this action." });
  }
  req.user = decoded;
  next();
}


const EMPTY_DB = {
  deadline: "",
  dates: [],
  students: [],
  accounts: [],
  timeSlots: DEFAULT_TIME_SLOTS,
  revokedTokens: [],
  adminLog: [],
};

function normalizeDB(db) {
  const safe = db && typeof db === "object" ? db : {};
  return {
    deadline: typeof safe.deadline === "string" ? safe.deadline : "",
    dates: Array.isArray(safe.dates) ? safe.dates : [],
    students: Array.isArray(safe.students) ? safe.students.map((student) => ({ ...student, verificationId: student.verificationId || generateVerificationId(`${student.id}|${student.appointmentNo || ""}`), checkedInAt: student.checkedInAt || null, checkedInBy: student.checkedInBy || null })) : [],
    accounts: Array.isArray(safe.accounts) ? safe.accounts : [],
    timeSlots: Array.isArray(safe.timeSlots) && safe.timeSlots.length ? safe.timeSlots : DEFAULT_TIME_SLOTS,
    revokedTokens: Array.isArray(safe.revokedTokens) ? safe.revokedTokens : [],
    adminLog: Array.isArray(safe.adminLog) ? safe.adminLog : [],
  };
}

function readDB() {
  try {
    return normalizeDB(JSON.parse(fs.readFileSync(DB_PATH, "utf-8")));
  } catch (err) {
    if (fs.existsSync(DB_BACKUP)) {
      console.error("db.json unreadable, falling back to db.backup.json:", err.message);
      try {
        return normalizeDB(JSON.parse(fs.readFileSync(DB_BACKUP, "utf-8")));
      } catch (backupErr) {
        console.error("Backup is also unreadable:", backupErr.message);
      }
    }
    console.error("Starting from an empty database:", err.message);
    return { ...EMPTY_DB };
  }
}

function writeDBSync(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  if (fs.existsSync(DB_PATH)) {
    try {
      fs.copyFileSync(DB_PATH, DB_BACKUP);
    } catch (err) {
      console.warn("Could not refresh backup:", err.message);
    }
  }
  const fd = fs.openSync(DB_TMP, "w");
  try {
    fs.writeFileSync(fd, JSON.stringify(db, null, 2), "utf-8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(DB_TMP, DB_PATH);
}

let writeChain = Promise.resolve();
function mutate(fn) {
  const run = writeChain.then(() => {
    const db = readDB();
    const result = fn(db);
    if (result && result.error) return result;
    writeDBSync(db);
    return result;
  });
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function logAdmin(db, req, action) {
  db.adminLog.unshift({
    admin: req.user?.username || req.user?.type || "unknown",
    action,
    at: Date.now(),
  });
  db.adminLog = db.adminLog.slice(0, 500);
}

function generateStudentId(db) {
  const used = new Set([
    ...db.accounts.map((a) => String(a.id || "")),
    ...db.students.map((s) => String(s.id || "")),
  ]);
  const year = String(new Date().getFullYear()).slice(-2);
  let number = 1;
  let id = `${year}-1-${String(number).padStart(4, "0")}`;
  while (used.has(id)) {
    number += 1;
    id = `${year}-1-${String(number).padStart(4, "0")}`;
  }
  return id;
}

function generateVerificationId(seed = "") {
  if (seed) return `JPC-${crypto.createHash("sha256").update(String(seed)).digest("hex").slice(0, 36)}`;
  return `JPC-${crypto.randomBytes(18).toString("hex")}`;
}

function generateAppointmentNo(students = []) {
  let max = 0;
  students.forEach((s) => {
    const m = String(s.appointmentNo || "").match(/ES-\d{4}-(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `ES-${new Date().getFullYear()}-${String(max + 1).padStart(4, "0")}`;
}

function addNotification(student, title, message, type = "info") {
  student.notifications = Array.isArray(student.notifications) ? student.notifications : [];
  student.notifications.unshift({
    id: `n-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    title,
    message,
    type,
    createdAt: Date.now(),
    read: false,
  });
  student.notifications = student.notifications.slice(0, 20);
}

function csvCell(value) {
  let v = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replaceAll('"', '""')}"`;
}

function validateBooking(db, { date, time, excludeStudentId }) {
  const slot = db.dates.find((d) => d.date === date);
  if (!slot) return { error: "That enrollment date is not available." };
  const deadline = slot.deadline || db.deadline;
  if (deadline && new Date(`${deadline}T23:59:59`) < new Date()) {
    return { error: "Enrollment is already closed." };
  }
  if (slot.status !== "Announced") return { error: "That enrollment date is not open for booking." };
  if (!db.timeSlots.includes(time)) return { error: "Please choose a valid time slot." };

  const active = db.students.filter(
    (s) => s.date === date && s.status !== "Cancelled" && String(s.id) !== String(excludeStudentId)
  );
  if (active.length >= Number(slot.maxSlots)) {
    return { error: "That date is already fully booked. Please choose another date." };
  }

  const perSlotMax = Number(slot.perSlotMax) || Math.ceil(Number(slot.maxSlots) / db.timeSlots.length);
  if (active.filter((s) => s.time === time).length >= perSlotMax) {
    return { error: "That time slot is already full. Please choose another time." };
  }
  return null;
}


app.get("/api/config", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ firebaseAuth: Boolean(firebaseAdminAuth), pwa: true, localAuth: true });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "enrollsmart-backend", time: Date.now() });
});


app.post(
  "/api/auth/admin",
  authLimiter,
  [body("username").trim().notEmpty().withMessage("Username is required."), body("password").notEmpty().withMessage("Password is required.")],
  handleValidation,
  wrap(async (req, res) => {
    if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH) {
      return res.status(503).json({ error: "Admin login is not configured on the server yet." });
    }

    const { username, password } = req.body;
    const lockKey = `admin:${username}`;
    if (isLocked(lockKey)) {
      return res.status(429).json({ error: "Too many failed attempts. Try again in 15 minutes." });
    }

    const candidate = username === ADMIN_USERNAME ? ADMIN_PASSWORD_HASH : "$2a$12$invalidsaltinvalidsaltinvalidsaltuO";
    const valid = await bcrypt.compare(password, candidate).catch(() => false);

    if (username !== ADMIN_USERNAME || !valid) {
      recordFailure(lockKey);
      return res.status(401).json({ error: "Invalid admin credentials." });
    }

    clearFailures(lockKey);
    const token = signToken({ type: "admin", username });
    res.json({ type: "admin", username, token, loginAt: Date.now() });
  })
);

async function handleFirebaseStudentAuth(req, res, googleOnly = false) {
  if (!firebaseAdminAuth) {
    return res.status(503).json({ error: "Firebase Admin is not configured on the server yet." });
  }

  let decoded;
  try {
    decoded = await firebaseAdminAuth.verifyIdToken(req.body.idToken);
  } catch (err) {
    console.error(
      "Firebase verifyIdToken error:",
      err.code || "NO_CODE",
      err.message || "NO_MESSAGE"
    );

    return res.status(401).json({
      error: "Invalid or expired Firebase session."
    });
  }

  const provider = decoded.firebase?.sign_in_provider || "firebase";
  if (googleOnly && provider !== "google.com") {
    return res.status(401).json({ error: "This account is not authenticated with Google." });
  }

  const email = String(decoded.email || "").toLowerCase();
  const phone = String(decoded.phone_number || "");
  const trustedAccount = readDB().accounts.find((account) =>
    (account.uid && account.uid === decoded.uid) ||
    (email && account.email && account.email.toLowerCase() === email)
  );

  if (ADMIN_EMAILS.includes(email) || decoded.admin === true || trustedAccount?.role === "admin" || trustedAccount?.type === "admin") {
    if (provider !== "google.com" || decoded.email_verified !== true) {
      return res.status(401).json({ error: "Administrator access requires Google authentication." });
    }
    const token = signToken({
      type: "admin",
      username: email || decoded.uid,
      email,
      uid: decoded.uid,
    });
    return res.json({ type: "admin", username: email || decoded.uid, email, token, loginAt: Date.now() });
  }

  const requestedStudentId = String(req.body.studentId || "").trim();
  if (requestedStudentId && !STUDENT_ID_RE.test(requestedStudentId)) {
    return res.status(400).json({ error: "Student ID must look like 26-1-0001." });
  }
  const requestedName = String(req.body.name || "").trim();
  const name = String(requestedName || decoded.name || email || phone || "Student").trim();
  if (!email && !phone) {
    return res.status(400).json({ error: "Firebase account does not contain a usable email or mobile number." });
  }

  const result = await mutate((db) => {
    let account = db.accounts.find((a) => a.uid === decoded.uid);
    if (!account && email) account = db.accounts.find((a) => a.email && a.email.toLowerCase() === email);
    if (!account && phone) account = db.accounts.find((a) => a.phone === phone);

    if (!account) {
      const requestedIdAvailable = requestedStudentId && !db.accounts.some((a) => String(a.id) === requestedStudentId) && !db.students.some((st) => String(st.id) === requestedStudentId);
      account = {
        id: requestedIdAvailable ? requestedStudentId : generateStudentId(db),
        uid: decoded.uid,
        name,
        email,
        phone,
        provider,
        passwordHash: null,
        createdAt: Date.now(),
      };
      db.accounts.push(account);
    } else {
      account.uid = decoded.uid;
      account.name = requestedName || name || account.name;
      account.email = email || account.email || "";
      account.phone = phone || account.phone || "";
      account.provider = provider || account.provider || "firebase";
    }

    const record = db.students.find((s) => String(s.id) === String(account.id));
    return { id: account.id, name: record?.name || account.name, email: account.email || "", phone: account.phone || "", provider: account.provider };
  });

  const token = signToken({ type: "student", id: result.id, name: result.name, email: result.email, phone: result.phone, uid: decoded.uid });
  res.json({ type: "student", ...result, token, loginAt: Date.now() });
}

app.get("/api/auth/session", requireAuth(), (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    type: req.user.type,
    id: req.user.id || null,
    uid: req.user.uid || null,
    name: req.user.name || req.user.username || "",
    email: req.user.email || ""
  });
});

app.post(
  "/api/auth/firebase",
  authLimiter,
  [body("idToken").notEmpty().withMessage("Missing Firebase ID token.")],
  handleValidation,
  wrap(async (req, res) => {
    await handleFirebaseStudentAuth(req, res, false);
  })
);

app.post(
  "/api/auth/student/google",
  authLimiter,
  [body("idToken").notEmpty().withMessage("Missing Firebase ID token.")],
  handleValidation,
  wrap(async (req, res) => {
    await handleFirebaseStudentAuth(req, res, true);
  })
);

app.post(
  "/api/auth/student/register",
  authLimiter,
  [
    body("studentId").trim().matches(STUDENT_ID_RE).withMessage("Student ID must look like 26-1-0001."),
    body("name").trim().isLength({ min: 2, max: 120 }).withMessage("Please enter your full name."),
    body("password").isLength({ min: 8, max: 128 }).withMessage("Password must be at least 8 characters."),
  ],
  handleValidation,
  wrap(async (req, res) => {
    const { studentId, name, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await mutate((db) => {
      if (db.accounts.some((a) => a.id === studentId)) {
        return { error: "An account for this Student ID already exists. Please log in instead." };
      }
      db.accounts.push({
        id: studentId,
        name: name.trim(),
        passwordHash,
        provider: "local",
        createdAt: Date.now(),
      });

      return { ok: true };
    });

    if (result.error) return res.status(409).json({ error: result.error });

    const token = signToken({ type: "student", id: studentId, name: name.trim(), email: "" });
    res.status(201).json({ type: "student", id: studentId, name: name.trim(), email: "", provider: "local", token, loginAt: Date.now() });
  })
);

app.post(
  "/api/auth/student",
  authLimiter,
  [
    body("studentId").trim().custom((value) => STUDENT_ID_RE.test(value) || LEGACY_STUDENT_ID_RE.test(value)).withMessage("Please enter a valid Student ID."),
    body("password").notEmpty().withMessage("Password is required."),
  ],
  handleValidation,
  wrap(async (req, res) => {
    const { studentId, password } = req.body;
    const lockKey = `student:${studentId}`;
    if (isLocked(lockKey)) {
      return res.status(429).json({ error: "Too many failed attempts for this Student ID. Try again in 15 minutes." });
    }

    const db = readDB();
    const account = db.accounts.find((a) => a.id === studentId);
    const candidate = account?.passwordHash || "$2a$12$invalidsaltinvalidsaltinvalidsaltuO";
    const valid = await bcrypt.compare(password, candidate).catch(() => false);

    if (!account || !valid) {
      recordFailure(lockKey);
      return res.status(401).json({ error: "Incorrect Student ID or password." });
    }

    clearFailures(lockKey);
    const record = db.students.find((s) => s.id === studentId);
    const name = record?.name || account.name;
    const email = record?.email || account.email || "";
    const token = signToken({ type: "student", id: studentId, name, email });
    res.json({ type: "student", id: studentId, name, email, provider: account.provider || "local", token, loginAt: Date.now() });
  })
);

app.post(
  "/api/auth/google",
  authLimiter,
  [body("credential").notEmpty().withMessage("Missing Google credential.")],
  handleValidation,
  (req, res) => res.status(410).json({ error: "Google sign-in is handled through Firebase Authentication." })
);

app.post(
  "/api/auth/logout",
  requireAuth("admin", "student"),
  wrap(async (req, res) => {
    await mutate((db) => {
      if (req.user.jti && !db.revokedTokens.includes(req.user.jti)) {
        db.revokedTokens.push(req.user.jti);
        if (db.revokedTokens.length > 5000) db.revokedTokens = db.revokedTokens.slice(-5000);
      }
      return { ok: true };
    });
    res.json({ ok: true });
  })
);


app.get("/api/state", requireAuth("admin"), (req, res) => {
  const db = readDB();
  res.json({
    deadline: db.deadline,
    dates: db.dates,
    students: db.students,
    timeSlots: db.timeSlots,
    adminLog: db.adminLog.slice(0, 50),
  });
});

app.post(
  "/api/state/reset",
  requireAuth("admin"),
  writeLimiter,
  [body("confirm").equals("RESET").withMessage('Send {"confirm":"RESET"} to confirm this destructive action.')],
  handleValidation,
  wrap(async (req, res) => {
    const out = await mutate((db) => {
      db.students = [];
      db.dates = [];
      logAdmin(db, req, "Reset all enrollment data");
      return { deadline: db.deadline, dates: db.dates, students: db.students };
    });
    res.json(out);
  })
);


app.put(
  "/api/settings/deadline",
  requireAuth("admin"),
  writeLimiter,
  [body("deadline").isISO8601().withMessage("Deadline must be a valid date (YYYY-MM-DD).")],
  handleValidation,
  wrap(async (req, res) => {
    const out = await mutate((db) => {
      db.deadline = req.body.deadline;
      logAdmin(db, req, `Set enrollment deadline to ${req.body.deadline}`);
      return { deadline: db.deadline };
    });
    res.json(out);
  })
);


app.get("/api/enrollment-info", (req, res) => {
  const db = readDB();
  const dates = db.dates
    .filter((d) => d.status === "Announced")
    .map((d) => {
      const active = db.students.filter((s) => s.date === d.date && s.status !== "Cancelled");
      const perSlotMax = Number(d.perSlotMax) || Math.ceil(Number(d.maxSlots) / db.timeSlots.length);
      const slotAvailability = {};
      db.timeSlots.forEach((t) => {
        slotAvailability[t] = Math.max(0, perSlotMax - active.filter((s) => s.time === t).length);
      });
      return {
        date: d.date,
        status: d.status,
        maxSlots: Number(d.maxSlots),
        booked: active.length,
        available: Math.max(0, Number(d.maxSlots) - active.length),
        slotAvailability,
        deadline: d.deadline || db.deadline || "",
      };
    });
  res.json({ deadline: db.deadline, dates, timeSlots: db.timeSlots });
});

app.get("/api/dates", requireAuth("admin"), (req, res) => {
  const db = readDB();
  res.json(
    db.dates.map((d) => {
      const booked = db.students.filter((s) => s.date === d.date && s.status !== "Cancelled").length;
      return { ...d, booked, available: Math.max(0, Number(d.maxSlots) - booked) };
    })
  );
});

app.get("/api/activity", requireAuth("admin"), (req, res) => {
  const db = readDB();
  const studentEvents = [];
  db.students.forEach((s) => (s.activity || []).forEach((a) => studentEvents.push({ name: s.name, action: a.action, at: a.at })));
  const adminEvents = db.adminLog.map((a) => ({ name: `Admin: ${a.admin}`, action: a.action, at: a.at }));
  res.json([...studentEvents, ...adminEvents].sort((a, b) => b.at - a.at).slice(0, 30));
});

app.post(
  "/api/dates",
  requireAuth("admin"),
  writeLimiter,
  [
    body("date").isISO8601().withMessage("Enter a valid date."),
    body("maxSlots").isInt({ min: 1, max: 10000 }).withMessage("Capacity must be between 1 and 10000."),
    body("perSlotMax").optional({ values: "falsy" }).isInt({ min: 1, max: 10000 }),
    body("deadline").optional({ values: "falsy" }).isISO8601().withMessage("Deadline must be a valid date."),
    body("status").optional().isIn(["Announced", "Unannounced"]).withMessage("Invalid schedule status."),
  ],
  handleValidation,
  wrap(async (req, res) => {
    const { date, maxSlots, perSlotMax, deadline, status } = req.body;
    const out = await mutate((db) => {
      if (db.dates.some((d) => d.date === date)) return { error: "This date already exists." };
      const finalDeadline = deadline || db.deadline || "";
      if (finalDeadline && new Date(`${date}T23:59:59`) > new Date(`${finalDeadline}T23:59:59`)) return { error: "The enrollment date cannot be after the deadline." };
      const entry = { date, maxSlots: Number(maxSlots), status: status || "Announced", deadline: finalDeadline };
      if (perSlotMax) entry.perSlotMax = Number(perSlotMax);
      db.dates.push(entry);
      db.dates.sort((a, b) => new Date(a.date) - new Date(b.date));
      logAdmin(db, req, `Added enrollment date ${date} (${maxSlots} slots)`);
      return { dates: db.dates };
    });
    if (out.error) return res.status(409).json({ error: out.error });
    res.status(201).json(out.dates);
  })
);

app.put(
  "/api/dates/:date",
  requireAuth("admin"),
  writeLimiter,
  [
    body("date").isISO8601().withMessage("Enter a valid date."),
    body("maxSlots").isInt({ min: 1, max: 10000 }).withMessage("Capacity must be between 1 and 10000."),
    body("perSlotMax").optional({ values: "falsy" }).isInt({ min: 1, max: 10000 }),
    body("deadline").optional({ values: "falsy" }).isISO8601().withMessage("Deadline must be a valid date."),
    body("status").optional().isIn(["Announced", "Unannounced"]).withMessage("Invalid schedule status."),
  ],
  handleValidation,
  wrap(async (req, res) => {
    const out = await mutate((db) => {
      const entry = db.dates.find((d) => d.date === req.params.date);
      if (!entry) return { error: "Date not found.", code: 404 };
      const nextDate = req.body.date;
      if (nextDate !== entry.date && db.dates.some((d) => d.date === nextDate)) return { error: "This date already exists.", code: 409 };
      const booked = db.students.filter((s) => s.date === entry.date && s.status !== "Cancelled").length;
      if (Number(req.body.maxSlots) < booked) return { error: `Capacity cannot be lower than current bookings (${booked}).`, code: 409 };
      const finalDeadline = req.body.deadline || db.deadline || "";
      if (finalDeadline && new Date(`${nextDate}T23:59:59`) > new Date(`${finalDeadline}T23:59:59`)) return { error: "The enrollment date cannot be after the deadline.", code: 409 };
      entry.date = nextDate;
      entry.maxSlots = Number(req.body.maxSlots);
      entry.perSlotMax = req.body.perSlotMax ? Number(req.body.perSlotMax) : undefined;
      entry.deadline = finalDeadline;
      entry.status = req.body.status || entry.status || "Unannounced";
      db.students.forEach((s) => { if (s.date === req.params.date) s.date = nextDate; });
      db.dates.sort((a, b) => new Date(a.date) - new Date(b.date));
      logAdmin(db, req, `Updated enrollment date ${req.params.date} to ${nextDate}`);
      return { date: entry };
    });
    if (out.error) return res.status(out.code || 400).json({ error: out.error });
    res.json(out.date);
  })
);

app.put(
  "/api/dates/:date/toggle",
  requireAuth("admin"),
  writeLimiter,
  wrap(async (req, res) => {
    const out = await mutate((db) => {
      const d = db.dates.find((x) => x.date === req.params.date);
      if (!d) return { error: "Date not found." };
      d.status = d.status === "Announced" ? "Unannounced" : "Announced";
      logAdmin(db, req, `Set ${d.date} to ${d.status}`);
      return { date: d };
    });
    if (out.error) return res.status(404).json({ error: out.error });
    res.json(out.date);
  })
);

app.delete(
  "/api/dates/:date",
  requireAuth("admin"),
  writeLimiter,
  wrap(async (req, res) => {
    const out = await mutate((db) => {
      const idx = db.dates.findIndex((d) => d.date === req.params.date);
      if (idx === -1) return { error: "Date not found." };
      db.dates.splice(idx, 1);
      logAdmin(db, req, `Deleted enrollment date ${req.params.date}`);
      return { ok: true };
    });
    if (out.error) return res.status(404).json({ error: out.error });
    res.status(204).end();
  })
);


app.get("/api/students", requireAuth("admin"), (req, res) => {
  const { q, status, program, page = 1, pageSize = 50 } = req.query;
  let students = readDB().students;

  if (q) {
    const needle = String(q).toLowerCase();
    students = students.filter((s) =>
      [s.name, s.id, s.dept, s.email].some((v) => String(v || "").toLowerCase().includes(needle))
    );
  }
  if (status) students = students.filter((s) => s.status === status);
  if (program) students = students.filter((s) => s.dept === program);

  const size = Math.min(200, Math.max(1, Number(pageSize) || 50));
  const current = Math.max(1, Number(page) || 1);
  const start = (current - 1) * size;

  res.json({
    total: students.length,
    page: current,
    pageSize: size,
    students: students.slice(start, start + size),
  });
});

app.get("/api/students/:id", requireSelfOrAdmin, (req, res) => {
  const student = readDB().students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found." });
  res.json(student);
});

app.post(
  "/api/students",
  requireAuth("admin", "student"),
  writeLimiter,
  [
    body("name").trim().isLength({ min: 2, max: 120 }).withMessage("Please enter a valid full name."),
    body("dept").trim().isLength({ min: 2, max: 120 }).withMessage("Please choose a program."),
    body("level").optional({ values: "falsy" }).trim().isLength({ max: 40 }),
    body("date").isISO8601().withMessage("Please choose a valid enrollment date."),
    body("time").trim().notEmpty().withMessage("Please choose a time slot."),
    body("phone").optional({ values: "falsy" }).matches(PH_MOBILE_RE).withMessage("Enter a valid PH mobile number (09XXXXXXXXX)."),
    body("gender").optional({ values: "falsy" }).trim().isLength({ max: 30 }),
    body("address").optional({ values: "falsy" }).trim().isLength({ max: 255 }),
    body("id").optional({ values: "falsy" }).trim().matches(STUDENT_ID_RE).withMessage("Student ID must look like 26-1-0001."),
  ],
  handleValidation,
  wrap(async (req, res) => {
    const input = req.body;

    const out = await mutate((db) => {
      const id =
        req.user.type === "student"
          ? req.user.id
          : input.id || generateStudentId(db);
      const email = req.user.type === "student" ? req.user.email || "" : input.email || "";

      const existing = db.students.find((s) => String(s.id) === String(id));
      if (existing && existing.status !== "Cancelled") {
        return { error: "This student already has an active appointment." };
      }

      const problem = validateBooking(db, { date: input.date, time: input.time, excludeStudentId: id });
      if (problem) return problem;

      if (existing) db.students = db.students.filter((s) => String(s.id) !== String(id));

      const student = {
        id,
        name: input.name.trim(),
        email,
        provider: db.accounts.find((a) => a.id === id)?.provider || "local",
        dept: input.dept.trim(),
        level: (input.level || "").trim(),
        date: input.date,
        time: input.time,
        phone: input.phone || "",
        gender: (input.gender || "").trim(),
        address: (input.address || "").trim(),
        status: "Pending",
        appointmentNo: generateAppointmentNo(db.students),
        verificationId: generateVerificationId(),
        checkedInAt: null,
        checkedInBy: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        requirements: {
          studentId: true,
          registration: false,
          birthCertificate: false,
          clearance: false,
          grades: false,
          other: false,
        },
        notifications: [],
        activity: [{ action: "Appointment created", at: Date.now() }],
      };
      db.students.push(student);
      if (req.user.type === "admin") logAdmin(db, req, `Created appointment for ${id}`);
      return { student };
    });

    if (out.error) return res.status(409).json({ error: out.error });

    res.status(201).json(out.student);
    console.log("New student added:", out.student);
  })
);

app.post(
  "/api/appointments/verify",
  requireAuth("admin"),
  writeLimiter,
  wrap(async (req, res) => {
    const verificationId = String(req.body?.verificationId || "").trim();
    if (!verificationId) return res.status(400).json({ error: "Verification ID is required." });
    const checkIn = req.body?.checkIn === true;
    const out = await mutate((db) => {
      const student = db.students.find((item) => item.verificationId === verificationId);
      if (!student) return { error: "Invalid or unknown appointment QR code.", code: 404 };
      if (checkIn) {
        if (student.checkedInAt) return { student, alreadyCheckedIn: true };
        student.checkedInAt = Date.now();
        student.checkedInBy = req.user.username || "admin";
        student.activity = student.activity || [];
        student.activity.unshift({ action: "Appointment checked in via QR", at: Date.now() });
        addNotification(student, "Appointment checked in", "Your appointment has been checked in by the administrator.", "success");
        logAdmin(db, req, `Checked in appointment ${student.appointmentNo} via QR`);
      }
      return { student, alreadyCheckedIn: Boolean(student.checkedInAt) };
    });
    if (out.error) return res.status(out.code || 400).json({ error: out.error });
    res.json(out);
  })
);

// UPDATE student (istilo ng PUT route ni teacher, may auth at validation)
app.put(
  "/api/students/:id",
  requireSelfOrAdmin,
  writeLimiter,
  [
    body("status").optional({ values: "falsy" }).isIn(STATUSES).withMessage("Invalid status."),
    body("phone").optional({ values: "falsy" }).matches(PH_MOBILE_RE).withMessage("Enter a valid PH mobile number (09XXXXXXXXX)."),
    body("name").optional({ values: "falsy" }).trim().isLength({ min: 2, max: 120 }),
    body("gender").optional({ values: "falsy" }).trim().isLength({ max: 30 }),
    body("address").optional({ values: "falsy" }).trim().isLength({ max: 255 }),
    body("date").optional({ values: "falsy" }).isISO8601(),
  ],
  handleValidation,
  wrap(async (req, res) => {
    // makuha yung id na nirerequest ng frontend na iedit
    const { id } = req.params;

    const out = await mutate((db) => {
      const editIndex = db.students.findIndex((s) => s.id === id);
      if (editIndex === -1) return { error: "Student not found.", code: 404 };

      const student = db.students[editIndex];
      const input = req.body || {};
      const isAdmin = req.user.type === "admin";

      if (isAdmin && (input.date || input.time)) {
        const nextDate = input.date || student.date;
        const nextTime = input.time || student.time;
        if (nextDate !== student.date || nextTime !== student.time) {
          const problem = validateBooking(db, { date: nextDate, time: nextTime, excludeStudentId: student.id });
          if (problem) return { error: problem.error, code: 409 };
        }
      }

      if (isAdmin && input.status && input.status !== student.status) {
        const oldStatus = student.status;
        student.status = input.status;
        student.activity = student.activity || [];
        student.activity.unshift({ action: `Status changed from ${oldStatus} to ${input.status}`, at: Date.now() });
        addNotification(
          student,
          `Appointment ${input.status}`,
          `Your appointment status has been updated to ${input.status}.`,
          input.status === "Enrolled" || input.status === "Completed"
            ? "success"
            : input.status === "Cancelled"
            ? "danger"
            : "info"
        );
        logAdmin(db, req, `Changed ${student.id} status: ${oldStatus} to ${input.status}`);
      }

      const studentEditable = ["name", "dept", "level", "phone", "gender", "address", "requirements"];
      const adminEditable = ["name", "email", "dept", "level", "date", "time", "phone", "gender", "address", "requirements"];
      (isAdmin ? adminEditable : studentEditable).forEach((field) => {
        if (input[field] === undefined) return;
        if (field === "requirements") {
          const next = { ...student.requirements };
          Object.keys(student.requirements || {}).forEach((key) => {
            if (typeof input.requirements?.[key] === "boolean") next[key] = input.requirements[key];
          });
          student.requirements = next;
        } else {
          student[field] = input[field];
        }
      });

      if (input.markNotificationsRead === true) {
        student.notifications = (student.notifications || []).map((n) => ({ ...n, read: true }));
      }

      student.updatedAt = Date.now();
      db.students[editIndex] = student;
      return { student };
    });

    if (out.error) return res.status(out.code || 400).json({ error: out.error });

    res.json(out.student);
    console.log(out.student);
  })
);

app.delete(
  "/api/students/:id",
  requireAuth("admin"),
  writeLimiter,
  wrap(async (req, res) => {
    const out = await mutate((db) => {
      const idx = db.students.findIndex((s) => s.id === req.params.id);
      if (idx === -1) return { error: "Student not found." };
      db.students.splice(idx, 1);
      logAdmin(db, req, `Deleted record ${req.params.id}`);
      return { ok: true };
    });
    if (out.error) return res.status(404).json({ error: out.error });

    res.status(204).end();
    console.log("Student deleted:", req.params.id);
  })
);


app.get("/api/analytics", requireAuth("admin"), (req, res) => {
  const db = readDB();
  const students = db.students;

  const statusCounts = { Pending: 0, Enrolled: 0, Completed: 0, Cancelled: 0 };
  students.forEach((s) => (statusCounts[s.status] = (statusCounts[s.status] || 0) + 1));

  const programCounts = {};
  students.forEach((s) => (programCounts[s.dept] = (programCounts[s.dept] || 0) + 1));

  const capacity = db.dates.reduce((n, d) => n + Number(d.maxSlots || 0), 0);
  const active = students.filter((s) => s.status !== "Cancelled").length;

  res.json({
    total: students.length,
    pending: statusCounts.Pending,
    enrolled: statusCounts.Enrolled,
    completed: statusCounts.Completed,
    cancelled: statusCounts.Cancelled,
    availableSlots: Math.max(0, capacity - active),
    statusCounts,
    programCounts,
  });
});


app.get("/api/export/csv", requireAuth("admin"), (req, res) => {
  const students = readDB().students;
  const headers = ["Appointment No", "Student ID", "Name", "Gender", "Address", "Email", "Provider", "Department", "Level", "Date", "Time", "Phone", "Status"];
  const rows = students.map((s) => [s.appointmentNo, s.id, s.name, s.gender, s.address, s.email, s.provider, s.dept, s.level, s.date, s.time, s.phone, s.status]);
  const csv = [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="JPC-ENROLLSMART-Masterlist.csv"');
  res.send("\uFEFF" + csv);
});


app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`ENROLLSMART backend running on port ${PORT}`);
  if (!IS_PROD) console.log("NODE_ENV is not 'production' — HSTS and origin checks are relaxed.");
});

["SIGINT", "SIGTERM"].forEach((sig) =>
  process.on(sig, () => {
    console.log(`\n${sig} received, shutting down...`);
    server.close(() => writeChain.finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  })
);