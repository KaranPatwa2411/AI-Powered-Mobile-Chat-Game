const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const TRIVIA_QUESTIONS = [
  'What is the capital of France?',
  'Who wrote "To Kill a Mockingbird"?',
  'What is 2 + 2?',
  'What is the largest planet in our solar system?',
  'Who painted the Mona Lisa?'
];

function getRandomTrivia() {
  return TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});


const lobbies = {};

function getLobbyList() {
  return Object.values(lobbies)
    .filter(lobby => !lobby.isPrivate) 
    .map(lobby => ({
      id: lobby.id,
      name: lobby.name,
      isPrivate: lobby.isPrivate,
      maxHumans: lobby.maxHumans,
      maxBots: lobby.maxBots,
      participants: lobby.participants.length,
      bots: lobby.bots.length,
  }));
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);


  socket.on('get_lobbies', () => {
    socket.emit('lobby_list', getLobbyList());
  });

  // Create lobby
  socket.on('create_lobby', ({ name, isPrivate, maxHumans, maxBots }, cb) => {
    const id = 'lobby_' + Math.random().toString(36).substr(2, 9);
    const bots = [];
    if (maxBots && maxBots > 0) {
      bots.push({
        id: 'bot_' + Math.random().toString(36).substr(2, 5),
        name: 'ChatBot',
        avatar: '🤖',
      });
    }
    lobbies[id] = {
      id,
      name,
      isPrivate: !!isPrivate,
      maxHumans: maxHumans || 10,
      maxBots: maxBots || 1,
      participants: [],
      bots,
      messages: [],
      messageCount: 0,
    };
    io.emit('lobby_list', getLobbyList()); 
    cb && cb({ success: true, id });
  });

  // Joining lobby
  socket.on('join_lobby', ({ lobbyId, username }, cb) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return cb && cb({ success: false, error: 'Lobby not found' });
    if (lobby.participants.length >= lobby.maxHumans) return cb && cb({ success: false, error: 'Lobby full' });
    socket.join(lobbyId);
    lobby.participants.push({ id: socket.id, username });
    io.to(lobbyId).emit('lobby_update', lobby);
    cb && cb({ success: true, lobby });
  });

  // Leave lobby
  socket.on('leave_lobby', ({ lobbyId }, cb) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return cb && cb({ success: false, error: 'Lobby not found' });
    lobby.participants = lobby.participants.filter(p => p.id !== socket.id);
    socket.leave(lobbyId);
    io.to(lobbyId).emit('lobby_update', lobby);
    cb && cb({ success: true });
  });

  
  socket.on('chat_message', async ({ lobbyId, username, message }, cb) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return cb && cb({ success: false, error: 'Lobby not found' });
    const msg = { sender: username, message, timestamp: Date.now() };
    lobby.messages.push(msg);
    lobby.messageCount = (lobby.messageCount || 0) + 1;
    io.to(lobbyId).emit('chat_message', msg);

    if (lobby.messageCount % 5 === 0) {
      const trivia = getRandomTrivia();
      const triviaMsg = { sender: 'Game', message: `Trivia: ${trivia}`, timestamp: Date.now(), isTrivia: true };
      lobby.messages.push(triviaMsg);
      io.to(lobbyId).emit('chat_message', triviaMsg);
    }

    if (lobby.bots && lobby.bots.length > 0) {
      setTimeout(async () => {
        try {
          const completion = await groq.chat.completions.create({
            model: 'llama3-8b-8192',
            messages: [
              { role: 'system', content: 'You are a friendly game chat bot.' },
              ...lobby.messages.slice(-10).map(m => ({ role: m.sender === 'ChatBot' ? 'assistant' : 'user', content: m.message }))
            ],
            max_tokens: 60,
            temperature: 0.7,
          });
          const botReply = completion.choices[0].message.content.trim();
          const botMsg = { sender: 'ChatBot', message: botReply, timestamp: Date.now(), avatar: '🤖' };
          lobby.messages.push(botMsg);
          io.to(lobbyId).emit('chat_message', botMsg);
        } catch (err) {
          console.error('Groq error:', err.message);
        }
      }, 2000);
    }
    cb && cb({ success: true });
  });

  socket.on('disconnect', () => {
    Object.values(lobbies).forEach(lobby => {
      const initialCount = lobby.participants.length;
      lobby.participants = lobby.participants.filter(p => p.id !== socket.id);
      if (initialCount > lobby.participants.length) {
        io.to(lobby.id).emit('lobby_update', lobby);
      }
    });
    io.emit('lobby_list', getLobbyList());
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});