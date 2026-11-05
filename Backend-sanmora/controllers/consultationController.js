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

const sendConsultationEmail = async (req, res) => {
  const startTime = Date.now();
  const clientIp = getClientIp(req);
  const {
    fullName,
    companyName,
    emailId,
    contactNo,
    serviceName,
    captchaToken,
    website_url, // Honeypot field
  } = req.body || {};

  // 1. Honeypot check
  if (website_url) {
    logSmtpAudit({
      endpoint: "/api/consultation (Backend)",
      ip: clientIp,
      status: "BOT_BLOCKED",
      action: "honeypot_triggered",
      error: "Honeypot field filled by bot.",
      latencyMs: Date.now() - startTime,
    });
    return res.status(200).json({
      success: true,
      message: "Consultation request email submitted successfully!",
    });
  }

  // 2. Rate Limit check
  const rateCheck = checkEmailRateLimit(clientIp);
  if (rateCheck.limited) {
    logSmtpAudit({
      endpoint: "/api/consultation (Backend)",
      ip: clientIp,
      status: "RATE_LIMITED",
      action: "consultation_rate_limit",
      error: rateCheck.reason,
      latencyMs: Date.now() - startTime,
    });
    return res.status(429).json({ error: rateCheck.reason });
  }

  // 3. Field presence check
  if (!fullName || !emailId || !contactNo || !serviceName) {
    return res.status(400).json({
      error: "Missing required fields: fullName, emailId, contactNo, and serviceName are required.",
    });
  }

  // 4. Email validation
  const emailValidation = validateEmailAddress(emailId);
  if (!emailValidation.valid) {
    logSmtpAudit({
      endpoint: "/api/consultation (Backend)",
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
      endpoint: "/api/consultation (Backend)",
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
    `${emailValidation.email}:${serviceName}`
  );
  if (duplicateCheck.isDuplicate) {
    logSmtpAudit({
      endpoint: "/api/consultation (Backend)",
      ip: clientIp,
      status: "RATE_LIMITED",
      action: "duplicate_submission_blocked",
      error: duplicateCheck.message,
      latencyMs: Date.now() - startTime,
    });
    return res.status(429).json({ error: duplicateCheck.message });
  }

  // 6. Google reCAPTCHA v3 verification
  const recaptchaResult = await verifyRecaptchaToken(captchaToken, null, clientIp);
  if (!recaptchaResult.success) {
    logSmtpAudit({
      endpoint: "/api/consultation (Backend)",
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

  // 7. Input Sanitization & Anti-Header-Injection
  const cleanFullName = sanitizeHeader(fullName, 80);
  const cleanCompanyName = sanitizeHeader(companyName || "N/A", 80);
  const cleanServiceName = sanitizeHeader(serviceName, 80);
  const cleanContactNo = sanitizeHeader(contactNo, 30);
  const cleanEmail = emailValidation.email;

  const safeFullName = sanitizeHtml(cleanFullName);
  const safeCompanyName = sanitizeHtml(cleanCompanyName);
  const safeServiceName = sanitizeHtml(cleanServiceName);
  const safeContactNo = sanitizeHtml(cleanContactNo);
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
    from: `"Sanmora Web Consultation" <${user || "info@sanmora.in"}>`,
    to: receiver,
    subject: `New Free Consultation Request: ${cleanServiceName} - ${cleanFullName}`,
    text: `New Free Consultation Request\n\nService: ${cleanServiceName}\nFull Name: ${cleanFullName}\nCompany: ${cleanCompanyName}\nEmail: ${cleanEmail}\nContact: ${cleanContactNo}\n\nSubmitted from Sanmora Web.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #7c3aed; border-bottom: 2px solid #7c3aed; padding-bottom: 12px; margin-top: 0;">Free Consultation Request</h2>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #4b5563; width: 170px;">Service of Interest:</td>
            <td style="padding: 10px 0; color: #1f2937;"><strong>${safeServiceName}</strong></td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Full Name:</td>
            <td style="padding: 10px 0; color: #1f2937;">${safeFullName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Company Name:</td>
            <td style="padding: 10px 0; color: #1f2937;">${safeCompanyName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Email Address:</td>
            <td style="padding: 10px 0; color: #1f2937;"><a href="mailto:${safeEmail}">${safeEmail}</a></td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Contact Number:</td>
            <td style="padding: 10px 0; color: #1f2937;">${safeContactNo}</td>
          </tr>
        </table>
        <div style="margin-top: 30px; padding: 12px; background-color: #f3e8ff; color: #6b21a8; border-radius: 6px; font-size: 13px; text-align: center;">
          This inquiry was verified by Google reCAPTCHA v3 and submitted from the Sanmora Web Free Consultation Form.
        </div>
      </div>
    `,
  };

  try {
    const sendResult = await transporter.sendMail(mailOptions);
    logSmtpAudit({
      endpoint: "/api/consultation (Backend)",
      ip: clientIp,
      status: "SUCCESS",
      recipientDomain: "sanmora.in",
      action: "consultation_delivered",
      messageId: sendResult?.messageId,
      latencyMs: Date.now() - startTime,
    });
    return res.status(200).json({
      success: true,
      message: "Consultation request email submitted successfully!",
    });
  } catch (error) {
    logSmtpAudit({
      endpoint: "/api/consultation (Backend)",
      ip: clientIp,
      status: "SMTP_ERROR",
      action: "consultation_failed",
      error: error.message || error,
      latencyMs: Date.now() - startTime,
    });
    return res.status(500).json({
      error: "Failed to send consultation email. Please try again later or contact us directly.",
    });
  }
};

module.exports = {
  sendConsultationEmail,
};
