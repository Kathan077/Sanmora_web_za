const path = require("path");
const { getTransporter } = require("../config/mailer");
const {
  sanitizeHeader,
  sanitizeHtml,
  validateEmailAddress,
  verifyEmailDomain,
  verifyRecaptchaToken,
  checkEmailRateLimit,
  checkDuplicateSubmission,
  logSmtpAudit,
  getClientIp,
} = require("../middlewares/securityMiddleware");

const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const applyJob = async (req, res) => {
  const startTime = Date.now();
  const clientIp = getClientIp(req);
  const {
    name,
    email,
    whatsapp,
    portfolio,
    message,
    jobId,
    jobTitle,
    captchaToken,
    website_url, // Honeypot trap
  } = req.body || {};

  // 1. Honeypot check
  if (website_url) {
    logSmtpAudit({
      endpoint: "/api/career-apply (Backend)",
      ip: clientIp,
      status: "BOT_BLOCKED",
      action: "career_honeypot_triggered",
      error: "Honeypot field filled by bot.",
      latencyMs: Date.now() - startTime,
    });
    return res.status(200).json({
      success: true,
      message: "Application submitted and email sent successfully!",
    });
  }

  // 2. Rate limit check
  const rateCheck = checkEmailRateLimit(clientIp);
  if (rateCheck.limited) {
    logSmtpAudit({
      endpoint: "/api/career-apply (Backend)",
      ip: clientIp,
      status: "RATE_LIMITED",
      action: "career_rate_limit",
      error: rateCheck.reason,
      latencyMs: Date.now() - startTime,
    });
    return res.status(429).json({ error: rateCheck.reason });
  }

  // 3. Required fields check
  if (!name || !email || !whatsapp || !message) {
    return res.status(400).json({
      error: "Missing required form fields (name, email, whatsapp, and message are required).",
    });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Resume / CV file attachment is required." });
  }

  // 4. Email validation
  const emailValidation = validateEmailAddress(email);
  if (!emailValidation.valid) {
    logSmtpAudit({
      endpoint: "/api/career-apply (Backend)",
      ip: clientIp,
      status: "VALIDATION_FAILED",
      error: emailValidation.error,
      latencyMs: Date.now() - startTime,
    });
    return res.status(400).json({ error: emailValidation.error });
  }

  const hasMailServers = await verifyEmailDomain(emailValidation.domain);
  if (!hasMailServers) {
    logSmtpAudit({
      endpoint: "/api/career-apply (Backend)",
      ip: clientIp,
      status: "VALIDATION_FAILED",
      recipientDomain: emailValidation.domain,
      error: "No active MX records found.",
      latencyMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: "The provided email domain is invalid or does not have active mail servers.",
    });
  }

  // 5. Deduplication check
  const duplicateCheck = checkDuplicateSubmission(
    clientIp,
    `${emailValidation.email}:${jobTitle || jobId || "career"}`
  );
  if (duplicateCheck.isDuplicate) {
    logSmtpAudit({
      endpoint: "/api/career-apply (Backend)",
      ip: clientIp,
      status: "RATE_LIMITED",
      action: "duplicate_submission_blocked",
      error: duplicateCheck.message,
      latencyMs: Date.now() - startTime,
    });
    return res.status(429).json({ error: duplicateCheck.message });
  }

  // 6. Google reCAPTCHA v3 verification
  const recaptchaResult = await verifyRecaptchaToken(captchaToken, "career_submit", clientIp);
  if (!recaptchaResult.success) {
    logSmtpAudit({
      endpoint: "/api/career-apply (Backend)",
      ip: clientIp,
      status: "BOT_BLOCKED",
      action: "recaptcha_failed",
      error: recaptchaResult.error,
      latencyMs: Date.now() - startTime,
    });
    return res.status(400).json({
      error: recaptchaResult.error || "Security verification failed.",
    });
  }

  // 7. File attachment security validation
  if (req.file.size > MAX_FILE_SIZE) {
    return res.status(400).json({
      error: "Resume file size exceeds maximum allowed limit of 10MB.",
    });
  }

  const fileExt = path.extname(req.file.originalname || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(fileExt)) {
    return res.status(400).json({
      error: "Invalid resume format. Only PDF, DOC, and DOCX files are permitted.",
    });
  }

  if (req.file.mimetype && !ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
    return res.status(400).json({
      error: "Invalid resume file type. Please upload a genuine PDF or Word document.",
    });
  }

  const safeFilename = path
    .basename(req.file.originalname || "resume.pdf")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 60);

  // 8. Input Sanitization & Anti-Header-Injection
  const cleanName = sanitizeHeader(name, 80);
  const cleanJobTitle = sanitizeHeader(jobTitle || `Job ID: ${jobId || "General"}`, 80);
  const cleanWhatsapp = sanitizeHeader(whatsapp, 30);
  const cleanPortfolio = sanitizeHeader(portfolio || "N/A", 200);
  const cleanEmail = emailValidation.email;

  const safeName = sanitizeHtml(cleanName);
  const safeJobTitle = sanitizeHtml(cleanJobTitle);
  const safeWhatsapp = sanitizeHtml(cleanWhatsapp);
  const safePortfolio = sanitizeHtml(cleanPortfolio);
  const safeMessage = sanitizeHtml(message, 3000);
  const safeEmail = sanitizeHtml(cleanEmail);

  const receiver = process.env.EMAIL_RECEIVER || "info@sanmora.in, info@sanmora.co.za";
  const user = process.env.EMAIL_USER;

  if (!user && !process.env.RESEND_API_KEY && !process.env.SENDGRID_API_KEY) {
    return res.status(500).json({
      error: "Mailer setup is incomplete. Please configure EMAIL_USER and EMAIL_PASS in the backend .env file.",
    });
  }

  const transporter = getTransporter();

  const mailOptions = {
    from: `"Sanmora Web Careers" <${user || "info@sanmora.in"}>`,
    to: receiver,
    subject: `New Job Application: ${cleanJobTitle} - ${cleanName}`,
    text: `New Job Application\n\nRole: ${cleanJobTitle}\nName: ${cleanName}\nEmail: ${cleanEmail}\nWhatsApp: ${cleanWhatsapp}\nPortfolio: ${cleanPortfolio}\n\nCover Letter / Message:\n${message}\n\nResume attached.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #06b6d4; border-bottom: 2px solid #06b6d4; padding-bottom: 12px; margin-top: 0;">Job Application Received</h2>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #4b5563; width: 170px;">Job Role Applied:</td>
            <td style="padding: 10px 0; color: #1f2937;"><strong>${safeJobTitle}</strong></td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Applicant Name:</td>
            <td style="padding: 10px 0; color: #1f2937;">${safeName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Email Address:</td>
            <td style="padding: 10px 0; color: #1f2937;"><a href="mailto:${safeEmail}">${safeEmail}</a></td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">WhatsApp Number:</td>
            <td style="padding: 10px 0; color: #1f2937;">${safeWhatsapp}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Portfolio / GitHub:</td>
            <td style="padding: 10px 0; color: #1f2937;">
              ${safePortfolio !== "N/A" ? `<a href="${safePortfolio}" target="_blank" rel="noopener noreferrer">${safePortfolio}</a>` : "N/A"}
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #4b5563; vertical-align: top;">Cover Letter / Message:</td>
            <td style="padding: 10px 0; color: #1f2937; white-space: pre-line;">${safeMessage}</td>
          </tr>
        </table>
        <p style="margin-top: 20px; font-size: 13px; color: #64748b;">
          <em>Note: The applicant's resume is attached to this email.</em>
        </p>
        <div style="margin-top: 30px; padding: 12px; background-color: #ecfeff; color: #0891b2; border-radius: 6px; font-size: 13px; text-align: center;">
          This job application was verified by Google reCAPTCHA v3 and submitted from the Sanmora Web Careers Portal.
        </div>
      </div>
    `,
    attachments: [
      {
        filename: safeFilename,
        content: req.file.buffer,
      },
    ],
  };

  try {
    const sendResult = await transporter.sendMail(mailOptions);
    logSmtpAudit({
      endpoint: "/api/career-apply (Backend)",
      ip: clientIp,
      status: "SUCCESS",
      recipientDomain: "sanmora.in",
      action: "career_delivered",
      messageId: sendResult?.messageId,
      latencyMs: Date.now() - startTime,
    });
    return res.status(200).json({
      success: true,
      message: "Application submitted and email sent successfully!",
    });
  } catch (error) {
    logSmtpAudit({
      endpoint: "/api/career-apply (Backend)",
      ip: clientIp,
      status: "SMTP_ERROR",
      action: "career_failed",
      error: error.message || error,
      latencyMs: Date.now() - startTime,
    });
    return res.status(500).json({
      error: "Failed to send career email. Please try again later or contact us directly.",
    });
  }
};

module.exports = {
  applyJob,
};
