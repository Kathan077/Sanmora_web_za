import { NextResponse } from "next/server";
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

export async function POST(request) {
  const startTime = Date.now();
  const forwarded = request.headers.get("x-forwarded-for");
  const clientIp = forwarded
    ? forwarded.split(",")[0].trim()
    : request.headers.get("x-real-ip") || "127.0.0.1";

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request payload." },
        { status: 400 }
      );
    }

    const {
      fullName,
      companyName,
      emailId,
      contactNo,
      serviceName,
      captchaToken,
      website_url, // Honeypot field
    } = body || {};

    // ── 1. Honeypot Bot Trap ─────────────────────────────────────────────────
    // If the hidden honeypot input is populated, silently drop the submission.
    if (website_url) {
      logSmtpAudit({
        endpoint: "/api/consultation",
        ip: clientIp,
        status: "BOT_BLOCKED",
        action: "honeypot_triggered",
        error: "Honeypot field filled by automated bot.",
        latencyMs: Date.now() - startTime,
      });
      // Stealth response to confuse automated scanners
      return NextResponse.json({
        success: true,
        message: "Consultation request email submitted successfully!",
      });
    }

    // ── 2. IP & Global Rate Limiting ─────────────────────────────────────────
    const rateCheck = checkEmailRateLimit(clientIp);
    if (rateCheck.limited) {
      logSmtpAudit({
        endpoint: "/api/consultation",
        ip: clientIp,
        status: "RATE_LIMITED",
        action: "consultation_rate_limit",
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

    // ── 3. Basic Field Presence Check ────────────────────────────────────────
    if (!fullName || !emailId || !contactNo || !serviceName) {
      return NextResponse.json(
        {
          error: "Missing required fields: fullName, emailId, contactNo, and serviceName are required.",
        },
        { status: 400 }
      );
    }

    // ── 4. Email Syntax & Domain Validation ──────────────────────────────────
    const emailValidation = validateEmailAddress(emailId);
    if (!emailValidation.valid) {
      logSmtpAudit({
        endpoint: "/api/consultation",
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

    // Check MX records to avoid bouncebacks that hurt Hostinger sender reputation
    const hasActiveMailServer = await verifyEmailDomain(emailValidation.domain);
    if (!hasActiveMailServer) {
      logSmtpAudit({
        endpoint: "/api/consultation",
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
      `${emailValidation.email}:${serviceName}`
    );
    if (duplicateCheck.isDuplicate) {
      logSmtpAudit({
        endpoint: "/api/consultation",
        ip: clientIp,
        status: "RATE_LIMITED",
        action: "duplicate_submission_blocked",
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
      null, // Allow either consultation_submit or consultation_seo_submit
      clientIp
    );
    if (!recaptchaResult.success) {
      logSmtpAudit({
        endpoint: "/api/consultation",
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

    // ── 7. Input Sanitization & Anti-Header-Injection ────────────────────────
    const cleanFullName = sanitizeHeader(fullName, 80);
    const cleanCompanyName = sanitizeHeader(companyName || "N/A", 80);
    const cleanServiceName = sanitizeHeader(serviceName, 80);
    const cleanContactNo = sanitizeHeader(contactNo, 30);
    const cleanEmail = emailValidation.email;

    // Escaped HTML for email template
    const safeFullName = sanitizeHtml(cleanFullName);
    const safeCompanyName = sanitizeHtml(cleanCompanyName);
    const safeServiceName = sanitizeHtml(cleanServiceName);
    const safeContactNo = sanitizeHtml(cleanContactNo);
    const safeEmail = sanitizeHtml(cleanEmail);

    const user = process.env.EMAIL_USER || "info@sanmora.in";
    const receiver = process.env.EMAIL_RECEIVER || "info@sanmora.in, info@sanmora.co.za";

    const mailOptions = {
      from: `"Sanmora Consultation" <${user}>`,
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
            This inquiry was verified by Google reCAPTCHA v3 and submitted from the Sanmora Web Portal.
          </div>
        </div>
      `,
    };

    // ── 8. Dispatch Email via Mailer ─────────────────────────────────────────
    const sendResult = await sendEmail(mailOptions);

    logSmtpAudit({
      endpoint: "/api/consultation",
      ip: clientIp,
      status: "SUCCESS",
      recipientDomain: "sanmora.in",
      action: "consultation_delivered",
      messageId: sendResult.messageId,
      latencyMs: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      message: "Consultation request email submitted successfully!",
    });
  } catch (error) {
    logSmtpAudit({
      endpoint: "/api/consultation",
      ip: clientIp,
      status: "SMTP_ERROR",
      action: "consultation_failed",
      error: error.message || error,
      latencyMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: "Failed to send consultation email. Please try again later or contact us directly." },
      { status: 500 }
    );
  }
}
