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

async function generateTriviaQuestion() {
  try {
    const prompt = `You are a trivia game host. Generate a single, random trivia question with a concise, one or two-word answer. Provide the output *only* in JSON format like this: {"question": "What is the capital of Canada?", "answer": "Ottawa"}. Do not include any other text, explanation, or markdown formatting.`;
    const completion = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [{ role: 'system', content: prompt }],
      temperature: 1.2,
    });
    const content = completion.choices[0].message.content;
    const trivia = JSON.parse(content);
    if (trivia.question && trivia.answer) {
      return trivia;
    }
    return null;
  } catch (err) {
    console.error("Failed to generate or parse trivia question:", err);
    return null;
  }
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const lobbies = {};
const lobbyTimers = {};

function getLobbyList() {
  return Object.values(lobbies)
    .filter(lobby => !lobby.isPrivate)
    .map(lobby => ({
      id: lobby.id,
      name: lobby.name,
      participants: lobby.participants.length,
      bots: lobby.bots.length,
    }));
}

async function triggerTrivia(lobbyId) {
  const lobby = lobbies[lobbyId];
  if (lobby && !lobby.triviaState.isTriviaActive && lobby.participants.length > 0) {
    console.log(`Triggering trivia for lobby: ${lobby.name}`);
    const trivia = await generateTriviaQuestion();
    if (trivia) {
      lobby.triviaState.isTriviaActive = true;
      lobby.triviaState.question = trivia.question;
      lobby.triviaState.answer = trivia.answer;
      const triviaMsg = { sender: 'ChatBot', message: `TRIVIA TIME: ${trivia.question}`, timestamp: Date.now() };
      lobby.messages.push(triviaMsg);
      io.to(lobbyId).emit('chat_message', triviaMsg);
      return true;
    }
  }
  return false;
}

io.on('connection', (socket) => {
  socket.on('get_lobbies', () => {
    socket.emit('lobby_list', getLobbyList());
  });

  
  socket.on('create_lobby', ({ name, isPrivate, maxHumans, maxBots }, cb) => {
    const id = 'lobby_' + Math.random().toString(36).substr(2, 9);
    
    
    const bots = [];
    if (maxBots && maxBots > 0) {
        for (let i = 0; i < maxBots; i++) {
            bots.push({
                id: `bot_${i+1}`,
                name: 'ChatBot'
            });
        }
    }

    lobbies[id] = {
      id, name, isPrivate, maxHumans, maxBots,
      participants: [], 
      bots: bots, 
      messages: [], 
      messageCount: 0,
      triviaState: { isTriviaActive: false, question: null, answer: null },
    };
    
    const intervalId = setInterval(() => triggerTrivia(id), 90000);
    lobbyTimers[id] = { intervalId, cleanupTimerId: null };

    io.emit('lobby_list', getLobbyList());
    cb && cb({ success: true, id });
  });

  socket.on('join_lobby', ({ lobbyId, username }, cb) => {
    const lobby = lobbies[lobbyId];
    const timers = lobbyTimers[lobbyId];
    if (!lobby) return cb && cb({ success: false, error: 'Lobby not found' });
    if (lobby.participants.length >= lobby.maxHumans) return cb && cb({ success: false, error: 'Lobby full' });
    if (timers && timers.cleanupTimerId) {
      clearTimeout(timers.cleanupTimerId);
      timers.cleanupTimerId = null;
    }
    socket.join(lobbyId);
    lobby.participants.push({ id: socket.id, username });
    io.to(lobbyId).emit('lobby_update', lobby);
    cb && cb({ success: true, lobby });
  });

  function scheduleLobbyCleanup(lobbyId) {
    const lobby = lobbies[lobbyId];
    const timers = lobbyTimers[lobbyId];
    if (lobby && lobby.participants.length === 0 && timers) {
      console.log(`Lobby ${lobby.name} is empty. Scheduling cleanup in 5 minutes.`);
      timers.cleanupTimerId = setTimeout(() => {
        const currentLobby = lobbies[lobbyId];
        const currentTimers = lobbyTimers[lobbyId];
        if (currentLobby && currentLobby.participants.length === 0) {
          console.log(`Cleaning up empty lobby: ${currentLobby.name}`);
          clearInterval(currentTimers.intervalId);
          delete lobbies[lobbyId];
          delete lobbyTimers[lobbyId];
          io.emit('lobby_list', getLobbyList());
        }
      }, 300000);
    }
  }

  socket.on('leave_lobby', ({ lobbyId }, cb) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return cb && cb({ success: false, error: 'Lobby not found' });
    lobby.participants = lobby.participants.filter(p => p.id !== socket.id);
    socket.leave(lobbyId);
    io.to(lobbyId).emit('lobby_update', lobby);
    cb && cb({ success: true });
    if (lobby.participants.length === 0) {
      scheduleLobbyCleanup(lobbyId);
    }
  });
  
  socket.on('disconnect', () => {
    for (const lobbyId in lobbies) {
        const lobby = lobbies[lobbyId];
        const participantIndex = lobby.participants.findIndex(p => p.id === socket.id);
        if (participantIndex !== -1) {
            lobby.participants.splice(participantIndex, 1);
            if (lobby.participants.length === 0) {
                scheduleLobbyCleanup(lobbyId);
            }
            io.to(lobbyId).emit('lobby_update', lobby);
            break;
        }
    }
    io.emit('lobby_list', getLobbyList());
  });

  socket.on('chat_message', async ({ lobbyId, username, message }, cb) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return cb && cb({ success: false, error: 'Lobby not found' });

    if (lobby.triviaState.isTriviaActive && message.trim().toLowerCase() === lobby.triviaState.answer.toLowerCase()) {
      const winnerMessage = `${username} is correct! The answer was: ${lobby.triviaState.answer}`;
      const botMsg = { sender: 'ChatBot', message: winnerMessage, timestamp: Date.now() };
      io.to(lobbyId).emit('chat_message', botMsg);
      lobby.messages.push(botMsg);
      lobby.triviaState = { isTriviaActive: false, question: null, answer: null };
      return cb && cb({ success: true });
    }

    const msg = { sender: username, message, timestamp: Date.now() };
    lobby.messages.push(msg);
    io.to(lobbyId).emit('chat_message', msg);
    lobby.messageCount = (lobby.messageCount || 0) + 1;

    if (lobby.messageCount % 5 === 0) {
      const wasTriviaTriggered = await triggerTrivia(lobbyId);
      if (wasTriviaTriggered) {
        return cb && cb({ success: true });
      }
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
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});