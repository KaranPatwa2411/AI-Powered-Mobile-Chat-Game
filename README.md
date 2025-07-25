# AI-Powered Mobile Chat Game Prototype 🚀

This repository contains the source code for a functional Android prototype demonstrating real-time, mixed human-AI chat inside game lobbies. The project was built to fulfill the requirements of a take-home technical assessment.

-----

## Architecture

1.  **Client**: A React Native (Expo) application that runs on Android. It connects to the backend server via WebSocket.
2.  **Server**: A Node.js application using Express and Socket.IO. It manages game state, lobby data, and all real-time communication. It acts as a middleman between clients and the LLM.
3.  **LLM API**: The server communicates with the Groq API to generate dynamic AI bot responses and on-the-fly trivia questions.

-----

## Tech Stack & Libraries 🛠️

### Client (Frontend)

  * **Framework**: React Native (Expo)
  * **UI Components**: React Native Paper
  * **Navigation**: React Navigation
  * **Real-Time Communication**: `socket.io-client`

### Server (Backend)

  * **Runtime**: Node.js
  * **Framework**: Express.js
  * **Real-Time Communication**: Socket.IO
  * **AI Integration**: `openai` (configured for the Groq API)
  * **Environment**: `dotenv`

-----

## AI Integration & Prompt Strategy 🤖

The AI, powered by **Llama 3** via the Groq API, serves two distinct roles in the application.

### 1\. Conversational Chat Bot

  * **Goal**: To act as a friendly and engaging participant in the lobby chat.
  * **Prompt**: The bot is given a simple system prompt to define its personality:
    > `You are a friendly game chat bot.`
  * **Implementation**: The bot receives the last 10 messages from the chat history as context to generate a relevant, conversational reply within \~2-3 seconds.

### 2\. Dynamic Trivia Question Generation

  * **Goal**: To act as a game host by dynamically creating trivia questions and answers, removing the need for a predefined question bank.
  * **Prompt Strategy**: To ensure reliable, machine-readable output, the AI is given a very specific, zero-shot prompt that instructs it to respond *only* in JSON format.
    > `You are a trivia game host. Generate a single, random trivia question with a concise, one or two-word answer. Provide the output *only* in JSON format like this: {"question": "What is the capital of Canada?", "answer": "Ottawa"}. Do not include any other text, explanation, or markdown formatting.`
  * **Implementation**: When a trivia event is triggered, the server calls the LLM with this prompt. It then parses the JSON response to get the question and answer, which are used to manage the game state.

### Rate-Limit Handling

For this prototype, rate-limit handling is managed implicitly. The application relies on the default rate limits provided by the Groq API's free tier. In a production environment, a more robust strategy using a request queue and exponential backoff would be implemented on the server to handle potential `429 Too Many Requests` errors gracefully.

-----

## Build & Run Instructions ⚙️

### Prerequisites

  * Node.js (v18 or later)
  * An active internet connection
  * An Android device or emulator
  * A Groq API key (available for free from [groq.com](https://groq.com/))

### 1\. Backend Setup

```bash
# Navigate to the server directory
cd server

# Install dependencies
npm install

# Create a .env file in the /server directory and add your API key
echo "GROQ_API_KEY=YOUR_API_KEY_HERE" > .env

# Start the server
npm start
# The server will be running on http://localhost:3001
```

### 2\. Frontend Setup

Make sure your server is running first\!

```bash
# Navigate to the client directory
cd client

# Install dependencies
npm install

# IMPORTANT: In client/App.js, update the SOCKET_URL
# with the local IP address of the machine running the server.
# For example: const SOCKET_URL = 'http://192.168.1.10:3001';

# Start the Metro bundler
npx expo start
```

Once the bundler is running, scan the QR code with the Expo Go app on your Android device, or press `a` to launch the app on a connected Android emulator.

### 3\. Building the Signed APK

The project is configured to be built using Expo Application Services (EAS).

```bash
# Install the EAS CLI globally
npm install -g eas-cli

# Log in with your Expo account
eas login

# Configure the project for building
eas build:configure

# Start the Android build process
# EAS will guide you through creating a new Android Keystore for signing.
eas build --platform android
```

Once the build is complete, you will get a link to download the signed APK file.

-----

## Known Limitations & Future Work

### Limitations

  * **In-Memory State**: The server stores all lobby and chat data in memory. This means all data is lost if the server restarts.
  * **No Authentication**: Usernames are generated randomly and there is no user account system.
  * **Basic UI**: The user interface is functional but minimal, designed to demonstrate core features.

### Future Work

  * **Database Integration**: Integrate a database like MongoDB or Redis to persist lobby and user data.
  * **User Authentication**: Implement a proper login/registration system.
  * **Expanded Game Mechanics**: Add more complex games, scoring, and win/loss conditions.
  * **Private Lobby Invitations**: Create a system for users to share and join private lobbies via a unique link or code.
  * **Streaming AI Responses**: Implement response streaming from the LLM to the client for a more immediate "typing" effect from the AI bot.