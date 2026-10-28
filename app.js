/**
 * Test Chat — ro'yxatdan o'tish yo'q
 * Havola orqali real chat + rasm
 */

const socket = io({ transports: ['websocket', 'polling'] });

let myName = 'Anonim';
let myId = null;
let currentRoom = null;
let typingTimer = null;

// ---------- Helpers ----------
function $(s) { return document.querySelector(s); }

function toast(msg, ms = 2500) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function time() {
  return new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

function escape(t) {
  return String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- Start screen ----------
$('#create-btn').addEventListener('click', () => {
  myName = $('#name-input').value.trim() || 'Anonim';
  const roomId = uid();
  joinRoom(roomId);
});

$('#join-btn').addEventListener('click', () => {
  let val = $('#join-input').value.trim();
  if (!val) return toast('Havola yoki ID yozing');

  // To'liq havola bo'lsa — room parametrini olamiz
  try {
    if (val.includes('http') || val.includes('?room=')) {
      const url = new URL(val, window.location.origin);
      val = url.searchParams.get('room') || val;
    }
  } catch {}

  // faqat id qolsin
  val = val.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!val) return toast('Noto‘g‘ri havola');

  myName = $('#name-input').value.trim() || 'Anonim';
  joinRoom(val);
});

// Enter bilan ham
$('#join-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('#join-btn').click();
});
$('#name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('#create-btn').click();
});

// URL da room bo'lsa — avtomatik kirish
(function checkUrl() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) {
    myName = localStorage.getItem('yc_name') || 'Anonim';
    $('#name-input').value = myName === 'Anonim' ? '' : myName;
    // biroz kutib kiramiz (socket ulanishi uchun)
    setTimeout(() => joinRoom(room), 400);
  }
})();

// ---------- Join ----------
function joinRoom(roomId) {
  currentRoom = roomId;
  localStorage.setItem('yc_name', myName);

  // URL ni yangilash (havola uchun)
  const newUrl = window.location.origin + window.location.pathname + '?room=' + roomId;
  window.history.replaceState({}, '', newUrl);

  socket.emit('join', { roomId, name: myName });
}

socket.on('joined', ({ roomId, name, count }) => {
  myId = socket.id;
  show('#chat-screen');
  $('#room-title').textContent = 'Xona: ' + roomId;
  $('#room-count').textContent = count + ' kishi';
  clearMessages();
  addSystem('Siz qo‘shildingiz. Havolani do‘stingizga yuboring.');
  toast('Xonaga kirdingiz');
});

socket.on('system', ({ text, count }) => {
  addSystem(text);
  if (count !== undefined) {
    $('#room-count').textContent = count + ' kishi';
  }
});

// ---------- Messages ----------
function clearMessages() {
  $('#messages').innerHTML = '';
}

function addSystem(text) {
  const div = document.createElement('div');
  div.className = 'system';
  div.textContent = text;
  $('#messages').appendChild(div);
  scrollBottom();
}

function addMsg(payload) {
  const isMine = payload.id === myId;
  const div = document.createElement('div');
  div.className = 'msg ' + (isMine ? 'mine' : 'theirs');

  let html = '';
  if (!isMine) {
    html += `<div class="name">${escape(payload.from)}</div>`;
  }

  if (payload.type === 'image') {
    html += `<img src="${payload.url}" alt="rasm" onclick="window.open(this.src)" />`;
  } else {
    html += escape(payload.text);
  }

  html += `<span class="time">${time()}</span>`;
  div.innerHTML = html;
  $('#messages').appendChild(div);
  scrollBottom();
}

function scrollBottom() {
  const box = $('#messages');
  box.scrollTop = box.scrollHeight;
}

socket.on('message', (payload) => {
  addMsg(payload);
  $('#typing').classList.add('hidden');
});

// ---------- Send text ----------
function sendText() {
  const input = $('#msg-input');
  const text = input.value.trim();
  if (!text || !currentRoom) return;
  input.value = '';
  socket.emit('message', { text });
}

$('#send-btn').addEventListener('click', sendText);
$('#msg-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendText();
  else {
    socket.emit('typing');
  }
});

socket.on('typing', ({ name }) => {
  const el = $('#typing');
  el.textContent = name + ' yozmoqda...';
  el.classList.remove('hidden');
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => el.classList.add('hidden'), 2000);
});

// ---------- Image ----------
$('#image-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !currentRoom) return;
  if (file.size > 4 * 1024 * 1024) {
    toast('Rasm 4 MB dan kichik bo‘lsin');
    return;
  }

  const fd = new FormData();
  fd.append('image', file);

  try {
    toast('Yuklanmoqda...');
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    const d = await r.json();
    if (!r.ok) {
      toast(d.error || 'Xato');
      return;
    }
    socket.emit('image', { url: d.url });
  } catch {
    toast('Rasm yuborilmadi');
  }
  e.target.value = '';
});

// ---------- Copy link ----------
$('#copy-link-btn').addEventListener('click', async () => {
  const link = window.location.href;
  try {
    await navigator.clipboard.writeText(link);
    toast('Havola nusxalandi! Do‘stingizga yuboring');
  } catch {
    prompt('Havolani nusxalang:', link);
  }
});

// ---------- Leave ----------
$('#leave-btn').addEventListener('click', () => {
  window.location.href = window.location.origin + window.location.pathname;
});
