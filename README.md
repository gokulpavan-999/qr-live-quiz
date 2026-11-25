# QR Live Quiz System (200 participants)

A runnable QR-based live quiz application with:
- One QR code / join link for participants
- Name-only registration before the quiz starts
- Admin-managed multiple-choice questions (add questions before starting)
- Manual question publishing: admin clicks **Publish next question**
- Per-question timer; the timer closes answers, but does not auto-advance
- One answer per participant per question
- Correct answer scoring: 100 points + up to 50 speed-bonus points
- Live participant count, answer distribution and leaderboard on the projector display
- Final top-three winner announcement
- JSON file persistence in `data.json`

## Requirements
- Node.js 18 or newer
- Internet/network access between the host computer and participant phones on the same Wi-Fi/LAN, or deploy the app to a public HTTPS host.

## Run locally
1. Extract the ZIP.
2. Open a terminal in the extracted `qr-live-quiz` folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env` (optional; adjust `PUBLIC_BASE_URL` for phone access).
5. Keep `PUBLIC_BASE_URL=http://localhost:3000` for testing on the same computer, or change it to the computer's LAN IP / public URL so phones can open the QR link.
6. Run `npm start`.
7. Open `http://localhost:3000` on the admin computer; the admin panel opens directly without a password.
8. Open `http://localhost:3000/display` on the projector/TV browser.
9. Display the QR code in the admin panel. Participants scan it and enter their names.

## Same-Wi-Fi phone testing
- Find the host computer's LAN IPv4 address (Windows: `ipconfig`).
- Set `PUBLIC_BASE_URL=http://YOUR-LAN-IP:3000` in `.env`, for example `http://192.168.1.25:3000`.
- Restart the server and ensure Windows Firewall allows inbound TCP port 3000 on the private network.
- Phones must be on the same Wi-Fi network. Do not use `localhost` in the QR URL for phones.

## Admin workflow
1. Add all questions and select the correct answer for each.
2. Set quiz title and timer.
3. Participants join while registration is open.
4. Click **Start quiz** to close registration.
5. Click **Publish next question** whenever you want to show the next question.
6. When all questions have been shown, click **Publish next question** once more to finish and show winners.
7. Use **Reset quiz** to clear the event and start a new quiz.

## Important deployment/security notes
- Admin login is enabled. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in production. Never commit real secrets to GitHub.
- Use HTTPS and a proper hosting provider for public events.
- For a public production deployment, add durable database storage (PostgreSQL), rate limiting, stronger admin authentication, backups, and monitoring.
- `data.json` stores participant names and scores locally. Protect the server and delete the file when no longer needed.
- The server supports 1–200 participants (configurable with MAX_PARTICIPANTS, capped at 200). Questions have no application-level count limit. Actual capacity also depends on hosting/network resources.
- The correct answer is never sent to participant browsers.
