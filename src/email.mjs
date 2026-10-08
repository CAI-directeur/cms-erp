// SPDX-License-Identifier: GPL-3.0-or-later

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function createResendEmailSender({ apiKey, from, origin, fetchImpl = fetch } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || typeof from !== 'string' || !from.trim() ||
      apiKey.length > 4096 || from.length > 254 || /[\r\n]/u.test(from) || typeof origin !== 'string') {
    throw new Error('Email delivery requires a Resend API key, sender, and exact site origin.');
  }
  const expectedOrigin = new URL(origin);
  if (expectedOrigin.origin !== origin || (expectedOrigin.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(expectedOrigin.hostname))) {
    throw new Error('Email delivery requires an exact HTTPS site origin.');
  }
  const senderAddress = /<([^<>]+)>/u.exec(from)?.[1] ?? from;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(senderAddress)) throw new Error('Email delivery requires a sender email address.');

  return async function sendPasswordReset({ to, url }) {
    if (typeof to !== 'string' || to.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(to) || typeof url !== 'string') throw new Error('INVALID_EMAIL_MESSAGE');
    const link = new URL(url);
    if (link.origin !== expectedOrigin.origin || link.pathname !== '/password-reset' ||
        !/^#token=[A-Za-z0-9_-]{43}$/u.test(link.hash)) {
      throw new Error('INVALID_PASSWORD_RESET_URL');
    }
    const safeUrl = escapeHtml(link.href);
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: 'Wachtwoord herstellen voor CMS/ERP',
        text: `Gebruik deze link om je wachtwoord opnieuw in te stellen. De link verloopt na 30 minuten.\n\n${link.href}\n\nHeb je dit niet aangevraagd? Negeer deze e-mail.`,
        html: `<p>Je hebt gevraagd om je CMS/ERP-wachtwoord opnieuw in te stellen.</p><p><a href="${safeUrl}">Stel mijn wachtwoord in</a></p><p>De link verloopt na 30 minuten. Heb je dit niet aangevraagd? Negeer deze e-mail.</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('EMAIL_PROVIDER_REJECTED');
  };
}
