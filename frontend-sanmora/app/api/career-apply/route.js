import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

async function sendCareerEmail({ from, to, subject, html, attachments }) {
  // 1. If RESEND_API_KEY is configured, send via Resend HTTP API
  if (process.env.RESEND_API_KEY) {
    console.log("[Mailer] Sending career email via Resend HTTP API...");
    let resendAttachments = [];
    if (attachments && attachments.length > 0) {
      resendAttachments = attachments.map(att => ({
        filename: att.filename,
        content: att.content.toString("base64")
      }));
    }
    let sender = process.env.RESEND_FROM;
    if (!sender) {
      const match = from.match(/^"([^"]+)"/);
      const namePrefix = match ? `"${match[1]}" ` : "";
      sender = `${namePrefix}<onboarding@resend.dev>`;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: sender,
        to: typeof to === "string" ? [to] : to,
        subject,
        html,
        attachments: resendAttachments.length > 0 ? resendAttachments : undefined
      })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || `Resend API returned status ${res.status}`);
    }
    return data;
  }

  // 2. If SENDGRID_API_KEY is configured, send via SendGrid HTTP API
  if (process.env.SENDGRID_API_KEY) {
    console.log("[Mailer] Sending career email via SendGrid HTTP API...");
    let sendgridAttachments = [];
    if (attachments && attachments.length > 0) {
      sendgridAttachments = attachments.map(att => ({
        content: att.content.toString("base64"),
        filename: att.filename,
        type: att.contentType || "application/octet-stream",
        disposition: "attachment"
      }));
    }
    let senderEmail = from;
    if (from.includes("<")) {
      const match = from.match(/<([^>]+)>/);
      if (match) senderEmail = match[1].trim();
    }
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`
      },
      body: JSON.stringify({
        personalizations: [{ to: (typeof to === "string" ? [to] : to).map(e => ({ email: e })) }],
        from: { email: senderEmail },
        subject,
        content: [{ type: "text/html", value: html }],
        attachments: sendgridAttachments.length > 0 ? sendgridAttachments : undefined
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`SendGrid API returned status ${res.status}: ${errText}`);
    }
    return { success: true };
  }

  // 3. Fallback to Nodemailer SMTP
  const host = process.env.EMAIL_HOST || "smtp.hostinger.com";
  const port = parseInt(process.env.EMAIL_PORT) || 465;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    console.warn("[Mailer Warning] EMAIL_USER or EMAIL_PASS not configured in environment. Skipping email delivery.");
    return { success: true, bypassed: true };
  }

  const transporter = nodemailer.createTransport({
    host: host,
    port: port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });

  return await transporter.sendMail({ from, to, subject, html, attachments });
}

export async function POST(request) {
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

    if (!name || !email || !whatsapp || !message || !resumeFile) {
      return NextResponse.json(
        { error: "Missing required fields (name, email, whatsapp, message, and resume are required)." },
        { status: 400 }
      );
    }

    // Validate email syntax first
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const parts = email.split("@");
    const username = parts[0].toLowerCase();
    const domain = parts[1].toLowerCase();

    // 1. Check fake or placeholder email addresses
    const fakePrefixes = ["abc", "xyz", "qwe", "asd", "zxc", "jkl", "qwerty", "test", "testing", "dummy", "example", "fake", "demo", "noreply", "no-reply", "null", "none", "temp"];
    const prefixPattern = new RegExp(`^(${fakePrefixes.join("|")})[._-]?\\d*$`);
    const forbiddenSubstrings = ["testing", "fakeemail", "exampleemail", "dummyemail"];

    if (
      prefixPattern.test(username) || 
      forbiddenSubstrings.some(sub => username.includes(sub)) || 
      /^(.)\1{2,}$/.test(username) || 
      /^\d+$/.test(username)
    ) {
      return NextResponse.json(
        { error: "Please enter a genuine, professional email address. Fake or placeholder emails are not allowed." },
        { status: 400 }
      );
    }
    
    // 2. Check disposable email domain list
    const DISPOSABLE_DOMAINS = new Set([
      "mailinator.com", "tempmail.com", "temp-mail.org", "10minutemail.com",
      "yopmail.com", "guerrillamail.com", "dispostable.com", "getairmail.com",
      "maildrop.cc", "trashmail.com", "mailnesia.com", "temp-mail.io", "fakemailgenerator.com",
      "generator.email", "disposable.com", "tempmailaddress.com", "throwawaymail.com"
    ]);
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return NextResponse.json(
        { error: "Temporary or disposable email addresses are not allowed. Please use a genuine email address." },
        { status: 400 }
      );
    }

    // 3. DNS MX Record check (with safe catch for serverless environments)
    try {
      const dns = require("dns").promises;
      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        const aRecords = await dns.resolve4(domain);
        if (!aRecords || aRecords.length === 0) {
          return NextResponse.json(
            { error: "The email domain is invalid or does not have active mail servers." },
            { status: 400 }
          );
        }
      }
    } catch (dnsErr) {
      console.warn(`[DNS warning] MX resolution failed for domain: ${domain}`, dnsErr?.message || dnsErr);
    }

    // Convert the File object to a Buffer
    const arrayBuffer = await resumeFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const user = process.env.EMAIL_USER || "info@sanmora.in";
    const receiver = process.env.EMAIL_RECEIVER || "info@sanmora.in";

    const mailOptions = {
      from: `"Sanmora Careers" <${user}>`,
      to: receiver,
      subject: `New Job Application: ${jobTitle || "Job Seeker"} - ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #06b6d4; border-bottom: 2px solid #06b6d4; padding-bottom: 10px;">Job Application Received</h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563; width: 180px;">Job Role Applied:</td>
              <td style="padding: 8px 0; color: #1f2937;"><strong>${jobTitle || "Job ID: " + jobId}</strong></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Applicant Name:</td>
              <td style="padding: 8px 0; color: #1f2937;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Email Address:</td>
              <td style="padding: 8px 0; color: #1f2937;"><a href="mailto:${email}">${email}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">WhatsApp Number:</td>
              <td style="padding: 8px 0; color: #1f2937;">${whatsapp}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Portfolio / GitHub:</td>
              <td style="padding: 8px 0; color: #1f2937;">
                ${portfolio ? `<a href="${portfolio}" target="_blank">${portfolio}</a>` : "N/A"}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563; vertical-align: top;">Cover Letter / Message:</td>
              <td style="padding: 8px 0; color: #1f2937; white-space: pre-line;">${message}</td>
            </tr>
          </table>
          <p style="margin-top: 20px; font-size: 13px; color: #64748b;">
            <em>Note: The applicant's resume is attached to this email.</em>
          </p>
          <div style="margin-top: 30px; padding: 12px; background-color: #ecfeff; color: #0891b2; border-radius: 6px; font-size: 14px; text-align: center;">
            This job application was submitted from the Sanmora Careers Portal.
          </div>
        </div>
      `,
      attachments: [
        {
          filename: resumeFile.name,
          content: buffer
        }
      ]
    };

    await sendCareerEmail(mailOptions);
    console.log(`[Success] Career email with attachment sent successfully to ${receiver} for: ${name}`);
    return NextResponse.json({ success: true, message: "Application submitted and email sent successfully!" });
  } catch (error) {
    console.error("[Error] Failed to send career email:", error);
    return NextResponse.json(
      { error: "Failed to send career email: " + error.message },
      { status: 500 }
    );
  }
}
