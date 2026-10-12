# 🚀 Deployment Guide: Render (Backend) + Vercel (Frontend)

This guide walks you through deploying your Gemini & Supabase Chatbot with **Render** hosting the `backend/` directory and **Vercel** hosting the `frontend/` directory.

```text
┌──────────────────────────────────────┐          ┌──────────────────────────────────────┐
│          Vercel (Frontend)           │  fetch() │           Render (Backend)           │
│   https://your-chatbot.vercel.app    ├─────────►│  https://your-chatbot.onrender.com   │
│         (frontend/ directory)        │          │         (backend/ directory)         │
└──────────────────────────────────────┘          └──────────────────┬───────────────────┘
                                                                     │
                                                     ┌───────────────┴───────────────┐
                                                     ▼                               ▼
                                         ┌───────────────────────┐       ┌───────────────────────┐
                                         │    Google Gemini      │       │   Supabase Database   │
                                         │   Generative AI SDK   │       │ PostgreSQL / Messages │
                                         └───────────────────────┘       └───────────────────────┘
```

---

## 📁 Project Structure

```text
auction/
├── backend/                  <-- Deploy this directory to Render
│   ├── .env.gemini.example
│   ├── .env.supabase.example
│   ├── .env.example
│   ├── package.json
│   ├── render.yaml
│   ├── server.js
│   └── supabase_schema.sql
│
├── frontend/                 <-- Deploy this directory to Vercel
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── app.js
│   ├── index.html
│   ├── package.json
│   └── vercel.json
│
├── DEPLOYMENT.md
└── README.md
```

---

## Part 1: Push Code to GitHub

From your repository root:
```bash
git init
git add .
git commit -m "Separate frontend and backend architecture"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```
*(Your secret files like `.env`, `.env.gemini`, and `.env.supabase` are automatically ignored by `.gitignore`).*

---

## Part 2: Deploy Backend to Render

1. Log into your **[Render Dashboard](https://dashboard.render.com)**.
2. Click **New +** ➔ **Web Service**.
3. Connect your GitHub repository.
4. Fill in the service settings:
   - **Name:** `gemini-chatbot-backend`
   - **Region:** Any region (e.g., `Oregon (US West)` or `Frankfurt`)
   - **Branch:** `main`
   - **Root Directory:** 👉 `backend` 👈 *(Important: set this to backend)*
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Under **Environment Variables**, add:
   | Key | Value | Notes |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Production mode |
   | `GEMINI_API_KEY` | `your_gemini_api_key` | From Google AI Studio |
   | `SUPABASE_URL` | `https://your-project.supabase.co` | From Supabase Project Settings |
   | `SUPABASE_ANON_KEY` | `eyJhbGci...` | From Supabase Project Settings |
6. Click **Create Web Service**.
7. Once deployed, copy your Render URL (e.g., `https://gemini-chatbot-backend.onrender.com`).
   - Check `https://gemini-chatbot-backend.onrender.com/health` to confirm it returns `OK`.

---

## Part 3: Deploy Frontend to Vercel

1. Log into your **[Vercel Dashboard](https://vercel.com/dashboard)**.
2. Click **Add New…** ➔ **Project**.
3. Import your GitHub repository.
4. In the **Configure Project** screen:
   - **Project Name:** `gemini-chatbot-frontend`
   - **Framework Preset:** `Other`
   - **Root Directory:** Click **Edit** and select 👉 `frontend` 👈 *(Important: set this to frontend)*
   - **Build and Output Settings:** Leave default.
5. Click **Deploy**.
6. Vercel will deploy your frontend in seconds (e.g., `https://gemini-chatbot-frontend.vercel.app`).

---

## Part 4: Connect Frontend to Backend

1. Open your live Vercel frontend in your browser.
2. Click the **Settings (⚙️)** button at the bottom of the sidebar.
3. In the **Backend Server URL (Render)** field, paste your Render URL:
   ```text
   https://gemini-chatbot-backend.onrender.com
   ```
4. Click **Save Configuration**.
5. Your Vercel frontend is now live and communicating with your Render backend!

---

## 💻 Local Development

To run the project locally on your machine:
```bash
# Run backend server (from project root)
npm start

# Or directly in backend folder:
cd backend
npm start
```
The backend server runs at `http://localhost:3000` and automatically connects to the frontend in `frontend/`.
