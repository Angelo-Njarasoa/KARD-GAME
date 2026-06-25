const socket = io({ reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000 });

let myName = sessionStorage.getItem('unoName') || '';
let myRoomId = sessionStorage.getItem('unoRoom') || '';
let isCreator = sessionStorage.getItem('unoCreator') === 'true';
let pendingCardIndex = null;

function saveSession() {
  sessionStorage.setItem('unoName', myName);
  sessionStorage.setItem('unoRoom', myRoomId);
  sessionStorage.setItem('unoCreator', isCreator);
}
function clearSession() {
  sessionStorage.removeItem('unoName');
  sessionStorage.removeItem('unoRoom');
  sessionStorage.removeItem('unoCreator');
}

// ─── Screens ──────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

// ─── Lobby ────────────────────────────────────────────────────────
document.getElementById('btn-create').addEventListener('click', () => {
  const name = document.getElementById('input-name').value.trim();
  if (!name) return showError('lobby', 'Entre ton pseudo !');
  myName = name; isCreator = true;
  socket.emit('createRoom', { name });
});

document.getElementById('btn-join').addEventListener('click', () => {
  const name = document.getElementById('input-name').value.trim();
  const code = document.getElementById('input-code').value.trim().toUpperCase();
  if (!name) return showError('lobby', 'Entre ton pseudo !');
  if (!code) return showError('lobby', 'Entre le code du salon !');
  myName = name; isCreator = false;
  socket.emit('joinRoom', { name, roomId: code });
});

document.getElementById('input-code').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-join').click(); });
document.getElementById('input-name').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-create').click(); });

socket.on('roomCreated', ({ roomId }) => {
  myRoomId = roomId; isCreator = true; saveSession();
  document.getElementById('room-code-display').textContent = roomId;
  document.getElementById('btn-start').style.display = 'block';
  document.getElementById('waiting-hint').style.display = 'none';
  showScreen('waiting');
});

socket.on('roomJoined', ({ roomId }) => {
  myRoomId = roomId; isCreator = false; saveSession();
  document.getElementById('room-code-display').textContent = roomId;
  document.getElementById('btn-start').style.display = 'none';
  document.getElementById('waiting-hint').style.display = 'block';
  showScreen('waiting');
});

socket.on('rejoinConfirmed', ({ roomId, phase, isCreator: ic }) => {
  myRoomId = roomId; isCreator = ic; saveSession();
  if (phase === 'lobby') {
    document.getElementById('room-code-display').textContent = roomId;
    document.getElementById('btn-start').style.display = ic ? 'block' : 'none';
    document.getElementById('waiting-hint').style.display = ic ? 'none' : 'block';
    showScreen('waiting');
  }
});

socket.on('connect', () => {
  if (myName && myRoomId) socket.emit('rejoinRoom', { name: myName, roomId: myRoomId });
});

socket.on('lobbyUpdate', ({ roomId, players }) => {
  const list = document.getElementById('player-list');
  list.innerHTML = players.map((name, i) =>
    `<div class="player-item ${i === 0 ? 'creator' : ''}">${name}${i === 0 ? ' (créateur)' : ''}</div>`
  ).join('');
  if (isCreator) {
    document.getElementById('btn-start').style.display = players.length >= 2 ? 'block' : 'none';
    document.getElementById('waiting-hint').textContent =
      players.length < 2 ? "En attente d'autres joueurs…" : `${players.length} joueur(s) — prêt à lancer !`;
  }
});

document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('startGame', { roomId: myRoomId });
});

// ─── Game State ───────────────────────────────────────────────────
socket.on('gameState', (state) => {
  showScreen('game');
  renderOpponents(state);
  renderTopCard(state.topCard);
  renderColorIndicator(state.currentColor);
  renderHand(state.hand, state.topCard, state.currentColor, state.isYourTurn, state.needColorChoice);
  renderStatus(state);
  document.getElementById('my-name-display').textContent = '👤 ' + myName;

  if (state.needColorChoice) document.getElementById('color-picker').classList.remove('hidden');
  else document.getElementById('color-picker').classList.add('hidden');

  if (state.winner) showWin(state.winner);
});

