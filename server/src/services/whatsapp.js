import { config, whatsappConfigured } from '../config.js';

// Russian etiquette: address by first name + patronymic. "Иванова Анна Сергеевна" -> "Анна Сергеевна".
// Names without a patronymic (two words or fewer) are used as given.
export function greetingName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  return parts.length >= 3 ? parts.slice(1).join(' ') : parts.join(' ');
}

export function messageText({ doctorName, title, url }) {
  return `Здравствуйте, ${greetingName(doctorName)}! Направляю вам материал «${title}»: ${url}`;
}

// Click-to-chat link: opens WhatsApp on the rep's phone with the message pre-filled.
export function waMeUrl(phone, text) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/**
 * Sends the approved template via the WhatsApp Cloud API.
 * Template body must have 3 variables: {{1}} doctor name, {{2}} presentation title, {{3}} link.
 * Without credentials it runs in dry-run mode and returns a wa.me link instead.
 */
export async function sendPresentationLink({ phone, doctorName, title, url }) {
  const text = messageText({ doctorName, title, url });
  if (!whatsappConfigured()) {
    return { status: 'dry_run', waMeUrl: waMeUrl(phone, text) };
  }
  const { token, phoneNumberId, apiVersion, templateName, templateLang } = config.whatsapp;
  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: greetingName(doctorName) },
              { type: 'text', text: title },
              { type: 'text', text: url },
            ],
          }],
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: 'failed', error: data?.error?.message || `WhatsApp API error ${res.status}` };
    }
    return { status: 'sent', providerMessageId: data?.messages?.[0]?.id || null };
  } catch (err) {
    return { status: 'failed', error: err.name === 'TimeoutError' ? 'WhatsApp API timed out' : err.message };
  }
}
