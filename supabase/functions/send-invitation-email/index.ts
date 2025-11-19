// Supabase Edge Function to send invitation emails using SMTP
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// SMTP configuration from environment variables
const SMTP_HOST = Deno.env.get("SMTP_HOST");
const SMTP_PORT = parseInt(Deno.env.get("SMTP_PORT") || "587");
const SMTP_USER = Deno.env.get("SMTP_USER");
const SMTP_PASSWORD = Deno.env.get("SMTP_PASSWORD");
// Support both SMTP_FROM_EMAIL and SMTP_FROM for backward compatibility
const SMTP_FROM_EMAIL = Deno.env.get("SMTP_FROM_EMAIL") || Deno.env.get("SMTP_FROM");
const SMTP_FROM_NAME = Deno.env.get("SMTP_FROM_NAME") || "Flatmates Expense Tracker";

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
}

// Helper function to read SMTP response with timeout
async function readSMTPResponse(conn: Deno.TlsConn | Deno.TcpConn, decoder: TextDecoder, timeoutMs: number = 10000): Promise<string> {
  const buffer = new Uint8Array(4096);
  
  // Create a promise that resolves when data is read
  const readPromise = conn.read(buffer);
  
  // Create a timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`SMTP read timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  
  // Race between read and timeout
  const n = await Promise.race([readPromise, timeoutPromise]);
  
  if (n === null || n === 0) return "";
  const response = decoder.decode(buffer.subarray(0, n));
  return response.trim();
}

// Helper function to write SMTP command
async function writeSMTPCommand(conn: Deno.TlsConn | Deno.TcpConn, encoder: TextEncoder, command: string): Promise<void> {
  const data = encoder.encode(command + "\r\n");
  let totalWritten = 0;
  while (totalWritten < data.length) {
    const written = await conn.write(data.subarray(totalWritten));
    if (written === null) throw new Error("Failed to write to connection");
    totalWritten += written;
  }
}

