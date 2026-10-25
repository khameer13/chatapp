# Thirteen Network · Chat Room

A real-time group chat room built with Node.js and Socket.IO.

**Live demo:** https://khameer13.github.io/chatapp/

GitHub Pages can only host the front end, so the live demo runs in **demo mode**: messages are shared between tabs of the same browser. Open the page in two tabs, join with two names and chat. Run the server below for real multi-user chat across devices.

## Features

- Join with a display name; join / leave notices
- Real-time messages with sender name and time
- "… is typing" indicator and online-user count
- Messages are rendered as plain text (no HTML injection); server trims names to 30 and messages to 500 characters and rate-limits flooding
- Responsive layout with light/dark mode

## Run locally

```bash
cd nodeserver
npm install
npm start            # http://localhost:8000
```

Open http://localhost:8000 in two browsers (or on your phone on the same Wi-Fi using your computer's IP). The page detects the server automatically. `npm run dev` restarts the server on file changes (nodemon).

To use the hosted page with your own server, open
`https://khameer13.github.io/chatapp/?server=http://localhost:8000`.
Browsers allow this for `localhost`; any other server address needs HTTPS.

Settings (environment variables):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8000` | Port to listen on |
| `ALLOWED_ORIGINS` | `https://khameer13.github.io` | Comma-separated sites allowed to connect from another origin |

## Socket events

| Client → server | Server → clients |
| --- | --- |
| `new-user-joined` (name) | `user-joined` (name), `online` (count) |
| `send` (message) | `receive` ({ name, message, time }) |
| `typing` | `typing` (name) |
| disconnect | `left` (name), `online` (count) |

## Project structure

| Path | Purpose |
| --- | --- |
| `index.html`, `style.css` | Chat page |
| `js/client.js` | Client: Socket.IO connection, or demo mode via BroadcastChannel |
| `nodeserver/index.js` | Serves the page and relays messages |
| `nodeserver/test/` | Server tests (`npm test`) |
