# AI Career Guidance & Adaptive Study Planner

A full-stack AI mentor that suggests careers, identifies skill gaps, creates adaptive study plans, tracks progress, and answers career questions in chat.

## Stack

- Frontend: React + Vite
- Styling: Tailwind via CDN + custom CSS
- Backend: Node.js + Express
- AI: OpenAI Responses API
- Storage: PostgreSQL via `pg` with a local JSON fallback when `DATABASE_URL` is unset

## What ships

- Multi-step onboarding with interests, strengths, current skills, study time, and goal
- `POST /generate-careers` for 2-3 personalized career matches
- `POST /skill-gap` for required vs. current skills
- `POST /generate-plan` for a 1-2 hour daily adaptive study plan
- `POST /update-plan` for easier or harder plan revisions
- `POST /chat` for an AI mentor conversation
- Dashboard, planner, progress, and mentor chat screens
- Dark mode toggle and responsive layout

## Project Structure

```txt
backend/
  src/
    app.js
    server.js
    config/db.js
    lib/ai.js
    lib/careerData.js
    lib/store.js
    routes/
      users.js
      careers.js
      plans.js
      chat.js
  .env.example

frontend/
  index.html
  src/
    CareerApp.jsx
    main.jsx
    styles.css
```

## Run Locally

### Backend

```bash
cd backend
npm install
npm run dev
```

Create `backend/.env` from `.env.example` and set:

- `DATABASE_URL`
- `GOOGLE_CLIENT_ID`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` if you want to override the default model

The backend runs locally on `http://localhost:5000`.
The deployed backend is `https://ai-study-planner-bgvf.onrender.com`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs locally on `http://localhost:5173`.
The deployed frontend is `https://ai-study-planner-drab.vercel.app/`.

Set `VITE_GOOGLE_CLIENT_ID` in `frontend/.env` to the same Google OAuth client ID.

## Environment

### `backend/.env.example`

```env
PORT=5000
CLIENT_ORIGIN=https://ai-study-planner-drab.vercel.app
GOOGLE_CLIENT_ID=your_google_client_id
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_career_guidance
DATABASE_SSL=false
DATABASE_SSL_REJECT_UNAUTHORIZED=true
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.4
```

## Notes

- The backend uses strict JSON schemas for AI responses.
- The backend auto-creates its PostgreSQL tables on startup.
- If `OPENAI_API_KEY` is missing, the backend falls back to deterministic local logic so the app still runs.
- If `DATABASE_URL` is unset, data persists to `backend/data/career-planner-state.json` as a safe development fallback.

## OpenAI choice

The code defaults to `gpt-5.4`, which the current OpenAI model docs describe as the strongest option for agentic, coding, and professional workflows.
