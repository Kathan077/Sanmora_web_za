import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

async function sendConsultationEmail({ from, to, subject, html }) {
  // 1. If RESEND_API_KEY is configured, send via Resend HTTP API
  if (process.env.RESEND_API_KEY) {
    console.log("[Mailer] Sending consultation email via Resend HTTP API...");
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
        html
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
    console.log("[Mailer] Sending consultation email via SendGrid HTTP API...");
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
        content: [{ type: "text/html", value: html }]
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

  return await transporter.sendMail({ from, to, subject, html });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { fullName, companyName, emailId, contactNo, serviceName } = body;

    if (!fullName || !emailId || !contactNo || !serviceName) {
      return NextResponse.json(
        { error: "Missing required fields: fullName, emailId, contactNo, and serviceName are required." },
        { status: 400 }
      );
    }

    // Validate email syntax first
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(emailId)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const parts = emailId.split("@");
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

    const user = process.env.EMAIL_USER || "info@sanmora.in";
    const receiver = process.env.EMAIL_RECEIVER || "info@sanmora.in";

    const mailOptions = {
      from: `"Sanmora Consultation" <${user}>`,
      to: receiver,
      subject: `New Free Consultation Request - ${serviceName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #7c3aed; border-bottom: 2px solid #7c3aed; padding-bottom: 10px;">Free Consultation Request</h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563; width: 180px;">Service of Interest:</td>
              <td style="padding: 8px 0; color: #1f2937;">${serviceName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Full Name:</td>
              <td style="padding: 8px 0; color: #1f2937;">${fullName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Company Name:</td>
              <td style="padding: 8px 0; color: #1f2937;">${companyName || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Email Address:</td>
              <td style="padding: 8px 0; color: #1f2937;"><a href="mailto:${emailId}">${emailId}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Contact Number:</td>
              <td style="padding: 8px 0; color: #1f2937;">${contactNo}</td>
            </tr>
          </table>
          <div style="margin-top: 30px; padding: 12px; background-color: #f3e8ff; color: #6b21a8; border-radius: 6px; font-size: 14px; text-align: center;">
            This inquiry was sent from the Sanmora Web Free Consultation Form.
          </div>
        </div>
      `
    };

    await sendConsultationEmail(mailOptions);
    console.log(`[Success] Consultation email sent successfully to ${receiver} for service: ${serviceName}`);
    return NextResponse.json({ success: true, message: "Consultation request email submitted successfully!" });
  } catch (error) {
    console.error("[Error] Failed to send consultation email:", error);
    return NextResponse.json(
      { error: "Failed to send consultation email: " + error.message },
      { status: 500 }
    );
  }
}
