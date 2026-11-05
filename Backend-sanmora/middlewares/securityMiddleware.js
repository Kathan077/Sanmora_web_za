const crypto = require("crypto");
const dns = require("dns");

// ── 1. Input Sanitization & Anti-Header-Injection ────────────────────────────

function sanitizeHeader(input, maxLength = 120) {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\r\n\0]/g, " ")
    .replace(/(%0A|%0D|%00)/gi, " ")
    .replace(/\b(bcc|cc|to|from|content-type|mime-version|reply-to)\s*:/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeHtml(input, maxLength = 5000) {
  if (typeof input !== "string") return "";
  return input
    .slice(0, maxLength)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── 2. Email Syntax & Domain Validation ──────────────────────────────────────

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "tempmail.com", "temp-mail.org", "10minutemail.com",
  "yopmail.com", "guerrillamail.com", "dispostable.com", "getairmail.com",
  "maildrop.cc", "trashmail.com", "mailnesia.com", "temp-mail.io", "fakemailgenerator.com",
  "generator.email", "disposable.com", "tempmailaddress.com", "throwawaymail.com",
  "sharklasers.com", "guerrillamailblock.com", "grr.la", "pokemail.net", "mohmal.com"
]);

const FAKE_PREFIXES = [
  "abc", "xyz", "qwe", "asd", "zxc", "jkl", "qwerty", "test", "testing",
  "dummy", "example", "fake", "demo", "noreply", "no-reply", "null", "none", "temp"
];
const PREFIX_REGEX = new RegExp(`^(${FAKE_PREFIXES.join("|")})[._-]?\\d*$`, "i");
const FORBIDDEN_SUBSTRINGS = ["testing", "fakeemail", "exampleemail", "dummyemail"];

function validateEmailAddress(email) {
  if (!email || typeof email !== "string") {
    return { valid: false, error: "Email address is required." };
  }

  const cleanEmail = email.trim();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(cleanEmail)) {
    return { valid: false, error: "Please enter a valid email address." };
  }

  const [username, domain] = cleanEmail.toLowerCase().split("@");

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, error: "Temporary or disposable email addresses are not permitted." };
  }

  if (
    PREFIX_REGEX.test(username) ||
    FORBIDDEN_SUBSTRINGS.some((sub) => username.includes(sub)) ||
    /^(.)\1{2,}$/.test(username) ||
    /^\d+$/.test(username)
  ) {
    return { valid: false, error: "Please enter a genuine, professional email address." };
  }

  return { valid: true, email: cleanEmail, domain };
}

async function verifyEmailDomain(domain) {
  try {
    const dnsPromises = dns.promises;
    const lookupPromise = dnsPromises.resolveMx(domain).then((mxRecords) => {
      if (mxRecords && mxRecords.length > 0) return true;
      return dnsPromises.resolve4(domain).then((aRecords) => aRecords && aRecords.length > 0);
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("DNS timeout")), 2500)
    );

    const hasMailServers = await Promise.race([lookupPromise, timeoutPromise]);
    return Boolean(hasMailServers);
  } catch (err) {
    console.warn(`[DNS Check Warning] Could not resolve MX for ${domain}:`, err?.message || err);
    return true; // Fallback to avoid false rejections on DNS timeout
  }
}

// ── 3. Google reCAPTCHA v3 Verification ──────────────────────────────────────

