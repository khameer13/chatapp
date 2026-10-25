// Thirteen Network chat server: serves the chat page and relays messages with Socket.IO.
//
//   cd nodeserver && npm install && npm start      -> http://localhost:8000
//
// Settings (environment variables):
//   PORT             default 8000
//   ALLOWED_ORIGINS  comma-separated origins allowed to connect from another site
//                    default: https://khameer13.github.io

const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 8000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://khameer13.github.io")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const MAX_NAME = 30;
const MAX_MESSAGE = 500;
const MIN_MS_BETWEEN_MESSAGES = 300; // simple flood protection

const ROOT = path.join(__dirname, "..");
// Only these files are served; everything else returns 404.
const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
  "/js/client.js": ["js/client.js", "text/javascript; charset=utf-8"],
  "/thirteennetwork.jpeg": ["thirteennetwork.jpeg", "image/jpeg"],
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    return res.end(JSON.stringify({ ok: true, app: "thirteen-chat" }));
  }
  const entry = req.method === "GET" && STATIC[url.pathname];
  if (!entry) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }
  fs.readFile(path.join(ROOT, entry[0]), (err, data) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      return res.end("Server error");
    }
    res.writeHead(200, { "Content-Type": entry[1] });
    res.end(data);
  });
});

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS },
  maxHttpBufferSize: 10_000,
});

const users = new Map(); // socket.id -> name

function clean(value, max) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function broadcastOnline() {
  io.emit("online", users.size);
}

io.on("connection", (socket) => {
  let lastMessageAt = 0;

  socket.on("new-user-joined", (rawName) => {
    const name = clean(rawName, MAX_NAME) || "Guest";
    const firstJoin = !users.has(socket.id);
    users.set(socket.id, name);
    if (firstJoin) socket.broadcast.emit("user-joined", name);
    broadcastOnline();
  });

  socket.on("send", (rawMessage) => {
    const name = users.get(socket.id);
    if (!name) return; // must join first
    const message = typeof rawMessage === "string" ? rawMessage.trim().slice(0, MAX_MESSAGE) : "";
    const now = Date.now();
    if (!message || now - lastMessageAt < MIN_MS_BETWEEN_MESSAGES) return;
    lastMessageAt = now;
    // The client sets text with textContent, so messages are never rendered as HTML.
    socket.broadcast.emit("receive", { message, kname: name, name, time: now });
  });

  socket.on("typing", () => {
    const name = users.get(socket.id);
    if (name) socket.broadcast.emit("typing", name);
  });

  socket.on("disconnect", () => {
    const name = users.get(socket.id);
    if (!name) return; // never joined
    users.delete(socket.id);
    socket.broadcast.emit("left", name);
    broadcastOnline();
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Chat server running at http://localhost:${PORT}`);
    console.log(`Allowed cross-site origins: ${ALLOWED_ORIGINS.join(", ")}`);
  });
}

module.exports = { server, io };
