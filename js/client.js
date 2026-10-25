'use strict';

/*
 * Thirteen Network chat client.
 *
 * Two transports with the same events:
 *   - Socket.IO server (nodeserver/index.js) — real multi-user chat
 *   - Demo (BroadcastChannel) — used when no server is reachable, e.g. on GitHub Pages;
 *     messages are shared between tabs of the same browser
 *
 * Server selection, in order:
 *   1. ?server=<url> in the page URL
 *   2. the page is served by the chat server itself (same origin)
 *   3. otherwise demo mode
 */

const $ = (id) => document.getElementById(id);
const messages = $('messages');
const form = $('send-container');
const input = $('messageInp');
const sendBtn = form.querySelector('button');

const MAX_NAME = 30;
const MAX_MESSAGE = 500;

// ------------------------------------------------------------------ UI

function timeLabel(ts) {
  return new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToEnd() {
  messages.scrollTop = messages.scrollHeight;
}

// All user text goes through textContent, so it is never parsed as HTML.
function appendMessage({ name, message, time }, position) {
  const wrap = document.createElement('div');
  wrap.className = `message ${position}`;
  if (position === 'left') {
    const who = document.createElement('span');
    who.className = 'name';
    who.textContent = name || 'Guest';
    wrap.append(who);
  }
  const body = document.createElement('p');
  body.className = 'text';
  body.textContent = message;
  const meta = document.createElement('span');
  meta.className = 'time';
  meta.textContent = timeLabel(time);
  wrap.append(body, meta);
  messages.append(wrap);
  scrollToEnd();
}

function appendNotice(text) {
  const el = document.createElement('div');
  el.className = 'message center';
  el.textContent = text;
  messages.append(el);
  scrollToEnd();
}

function setOnline(n) {
  $('onlineCount').textContent = `${n} online`;
}

let typingTimer = null;
function showTyping(name) {
  $('typing').textContent = `${name} is typing…`;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    $('typing').textContent = '';
  }, 2000);
}

function setMode(kind, detail) {
  const badge = $('modeBadge');
  badge.hidden = false;
  badge.textContent = kind === 'demo' ? 'Demo' : 'Live';
  badge.className = `badge ${kind}`;
  badge.title = detail || '';
  $('demoNote').hidden = kind !== 'demo';
}

function cleanName(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

// ------------------------------------------------------------------ transports

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(s);
  });
}

async function serverReachable(base) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2000);
  try {
    const res = await fetch(new URL('health', base), { signal: ctrl.signal });
    if (!res.ok) return false;
    const body = await res.json();
    return body && body.app === 'thirteen-chat';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function socketTransport(base, handlers) {
  await loadScript(new URL('socket.io/socket.io.js', base).href);
  const socket = window.io(base.replace(/\/$/, ''), { transports: ['websocket', 'polling'] });
  socket.on('connect_error', () => handlers.status('Reconnecting…'));
  socket.on('user-joined', (name) => handlers.joined(name));
  socket.on('receive', (data) => handlers.message(data));
  socket.on('left', (name) => handlers.left(name));
  socket.on('online', (n) => handlers.online(n));
  socket.on('typing', (name) => handlers.typing(name));
  return {
    kind: 'live',
    detail: `Connected to ${base}`,
    join(name) {
      const doJoin = () => socket.emit('new-user-joined', name);
      if (socket.connected) doJoin();
      socket.on('connect', doJoin); // first connect, and re-join after a reconnect
    },
    send(message) {
      socket.emit('send', message);
    },
    typing() {
      socket.emit('typing');
    },
  };
}

function demoTransport(handlers) {
  const id = Math.random().toString(36).slice(2);
  const peers = new Map(); // id -> name
  let myName = null;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('thirteen-network-chat') : null;
  const post = (msg) => channel && channel.postMessage({ ...msg, from: id });
  const count = () => handlers.online(peers.size + 1);

  if (channel) {
    channel.onmessage = ({ data }) => {
      if (!data || data.from === id) return;
      switch (data.type) {
        case 'join':
          peers.set(data.from, data.name);
          handlers.joined(data.name);
          post({ type: 'here', name: myName }); // tell the newcomer we are online
          count();
          break;
        case 'here':
          if (data.name) peers.set(data.from, data.name);
          count();
          break;
        case 'message':
          handlers.message({ name: data.name, message: data.message, time: data.time });
          break;
        case 'typing':
          handlers.typing(data.name);
          break;
        case 'leave':
          if (peers.delete(data.from)) handlers.left(data.name);
          count();
          break;
      }
    };
    window.addEventListener('pagehide', () => myName && post({ type: 'leave', name: myName }));
  }

  return {
    kind: 'demo',
    detail: 'Messages are shared between tabs of this browser',
    join(name) {
      myName = name;
      post({ type: 'join', name });
      count();
    },
    send(message) {
      post({ type: 'message', name: myName, message, time: Date.now() });
    },
    typing() {
      post({ type: 'typing', name: myName });
    },
  };
}

async function connect(handlers) {
  const param = new URLSearchParams(location.search).get('server');
  if (param && /^https?:\/\//i.test(param)) {
    const base = param.endsWith('/') ? param : `${param}/`;
    try {
      return await socketTransport(base, handlers);
    } catch {
      handlers.status(`Could not reach ${param}. Using demo mode.`);
      return demoTransport(handlers);
    }
  }
  const sameOrigin = new URL('./', location.href).href;
  if (/^https?:$/.test(location.protocol) && (await serverReachable(sameOrigin))) {
    try {
      return await socketTransport(sameOrigin, handlers);
    } catch {
      /* fall through to demo */
    }
  }
  return demoTransport(handlers);
}

// ------------------------------------------------------------------ app

let transport = null;
let lastTypingSent = 0;

const handlers = {
  joined: (name) => appendNotice(`${name} joined the chat`),
  left: (name) => name && appendNotice(`${name} left the chat`),
  message: (data) => {
    $('typing').textContent = '';
    appendMessage(data, 'left');
  },
  online: setOnline,
  typing: (name) => name && showTyping(name),
  status: (text) => {
    $('onlineCount').textContent = text;
  },
};

function askName() {
  const dialog = $('joinDialog');
  const nameInput = $('nameInput');
  try {
    nameInput.value = localStorage.getItem('chat.name') || '';
  } catch {
    /* storage blocked */
  }
  return new Promise((resolve) => {
    $('joinForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = cleanName(nameInput.value);
      if (!name) {
        $('joinError').textContent = 'Please enter a name.';
        return;
      }
      try {
        localStorage.setItem('chat.name', name);
      } catch {
        /* storage blocked */
      }
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      resolve(name);
    });
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    nameInput.focus();
  });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = input.value.trim().slice(0, MAX_MESSAGE);
  if (!message || !transport) return;
  appendMessage({ name: 'You', message, time: Date.now() }, 'right');
  transport.send(message);
  input.value = '';
  input.focus();
});

input.addEventListener('input', () => {
  if (!transport || Date.now() - lastTypingSent < 1000) return;
  lastTypingSent = Date.now();
  transport.typing();
});

$('openTab').addEventListener('click', (e) => {
  e.preventDefault();
  window.open(location.href, '_blank', 'noopener');
});

async function start() {
  const [name, t] = await Promise.all([askName(), connect(handlers)]);
  transport = t;
  setMode(transport.kind, transport.detail);
  transport.join(name);
  appendNotice(`You joined as ${name}`);
  input.disabled = false;
  sendBtn.disabled = false;
  input.focus();
}

start();
