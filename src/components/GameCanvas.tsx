/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { GameStatus, Obstacle, Player, Particle } from "../types";
import { sfx } from "./SoundManager";

// 8-Bit Pixel Sprites defined as grids (1 = color, 0 = transparent, other letters for shades)
// Dino Sprites (16x16 Grid)
const DINO_RUN_1 = [
  "....#####.......",
  "....######.##...",
  "....######......",
  "....#...###.....",
  "....#######.....",
  "###.#######.....",
  "###########.....",
  "###########.....",
  "###########.....",
  ".#########......",
  "..#######.......",
  "...#####........",
  "....####........",
  "....##.#........",
  "....#..#........",
  "....##.##.......",
];

const DINO_RUN_2 = [
  "....#####.......",
  "....######.##...",
  "....######......",
  "....#...###.....",
  "....#######.....",
  "###.#######.....",
  "###########.....",
  "###########.....",
  "###########.....",
  ".#########......",
  "..#######.......",
  "...#####........",
  "....####........",
  "....#.##........",
  "....#..#........",
  "....##.##.......",
];

const DINO_DUCK_1 = [
  "..........#####.",
  "......#########.",
  "......#########.",
  "......#..######.",
  "......#########.",
  "#######.#######.",
  "###############.",
  "###############.",
  ".#############..",
  "..###########...",
  "...#########....",
  "....#######.....",
  "....##...##.....",
];

const DINO_DUCK_2 = [
  "..........#####.",
  "......#########.",
  "......#########.",
  "......#..######.",
  "......#########.",
  "#######.#######.",
  "###############.",
  "###############.",
  ".#############..",
  "..###########...",
  "...#########....",
  "....#######.....",
  "....#.....#.....",
];

const DINO_DEAD = [
  "....#####.......",
  "....######.XX...",
  "....######......",
  "....#...###.....",
  "....#######.....",
  "###.#######.....",
  "###########.....",
  "###########.....",
  "###########.....",
  ".#########......",
  "..#######.......",
  "...#####........",
  ".##.#####.##....",
  "..##.###.##.....",
  "....##.##.......",
  ".....###........",
];

// Cactus Sprites (12x18 Grid)
const CACTUS_SMALL = [
  "....##......",
  "....##......",
  "..####......",
  ".##.##......",
  ".##.##......",
  ".##.##...##.",
  ".#####..###.",
  "..####.####.",
  "....######..",
  "....####....",
  "....##......",
  "....##......",
  "....##......",
  "....##......",
  "....##......",
  "....##......",
  "....##......",
  "....##......",
];

const CACTUS_LARGE = [
  ".....###.....",
  ".....###.....",
  ".....###.....",
  "..######.....",
  ".###.###.....",
  ".###.###.###.",
  ".###.###.###.",
  ".#######.###.",
  "..##########.",
  ".....######..",
  ".....###.....",
  ".....###.....",
  ".....###.....",
  ".....###.....",
  ".....###.....",
  ".....###.....",
  ".....###.....",
  ".....###.....",
  ".....###.....",
  ".....###.....",
];

// Pterodactyl Sprites (18x12 Grid)
const PTERODACTYL_FLAP_1 = [
  "......##..........",
  "....####..........",
  "..######..####....",
  "########.####.....",
  "##########........",
  "##########.###....",
  ".########.###.....",
  "..######..........",
  "...####...........",
  "....##............",
  "..................",
  "..................",
];

const PTERODACTYL_FLAP_2 = [
  "......##..........",
  "....####..........",
  "..######..####....",
  "########.####.....",
  "##########........",
  "##########.###....",
  ".########.###.....",
  "..######..........",
  "....##..##........",
  "....######........",
  ".....####.........",
  "......##..........",
];

// Meteor / Fireball (14x12)
const METEOR = [
  "...######.....",
  "..########....",
  ".#########..#.",
  "##########.##.",
  "#############.",
  "##########.##.",
  "#########..#.",
  "..########....",
  "...######.....",
  "....####......",
  ".....##.......",
  "......#.......",
];

