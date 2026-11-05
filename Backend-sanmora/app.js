require("dotenv").config();
const dns = require("dns");
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// Security: Disable X-Powered-By header
app.disable("x-powered-by");

// Allowed origins
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://sanmora.co.za",
  "https://www.sanmora.co.za",
  "https://sanmora.in",
  "https://www.sanmora.in",
];

if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(",").forEach((origin) => {
    ALLOWED_ORIGINS.push(origin.trim());
  });
}

// CORS Middleware with Strict Origin Validation
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, or same-origin serverless)
      if (!origin) return callback(null, true);

      // Check explicit allowed origins
      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      // Check Vercel deployment preview domains (*.vercel.app)
      if (/^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }

      console.warn(`[CORS Blocked] Origin not allowed: ${origin}`);
      return callback(new Error("CORS policy: Access denied from unauthorized origin."), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  })
);

// Basic Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// JSON and URL-encoded body parsers with strict size limits
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Route handlers
const consultationRouter = require("./routes/consultationRoutes");
const careerRouter = require("./routes/careerRoutes");

// Mount routes
app.use("/api/consultation", consultationRouter);
app.use("/api/career-apply", careerRouter);

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Sanmora Web Backend is running securely.",
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("[Backend Error Handler]", err.message || err);
  res.status(err.status || 500).json({
    error: err.message || "An unexpected error occurred.",
  });
});

// Start express server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
  });
}

module.exports = app;
