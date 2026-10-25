// Run with: npm test   (Node 18+, uses socket.io-client from devDependencies)
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { io: connect } = require("socket.io-client");
const { server, io } = require("../index");

let url;
const sockets = [];

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  sockets.forEach((s) => s.close());
  io.close();
  server.close();
});

const client = () => {
  const s = connect(url, { transports: ["websocket"], forceNew: true });
  sockets.push(s);
  return s;
};
const once = (s, event, ms = 1500) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    s.once(event, (v) => {
      clearTimeout(t);
      resolve(v);
    });
  });
const noEvent = (s, event, ms = 400) =>
  new Promise((resolve, reject) => {
    const h = () => reject(new Error(`unexpected ${event}`));
    s.once(event, h);
    setTimeout(() => {
      s.off(event, h);
      resolve();
    }, ms);
  });

test("serves the page and health check, nothing else", async () => {
  assert.strictEqual((await fetch(url + "/")).status, 200);
  assert.strictEqual((await fetch(url + "/js/client.js")).status, 200);
  assert.deepStrictEqual(await (await fetch(url + "/health")).json(), { ok: true, app: "thirteen-chat" });
  assert.strictEqual((await fetch(url + "/nodeserver/index.js")).status, 404);
  assert.strictEqual((await fetch(url + "/nodeserver/package.json")).status, 404);
  assert.strictEqual((await fetch(url + "/../index.js")).status, 404);
});

test("join, message, typing, leave and online count", async () => {
  const a = client();
  const b = client();
  await Promise.all([once(a, "connect"), once(b, "connect")]);

  a.emit("new-user-joined", "  Asha  ");
  assert.strictEqual(await once(a, "online"), 1);

  const joined = once(a, "user-joined");
  b.emit("new-user-joined", "Ravi");
  assert.strictEqual(await joined, "Ravi");

  const got = once(b, "receive");
  a.emit("send", "  hello <b>there</b>  ");
  const msg = await got;
  assert.strictEqual(msg.message, "hello <b>there</b>");
  assert.strictEqual(msg.name, "Asha");
  assert.strictEqual(msg.kname, "Asha"); // old field kept for compatibility
  assert.ok(typeof msg.time === "number");

  const typing = once(b, "typing");
  a.emit("typing");
  assert.strictEqual(await typing, "Asha");

  // empty and non-string messages are ignored
  await new Promise((r) => setTimeout(r, 350));
  const ignored = noEvent(b, "receive");
  a.emit("send", "   ");
  a.emit("send", { evil: true });
  await ignored;

  // long messages are cut to 500 characters
  const long = once(b, "receive");
  a.emit("send", "x".repeat(2000));
  assert.strictEqual((await long).message.length, 500);

  const left = once(a, "left");
  b.close();
  assert.strictEqual(await left, "Ravi");
});

test("messages before joining are ignored and unjoined disconnects are silent", async () => {
  const a = client();
  const c = client();
  await Promise.all([once(a, "connect"), once(c, "connect")]);
  a.emit("new-user-joined", "Watcher");
  await once(a, "online");
  const quiet = Promise.all([noEvent(a, "receive"), noEvent(a, "left")]);
  c.emit("send", "sneaky");
  c.close();
  await quiet;
});

test("blank name becomes Guest", async () => {
  const a = client();
  const b = client();
  await Promise.all([once(a, "connect"), once(b, "connect")]);
  a.emit("new-user-joined", "Host");
  await once(a, "online");
  const joined = once(a, "user-joined");
  b.emit("new-user-joined", "   ");
  assert.strictEqual(await joined, "Guest");
});
