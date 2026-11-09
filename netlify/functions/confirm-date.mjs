// Secure server-side Telegram notification for the Vintage Romance website.
// Configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Netlify site environment variables.
export default async (request) => {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, error: 'Method not allowed.' }, { status: 405 });
  }

  // Only accept requests originating from this deployed site.
  const origin = request.headers.get('origin');
  const requestOrigin = new URL(request.url).origin;
  if (origin && origin !== requestOrigin) {
    return Response.json({ ok: false, error: 'Request origin not allowed.' }, { status: 403 });
  }

  const length = Number(request.headers.get('content-length') || 0);
  if (length > 4000) {
    return Response.json({ ok: false, error: 'Request too large.' }, { status: 413 });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  const name = typeof data.name === 'string' ? data.name.trim().slice(0, 40) : '';
  const date = typeof data.date === 'string' ? data.date : '';
  const dateLabel = typeof data.dateLabel === 'string' ? data.dateLabel.trim().slice(0, 80) : '';
  const time = typeof data.time === 'string' ? data.time.trim().slice(0, 20) : '';
  const dateChoice = typeof data.dateChoice === 'string' ? data.dateChoice.trim().slice(0, 50) : 'Dinner Date';

  if (name !== 'Yuliyana' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !dateLabel || !/^\d{1,2}:\d{2} (AM|PM)$/.test(time)) {
    return Response.json({ ok: false, error: 'Please check the selected date and time.' }, { status: 400 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error('Missing Telegram environment variables.');
    return Response.json({ ok: false, error: 'Notification service is not configured yet.' }, { status: 503 });
  }

  const message = [
    '💌 NEW DATE CONFIRMATION',
    '',
    `Name: ${name}`,
    `Date: ${dateLabel} (${date})`,
    `Time: ${time}`,
    `Plan: ${dateChoice}`,
    '',
    'Status: Confirmed ❤️',
  ].join('\n');

  try {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
    });
    const telegramResult = await telegramResponse.json();
    if (!telegramResponse.ok || !telegramResult.ok) {
      console.error('Telegram API rejected the notification:', telegramResult.description || telegramResponse.status);
      return Response.json({ ok: false, error: 'Telegram could not deliver the notification.' }, { status: 502 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Telegram delivery error:', error);
    return Response.json({ ok: false, error: 'Notification delivery failed.' }, { status: 502 });
  }
};