async function verifyRecaptchaToken(token, expectedAction, clientIp) {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  if (!secretKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[Backend reCAPTCHA DEV NOTICE] RECAPTCHA_SECRET_KEY not set. Skipping verification in dev.`
      );
      return { success: true, score: 1.0, bypassed: true };
    }
    return { success: false, error: "reCAPTCHA verification is misconfigured on the server." };
  }

  if (!token || typeof token !== "string") {
    return { success: false, error: "Missing or invalid reCAPTCHA verification token." };
  }

  try {
    const params = new URLSearchParams();
    params.append("secret", secretKey);
    params.append("response", token);
    if (clientIp) params.append("remoteip", clientIp);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();

    if (!data.success) {
      console.warn("[Backend reCAPTCHA Failed]", data["error-codes"]);
      return {
        success: false,
        error: "reCAPTCHA verification failed. Please try again.",
        details: data["error-codes"],
      };
    }

    const scoreThreshold = parseFloat(process.env.RECAPTCHA_MIN_SCORE || "0.5");
    if (typeof data.score === "number" && data.score < scoreThreshold) {
      console.warn(`[Backend reCAPTCHA Low Score] ${data.score} < ${scoreThreshold} for IP ${clientIp}`);
      return {
        success: false,
        error: "Automated traffic detected. Please try again later.",
        score: data.score,
      };
    }

    return { success: true, score: data.score, action: data.action };
  } catch (err) {
    console.error("[Backend reCAPTCHA Exception]", err?.message || err);
    if (process.env.NODE_ENV !== "production") {
      return { success: true, score: 0.9, error: err?.message };
    }
    return { success: false, error: "Could not verify security token. Please retry in a few moments." };
  }
}

// ── 4. Sliding-Window Rate Limiter & Abuse Prevention ────────────────────────

const ipRequestHistory = new Map();
const IP_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 mins
const MAX_IP_REQUESTS = 5;

const globalRequestHistory = [];
const GLOBAL_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_GLOBAL_REQUESTS = 60;

function checkEmailRateLimit(clientIp) {
  const now = Date.now();

  // 1. Global limit
  while (globalRequestHistory.length > 0 && now - globalRequestHistory[0] > GLOBAL_RATE_WINDOW_MS) {
    globalRequestHistory.shift();
  }

  if (globalRequestHistory.length >= MAX_GLOBAL_REQUESTS) {
    const oldestGlobal = globalRequestHistory[0];
    const retryAfter = Math.ceil((oldestGlobal + GLOBAL_RATE_WINDOW_MS - now) / 1000);
    return {
      limited: true,
      retryAfter: Math.max(1, retryAfter),
      reason: "Server email capacity reached for this hour. Please try again later.",
    };
  }

  // 2. Per-IP limit
  const ipList = ipRequestHistory.get(clientIp) || [];
  const recentIpList = ipList.filter((t) => now - t < IP_RATE_WINDOW_MS);

  if (recentIpList.length >= MAX_IP_REQUESTS) {
    const oldestIp = recentIpList[0];
    const retryAfter = Math.ceil((oldestIp + IP_RATE_WINDOW_MS - now) / 1000);
    return {
      limited: true,
      retryAfter: Math.max(1, retryAfter),
      reason: `Too many submissions from this IP. Please wait ${Math.ceil(retryAfter / 60)} minute(s) before trying again.`,
    };
  }

  recentIpList.push(now);
  ipRequestHistory.set(clientIp, recentIpList);
  globalRequestHistory.push(now);

  if (ipRequestHistory.size > 2000) {
    for (const [key, timestamps] of ipRequestHistory.entries()) {
      const active = timestamps.filter((t) => now - t < IP_RATE_WINDOW_MS);
      if (active.length === 0) ipRequestHistory.delete(key);
      else ipRequestHistory.set(key, active);
    }
  }

  return { limited: false };
}

// ── 5. Duplicate Submission Prevention ───────────────────────────────────────

const recentFingerprints = new Map();
const DEDUPLICATION_WINDOW_MS = 3 * 60 * 1000; // 3 mins

function checkDuplicateSubmission(clientIp, identifier) {
  const now = Date.now();
  const hash = crypto
    .createHash("sha256")
    .update(`${clientIp}:${identifier.toLowerCase().trim()}`)
    .digest("hex");

  const lastSeen = recentFingerprints.get(hash);
  if (lastSeen && now - lastSeen < DEDUPLICATION_WINDOW_MS) {
    const retryAfter = Math.ceil((lastSeen + DEDUPLICATION_WINDOW_MS - now) / 1000);
    return {
      isDuplicate: true,
      retryAfter,
      message: "Duplicate submission detected. Please wait a few minutes before submitting again.",
    };
  }

  recentFingerprints.set(hash, now);

  if (recentFingerprints.size > 1000) {
    for (const [key, timestamp] of recentFingerprints.entries()) {
      if (now - timestamp > DEDUPLICATION_WINDOW_MS) {
        recentFingerprints.delete(key);
      }
    }
  }

  return { isDuplicate: false };
}

// ── 6. Structured SMTP Audit Logger ──────────────────────────────────────────

function logSmtpAudit({
  endpoint,
  ip,
  status,
  recipientDomain,
  action,
  error,
  latencyMs,
  messageId,
}) {
  const timestamp = new Date().toISOString();
  const cleanIp = ip ? ip.replace(/:\d+$/, "") : "unknown";
  const errStr = error ? String(error).slice(0, 300) : undefined;

  const formatted = `[SMTP AUDIT] ${timestamp} | ${status} | ${endpoint} | IP: ${cleanIp} | ${latencyMs ? `${Math.round(latencyMs)}ms | ` : ""}${errStr ? `Error: ${errStr}` : `MsgId: ${messageId || "ok"}`}`;

  if (status === "SUCCESS") {
    console.log(formatted);
  } else if (status === "RATE_LIMITED" || status === "BOT_BLOCKED" || status === "VALIDATION_FAILED") {
    console.warn(formatted);
  } else {
    console.error(formatted);
  }
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "127.0.0.1";
}

module.exports = {
  sanitizeHeader,
  sanitizeHtml,
  validateEmailAddress,
  verifyEmailDomain,
  verifyRecaptchaToken,
  checkEmailRateLimit,
  checkDuplicateSubmission,
  logSmtpAudit,
  getClientIp,
};