interface GameCanvasProps {
  onScoreChange: (score: number) => void;
  onHighScoreChange: (highScore: number) => void;
  onStatusChange: (status: GameStatus) => void;
  activeControlSource: "KEYBOARD" | "TEACHABLE_MACHINE" | "NONE";
}

export interface GameCanvasHandle {
  startGame: () => void;
  resetGame: () => void;
  triggerJump: () => void;
  triggerCrouch: (isPressed: boolean) => void;
  toggleMute: () => boolean;
  isMuted: () => boolean;
}

export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(
  ({ onScoreChange, onHighScoreChange, onStatusChange, activeControlSource }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Dynamic Game State variables managed via ref for the physics loop
    const stateRef = useRef<{
      status: GameStatus;
      score: number;
      highScore: number;
      speedMultiplier: number;
      player: Player;
      obstacles: Obstacle[];
      particles: Particle[];
      groundOffset: number;
      obstacleTimer: number;
      nextObstacleSpawnTime: number;
      animationFrameId: number;
      lastTime: number;
      stars: { x: number; y: number; size: number; speed: number }[];
      clouds: { x: number; y: number; width: number; speed: number }[];
      jumpRequested: boolean;
      crouchRequested: boolean;
    }>({
      status: "IDLE",
      score: 0,
      highScore: parseInt(localStorage.getItem("8bit_high_score") || "0", 10),
      speedMultiplier: 1.0,
      player: {
        x: 50,
        y: 154, // Rest on ground
        width: 44,
        height: 44,
        velocityY: 0,
        isJumping: false,
        isDoubleJumping: false,
        isCrouching: false,
        animFrame: 0,
      },
      obstacles: [],
      particles: [],
      groundOffset: 0,
      obstacleTimer: 0,
      nextObstacleSpawnTime: 90,
      animationFrameId: 0,
      lastTime: 0,
      stars: [],
      clouds: [],
      jumpRequested: false,
      crouchRequested: false,
    });

    // Mirroring statuses to React state for UI rendering
    const [gameState, setGameState] = useState<GameStatus>("IDLE");
    const [currentScore, setCurrentScore] = useState<number>(0);
    const [highScore, setHighScore] = useState<number>(stateRef.current.highScore);
    const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);
    const [soundMuted, setSoundMuted] = useState<boolean>(!sfx.isSoundEnabled());

    const GROUND_Y = 190;
    const GRAVITY = 0.58;
    const JUMP_FORCE = -10.5;
    const DOUBLE_JUMP_FORCE = -8.5;
    const BASE_SPEED = 6.2;

    // Standard high score publisher
    const updateScores = (newScore: number) => {
      stateRef.current.score = newScore;
      setCurrentScore(newScore);
      onScoreChange(newScore);

      // Milestone trigger (Every 100 points, play point sfx)
      if (newScore > 0 && newScore % 100 === 0) {
        sfx.playMilestone();
        // Give a little sparkle of explosion stars
        createParticleSparkle(GROUND_Y - 40, "#FBBF24");
      }

      if (newScore > stateRef.current.highScore) {
        stateRef.current.highScore = newScore;
        setHighScore(newScore);
        localStorage.setItem("8bit_high_score", newScore.toString());
        onHighScoreChange(newScore);
      }
    };

    const createParticleSparkle = (y: number, color: string) => {
      for (let i = 0; i < 15; i++) {
        stateRef.current.particles.push({
          x: stateRef.current.player.x + 30,
          y,
          size: Math.random() * 4 + 2,
          vx: (Math.random() - 0.2) * 5,
          vy: (Math.random() - 0.5) * 8 - 2,
          color,
          alpha: 1.0,
          type: "STAR",
        });
      }
    };

    // Public controller interface
    useImperativeHandle(ref, () => ({
      startGame: () => {
        if (stateRef.current.status !== "PLAYING") {
          sfx.playStart();
          stateRef.current.status = "PLAYING";
          stateRef.current.score = 0;
          stateRef.current.speedMultiplier = 1.0;
          stateRef.current.obstacles = [];
          stateRef.current.particles = [];
          stateRef.current.player.y = GROUND_Y - stateRef.current.player.height;
          stateRef.current.player.velocityY = 0;
          stateRef.current.player.isJumping = false;
          stateRef.current.player.isDoubleJumping = false;
          stateRef.current.player.isCrouching = false;
          
          setGameState("PLAYING");
          onStatusChange("PLAYING");
          updateScores(0);
        }
      },
      resetGame: () => {
        sfx.playStart();
        stateRef.current.status = "PLAYING";
        stateRef.current.score = 0;
        stateRef.current.speedMultiplier = 1.0;
        stateRef.current.obstacles = [];
        stateRef.current.particles = [];
        stateRef.current.player.y = GROUND_Y - stateRef.current.player.height;
        stateRef.current.player.velocityY = 0;
        stateRef.current.player.isJumping = false;
        stateRef.current.player.isDoubleJumping = false;
        stateRef.current.player.isCrouching = false;

        setGameState("PLAYING");
        onStatusChange("PLAYING");
        updateScores(0);
      },
      triggerJump: () => {
        stateRef.current.jumpRequested = true;
      },
      triggerCrouch: (isPressed: boolean) => {
        stateRef.current.crouchRequested = isPressed;
      },
      toggleMute: () => {
        const result = sfx.toggleSound();
        setSoundMuted(!result);
        return result;
      },
      isMuted: () => {
        return !sfx.isSoundEnabled();
      }
    }));

    // Trigger local Jump action in game loop
    const executeJump = () => {
      const p = stateRef.current.player;
      if (!p.isJumping) {
        p.velocityY = JUMP_FORCE;
        p.isJumping = true;
        p.isCrouching = false;
        sfx.playJump();
        // Spurt running dust
        createDustCloud();
      } else if (!p.isDoubleJumping) {
        // Double Jump mechanic
        p.velocityY = DOUBLE_JUMP_FORCE;
        p.isDoubleJumping = true;
        sfx.playJump();
        createDustCloud();
      }
    };

    const createDustCloud = () => {
      const p = stateRef.current.player;
      for (let i = 0; i < 5; i++) {
        stateRef.current.particles.push({
          x: p.x + 5,
          y: GROUND_Y - 5,
          size: Math.random() * 5 + 3,
          vx: -(Math.random() * 2 + 1),
          vy: -(Math.random() * 1.5),
          color: "rgba(156, 163, 175, 0.6)", // gray dust
          alpha: 0.8,
          type: "DUST",
        });
      }
    };

    // Initialize decorative elements
    useEffect(() => {
      // Setup stars
      const stars = [];
      for (let i = 0; i < 40; i++) {
        stars.push({
          x: Math.random() * 800,
          y: Math.random() * 120,
          size: Math.random() * 2 + 1,
          speed: Math.random() * 0.1 + 0.05,
        });
      }
      stateRef.current.stars = stars;

      // Setup clouds
      const clouds = [];
      for (let i = 0; i < 5; i++) {
        clouds.push({
          x: Math.random() * 800 + i * 160,
          y: Math.random() * 50 + 20,
          width: Math.random() * 40 + 30,
          speed: Math.random() * 0.3 + 0.1,
        });
      }
      stateRef.current.clouds = clouds;
    }, []);

    // Physics update & Rendering Loop
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Ensure pixelated crisp canvas rendering (No anti-aliasing)
      ctx.imageSmoothingEnabled = false;

      let timerId: number;

      const renderDinoSprite = (
        c: CanvasRenderingContext2D,
        sprite: string[],
        px: number,
        py: number,
        pWidth: number,
        pHeight: number,
        color: string
      ) => {
        const rows = sprite.length;
        const cols = sprite[0].length;
        const pixelW = pWidth / cols;
        const pixelH = pHeight / rows;

        for (let r = 0; r < rows; r++) {
          for (let col = 0; col < cols; col++) {
            const char = sprite[r][col];
            if (char !== ".") {
              if (char === "X") {
                c.fillStyle = "#EF4444"; // Red eyes when crashed
              } else if (char === "#") {
                c.fillStyle = color; // Dino main color
              } else {
                c.fillStyle = "#1E293B"; // Shading / Eye
              }
              c.fillRect(
                Math.round(px + col * pixelW),
                Math.round(py + r * pixelH),
                Math.ceil(pixelW),
                Math.ceil(pixelH)
              );
            }
          }
        }
      };

      const loop = (timestamp: number) => {
        const state = stateRef.current;

        // Base logic updates
        // Gradually increase speed log-scale based on score
        if (state.status === "PLAYING") {
          state.score += 0.15; // smooth score increment
          const displayScore = Math.floor(state.score);
          if (displayScore !== currentScore) {
            updateScores(displayScore);
          }

          // SPEED INCREASES GRADUALLY OVER TIME
          // Formula: 1.0 + Math.log2(1 + score / 150) * 0.25 (gradual curve)
          const newSpeedMult = 1.0 + Math.log2(1 + state.score / 200) * 0.3;
          state.speedMultiplier = Math.min(newSpeedMult, 3.5); // Cap multiplier at 3.5x
          setSpeedMultiplier(parseFloat(state.speedMultiplier.toFixed(2)));
        }

        // Handle external inputs
        if (state.jumpRequested) {
          executeJump();
          state.jumpRequested = false;
        }

        const p = state.player;
        if (state.crouchRequested) {
          if (!p.isJumping) {
            p.isCrouching = true;
            p.height = 30; // lower height hitbox
          }
        } else {
          p.isCrouching = false;
          p.height = 44; // default height hitbox
        }

        // Apply Physics / Gravity
        if (state.status === "PLAYING") {
          p.velocityY += GRAVITY;
          p.y += p.velocityY;

          // Ground check
          const floorY = GROUND_Y - p.height;
          if (p.y >= floorY) {
            p.y = floorY;
            p.velocityY = 0;
            p.isJumping = false;
            p.isDoubleJumping = false;
          }

          // Cycle run animation frame
          p.animFrame = (p.animFrame + 0.15) % 2;
        }

        // Background elements flow
        const activeSpeed = BASE_SPEED * state.speedMultiplier;

        // Ground scroll
        if (state.status === "PLAYING") {
          state.groundOffset = (state.groundOffset + activeSpeed) % 800;
        }

        // Clear canvas with Artistic design base color
        ctx.fillStyle = "#0c0c0c"; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw radial-type background dots (Neural Runner Grid aesthetic)
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        for (let x = 0; x < canvas.width; x += 40) {
          for (let y = 0; y < canvas.height; y += 40) {
            ctx.fillRect(x + 20, y + 20, 2, 2);
          }
        }

        // Render Stars
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        state.stars.forEach((star) => {
          if (state.status === "PLAYING") {
            star.x = (star.x - star.speed * activeSpeed + 800) % 800;
          }
          ctx.fillRect(Math.round(star.x), Math.round(star.y), Math.round(star.size), Math.round(star.size));
        });

        // Render Clouds
        ctx.fillStyle = "rgba(255, 255, 255, 0.06)"; // subtle clouds
        state.clouds.forEach((cloud) => {
          if (state.status === "PLAYING") {
            cloud.x = (cloud.x - cloud.speed * activeSpeed + 900) % 900 - 100;
          }
          ctx.fillRect(Math.round(cloud.x), Math.round(cloud.y), cloud.width, 14);
          ctx.fillRect(Math.round(cloud.x + 8), Math.round(cloud.y - 6), cloud.width - 16, 6);
          ctx.fillRect(Math.round(cloud.x + 16), Math.round(cloud.y + 14), cloud.width - 20, 6);
        });

        // Render Mountains (Far background) - brutalist flat peaks
        ctx.fillStyle = "#161616";
        for (let i = 0; i < 4; i++) {
          const mX = (i * 260 - state.groundOffset * 0.15 + 1040) % 1040 - 150;
          ctx.beginPath();
          ctx.moveTo(mX, GROUND_Y);
          ctx.lineTo(mX + 130, GROUND_Y - 70);
          ctx.lineTo(mX + 260, GROUND_Y);
          ctx.fill();
        }

        // Ground Floor Line & Texture Dots
        ctx.strokeStyle = "#ffffff"; // pure high-contrast flat white
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, GROUND_Y);
        ctx.lineTo(canvas.width, GROUND_Y);
        ctx.stroke();

        ctx.fillStyle = "#444444"; // grey texture dots
        for (let i = 0; i < 50; i++) {
          const dotX = (i * 24 - state.groundOffset + 800) % 800;
          ctx.fillRect(dotX, GROUND_Y + 8, i % 3 === 0 ? 3 : 2, 2);
          ctx.fillRect((dotX + 12) % 800, GROUND_Y + 18, i % 2 === 0 ? 2 : 1, 2);
        }

        // Spawn Obstacles
        if (state.status === "PLAYING") {
          state.obstacleTimer++;
          if (state.obstacleTimer >= state.nextObstacleSpawnTime) {
            state.obstacleTimer = 0;
            // Spawn interval decreases somewhat with higher speeds
            state.nextObstacleSpawnTime = Math.max(
              45,
              Math.floor(Math.random() * 60 + 50 - state.speedMultiplier * 8)
            );

            // Obstacle type weighted selector
            const rand = Math.random();
            let type: Obstacle["type"] = "CACTUS_S";
            let width = 24;
            let height = 36;
            let obsY = GROUND_Y - height;

            if (rand < 0.4) {
              type = "CACTUS_S";
              width = 24;
              height = 36;
              obsY = GROUND_Y - height;
            } else if (rand < 0.75) {
              type = "CACTUS_L";
              width = 26;
              height = 42;
              obsY = GROUND_Y - height;
            } else {
              // Flying birds / pterodactyl / meteor
              const heightChance = Math.random();
              if (heightChance < 0.33) {
                type = "PTERODACTYL_HIGH"; // must duck!
                width = 36;
                height = 24;
                obsY = GROUND_Y - 55;
              } else if (heightChance < 0.66) {
                type = "PTERODACTYL_LOW"; // run regular or jump!
                width = 36;
                height = 24;
                obsY = GROUND_Y - 30;
              } else {
                type = "METEOR"; // fast fireball
                width = 28;
                height = 24;
                obsY = GROUND_Y - 45;
              }
            }

            state.obstacles.push({
              id: Date.now() + Math.random(),
              x: canvas.width + 20,
              y: obsY,
              width,
              height,
              type,
              speedX: type === "METEOR" ? activeSpeed * 1.25 : activeSpeed,
              passed: false,
              frame: 0,
            });
          }
        }

        // Update & Render Obstacles
        state.obstacles.forEach((obs, index) => {
          if (state.status === "PLAYING") {
            obs.x -= obs.speedX;
            obs.frame = (obs.frame + 0.1) % 2;
          }

          // Collision boundaries (shrink slightly for lenient gameplay bounding box)
          const margin = 5;
          const playerLeft = p.x + margin;
          const playerRight = p.x + p.width - margin;
          const playerTop = p.y + margin;
          const playerBottom = p.y + p.height; // full base of player

          const obsLeft = obs.x + margin;
          const obsRight = obs.x + obs.width - margin;
          const obsTop = obs.y + margin;
          const obsBottom = obs.y + obs.height - margin;

          // Render sprite based on obstacle type (Artistic high contrast Red & White accent theme)
          if (obs.type === "CACTUS_S") {
            renderDinoSprite(ctx, CACTUS_SMALL, obs.x, obs.y, obs.width, obs.height, "#ef4444");
          } else if (obs.type === "CACTUS_L") {
            renderDinoSprite(ctx, CACTUS_LARGE, obs.x, obs.y, obs.width, obs.height, "#ef4444");
          } else if (obs.type === "PTERODACTYL_HIGH" || obs.type === "PTERODACTYL_LOW") {
            const birdSprite = Math.floor(obs.frame) === 0 ? PTERODACTYL_FLAP_1 : PTERODACTYL_FLAP_2;
            renderDinoSprite(ctx, birdSprite, obs.x, obs.y, obs.width, obs.height, "#ffffff");
          } else if (obs.type === "METEOR") {
            renderDinoSprite(ctx, METEOR, obs.x, obs.y, obs.width, obs.height, "#ef4444");
            // Add custom spark particles trailing behind meteor
            if (state.status === "PLAYING" && Math.random() < 0.4) {
              state.particles.push({
                x: obs.x + obs.width,
                y: obs.y + obs.height / 2 + (Math.random() - 0.5) * 10,
                size: Math.random() * 3 + 1,
                vx: Math.random() * 2 + 1,
                vy: (Math.random() - 0.5) * 2,
                color: "#ef4444",
                alpha: 0.9,
                type: "DUST",
              });
            }
          }

          // Check collisions
          if (
            state.status === "PLAYING" &&
            playerLeft < obsRight &&
            playerRight > obsLeft &&
            playerTop < obsBottom &&
            playerBottom > obsTop
          ) {
            // CRASHED! Game Over
            state.status = "GAMEOVER";
            sfx.playDeath();
            setGameState("GAMEOVER");
            onStatusChange("GAMEOVER");

            // Create circular explosion splinters of white and red
            for (let i = 0; i < 25; i++) {
              state.particles.push({
                x: p.x + p.width / 2,
                y: p.y + p.height / 2,
                size: Math.random() * 6 + 2,
                vx: (Math.random() - 0.5) * 12,
                vy: (Math.random() - 0.6) * 12,
                color: i % 2 === 0 ? "#ffffff" : "#ef4444",
                alpha: 1.0,
                type: "EXPLOSION",
              });
            }
          }
        });

        // Filter offscreen obstacles
        if (state.status === "PLAYING") {
          state.obstacles = state.obstacles.filter((obs) => obs.x + obs.width > -10);
        }

        // Particle updates
        state.particles.forEach((part) => {
          part.x += part.vx;
          part.y += part.vy;
          if (part.type === "EXPLOSION") {
            part.vy += 0.2; // gravitate downward
          }
          part.alpha -= part.type === "EXPLOSION" ? 0.02 : 0.035;

          ctx.fillStyle = part.color;
          ctx.globalAlpha = Math.max(0, part.alpha);
          ctx.fillRect(Math.round(part.x), Math.round(part.y), Math.round(part.size), Math.round(part.size));
        });
        ctx.globalAlpha = 1.0; // reset
        state.particles = state.particles.filter((part) => part.alpha > 0);

        // Dust generation during run
        if (state.status === "PLAYING" && !p.isJumping && !p.isCrouching) {
          if (Math.random() < 0.15) {
            state.particles.push({
              x: p.x + 8,
              y: GROUND_Y - 4,
              size: Math.random() * 4 + 2,
              vx: -activeSpeed * 0.3 - Math.random() * 1.5,
              vy: -0.5 - Math.random() * 0.5,
              color: "rgba(100, 116, 139, 0.45)",
              alpha: 0.7,
              type: "DUST",
            });
          }
        }

        // Render Player Dino (Artistic high contrast white player look)
        if (state.status === "GAMEOVER") {
          // Flatten dead Dino
          renderDinoSprite(ctx, DINO_DEAD, p.x, p.y, p.width, p.height, "#ffffff");
        } else {
          let currentDinoSprite = DINO_RUN_1;
          if (p.isJumping) {
            currentDinoSprite = DINO_RUN_1; // Airborn
          } else if (p.isCrouching) {
            currentDinoSprite = Math.floor(p.animFrame) === 0 ? DINO_DUCK_1 : DINO_DUCK_2;
          } else {
            currentDinoSprite = Math.floor(p.animFrame) === 0 ? DINO_RUN_1 : DINO_RUN_2;
          }

          // Dino core coloring: pure white for high contrast
          renderDinoSprite(ctx, currentDinoSprite, p.x, p.y, p.width, p.height, "#ffffff");
        }

        // Draw HUD overlay inside canvas
        // Score display top-right
        ctx.font = 'bold 15px "JetBrains Mono", "Courier New", Courier, monospace';
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "right";

        const scoreStr = String(Math.floor(state.score)).padStart(6, "0");
        const highscoreStr = String(state.highScore).padStart(6, "0");

        ctx.fillText(`HI ${highscoreStr}   ${scoreStr}`, canvas.width - 20, 30);

        // Render speed dynamic label
        ctx.textAlign = "left";
        ctx.fillStyle = "#ef4444"; // Vivid red speed accent from design
        ctx.fillText(`SPEED ${state.speedMultiplier.toFixed(1)}X`, 20, 30);

        // Render Active input label bottom left (Stark high-contrast design labels)
        ctx.fillStyle = "#888888";
        ctx.font = '10px "JetBrains Mono", "Courier New", Courier, monospace';
        let ctrlStr = "INPUT SOURCE: KEYBOARD";
        if (activeControlSource === "TEACHABLE_MACHINE") {
          ctrlStr = "MODEL CONTROL: ACTIVE (TEACHABLE MACHINE)";
          ctx.fillStyle = "#ef4444"; // bright red for active sensory control
        } else if (activeControlSource === "KEYBOARD") {
          ctrlStr = "INPUT SOURCE: ACTIVE (KEYBOARD)";
          ctx.fillStyle = "#ffffff";
        }
        ctx.fillText(ctrlStr, 20, canvas.height - 15);

        // If IDLE, render overlay (Neural Runner Aesthetic)
        if (state.status === "IDLE") {
          ctx.fillStyle = "rgba(12, 12, 12, 0.9)";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.textAlign = "center";
          ctx.font = 'bold 22px "JetBrains Mono", "Courier New", Courier, monospace';
          ctx.fillStyle = "#ffffff";
          ctx.fillText("NEURAL RUNNER v1.0", canvas.width / 2, canvas.height / 2 - 35);

          // Draw the white status underline from design guidelines
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(canvas.width / 2 - 110, canvas.height / 2 - 25, 220, 3);

          ctx.font = '12px "JetBrains Mono", "Courier New", Courier, monospace';
          ctx.fillStyle = "#888888";
          ctx.fillText("MODEL: STABLE   LATENCY: 12ms", canvas.width / 2, canvas.height / 2 + 5);

          ctx.fillStyle = "#ef4444";
          ctx.fillText("CLICK GAME SCREEN TO START PLAYING", canvas.width / 2, canvas.height / 2 + 35);
        }

        // If GAMEOVER, render overlay
        if (state.status === "GAMEOVER") {
          ctx.fillStyle = "rgba(12, 12, 12, 0.92)";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.textAlign = "center";
          ctx.font = 'bold 24px "JetBrains Mono", "Courier New", Courier, monospace';
          ctx.fillStyle = "#ef4444";
          ctx.fillText("S Y S T E M   C R A S H", canvas.width / 2, canvas.height / 2 - 25);

          ctx.font = '12px "JetBrains Mono", "Courier New", Courier, monospace';
          ctx.fillStyle = "#ffffff";
          ctx.fillText(`TOTAL SCORE: ${Math.floor(state.score)}`, canvas.width / 2, canvas.height / 2 + 8);
          
          ctx.fillStyle = "#ef4444";
          ctx.fillText("CLICK SCREEN TO REBOOT CURRENT RUN", canvas.width / 2, canvas.height / 2 + 38);
        }

        timerId = requestAnimationFrame(loop);
      };

      timerId = requestAnimationFrame(loop);

      // Clean up physics thread/frames on unmount
      return () => {
        cancelAnimationFrame(timerId);
      };
    }, [activeControlSource, currentScore]);

    // Screen resizing watcher
    useEffect(() => {
      const handleResize = () => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        canvas.width = container.clientWidth;
        canvas.height = 240; // Fixed canvas retro height
      };

      handleResize();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Handle initial keyboard triggers for pure testing mode
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        const state = stateRef.current;
        if (state.status === "PLAYING") {
          if (e.code === "Space" || e.code === "ArrowUp") {
            e.preventDefault();
            executeJump();
          }
          if (e.code === "ArrowDown") {
            e.preventDefault();
            state.crouchRequested = true;
          }
        } else if (state.status === "GAMEOVER" || state.status === "IDLE") {
          if (e.code === "Space" || e.code === "Enter") {
            e.preventDefault();
            // Start
            if (state.status === "IDLE") {
              sfx.playStart();
              state.status = "PLAYING";
              setGameState("PLAYING");
              onStatusChange("PLAYING");
            } else {
              sfx.playStart();
              state.status = "PLAYING";
              state.score = 0;
              state.speedMultiplier = 1.0;
              state.obstacles = [];
              state.particles = [];
              state.player.y = GROUND_Y - state.player.height;
              state.player.velocityY = 0;
              setGameState("PLAYING");
              onStatusChange("PLAYING");
              updateScores(0);
            }
          }
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === "ArrowDown") {
          stateRef.current.crouchRequested = false;
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
      };
    }, [currentScore]);

    const handleCanvasClick = () => {
      const state = stateRef.current;
      if (state.status === "IDLE") {
        sfx.playStart();
        state.status = "PLAYING";
        setGameState("PLAYING");
        onStatusChange("PLAYING");
      } else if (state.status === "GAMEOVER") {
        sfx.playStart();
        state.status = "PLAYING";
        state.score = 0;
        state.speedMultiplier = 1.0;
        state.obstacles = [];
        state.particles = [];
        state.player.y = GROUND_Y - state.player.height;
        state.player.velocityY = 0;
        setGameState("PLAYING");
        onStatusChange("PLAYING");
        updateScores(0);
      } else {
        // Force jump on click during gameplay as visual/mouse control
        executeJump();
      }
    };

    return (
      <div 
        ref={containerRef} 
        className="relative w-full overflow-hidden rounded-xl border-4 border-slate-700 bg-slate-950 p-[2px] shadow-2xl transition-all duration-300"
        id="game-canvas-screen-container"
      >
        {/* Dynamic header stats indicators */}
        <div className="absolute top-2 left-2 flex items-center gap-4 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700 font-mono text-[10px] text-zinc-400 z-10 select-none">
          <span className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${gameState === "PLAYING" ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            STATUS: {gameState}
          </span>
          <span>MULT: {speedMultiplier}x</span>
        </div>

        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="block w-full cursor-pointer bg-slate-900 rounded-lg"
          style={{ height: "240px" }}
          id="retro-game-board"
        />

        {/* Volume controls floating button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            sfx.toggleSound();
            setSoundMuted(!sfx.isSoundEnabled());
          }}
          className="absolute bottom-2 right-2 p-1.5 rounded bg-slate-950/80 hover:bg-slate-800 border border-slate-700 text-zinc-400 hover:text-white transition"
          title="Mute/Unmute game audio"
          id="game-volume-toggle-floating-btn"
        >
          {soundMuted ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="22" y1="9" x2="16" y2="15"></line><line x1="16" y1="9" x2="22" y2="15"></line></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
          )}
        </button>
      </div>
    );
  }
);

GameCanvas.displayName = "GameCanvas";