// ─── Opponents ────────────────────────────────────────────────────
const ZONE_COLORS = ['#e74c3c','#f1c40f','#2ecc71','#3498db','#9b59b6','#e67e22','#1abc9c','#e91e63'];

function getAngles(n) {
  if (n === 0) return [];
  if (n === 1) return [0];
  const spread = n <= 2 ? 110 : n <= 3 ? 170 : n <= 5 ? 230 : 290;
  return Array.from({ length: n }, (_, i) => -spread / 2 + (spread / (n - 1)) * i);
}

function renderOpponents(state) {
  const zonesEl = document.getElementById('opponents-zones');
  zonesEl.innerHTML = '';

  const opponents = state.players
    .map((p, originalIndex) => ({ ...p, originalIndex }))
    .filter(p => !p.isYou);

  const TABLE_RADIUS = 170; // half of 340px table
  const DIST = TABLE_RADIUS + 72;
  const angles = getAngles(opponents.length);

  opponents.forEach((p, i) => {
    const angle = angles[i];
    const rad = ((angle - 90) * Math.PI) / 180;
    const x = Math.cos(rad) * DIST;
    const y = Math.sin(rad) * DIST;

    const zone = document.createElement('div');
    zone.className = 'opponent-zone'
      + (p.isCurrent ? ' active-turn' : '')
      + (p.disconnected ? ' disconnected' : '');
    zone.style.left = `calc(50% + ${x}px)`;
    zone.style.top = `calc(50% + ${y}px)`;
    zone.style.setProperty('--accent', ZONE_COLORS[i % ZONE_COLORS.length]);

    const visibleCards = Math.min(Math.max(p.handCount, 0), 5);
    const fanHtml = buildFan(visibleCards);
    const catchBtn = (p.handCount === 1 && !p.saidUno && !p.disconnected)
      ? `<button class="btn-catch" onclick="callBluff(${p.originalIndex})">KARD?</button>` : '';

    zone.innerHTML = `
      ${fanHtml}
      <div class="opp-info-box" style="border-color: rgba(${hexToRgb(ZONE_COLORS[i % ZONE_COLORS.length])},0.4)">
        <div class="opp-name">${escHtml(p.name)}${p.disconnected ? ' 🔌' : ''}</div>
        <div class="opp-count">${p.handCount}</div>
        <div class="opp-meta">
          carte${p.handCount !== 1 ? 's' : ''}
          ${p.saidUno ? '<span class="uno-badge">KARD!</span>' : ''}
          ${catchBtn}
        </div>
      </div>
    `;
    zonesEl.appendChild(zone);
  });
}

function buildFan(count) {
  if (count === 0) return '<div class="opp-cards-fan"></div>';
  const cards = [];
  const total = Math.min(count, 5);
  for (let i = 0; i < total; i++) {
    const rot = total > 1 ? ((i / (total - 1)) - 0.5) * 40 : 0;
    const ty = Math.abs(rot) * 0.3;
    cards.push(`<div class="mini-card" style="transform: rotate(${rot}deg) translateY(${ty}px); z-index:${i}"></div>`);
  }
  return `<div class="opp-cards-fan">${cards.join('')}</div>`;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `${r},${g},${b}`;
}

function callBluff(targetIndex) {
  socket.emit('callUnoBluff', { roomId: myRoomId, targetIndex });
}

// ─── Top Card & Color ─────────────────────────────────────────────
function renderTopCard(card) {
  const el = document.getElementById('top-card');
  el.className = 'card color-' + card.color;
  el.innerHTML = buildCardInner(card);
}

function renderColorIndicator(color) {
  const el = document.getElementById('current-color-indicator');
  el.className = 'color-ring ci-' + color;
  el.title = 'Couleur active : ' + colorName(color);
}

// ─── Hand ─────────────────────────────────────────────────────────
function renderHand(hand, topCard, currentColor, isMyTurn, needColorChoice) {
  const el = document.getElementById('my-hand');
  el.innerHTML = '';
  hand.forEach((card, i) => {
    const playable = isMyTurn && !needColorChoice && canPlayCard(card, topCard, currentColor);
    const div = document.createElement('div');
    div.className = 'card color-' + card.color + (playable ? ' playable' : ' disabled');
    div.innerHTML = buildCardInner(card);
    div.title = cardTitle(card);
    if (playable) div.addEventListener('click', () => playCard(i, card));
    el.appendChild(div);
  });
}

