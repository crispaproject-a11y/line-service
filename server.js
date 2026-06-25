require('dotenv').config();
const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk').default;
const db = require('./db');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic()
  : null;

const SYSTEM_PROMPT = `Ти — AI-консультант сантехнічного сервісу "Line Service" у Києві та Одесі.

Відповідай ВИКЛЮЧНО українською мовою. Будь доброзичливим та лаконічним — 2–4 речення.

Орієнтовні ціни:
- Виклик майстра / діагностика: від 300 грн
- Усунення засору: 500–1200 грн
- Ремонт або заміна крана / змішувача: 400–1500 грн
- Усунення протікання: 500–1200 грн
- Встановлення унітазу або пральної машини: 600–1500 грн

Виїзд: 30–60 хвилин у межах міста. Працюємо цілодобово 24/7.
Після відповіді одним коротким реченням запропонуй залишити контакт для виклику майстра.`;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID;

async function notifyTelegram(lead) {
  if (!TG_TOKEN || !TG_CHAT) return;
  const urgencyEmoji = {
    '🚨 Терміново — зараз': '🚨',
    '🕐 Сьогодні': '🕐',
    '📅 Можна завтра': '📅',
  }[lead.urgency] ?? '📋';
  const text = [
    `🔧 *Нова заявка — Line Service* #${lead.id}`,
    '',
    `📍 *Місто:* ${lead.city}`,
    `🏘 *Район:* ${lead.district}`,
    `🚿 *Проблема:* ${lead.problem}`,
    `${urgencyEmoji} *Терміновість:* ${lead.urgency}`,
    `👤 *Ім'я:* ${lead.name}`,
    `📞 *Телефон:* ${lead.phone}`,
  ].join('\n');

  const res = await fetch(
    `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'Markdown' }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${err}`);
  }
}

app.post('/api/chat', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });
    res.json({ content: response.content[0].text });
  } catch (err) {
    console.error('[claude]', err.message);
    res.status(502).json({ error: 'AI unavailable' });
  }
});

app.post('/api/lead', async (req, res) => {
  const { problem, urgency, district, name, phone, city } = req.body ?? {};
  if (!name?.trim() || !phone?.trim()) {
    return res.status(400).json({ ok: false, error: 'name and phone are required' });
  }

  const lead = db.saveLead({ problem, urgency, district, name, phone, city });

  notifyTelegram(lead).catch(err =>
    console.error('[telegram]', err.message)
  );

  res.json({ ok: true, id: lead.id });
});

app.get('/api/leads', (req, res) => {
  if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json(db.getLeads());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Line Service → http://localhost:${PORT}`));
