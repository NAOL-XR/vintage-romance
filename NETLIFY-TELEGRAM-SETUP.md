# Netlify + Telegram notification setup

The website now sends a Telegram notification only after the visitor confirms the selected date and time. The bot token is read only by a Netlify Function; it is not included in browser JavaScript.

## 1. Create your Telegram bot
1. Open Telegram and search for **@BotFather**.
2. Send `/newbot` and follow the instructions.
3. Copy the bot token. Keep it private. Do not paste it into `script.js`, `index.html`, GitHub, or this project.
4. Open your new bot chat and press **Start** (or send `/start`).

## 2. Get your Telegram chat ID
1. In a browser, while signed in to Telegram, open `https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates` after sending `/start` to your bot.
2. Find `message` → `chat` → `id` in the JSON response.
3. Keep the chat ID private too. If `result` is empty, send `/start` again and refresh.

Replace `YOUR_BOT_TOKEN` in that URL locally with your real token. Do not share the URL or a screenshot containing the token.

## 3. Deploy to Netlify
1. Push this complete project folder to a GitHub repository.
2. Sign in at https://app.netlify.com/ and choose **Add new project → Import an existing project**.
3. Connect GitHub and select the repository.
4. For this plain HTML/CSS/JS project, leave the build command empty. The publish directory is `.`. The included `netlify.toml` already defines the functions directory.
5. Deploy the site.

## 4. Add private environment variables in Netlify
In your Netlify site: **Site configuration → Environment variables → Add a variable**. Add these exact names:

- `TELEGRAM_BOT_TOKEN` = your BotFather token
- `TELEGRAM_CHAT_ID` = your Telegram chat ID

Make sure the variables are available to Functions. Save, then trigger a new deploy so the function receives them. Never commit these values to GitHub.

## 5. Test
Open the deployed Netlify URL, go through the experience, choose a date and time, and confirm. The Telegram message should arrive in the chat where you started the bot. Test with your own details before sharing the site.

## Important
- The Telegram message is sent only after the visitor presses the final confirmation button.
- If Telegram delivery fails, the site shows an error and does not display a false confirmation.
- Do not share the bot token with anyone. If it is exposed, revoke it with BotFather and replace the environment variable.
