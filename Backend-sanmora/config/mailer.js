const nodemailer = require("nodemailer");
const dns = require("dns");
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

let cachedTransporter = null;

/**
 * Custom wrapper that mimics Nodemailer's transporter object but sends via HTTPS API
 * for Resend or SendGrid to bypass SMTP port blocking on environments like Render Free Tier.
 */
const sendViaResend = async (mailOptions) => {
  const { from, to, subject, html, attachments, text } = mailOptions;

  let resendAttachments = [];
  if (attachments && attachments.length > 0) {
    resendAttachments = attachments.map((att) => {
      let base64Content = "";
      if (Buffer.isBuffer(att.content)) {
        base64Content = att.content.toString("base64");
      } else if (typeof att.content === "string") {
        base64Content = Buffer.from(att.content).toString("base64");
      } else {
        base64Content = att.content;
      }
      return {
        filename: att.filename,
        content: base64Content,
      };
    });
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

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: sender,
      to: recipients,
      subject: subject,
      html: html,
      text: text,
      attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `Resend API returned status ${response.status}`);
  }
  return { success: true, messageId: data.id, provider: "resend" };
};

const sendViaSendGrid = async (mailOptions) => {
  const { from, to, subject, html, attachments, text } = mailOptions;

  let sendgridAttachments = [];
  if (attachments && attachments.length > 0) {
    sendgridAttachments = attachments.map((att) => {
      let base64Content = "";
      if (Buffer.isBuffer(att.content)) {
        base64Content = att.content.toString("base64");
      } else if (typeof att.content === "string") {
        base64Content = Buffer.from(att.content).toString("base64");
      } else {
        base64Content = att.content;
      }
      return {
        content: base64Content,
        filename: att.filename,
        type: att.contentType || "application/octet-stream",
        disposition: "attachment",
      };
    });
  }

  let senderEmail = from;
  if (from.includes("<")) {
    const match = from.match(/<([^>]+)>/);
    if (match) {
      senderEmail = match[1].trim();
    }
  }

  const recipients = Array.isArray(to)
    ? to
    : String(to)
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: recipients.map((email) => ({ email })),
        },
      ],
      from: {
        email: senderEmail,
      },
      subject: subject,
      content: [
        {
          type: "text/html",
          value: html,
        },
      ],
      attachments: sendgridAttachments.length > 0 ? sendgridAttachments : undefined,
    }),
  });

  if (!response.ok) {
    let errorText = "";
    try {
      const errData = await response.json();
      errorText = JSON.stringify(errData);
    } catch {
      errorText = await response.text();
    }
    throw new Error(`SendGrid API returned status ${response.status}: ${errorText}`);
  }
  return { success: true, provider: "sendgrid" };
};

const getTransporter = () => {
  // 1. If RESEND_API_KEY is configured, return the HTTP API wrapper
  if (process.env.RESEND_API_KEY) {
    return {
      sendMail: sendViaResend,
    };
  }

  // 2. If SENDGRID_API_KEY is configured, return the HTTP API wrapper
  if (process.env.SENDGRID_API_KEY) {
    return {
      sendMail: sendViaSendGrid,
    };
  }

  // 3. Fallback to standard Nodemailer Hostinger SMTP with pooling
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    console.warn(
      "[Mailer Warning] SMTP credentials (EMAIL_USER/EMAIL_PASS) are not configured. Emails will fail."
    );
  }

  const host = process.env.EMAIL_HOST || "smtp.hostinger.com";
  const port = parseInt(process.env.EMAIL_PORT, 10) || 465;
  const secure = port === 465 || process.env.EMAIL_SECURE === "true";

  cachedTransporter = nodemailer.createTransport({
    host: host,
    port: port,
    secure: secure,
    auth: {
      user: user,
      pass: pass,
    },
    pool: true, // Connection pooling to prevent rapid socket teardown
    maxConnections: 3,
    maxMessages: 50,
    rateLimit: 5,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    },
  });

  return cachedTransporter;
};

module.exports = {
  getTransporter,
};
