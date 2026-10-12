# 🤖 Gemini & Supabase AI Chatbot

A high-performance, full-stack AI Chatbot application powered by **Google Gemini** for intelligent reasoning and **Supabase** for cloud conversation persistence, structured as a clean, decoupled **Frontend** and **Backend**.

---

## 📁 Project Architecture

```text
auction/
├── backend/                  # Node.js + Express API Backend (Deploy to Render)
│   ├── .env.gemini           # Gemini API key
│   ├── .env.supabase         # Supabase credentials
│   ├── .env                  # General backend port/config
│   ├── package.json          # Express, @google/genai, @supabase/supabase-js
│   ├── render.yaml           # Render deployment blueprint
│   ├── server.js             # API server & streaming SSE endpoints
│   └── supabase_schema.sql   # Database setup script
│
├── frontend/                 # Vanilla CSS & JS Web App (Deploy to Vercel)
│   ├── css/
│   │   └── style.css         # Glassmorphic styling system & animations
│   ├── js/
│   │   └── app.js            # Client chat state, markdown rendering & SSE stream
│   ├── index.html            # Main web application layout
│   ├── package.json          # Frontend development scripts
│   └── vercel.json           # Vercel deployment config
│
├── DEPLOYMENT.md             # Complete step-by-step Render + Vercel deployment guide
└── package.json              # Monorepo root scripts
```

---

## ✨ Features

- 🧠 **Google Gemini 2.5 Flash / 1.5 Pro:** Fast, intelligent generative responses with real-time SSE (Server-Sent Events) streaming.
- 🗄️ **Supabase Cloud Persistence:** Multi-turn chat history and session management stored in PostgreSQL with Row Level Security (RLS).
- ⚡ **Decoupled Architecture:** Clean separation allowing backend hosting on Render and frontend hosting on Vercel.
- 🎨 **Glassmorphism UI:** Ultra-modern dark aesthetic, glowing neon accents, and smooth animations.
- 📝 **Rich Markdown & Code Highlighting:** Automated syntax highlighting (via highlight.js) with 1-click **Copy Code** headers.
- ⚙️ **In-App Settings & DB Diagnostics:** Enter or test your Gemini API Key and Supabase credentials directly in the UI without restarting the server.
- 🔊 **Voice Speech Synthesis:** Text-to-speech button to read AI responses aloud.
- 💾 **Export Chats:** 1-click export of any conversation as formatted Markdown.

---

## 🚀 Running Locally

### 1. Start Backend Server
From the root directory:
```bash
npm start
```
Or from the `backend/` directory:
```bash
cd backend
npm start
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser! The backend serves both the API endpoints (`/api/*`) and the frontend files from [`frontend/`](frontend/).

---

## 🌐 Deploying to Render (Backend) and Vercel (Frontend)

Refer to the complete, step-by-step guide in **[DEPLOYMENT.md](DEPLOYMENT.md)**:
1. **Render (Backend):** Set Root Directory to `backend`, Build Command to `npm install`, Start Command to `npm start`.
2. **Vercel (Frontend):** Set Root Directory to `frontend`, Framework to `Other`.
3. **Connect:** Enter your Render URL in the frontend's **Settings (⚙️)** modal.
