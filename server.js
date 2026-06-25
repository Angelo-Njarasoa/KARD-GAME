const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ─── Game State ───────────────────────────────────────────────────────────────

const rooms = {};
const disconnectTimers = {}; // socketId → timer

function createDeck() {
  const colors = ['red', 'yellow', 'green', 'blue'];
  const deck = [];

  for (const color of colors) {
    deck.push({ color, value: '0', type: 'number' });
    for (let i = 1; i <= 9; i++) {
      deck.push({ color, value: String(i), type: 'number' });
      deck.push({ color, value: String(i), type: 'number' });
    }
    for (const value of ['skip', 'reverse', 'draw2']) {
      deck.push({ color, value, type: 'action' });
      deck.push({ color, value, type: 'action' });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild', type: 'wild' });
    deck.push({ color: 'wild', value: 'wild4', type: 'wild' });
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function drawCards(room, count) {
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (room.deck.length === 0) {
      // Reshuffle discard pile except top card
      const top = room.discard[room.discard.length - 1];
      room.deck = shuffle(room.discard.slice(0, -1));
      room.discard = [top];
    }
    if (room.deck.length > 0) drawn.push(room.deck.pop());
  }
  return drawn;
}

function canPlay(card, top, currentColor) {
  if (card.type === 'wild') return true;
  if (card.color === currentColor) return true;
  if (card.value === top.value) return true;
  return false;
}

function nextPlayerIndex(room, skip = false) {
  const n = room.players.length;
  let steps = skip ? 2 : 1;
  return ((room.currentPlayer + room.direction * steps) % n + n) % n;
}

function advanceTurn(room, skip = false) {
  room.currentPlayer = nextPlayerIndex(room, skip);
}

function broadcastState(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.players.forEach((player, idx) => {
    const socket = io.sockets.sockets.get(player.id);
    if (!socket) return;

    socket.emit('gameState', {
      hand: player.hand,
      players: room.players.map((p, i) => ({
        name: p.name,
        handCount: p.hand.length,
        isYou: i === idx,
        isCurrent: i === room.currentPlayer,
        saidUno: p.saidUno,
        disconnected: p.disconnected || false,
      })),
      topCard: room.discard[room.discard.length - 1],
      currentColor: room.currentColor,
      currentPlayer: room.currentPlayer,
      isYourTurn: idx === room.currentPlayer,
      direction: room.direction,
      deckCount: room.deck.length,
      phase: room.phase,
      winner: room.winner,
      needColorChoice: room.needColorChoice && idx === room.currentPlayer,
    });
  });
}

// ─── Socket Handlers ──────────────────────────────────────────────────────────

io.on('connection', (socket) => {

  socket.on('createRoom', ({ name }) => {
    const roomId = Math.random().toString(36).substr(2, 5).toUpperCase();
    rooms[roomId] = {
      id: roomId,
      players: [],
      deck: [],
      discard: [],
      currentPlayer: 0,
      direction: 1,
      currentColor: null,
      phase: 'lobby',
      winner: null,
      needColorChoice: false,
      drawStack: 0,
    };
    rooms[roomId].players.push({ id: socket.id, name, hand: [], saidUno: false });
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, name });
    io.to(roomId).emit('lobbyUpdate', getLobbyState(roomId));
  });

  socket.on('joinRoom', ({ name, roomId }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', 'Salon introuvable.');
    if (room.phase !== 'lobby') return socket.emit('error', 'La partie a déjà commencé.');
    if (room.players.length >= 10) return socket.emit('error', 'Salon plein (max 10 joueurs).');

    room.players.push({ id: socket.id, name, hand: [], saidUno: false });
    socket.join(roomId);
    socket.emit('roomJoined', { roomId, name });
    io.to(roomId).emit('lobbyUpdate', getLobbyState(roomId));
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.phase !== 'lobby') return;
    if (room.players[0].id !== socket.id) return socket.emit('error', 'Seul le créateur peut lancer.');
    if (room.players.length < 2) return socket.emit('error', 'Il faut au moins 2 joueurs.');

    room.deck = shuffle(createDeck());
    room.players.forEach(p => { p.hand = drawCards(room, 7); p.saidUno = false; });

    // First card: skip wilds/wild4
    let first;
    do { first = room.deck.pop(); } while (first.type === 'wild');
    room.deck.unshift(first); // put non-wild back if it was wild
    first = room.deck.pop();
    room.discard.push(first);
    room.currentColor = first.color;
    room.phase = 'playing';
    room.currentPlayer = 0;

    // Handle action first card
    if (first.value === 'skip') advanceTurn(room);
    else if (first.value === 'reverse') { room.direction = -1; advanceTurn(room); }
    else if (first.value === 'draw2') {
      const idx = nextPlayerIndex(room);
      room.players[idx].hand.push(...drawCards(room, 2));
      advanceTurn(room, true);
    }

    broadcastState(roomId);
  });

  socket.on('playCard', ({ roomId, cardIndex, chosenColor }) => {
    const room = rooms[roomId];
    if (!room || room.phase !== 'playing') return;

    const playerIdx = room.players.findIndex(p => p.id === socket.id);
    if (playerIdx !== room.currentPlayer) return;
    if (room.needColorChoice) return;

    const player = room.players[playerIdx];
    const card = player.hand[cardIndex];
    if (!card) return;

    const top = room.discard[room.discard.length - 1];
    if (!canPlay(card, top, room.currentColor)) {
      return socket.emit('error', 'Cette carte ne peut pas être jouée.');
    }

    // Play the card
    player.hand.splice(cardIndex, 1);
    player.saidUno = false;
    room.discard.push(card);

    // Check win
    if (player.hand.length === 0) {
      room.phase = 'ended';
      room.winner = player.name;
      broadcastState(roomId);
      return;
    }

    // Apply card effect
    if (card.type === 'wild') {
      if (chosenColor) {
        room.currentColor = chosenColor;
        room.needColorChoice = false;
        if (card.value === 'wild4') {
          const nextIdx = nextPlayerIndex(room);
          room.players[nextIdx].hand.push(...drawCards(room, 4));
          advanceTurn(room, true);
        } else {
          advanceTurn(room);
        }
      } else {
        room.needColorChoice = true;
        broadcastState(roomId);
        return;
      }
    } else {
      room.currentColor = card.color;
      if (card.value === 'skip') {
        advanceTurn(room, true);
      } else if (card.value === 'reverse') {
        room.direction *= -1;
        if (room.players.length === 2) advanceTurn(room, true);
        else advanceTurn(room);
      } else if (card.value === 'draw2') {
        const nextIdx = nextPlayerIndex(room);
        room.players[nextIdx].hand.push(...drawCards(room, 2));
        advanceTurn(room, true);
      } else {
        advanceTurn(room);
      }
    }

    broadcastState(roomId);
  });

  socket.on('drawCard', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.phase !== 'playing') return;
    if (room.needColorChoice) return;

    const playerIdx = room.players.findIndex(p => p.id === socket.id);
    if (playerIdx !== room.currentPlayer) return;

    const [drawn] = drawCards(room, 1);
    if (drawn) room.players[playerIdx].hand.push(drawn);
    advanceTurn(room);
    broadcastState(roomId);
  });

  socket.on('sayUno', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    if (player.hand.length === 1) {
      player.saidUno = true;
      broadcastState(roomId);
    }
  });

  socket.on('callUnoBluff', ({ roomId, targetIndex }) => {
    const room = rooms[roomId];
    if (!room) return;
    const target = room.players[targetIndex];
    if (!target) return;
    // If target has 1 card and didn't say UNO, they draw 2
    if (target.hand.length === 1 && !target.saidUno) {
      target.hand.push(...drawCards(room, 2));
      io.to(roomId).emit('unoBluffCaught', { name: target.name });
      broadcastState(roomId);
    }
  });

  socket.on('restartGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.players[0].id !== socket.id) return;

    room.deck = [];
    room.discard = [];
    room.currentPlayer = 0;
    room.direction = 1;
    room.currentColor = null;
    room.phase = 'lobby';
    room.winner = null;
    room.needColorChoice = false;
    room.players.forEach(p => { p.hand = []; p.saidUno = false; });

    io.to(roomId).emit('lobbyUpdate', getLobbyState(roomId));
  });

  socket.on('rejoinRoom', ({ name, roomId }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', 'Salon introuvable.');

    const player = room.players.find(p => p.name === name);
    if (!player) return socket.emit('error', 'Joueur introuvable dans ce salon.');

    // Cancel pending removal
    if (disconnectTimers[player.id]) {
      clearTimeout(disconnectTimers[player.id]);
      delete disconnectTimers[player.id];
    }

    // Update socket ID
    player.id = socket.id;
    player.disconnected = false;
    socket.join(roomId);

    const isCreator = room.players[0].id === socket.id;
    if (room.phase === 'lobby') {
      socket.emit('roomCreated', { roomId });
      socket.emit('lobbyUpdate', getLobbyState(roomId)); // will be caught as roomJoined flow
      socket.emit('rejoinConfirmed', { roomId, phase: 'lobby', isCreator });
      io.to(roomId).emit('lobbyUpdate', getLobbyState(roomId));
    } else {
      socket.emit('rejoinConfirmed', { roomId, phase: room.phase, isCreator });
      broadcastState(roomId);
    }

    io.to(roomId).emit('playerRejoined', { name });
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx === -1) continue;

      const player = room.players[idx];
      player.disconnected = true;

      io.to(roomId).emit('playerDisconnected', { name: player.name });

      // If it's their turn during a game, skip them
      if (room.phase === 'playing' && idx === room.currentPlayer) {
        advanceTurn(room);
        broadcastState(roomId);
      }

      // Grace period: 30s to reconnect before removing
      disconnectTimers[socket.id] = setTimeout(() => {
        const currentIdx = room.players.findIndex(p => p.name === player.name);
        if (currentIdx === -1) return;
        room.players.splice(currentIdx, 1);
        delete disconnectTimers[socket.id];

        if (room.players.length === 0) {
          delete rooms[roomId];
        } else {
          if (room.phase === 'playing') {
            if (room.currentPlayer >= room.players.length) room.currentPlayer = 0;
            io.to(roomId).emit('playerLeft', { name: player.name });
            broadcastState(roomId);
          } else {
            io.to(roomId).emit('lobbyUpdate', getLobbyState(roomId));
          }
        }
      }, 30000);
    }
  });
});

function getLobbyState(roomId) {
  const room = rooms[roomId];
  return {
    roomId,
    players: room.players.map(p => p.name),
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`KARD server running on port ${PORT}`);
});