function playCard(index, card) {
  if (card.type === 'wild') {
    pendingCardIndex = index;
    document.getElementById('color-picker').classList.remove('hidden');
  } else {
    socket.emit('playCard', { roomId: myRoomId, cardIndex: index });
  }
}

document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const color = btn.dataset.color;
    document.getElementById('color-picker').classList.add('hidden');
    socket.emit('playCard', { roomId: myRoomId, cardIndex: pendingCardIndex ?? -1, chosenColor: color });
    pendingCardIndex = null;
  });
});

document.getElementById('deck-pile').addEventListener('click', () => {
  socket.emit('drawCard', { roomId: myRoomId });
});

document.getElementById('btn-uno').addEventListener('click', () => {
  socket.emit('sayUno', { roomId: myRoomId });
  showToast('KARD !');
});

// ─── Status ───────────────────────────────────────────────────────
function renderStatus(state) {
  const el = document.getElementById('game-status');
  const dir = state.direction === 1 ? '→' : '←';
  if (state.isYourTurn) {
    el.textContent = `C'est TON TOUR ! ${dir}`;
    el.style.color = '#f1c40f';
    el.style.background = 'rgba(241,196,15,0.15)';
  } else {
    const current = state.players.find(p => p.isCurrent);
    el.textContent = `Tour de ${current ? current.name : '?'} ${dir}`;
    el.style.color = 'rgba(255,255,255,0.8)';
    el.style.background = 'rgba(0,0,0,0.35)';
  }
}

// ─── Win ──────────────────────────────────────────────────────────
function showWin(winner) {
  const isMe = winner === myName;
  document.getElementById('win-message').textContent = isMe ? '🏆 Tu as gagné !' : `${winner} a gagné !`;
  if (isCreator) document.getElementById('btn-restart').style.display = 'block';
  showScreen('win');
}

document.getElementById('btn-restart').addEventListener('click', () => {
  socket.emit('restartGame', { roomId: myRoomId });
});
document.getElementById('btn-quit').addEventListener('click', () => {
  clearSession(); location.reload();
});

// ─── Events ───────────────────────────────────────────────────────
socket.on('playerDisconnected', ({ name }) => showToast(`${name} s'est déconnecté… (30s)`));
socket.on('playerRejoined', ({ name }) => showToast(`${name} est de retour !`));
socket.on('playerLeft', ({ name }) => showToast(`${name} a quitté définitivement`));
socket.on('unoBluffCaught', ({ name }) => showToast(`${name} n'a pas dit KARD ! +2 cartes !`));

socket.on('error', (msg) => {
  const screens = ['lobby', 'waiting'];
  let shown = false;
  screens.forEach(s => {
    const el = document.getElementById(s + '-error');
    if (el && document.getElementById('screen-' + s).classList.contains('active')) {
      el.textContent = msg; shown = true;
    }
  });
  if (!shown) showToast(msg);
});

// ─── Helpers ──────────────────────────────────────────────────────
function canPlayCard(card, top, currentColor) {
  if (card.type === 'wild') return true;
  if (card.color === currentColor) return true;
  if (card.value === top.value) return true;
  return false;
}

function buildCardInner(card) {
  const label = cardLabel(card);
  return `
    <span class="card-corner-tl">${label}</span>
    <span class="card-label">${label}</span>
    <span class="card-corner-br">${label}</span>
  `;
}

function cardLabel(card) {
  const map = { skip: '🚫', reverse: '↩', draw2: '+2', wild: '🌈', wild4: '+4' };
  return map[card.value] || card.value;
}

function cardTitle(card) {
  const valN = { skip: 'Passe ton tour', reverse: 'Inversion', draw2: '+2 cartes', wild: 'Joker couleur', wild4: 'Joker +4' };
  return `${colorName(card.color)} ${valN[card.value] || card.value}`;
}

function colorName(c) {
  return { red: 'Rouge', yellow: 'Jaune', green: 'Vert', blue: 'Bleu', wild: 'Joker' }[c] || c;
}

function showError(screen, msg) {
  const el = document.getElementById(screen + '-error');
  if (el) el.textContent = msg;
}

function escHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
