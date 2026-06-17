# AGENTS.md — Neural Runner // 8-BIT

> Agent orientation file. Read this before touching any code in this repository.

---

## Project Overview

**Neural Runner // 8-BIT** is a browser-based endless runner game where the player character is controlled either via keyboard or via a live [Google Teachable Machine](https://teachablemachine.withgoogle.com/) model (image, pose, or audio) connected through a URL. The app runs in the browser and is built to be deployed on Google AI Studio / Cloud Run.

**Core concept:** Train a Teachable Machine model with body gestures (e.g., raise hand = jump, crouch = duck), paste its shareable URL into the panel, and control the runner in real time with your body.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript 5.8 |
| Build tool | Vite 6 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) |
| Icons | `lucide-react` |
| Animation | `motion` (Framer Motion v12) |
| AI SDK | `@google/genai` v2 |
| Server | Express 4 (for local API proxy if needed) |
| Env | `dotenv` |
| Type checking | `tsc --noEmit` (`npm run lint`) |

---

## Repository Structure

```
test-app/
├── index.html                  # Vite HTML entry point
├── vite.config.ts              # Vite config (React + Tailwind plugins, HMR control)
├── tsconfig.json               # TypeScript config (ESNext, react-jsx, bundler resolution)
├── package.json                # Scripts and dependencies
├── .env.example                # Required environment variables
├── AGENTS.md                   # ← You are here
├── TASKS.md                    # Active task list for ongoing agent work
├── PROMPTS.md                  # Prompt library / experiment log
├── README.md                   # User-facing setup instructions
├── metadata.json               # AI Studio app metadata
├── assets/                     # Static assets
└── src/
    ├── main.tsx                # React root mount
    ├── App.tsx                 # Root component — layout, state, event wiring
    ├── index.css               # Global styles + Tailwind directives
    ├── types.ts                # All shared TypeScript types and interfaces
    └── components/
        ├── GameCanvas.tsx      # Core game engine (canvas rendering, physics, game loop)
        ├── TeachableMachinePanel.tsx  # TM model URL input, class-to-action mapping, live inference
        └── SoundManager.ts     # Web Audio API sound effect engine
```

---

## Key Architecture Decisions

### State lives in `App.tsx`
`App.tsx` is the single source of truth for game-level state: `gameStatus`, `score`, `highScore`, `tmConnected`, `activeControl`, `isMuted`. Child components communicate upward via callbacks.

### `GameCanvas` is imperative via `useRef`
`GameCanvas.tsx` exposes an imperative handle (`GameCanvasHandle`) for actions like `startGame()`, `resetGame()`, `triggerJump()`, `triggerCrouch(bool)`, `toggleMute()`. The parent (`App.tsx`) calls these via `gameRef.current.*`. **Do not add React state to control game physics** — keep it in the canvas game loop.

### Teachable Machine integration is self-contained
`TeachableMachinePanel.tsx` loads `@teachablemachine/image`, `@teachablemachine/pose`, or `@teachablemachine/audio` dynamically from CDN (via `script` injection). It does prediction loops internally and calls `onAction` with `"JUMP" | "CROUCH" | "RELEASE"` when confidence thresholds are crossed.

### No React state in the game loop
`GameCanvas.tsx` uses `requestAnimationFrame` with `useRef` for all mutable game state (player position, velocity, obstacles, particles). Never pass game-loop variables as React props on every frame — it will cause re-renders.

### Sound is purely imperative
`SoundManager.ts` is a plain class (not a React component) that wraps the Web Audio API. It is instantiated once inside `GameCanvas` and called directly.

---

## Types (`src/types.ts`)

All shared types are defined here. The key ones:

```ts
type GameStatus = "IDLE" | "PLAYING" | "GAMEOVER";

type TMModelType = "IMAGE" | "POSE" | "AUDIO";

interface ModelClassMapping {
  className: string;         // e.g. "Raise Hand"
  action: "NONE" | "JUMP" | "CROUCH";
}

interface Obstacle {
  type: "CACTUS_S" | "CACTUS_L" | "PTERODACTYL_HIGH" | "PTERODACTYL_LOW" | "METEOR";
  // ... position, size, speed, frame
}
```

When adding new features, **extend types here first**, then implement.

---

## Environment Variables

Defined in `.env.example`. Copy to `.env.local` before running locally.

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key (injected by AI Studio at runtime) |
| `APP_URL` | Hosting URL (injected by AI Studio; used for self-referential links) |

> ⚠️ Never commit `.env.local`. It is listed in `.gitignore`.

---

