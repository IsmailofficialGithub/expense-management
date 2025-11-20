// Supabase Edge Function to send invitation emails using external email API
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// External email API endpoint
const EMAIL_API_URL = "https://send-email-nu-five.vercel.app/api/send-email";

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
}

// Send email via external API
async function sendEmailViaAPI(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  try {
    console.log('Sending email via external API:', { to, subject });
    
    const response = await fetch(EMAIL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Email API error response:', errorText);
      throw new Error(`Email API returned status ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('Email sent successfully via API:', result);
  } catch (error) {
    console.error("Email API error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to send email via API: ${errorMessage}`);
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
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          } 
        }
      );
    }

    // Send email via external API with timeout
    const emailTimeout = 30000; // 30 seconds total
    await Promise.race([
      sendEmailViaAPI(to, subject, html),
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
