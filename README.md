# 📮 Godjo Mail

Своя бесплатная почта на собственном домене + приём SMS, в одном веб-интерфейсе.
Работает на бесплатном тарифе **Cloudflare** (Email Routing + Workers + D1). Сервер не нужен.

```
письмо на you@ваш-домен ──► Cloudflare Email Routing ──► Worker ──► D1 ──► веб-интерфейс
SMS на ваш телефон ──► Android-приложение SMS Forwarder ──► POST /api/sms ──► D1 ──► веб-интерфейс
```

## Что умеет
- Принимает письма на **любой** адрес вашего домена (catch-all): `gmail@…`, `reg@…`, `shop@…` и т. д.
- Подходит для регистрации и кодов подтверждения от Gmail, Mail.ru, VK, Telegram, магазинов и других сайтов.
- Показывает SMS, пересланные с вашего Android-телефона.
- Веб-интерфейс с паролем: вкладки «Все / Почта / SMS», просмотр HTML-писем, удаление.
- JSON API: `GET /api/messages`.

## ⚠️ Что честно нужно знать
| | |
|---|---|
| **Домен** | Нужен свой домен. Cloudflare бесплатный, домен — нет (обычно от ~$1–10 в год, `.xyz`/`.site` бывают совсем дешёвыми). |
| **SMS** | Принять SMS «из воздуха» бесплатно невозможно: нужен реальный номер. Godjo Mail показывает SMS, которые приходят на **ваш** телефон с SIM-картой. |
| **Отправка** | Это почта только для приёма. Отвечать удобно через Gmail «Отправлять как» или через бесплатный SMTP-сервис (Brevo, Resend). |

## Установка (≈15 минут)
1. Добавьте домен в [Cloudflare](https://dash.cloudflare.com) (тариф Free) и смените NS-серверы у регистратора.
2. Установите [Node.js](https://nodejs.org), затем:
   ```bash
   git clone https://github.com/denismaslov769-lab/godjo-mail
   cd godjo-mail
   npm install
   npx wrangler login
   npx wrangler d1 create godjo-mail      # скопируйте database_id в wrangler.toml
   npm run db:init
   npx wrangler secret put ADMIN_PASSWORD # пароль для входа в веб-интерфейс
   npx wrangler secret put SMS_TOKEN      # любой длинный случайный токен
   npm run deploy
   ```
3. Cloudflare → ваш домен → **Email → Email Routing** → включите → **Routing rules → Catch-all address** → действие **Send to a Worker** → `godjo-mail`.
4. Откройте `https://godjo-mail.<ваш-аккаунт>.workers.dev` (логин `admin` и ваш пароль). Можно привязать свой поддомен, например `mail.ваш-домен`.

## Приём SMS
1. Поставьте на Android-телефон с SIM-картой бесплатное приложение для пересылки SMS на вебхук, например **SMS Forwarder** (с открытым кодом, есть на GitHub/F-Droid).
2. Добавьте правило: Webhook / POST на адрес
   ```
   https://godjo-mail.<ваш-аккаунт>.workers.dev/api/sms?token=ВАШ_SMS_TOKEN
   ```
   Тело запроса — JSON: `{"from": "[from]", "text": "[text]"}` (подставьте переменные приложения). Поддерживаются поля `from/sender/phone` и `text/message/body/msg`, в виде JSON или формы.
3. Проверка:
   ```bash
   curl -X POST "https://godjo-mail.<…>.workers.dev/api/sms?token=ВАШ_SMS_TOKEN" \
     -H "Content-Type: application/json" -d '{"from":"Google","text":"G-123456 — ваш код"}'
   ```

## Лимиты бесплатного тарифа
Workers — 100 000 запросов в день; D1 — 5 ГБ и 5 млн чтений в день. Для личной почты этого с запасом.

## Лицензия
MIT
