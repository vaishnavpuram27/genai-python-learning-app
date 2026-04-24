# PyLearn — K-12 Python Learning Platform

An AI-powered web platform for teaching Python to middle school students (ages 11–14). Teachers build structured curricula with lessons, quizzes, and coding exercises; students work through them at their own pace with a built-in AI tutor.

---

## Features

### For Teachers
- **Class management** — create classes, generate join codes, and enroll students
- **Curriculum builder** — organize content into topics with drag-and-drop reordering
- **Three content types** — learning items (markdown lessons), MCQ quizzes, and coding practice exercises
- **AI Teaching Assistant** — generate lessons, quizzes, and practice problems via chat; inline text editing with AI suggestions
- **AI Tutor settings** — configure persona name, tone, per-topic notes, and assessment instructions for the student AI
- **Live student stats** — track per-student progress, quiz attempts, and AI interaction logs
- **Quiz settings** — set max points and deadlines per quiz

### For Students
- **Step-by-step lessons** — readable markdown content with syntax-highlighted code blocks
- **MCQ & short-answer quizzes** — with auto-grading and teacher feedback
- **Coding practice** — in-browser Python editor (Skulpt) with test case execution and hints
- **AI Tutor** — context-aware chat assistant with "I'm stuck" mode and text-select "Explain this"
- **Progress tracking** — per-item completion status and overall class progress

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, CSS (no UI library) |
| Backend | Node.js, Express 4, ES Modules |
| Database | MongoDB via Mongoose |
| Auth | JWT Bearer tokens (student / teacher roles) |
| AI | OpenAI `gpt-4.1-mini` — streaming SSE |
| Python runtime | Skulpt (CDN) |
| Code editor | Ace Editor (CDN) |

---

## Project Structure

```
PythonLearning/
├── backend/
│   ├── controllers/        # Request handlers
│   ├── middleware/         # Auth middleware
│   ├── models/             # Mongoose schemas
│   │   ├── User.js
│   │   ├── Classroom.js
│   │   ├── Topic.js
│   │   ├── TopicItem.js
│   │   ├── Lesson.js
│   │   ├── QuizAttempt.js
│   │   ├── LessonProgress.js
│   │   └── AIInteraction.js
│   ├── routes/v1/          # API routes
│   ├── services/           # Business logic & AI pipeline
│   │   └── chatService.js  # All AI prompt building
│   ├── utils/
│   ├── tests/
│   ├── server.js
│   └── .env.example
└── frontend/
    └── src/
        ├── components/     # Shared UI components
        ├── contexts/       # React contexts (Auth, Router, App, Class)
        ├── pages/          # Page-level components
        ├── utils/          # API helpers, parsers
        └── App.jsx
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (or local MongoDB)
- OpenAI API key

### 1. Clone the repo

```bash
git clone <repo-url>
cd PythonLearning
```

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

```env
PORT=5001
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/pylearn
JWT_SECRET=your_secret_here
OPENAI_API_KEY=sk-...
```

### 3. Install dependencies

```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 4. Run in development

```bash
# Terminal 1 — backend (port 5001)
cd backend && npm run dev

# Terminal 2 — frontend (port 5173)
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The Vite dev server proxies `/api` → `http://localhost:5001`.

---

## API Overview

All routes are prefixed with `/api/v1`.

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/auth/register` | Register a new user |
| POST | `/auth/login` | Log in and receive a JWT |
| GET | `/classes` | List classes for the authenticated user |
| POST | `/classes` | Create a class (teacher) |
| POST | `/classes/join` | Join a class with a code (student) |
| GET | `/classes/:id/topics` | Get topics and items for a class |
| POST | `/classes/:id/topics` | Create a topic |
| GET | `/classes/:id/stats` | Class-wide statistics (teacher) |
| GET | `/classes/:id/my-progress` | Student's own progress |
| GET | `/classes/:id/ai-config` | Get AI tutor configuration |
| PUT | `/classes/:id/ai-config` | Update AI tutor configuration |
| POST | `/chat` | Stream AI chat response (SSE) |
| GET | `/lessons/:id` | Get lesson content |

---

## AI Architecture

### Teacher pipeline
Single streaming call → `gpt-4.1-mini` → SSE to client.

The teacher assistant can generate structured content via fenced JSON blocks:
- ` ```mcq-json ` — multiple choice question
- ` ```sa-json ` — short answer question
- ` ```practice-json ` — coding exercise
- ` ```learning-json ` — lesson content
- ` ```quiz-config-json ` — quiz settings (deadline, max points)

### Student pipeline
Two-agent system:
1. **Analyst** (non-streaming, 350 tokens) — reads student context, determines scaffolded response strategy
2. **Simplifier** (streaming, ≤120 tokens, ≤3 sentences) — rewrites response in plain language for ages 11–14

When `isStuck = true`, the pipeline switches to guided scaffolding mode with numbered steps instead of Socratic questions.

---

## Running Tests

```bash
# Backend
cd backend && npm test

# Frontend
cd frontend && npm test
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Backend server port (default: 5001) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `OPENAI_API_KEY` | OpenAI API key |

---

## Roles

| Role | Capabilities |
|------|-------------|
| `teacher` | Create/manage classes, build curriculum, access AI assistant, view all student data |
| `student` | Join classes, complete lessons/quizzes/practice, chat with AI tutor |