// SMTP email sending function using native Deno TLS
async function sendEmailViaSMTP(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM_EMAIL) {
    throw new Error("SMTP configuration is missing. Please set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM_EMAIL.");
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let conn: Deno.TlsConn | Deno.TcpConn | null = null;

  try {
    // Connect to SMTP server with timeout
    const connectTimeout = 15000; // 15 seconds
    const connectPromise = SMTP_PORT === 465
      ? Deno.connectTls({
          hostname: SMTP_HOST,
          port: 465,
        })
      : Deno.connect({
          hostname: SMTP_HOST,
          port: SMTP_PORT,
        });
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`SMTP connection timeout after ${connectTimeout}ms`)), connectTimeout);
    });
    
    conn = await Promise.race([connectPromise, timeoutPromise]);
    
    if (SMTP_PORT === 465) {
      // SSL connection (port 465) - direct TLS
      
      // Read greeting
      const greeting = await readSMTPResponse(conn, decoder);
      console.log("SMTP greeting:", greeting);

      // Send EHLO
      await writeSMTPCommand(conn, encoder, `EHLO ${SMTP_HOST}`);
      await readSMTPResponse(conn, decoder);
    } else {
      // Port 587 - connection already established above

      // Read greeting
      const greeting = await readSMTPResponse(conn as Deno.TcpConn, decoder);
      console.log("SMTP greeting:", greeting);

      // Send EHLO
      await writeSMTPCommand(conn as Deno.TcpConn, encoder, `EHLO ${SMTP_HOST}`);
      const ehloResponse = await readSMTPResponse(conn as Deno.TcpConn, decoder);
      console.log("EHLO response:", ehloResponse);

      // Upgrade to TLS with STARTTLS
      await writeSMTPCommand(conn as Deno.TcpConn, encoder, "STARTTLS");
      const starttlsResponse = await readSMTPResponse(conn as Deno.TcpConn, decoder);
      console.log("STARTTLS response:", starttlsResponse);

      if (!starttlsResponse.includes("220")) {
        throw new Error(`STARTTLS failed: ${starttlsResponse}`);
      }

      // Close plain connection and create TLS connection
      conn.close();
      conn = await Deno.connectTls({
        hostname: SMTP_HOST,
        port: 587,
      });

      // Re-send EHLO after TLS upgrade
      await writeSMTPCommand(conn, encoder, `EHLO ${SMTP_HOST}`);
      await readSMTPResponse(conn, decoder);
    }

    // Authenticate
    await writeSMTPCommand(conn, encoder, "AUTH LOGIN");
    await readSMTPResponse(conn, decoder);

    // Send username (base64)
    const usernameB64 = btoa(SMTP_USER);
    await writeSMTPCommand(conn, encoder, usernameB64);
    await readSMTPResponse(conn, decoder);

    // Send password (base64)
    const passwordB64 = btoa(SMTP_PASSWORD);
    await writeSMTPCommand(conn, encoder, passwordB64);
    const authResponse = await readSMTPResponse(conn, decoder);

    if (!authResponse.includes("235")) {
      throw new Error(`SMTP authentication failed: ${authResponse}`);
    }

    // Send MAIL FROM
    await writeSMTPCommand(conn, encoder, `MAIL FROM:<${SMTP_FROM_EMAIL}>`);
    await readSMTPResponse(conn, decoder);

    // Send RCPT TO
    await writeSMTPCommand(conn, encoder, `RCPT TO:<${to}>`);
    await readSMTPResponse(conn, decoder);

    // Send DATA
    await writeSMTPCommand(conn, encoder, "DATA");
    const dataReady = await readSMTPResponse(conn, decoder);
    if (!dataReady.includes("354")) {
      throw new Error(`DATA command failed: ${dataReady}`);
    }

    // Send email content (headers and body)
    const emailHeaders = `From: ${SMTP_FROM_NAME} <${SMTP_FROM_EMAIL}>\r\n` +
      `To: ${to}\r\n` +
      `Subject: ${subject}\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/html; charset=UTF-8\r\n` +
      `\r\n`;
    
    // Send headers
    const headersData = encoder.encode(emailHeaders);
    let written = 0;
    while (written < headersData.length) {
      const n = await conn.write(headersData.subarray(written));
      if (n === null) throw new Error("Failed to write email headers");
      written += n;
    }

    // Send HTML body (handle dot-stuffing: lines starting with . need to be ..)
    const htmlLines = html.split('\n');
    for (const line of htmlLines) {
      const lineToSend = line.startsWith('.') ? '.' + line : line;
      const lineData = encoder.encode(lineToSend + '\r\n');
      written = 0;
      while (written < lineData.length) {
        const n = await conn.write(lineData.subarray(written));
        if (n === null) throw new Error("Failed to write email body");
        written += n;
      }
    }

    // End DATA with single dot on its own line
    await writeSMTPCommand(conn, encoder, ".");
    const dataResponse = await readSMTPResponse(conn, decoder);

    if (!dataResponse.includes("250")) {
      throw new Error(`Failed to send email: ${dataResponse}`);
    }

    // Quit
    await writeSMTPCommand(conn, encoder, "QUIT");
    await readSMTPResponse(conn, decoder);

    if (conn) {
      conn.close();
    }
    console.log("Email sent successfully via SMTP");
  } catch (error) {
    if (conn) {
      try {
        conn.close();
      } catch (e) {
        // Ignore close errors
        console.error("Error closing connection:", e);
      }
    }
    console.error("SMTP error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`SMTP error: ${errorMessage}`);
  }
}

serve(async (req: Request) => {
  try {
    // Handle CORS
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        },
      });
    }

    const { to, subject, html } = await req.json() as EmailRequest;

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, html" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate SMTP configuration
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM_EMAIL) {
      const missing = [];
      if (!SMTP_HOST) missing.push('SMTP_HOST');
      if (!SMTP_USER) missing.push('SMTP_USER');
      if (!SMTP_PASSWORD) missing.push('SMTP_PASSWORD');
      if (!SMTP_FROM_EMAIL) missing.push('SMTP_FROM_EMAIL');
      
      console.error('Missing SMTP configuration:', missing);
      return new Response(
        JSON.stringify({ 
          error: `SMTP not configured. Missing: ${missing.join(', ')}. Please set these in Supabase secrets.`,
          missing: missing
        }),
        { 
          status: 500, 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          } 
        }
      );
    }

    console.log('SMTP Configuration check:', {
      host: SMTP_HOST,
      port: SMTP_PORT,
      user: SMTP_USER ? '***set***' : 'missing',
      password: SMTP_PASSWORD ? '***set***' : 'missing',
      from: SMTP_FROM_EMAIL
    });

    // Send email via SMTP with overall timeout
    const emailTimeout = 30000; // 30 seconds total
    await Promise.race([
      sendEmailViaSMTP(to, subject, html),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Email sending timeout after 30 seconds")), emailTimeout);
      })
    ]);

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      { 
        status: 200, 
        headers: { 
          "Content-Type": "application/json", 
          "Access-Control-Allow-Origin": "*" 
        } 
      }
    );

  } catch (error: any) {
    console.error("Error sending email:", error);
    const errorMessage = error?.message || error?.toString() || "Failed to send email";
    console.error("Error details:", JSON.stringify(error, null, 2));
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: error?.stack || "No additional details available"
      }),
      { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        } 
      }
    );
  }
});
