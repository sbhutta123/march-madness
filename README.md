# 🏀 March Madness AI Predictor

AI-powered predictions for the NCAA Men's and Women's March Madness tournaments, built with **Next.js** (frontend) and **Node/Express** (backend), using the **Anthropic Claude API**.

- **Frontend** → GitHub Pages (static export)
- **Backend** → Railway (Express API server)

---

## Project Structure

```
march-madness/
├── frontend/          # Next.js app (static export → GitHub Pages)
└── backend/           # Express API server (→ Railway)
```

---

## 1. Backend Setup (Railway)

### Local development
```bash
cd backend
npm install
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and FRONTEND_ORIGIN in .env
npm run dev
```

### Deploy to Railway
1. Go to [railway.app](https://railway.app) and create a new project
2. Connect your GitHub repo and select the **`backend/`** folder as root
3. Add environment variables in Railway dashboard:
   - `ANTHROPIC_API_KEY` → your key from [console.anthropic.com](https://console.anthropic.com)
   - `FRONTEND_ORIGIN` → your GitHub Pages URL (e.g. `https://username.github.io`)
   - `PORT` → Railway sets this automatically, no need to set manually
4. Deploy. Copy your Railway public URL (e.g. `https://march-madness-backend.up.railway.app`)

---

## 2. Frontend Setup (GitHub Pages)

### Local development
```bash
cd frontend
npm install
cp .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:3001 in .env.local
npm run dev
```

### Configure for your repo
In `frontend/next.config.js`, uncomment and update `basePath` and `assetPrefix`:
```js
basePath: "/YOUR_REPO_NAME",
assetPrefix: "/YOUR_REPO_NAME/",
```
(Skip this if the repo name is the root GitHub Pages domain like `username.github.io`)

### Deploy to GitHub Pages
1. In your GitHub repo → **Settings → Pages** → set source to **GitHub Actions**
2. In your GitHub repo → **Settings → Secrets → Actions**, add:
   - `NEXT_PUBLIC_API_URL` → your Railway backend URL
3. Push to `main` — the GitHub Actions workflow will build and deploy automatically

---

## 3. Backend CORS Update

Once you know your GitHub Pages URL, update `backend/server.js`:
```js
process.env.FRONTEND_ORIGIN || "https://YOUR_GITHUB_USERNAME.github.io",
```
Or just set `FRONTEND_ORIGIN` in your Railway environment variables.

---

## Features

- Predict any Men's or Women's matchup by round
- Ask freeform questions (championship picks, Cinderella picks, upset risks)
- Confidence meter, key factors, analysis, and dark horse picks
- Rate limiting (30 req / 15 min per IP)
- Auto-deploy via GitHub Actions on every push to `main`

---

## Tech Stack

| Layer     | Technology                    |
|-----------|-------------------------------|
| Frontend  | Next.js 14, TypeScript, Tailwind CSS |
| Backend   | Node.js, Express              |
| AI        | Anthropic Claude API          |
| Hosting   | GitHub Pages + Railway        |
| CI/CD     | GitHub Actions                |

---

## Getting Your Anthropic API Key

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Go to **API Keys** → **Create Key**
3. Add it as `ANTHROPIC_API_KEY` in your Railway environment