## Scripts

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server at http://localhost:3000
npm run build        # Production bundle
npm run preview      # Preview production build
npm run lint         # Type-check with tsc --noEmit (no output files)
npm run clean        # Remove dist/ and server.js
```

**Always run `npm run lint` after making TypeScript changes** to catch type errors before committing.

---

## Coding Conventions

### TypeScript
- Strict mode is not explicitly enabled, but avoid `any`. Use proper types from `src/types.ts`.
- Use `type` for unions/aliases, `interface` for object shapes.
- All new shared types go in `src/types.ts`.
- Path alias `@/` resolves to the project root (e.g., `@/src/types`).

### React
- Functional components only. No class components.
- `useRef` for imperative handles and game-loop mutable state.
- `useState` for UI-level state only (not game physics).
- Props typed inline or with a named `interface` in the same file.

### Styling (Tailwind CSS v4)
- Use Tailwind utility classes directly in JSX. No separate CSS modules.
- The design language is **brutalist / retro arcade**: black backgrounds, white borders, red (`#ef4444`) accents, monospace fonts, sharp corners (`rounded-none`), pixel-shadow effects (`shadow-[4px_4px_0_0_#ef4444]`).
- Avoid introducing new color palettes without matching the existing aesthetic.
- All interactive elements must have a unique `id` attribute for browser testing.

### File organization
- One component per file.
- Non-React utilities (like `SoundManager.ts`) live in `src/components/` alongside components.
- No barrel `index.ts` files — import directly from the file.

---

## Game Logic Notes (for agents editing `GameCanvas.tsx`)

- **Game loop:** Driven by `requestAnimationFrame` stored in a ref. Call `cancelAnimationFrame` on cleanup.
- **Physics constants** (gravity, jump velocity, speed progression) are defined as `const` at the top of the file. Tweak these first when adjusting feel.
- **Obstacle spawning** is time/score based. Higher score → faster obstacles → shorter spawn intervals.
- **Collision detection** uses AABB (axis-aligned bounding boxes) with a configurable hitbox shrink factor to make it feel fair.
- **Particles** (dust, explosion, stars) are stored in a ref array and updated each frame.
- **Score** is passed up via the `onScoreChange` callback prop — only call this when the integer part changes to avoid excessive parent re-renders.

---

## Teachable Machine Panel Notes (for agents editing `TeachableMachinePanel.tsx`)

- The panel dynamically injects Teachable Machine CDN scripts on first load.
- Supports three model types: `IMAGE`, `POSE`, `AUDIO`. Type is auto-detected from the model metadata.
- Each class can be mapped to `NONE`, `JUMP`, or `CROUCH` via a dropdown per class.
- Confidence threshold is user-configurable via a slider.
- The prediction loop runs via `setInterval` (or `requestAnimationFrame` for pose) inside the component and is cleared on unmount.
- Camera access requires HTTPS or `localhost`. Webcam permission errors surface to the user via in-panel error state.

---

## Do's and Don'ts for Agents

### ✅ Do
- Run `npm run lint` after any TypeScript change.
- Keep all new shared types in `src/types.ts`.
- Follow the existing brutalist design system when adding UI.
- Add `id` attributes to all new interactive elements.
- Write clear, concise inline comments for non-obvious game logic.
- Update `TASKS.md` with progress notes when working on a multi-step task.

### ❌ Don't
- Don't add React state to the game loop inside `GameCanvas.tsx`.
- Don't introduce new UI libraries or icon sets — use `lucide-react`.
- Don't change Tailwind to a different CSS solution.
- Don't commit secrets or API keys.
- Don't use `any` in TypeScript — look up the correct type or add one to `types.ts`.
- Don't create barrel `index.ts` export files.
- Don't run `npm run build` unless explicitly asked — use `npm run dev` for local testing.

---

## Common Agent Tasks

### Add a new obstacle type
1. Add the type string to the `Obstacle.type` union in `src/types.ts`.
2. Add spawn logic in `GameCanvas.tsx` (search for `spawnObstacle`).
3. Add render logic in the canvas draw loop (search for `drawObstacle`).
4. Add collision hitbox dimensions to the hitbox config object.

### Add a new sound effect
1. Open `src/components/SoundManager.ts`.
2. Add a new method that uses the Web Audio API oscillator / buffer pattern matching the existing methods.
3. Call the method from `GameCanvas.tsx` at the appropriate game event.

### Change game speed / difficulty
- Physics constants are at the top of `GameCanvas.tsx`. Look for `BASE_SPEED`, `SPEED_INCREMENT`, `GRAVITY`, `JUMP_VELOCITY`.

### Add a new UI panel or section
1. Create a new component file in `src/components/`.
2. Import and wire it in `App.tsx`.
3. Follow the existing Tailwind brutalist class patterns.
4. Ensure all interactive elements have unique `id` attributes.

### Integrate a Gemini AI feature
- Use the `@google/genai` SDK already installed.
- Read the API key from `import.meta.env.VITE_GEMINI_API_KEY` (Vite exposes env vars with `VITE_` prefix on the client).
- For server-side calls (to keep the key hidden), use the Express server pattern and add an endpoint.