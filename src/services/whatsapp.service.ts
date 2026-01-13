import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * WhatsApp API base URL
 * Set this to your deployed WhatsApp service URL
 * Default: http://localhost:3001 (for local development)
 */
const WHATSAPP_API_URL =
  Constants.expoConfig?.extra?.WHATSAPP_API_URL ||
  process.env.EXPO_PUBLIC_WHATSAPP_API_URL ||
  'http://109.123.251.103:30010';

console.log('[WhatsApp Service] Initialized with API URL:', WHATSAPP_API_URL);

/**
 * Convert HTML content to plain text for WhatsApp
 * Removes HTML tags and converts to readable text
 */
function htmlToPlainText(html: string): string {
  if (!html) return '';

  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, '');

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Format phone number to WhatsApp format (E.164)
 * Supports flexible input formats
 */
function formatPhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;

  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');

  // If it doesn't start with +, try to add country code
  if (!cleaned.startsWith('+')) {
    // If it's 11 digits and starts with 1, assume US number
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = '+' + cleaned;
    } else if (cleaned.length === 10) {
      // Assume US number, add +1
      cleaned = '+1' + cleaned;
    } else {
      // Try to add + if it looks like it might have country code
      cleaned = '+' + cleaned;
    }
  }

  return cleaned;
}

/**
 * Send WhatsApp message via backend API
 * @param phone - Phone number (will be formatted)
 * @param message - Message text (HTML will be converted to plain text)
 * @returns Promise<boolean> - true if sent successfully, false otherwise
 */
export async function sendWhatsAppMessage(
  phone: string | null | undefined,
  message: string
): Promise<boolean> {
  console.log('[WhatsApp Service] sendWhatsAppMessage called', {
    phone,
    messageLength: message?.length,
    platform: Platform.OS,
  });

  // Note: WhatsApp can work on web since it's just an API call to backend service
  // Unlike email which has CORS issues, WhatsApp backend handles the actual sending

  // Validate phone number
  const formattedPhone = formatPhoneNumber(phone);
  console.log('[WhatsApp Service] Phone formatting', {
    original: phone,
    formatted: formattedPhone,
  });

  if (!formattedPhone) {
    console.log('[WhatsApp Service] Skipped: No valid phone number');
    return false;
  }

  // Convert HTML to plain text if needed
  const plainTextMessage = htmlToPlainText(message);
  console.log('[WhatsApp Service] Message conversion', {
    originalLength: message?.length,
    plainTextLength: plainTextMessage?.length,
    plainTextPreview: plainTextMessage?.substring(0, 100),
  });

  if (!plainTextMessage || plainTextMessage.trim().length === 0) {
    console.log('[WhatsApp Service] Skipped: Empty message after conversion');
    return false;
  }

  const apiUrl = `${WHATSAPP_API_URL}/api/send-message`;
  console.log('[WhatsApp Service] Sending request', {
    url: apiUrl,
    phone: formattedPhone,
    messageLength: plainTextMessage.length,
  });

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: formattedPhone,
        message: plainTextMessage,
      }),
    });

    console.log('[WhatsApp Service] Response received', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[WhatsApp Service] API error:', {
        status: response.status,
        error: errorText,
      });
      return false;
    }

    const result = await response.json();
    console.log('[WhatsApp Service] Response data:', result);

    if (result.success) {
      console.log('[WhatsApp Service] ✅ Message sent successfully to:', formattedPhone);
      return true;
    } else {
      console.error('[WhatsApp Service] ❌ API returned error:', result.error);
      return false;
    }
  } catch (error: any) {
    // Log error but don't throw - WhatsApp is optional
    console.error('[WhatsApp Service] ❌ Exception occurred:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return false;
  }
}

/**
 * Send WhatsApp message with HTML content (converts to plain text)
 * This is a convenience function that handles HTML conversion
 */
export async function sendWhatsAppMessageFromHtml(
  phone: string | null | undefined,
  htmlContent: string,
  fallbackText?: string
): Promise<boolean> {
  console.log('[WhatsApp Service] sendWhatsAppMessageFromHtml called', {
    phone,
    htmlLength: htmlContent?.length,
    hasFallback: !!fallbackText,
  });

  const plainText = htmlToPlainText(htmlContent) || fallbackText || '';
  console.log('[WhatsApp Service] Converted HTML to text', {
    plainTextLength: plainText.length,
    usingFallback: !htmlToPlainText(htmlContent) && !!fallbackText,
  });

  return sendWhatsAppMessage(phone, plainText);
}

/**
 * Check if WhatsApp service is available
 */
export async function checkWhatsAppService(): Promise<boolean> {
  try {
    const response = await fetch(`${WHATSAPP_API_URL}/api/health`, {
      method: 'GET',
    });

    if (!response.ok) {
      return false;
    }

    const result = await response.json();
    return result.whatsapp_connected === true;
  } catch (error) {
    console.error('WhatsApp service health check failed:', error);
    return false;
  }
}

export const whatsappService = {
  sendMessage: sendWhatsAppMessage,
  sendMessageFromHtml: sendWhatsAppMessageFromHtml,
  checkService: checkWhatsAppService,
  formatPhoneNumber,
};
