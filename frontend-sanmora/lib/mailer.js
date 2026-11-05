import nodemailer from "nodemailer";

let cachedTransporter = null;

/**
 * Returns a pooled Nodemailer transporter instance for SMTP.
 * Using a connection pool prevents opening dozens of new SSL/TLS handshakes
 * simultaneously to smtp.hostinger.com, which is a common cause of Hostinger SMTP suspensions.
 */
function getSmtpTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const host = process.env.EMAIL_HOST || "smtp.hostinger.com";
  const port = parseInt(process.env.EMAIL_PORT, 10) || 465;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    console.warn(
      "[Mailer Warning] EMAIL_USER or EMAIL_PASS not configured in environment. Emails cannot be delivered."
    );
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // SSL for 465, STARTTLS for 587
    auth: { user, pass },
    pool: true, // Use connection pooling
    maxConnections: 3, // Conservative connection limit for Hostinger
    maxMessages: 50, // Rotate connection after 50 messages
    rateLimit: 5, // Maximum 5 messages per second
    connectionTimeout: 10000, // 10s connection timeout
    greetingTimeout: 10000, // 10s greeting timeout
    socketTimeout: 15000, // 15s socket timeout
    tls: {
      rejectUnauthorized: true, // Enforce valid SSL/TLS certificates
      minVersion: "TLSv1.2",
    },
  });

  return cachedTransporter;
}

/**
 * Unified dispatch function supporting Resend, SendGrid, and Hostinger SMTP.
 */
export async function sendEmail({ from, to, subject, html, attachments, text }) {
  const startTime = Date.now();

  // 1. Resend HTTP API (if configured)
  if (process.env.RESEND_API_KEY) {
    let resendAttachments = [];
    if (attachments && attachments.length > 0) {
      resendAttachments = attachments.map((att) => ({
        filename: att.filename,
        content: Buffer.isBuffer(att.content) ? att.content.toString("base64") : att.content,
      }));
    }

    let sender = process.env.RESEND_FROM || from;
    if (!process.env.RESEND_FROM && !from.includes("@sanmora.in")) {
      const match = from.match(/^"([^"]+)"/);
      const namePrefix = match ? `"${match[1]}" ` : "";
      sender = `${namePrefix}<onboarding@resend.dev>`;
    }

    const recipients = Array.isArray(to)
      ? to
      : String(to)
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: sender,
        to: recipients,
        subject,
        html,
        text,
        attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || `Resend API returned status ${res.status}`);
    }
    return { success: true, messageId: data.id, provider: "resend", durationMs: Date.now() - startTime };
  }

  // 2. SendGrid HTTP API (if configured)
  if (process.env.SENDGRID_API_KEY) {
    let sendgridAttachments = [];
    if (attachments && attachments.length > 0) {
      sendgridAttachments = attachments.map((att) => ({
        content: Buffer.isBuffer(att.content) ? att.content.toString("base64") : att.content,
        filename: att.filename,
        type: att.contentType || "application/octet-stream",
        disposition: "attachment",
      }));
    }

    let senderEmail = from;
    if (from.includes("<")) {
      const match = from.match(/<([^>]+)>/);
      if (match) senderEmail = match[1].trim();
    }

    const recipients = Array.isArray(to)
      ? to
      : String(to)
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean);

    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: recipients.map((email) => ({ email })) }],
        from: { email: senderEmail },
        subject,
        content: [{ type: "text/html", value: html }],
        attachments: sendgridAttachments.length > 0 ? sendgridAttachments : undefined,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`SendGrid API returned status ${res.status}: ${errText}`);
    }
    return { success: true, provider: "sendgrid", durationMs: Date.now() - startTime };
  }

  // 3. Fallback to Hostinger Nodemailer SMTP
  const transporter = getSmtpTransporter();
  if (!transporter) {
    console.warn("[Mailer] SMTP credentials missing. Email simulated (bypassed).");
    return { success: true, bypassed: true, provider: "smtp-mock", durationMs: Date.now() - startTime };
  }

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    html,
    text,
    attachments,
  });

  return {
    success: true,
    messageId: info.messageId,
    provider: "smtp",
    durationMs: Date.now() - startTime,
  };
}

