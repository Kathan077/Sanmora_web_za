import { NextResponse } from "next/server";
import path from "path";
import { sendEmail } from "@/lib/mailer";
import {
  sanitizeHeader,
  sanitizeHtml,
  validateEmailAddress,
  verifyEmailDomain,
  verifyRecaptchaToken,
  checkEmailRateLimit,
  checkDuplicateSubmission,
  logSmtpAudit,
} from "@/lib/emailSecurity";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream", // Fallback for some OS file uploaders
]);

const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

export async function POST(request) {
  const startTime = Date.now();
  const forwarded = request.headers.get("x-forwarded-for");
  const clientIp = forwarded
    ? forwarded.split(",")[0].trim()
    : request.headers.get("x-real-ip") || "127.0.0.1";

  try {
    const formData = await request.formData();
    const name = formData.get("name");
    const email = formData.get("email");
    const whatsapp = formData.get("whatsapp");
    const portfolio = formData.get("portfolio");
    const message = formData.get("message");
    const jobId = formData.get("jobId");
    const jobTitle = formData.get("jobTitle");
    const resumeFile = formData.get("resume");
    const captchaToken = formData.get("captchaToken");
    const website_url = formData.get("website_url"); // Honeypot trap

    // ── 1. Honeypot Bot Trap ─────────────────────────────────────────────────
    if (website_url) {
      logSmtpAudit({
        endpoint: "/api/career-apply",
        ip: clientIp,
        status: "BOT_BLOCKED",
        action: "career_honeypot_triggered",
        error: "Honeypot field filled by automated bot.",
        latencyMs: Date.now() - startTime,
      });
      return NextResponse.json({
        success: true,
        message: "Application submitted and email sent successfully!",
      });
    }

    // ── 2. IP & Global Rate Limiting ─────────────────────────────────────────
    const rateCheck = checkEmailRateLimit(clientIp);
    if (rateCheck.limited) {
      logSmtpAudit({
        endpoint: "/api/career-apply",
        ip: clientIp,
        status: "RATE_LIMITED",
        action: "career_rate_limit",
        error: rateCheck.reason,
        latencyMs: Date.now() - startTime,
      });
      return NextResponse.json(
        { error: rateCheck.reason },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateCheck.retryAfter),
          },
        }
      );
    }

    // ── 3. Field Presence Checks ─────────────────────────────────────────────
    if (!name || !email || !whatsapp || !message || !resumeFile) {
      return NextResponse.json(
        {
          error: "Missing required fields (name, email, whatsapp, message, and resume are required).",
        },
        { status: 400 }
      );
    }

    // ── 4. Email Syntax & Domain Validation ──────────────────────────────────
    const emailValidation = validateEmailAddress(email);
    if (!emailValidation.valid) {
      logSmtpAudit({
        endpoint: "/api/career-apply",
        ip: clientIp,
        status: "VALIDATION_FAILED",
        error: emailValidation.error,
        latencyMs: Date.now() - startTime,
      });
      return NextResponse.json(
        { error: emailValidation.error },
        { status: 400 }
      );
    }

    const hasActiveMailServer = await verifyEmailDomain(emailValidation.domain);
    if (!hasActiveMailServer) {
      logSmtpAudit({
        endpoint: "/api/career-apply",
        ip: clientIp,
        status: "VALIDATION_FAILED",
        recipientDomain: emailValidation.domain,
        error: "Email domain has no valid MX or A records.",
        latencyMs: Date.now() - startTime,
      });
      return NextResponse.json(
        { error: "The provided email domain is invalid or does not have active mail servers." },
        { status: 400 }
      );
    }

    // ── 5. Duplicate Submission Cooldown ─────────────────────────────────────
    const duplicateCheck = checkDuplicateSubmission(
      clientIp,
      `${emailValidation.email}:${jobTitle || jobId || "career"}`
    );
    if (duplicateCheck.isDuplicate) {
      logSmtpAudit({
        endpoint: "/api/career-apply",
        ip: clientIp,
        status: "RATE_LIMITED",
        action: "career_duplicate_blocked",
        error: duplicateCheck.message,
        latencyMs: Date.now() - startTime,
      });
      return NextResponse.json(
        { error: duplicateCheck.message },
        { status: 429 }
      );
    }

    // ── 6. Google reCAPTCHA v3 Verification ──────────────────────────────────
    const recaptchaResult = await verifyRecaptchaToken(
      captchaToken,
      "career_submit",
      clientIp
    );
    if (!recaptchaResult.success) {
      logSmtpAudit({
        endpoint: "/api/career-apply",
        ip: clientIp,
        status: "BOT_BLOCKED",
        action: "recaptcha_verification_failed",
        error: recaptchaResult.error,
        latencyMs: Date.now() - startTime,
      });
      return NextResponse.json(
        { error: recaptchaResult.error || "Security verification failed." },
        { status: 400 }
      );
    }

    // ── 7. File Attachment Security Checks ───────────────────────────────────
    if (typeof resumeFile.size === "number" && resumeFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Resume file size exceeds maximum allowed limit of 10MB." },
        { status: 400 }
      );
    }

    const fileExt = path.extname(resumeFile.name || "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(fileExt)) {
      return NextResponse.json(
        { error: "Invalid resume format. Only PDF, DOC, and DOCX files are permitted." },
        { status: 400 }
      );
    }

    if (resumeFile.type && !ALLOWED_MIME_TYPES.has(resumeFile.type)) {
      return NextResponse.json(
        { error: "Invalid resume file type. Please upload a genuine PDF or Word document." },
        { status: 400 }
      );
    }

    // Sanitize file name for safe attachment handling
    const safeBaseName = path
      .basename(resumeFile.name || "resume.pdf")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 60);

    const arrayBuffer = await resumeFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ── 8. Input Sanitization & Anti-Header-Injection ────────────────────────
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

    const user = process.env.EMAIL_USER || "info@sanmora.in";
    const receiver = process.env.EMAIL_RECEIVER || "info@sanmora.in, info@sanmora.co.za";

    const mailOptions = {
      from: `"Sanmora Careers" <${user}>`,
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
            <em>Note: The applicant's verified resume is attached to this email.</em>
          </p>
          <div style="margin-top: 30px; padding: 12px; background-color: #ecfeff; color: #0891b2; border-radius: 6px; font-size: 13px; text-align: center;">
            This job application was verified by Google reCAPTCHA v3 and submitted from the Sanmora Careers Portal.
          </div>
        </div>
      `,
      attachments: [
        {
          filename: safeBaseName,
          content: buffer,
        },
      ],
    };

    const sendResult = await sendEmail(mailOptions);

    logSmtpAudit({
      endpoint: "/api/career-apply",
      ip: clientIp,
      status: "SUCCESS",
      recipientDomain: "sanmora.in",
      action: "career_delivered",
      messageId: sendResult.messageId,
      latencyMs: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      message: "Application submitted and email sent successfully!",
    });
  } catch (error) {
    logSmtpAudit({
      endpoint: "/api/career-apply",
      ip: clientIp,
      status: "SMTP_ERROR",
      action: "career_failed",
      error: error.message || error,
      latencyMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: "Failed to send career application. Please try again later or contact us directly." },
      { status: 500 }
    );
  }
}
