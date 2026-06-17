/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from "react";
import { GameCanvas, GameCanvasHandle } from "./components/GameCanvas";
import { TeachableMachinePanel } from "./components/TeachableMachinePanel";
import { GameStatus } from "./types";
import { Play, RotateCcw, HelpCircle, Trophy, Sparkles, VolumeX, Volume2, Info, ChevronRight, Zap } from "lucide-react";

export default function App() {
  const gameRef = useRef<GameCanvasHandle | null>(null);
  const [gameStatus, setGameStatus] = useState<GameStatus>("IDLE");
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    return parseInt(localStorage.getItem("8bit_high_score") || "0", 10);
  });
  const [tmConnected, setTmConnected] = useState<boolean>(false);
  const [activeControl, setActiveControl] = useState<"KEYBOARD" | "TEACHABLE_MACHINE" | "NONE">("KEYBOARD");
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Triggered when Teachable Machine output predicts action JUMP or CROUCH
  const handleTMAction = (action: "JUMP" | "CROUCH" | "RELEASE") => {
    if (!gameRef.current) return;
    
    if (action === "JUMP") {
      gameRef.current.triggerJump();
    } else if (action === "CROUCH") {
      gameRef.current.triggerCrouch(true);
    } else {
      gameRef.current.triggerCrouch(false);
    }
  };

  // Toggle active input controls from TM
  const handleTMStateActive = (isActive: boolean) => {
    setTmConnected(isActive);
    setActiveControl(isActive ? "TEACHABLE_MACHINE" : "KEYBOARD");
  };

  const handleStartResetBtn = () => {
    if (!gameRef.current) return;
    if (gameStatus === "IDLE") {
      gameRef.current.startGame();
    } else {
      gameRef.current.resetGame();
    }
  };

  const handleToggleMute = () => {
    if (!gameRef.current) return;
    const isNowMuted = gameRef.current.toggleMute();
    setIsMuted(isNowMuted);
  };

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-white flex flex-col items-center justify-between p-4 md:p-8 selection:bg-red-600 selection:text-white" id="retro-platformer-main-rootDiv">
      {/* Neural Grid background texture preset */}
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-7xl mx-auto flex flex-col gap-6 z-10" id="arcade-game-stage-wrapper">
        
        {/* Stark Title Header Board */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#111111] p-5 rounded-none border-2 border-white shadow-[4px_4px_0_0_#ef4444]" id="arcade-header-widget">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 px-2.5 bg-red-600 text-white font-mono text-[9px] uppercase font-black tracking-widest flex items-center gap-1.5 animate-pulse">
                <Zap className="w-3 h-3 fill-current" />
                SYSTEM RUNNING // V1.0
              </span>
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase mt-1.5" id="main-crawler-title-label">
              NEURAL RUNNER <span className="text-[#ef4444] font-light font-mono">// 8-BIT</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1 font-mono tracking-tight leading-relaxed">
              ENDLESS ENDURANCE ENGINE DRIVEN BY BODY SENSORY DATA DIRECTLY FROM YOUR TEACHABLE MACHINE MODEL.
            </p>
          </div>

          {/* Stark Brutalist Scores Board */}
          <div className="flex items-center gap-4 bg-black p-3 px-5 rounded-none border-2 border-white" id="hud-top-scores-board">
            <div className="flex flex-col pr-4 border-r border-zinc-800">
              <span className="text-[9px] font-mono text-zinc-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-red-500" />
                HI-RECORD
              </span>
              <span className="text-base font-mono font-black text-white">
                {String(highScore).padStart(6, "0")}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-mono text-zinc-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
                SCORE
              </span>
              <span className="text-base font-mono font-black text-[#ef4444]">
                {String(Math.floor(score)).padStart(6, "0")}
              </span>
            </div>
          </div>
        </header>

        {/* Central Dashboard Layout split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="gameplay-dashboard-split-layout">
          
          {/* Main game board sub-stage of 8 cols */}
          <main className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6" id="main-gameplay-stage-sub-column">
            
            {/* Game Canvas Wrapper with elegant retro frame */}
            <div className="border-2 border-white shadow-[6px_6px_0_0_#222] overflow-hidden">
              <GameCanvas
                ref={gameRef}
                onScoreChange={(s) => setScore(s)}
                onHighScoreChange={(hs) => setHighScore(hs)}
                onStatusChange={(status) => setGameStatus(status)}
                activeControlSource={activeControl}
              />
            </div>

            {/* Inline Action HUD controls header panel */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#111111] p-4 rounded-none border-2 border-white" id="gameplay-quickactions-bar">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleStartResetBtn}
                  className={`py-2 px-6 rounded-none text-xs font-mono font-extrabold uppercase tracking-widest transition-all hover:-translate-y-0.5 active:translate-y-0.5 flex items-center gap-2 border-2 ${
                    gameStatus === "PLAYING"
                      ? "bg-[#ef4444] border-white text-white hover:bg-red-700"
                      : "bg-white border-white text-black hover:bg-zinc-200"
                  }`}
                  id="btn-trigger-action-primary"
                >
                  {gameStatus === "PLAYING" ? (
                    <>
                      <RotateCcw className="w-4 h-4 text-white" />
                      REBOOT RUN
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current text-black" />
                      BOOT UP ENGINE
                    </>
                  )}
                </button>

                <button
                  onClick={handleToggleMute}
                  className="p-2 px-3 rounded-none bg-black hover:bg-zinc-900 border-2 border-white text-zinc-400 hover:text-white transition-colors"
                  title="Toggle Sound FX Mute"
                  id="btn-sound-trigger-sfx"
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4 text-white" />}
                </button>
              </div>

              {/* Feed Control status info details */}
              <div className="flex items-center gap-2.5 bg-black p-2 px-4 rounded-none border-2 border-zinc-800" id="feed-status-badge">
                <div className="text-[10px] font-mono text-zinc-500 tracking-wider">
                  DRIVER STATUS:{" "}
                  <span className={`font-black uppercase ${tmConnected ? "text-white bg-red-600 px-1" : "text-white"}`}>
                    {activeControl === "TEACHABLE_MACHINE" ? "TELEMETRY LINKED" : "KEYBOARD DIRECT"}
                  </span>
                </div>
              </div>
            </div>

            {/* In-Game Cheat Sheet Instructions list */}
            <div className="bg-[#111111] p-5 rounded-none border-2 border-white">
              <h3 className="text-xs font-mono font-black text-white flex items-center gap-2 mb-3.5 uppercase tracking-wider">
                <Info className="w-4 h-4 text-[#ef4444]" />
                OPERATIONS MANUAL: CONTROLLING TARGETS
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-400">
                <div className="bg-black p-3.5 rounded-none border border-zinc-800">
                  <span className="font-mono text-white font-black flex items-center gap-1.5 mb-1.5 uppercase tracking-tighter">
                    <ChevronRight className="w-3.5 h-3.5 text-[#ef4444]" />
                    A. ELEVATION LOGIC
                  </span>
                  Tap <kbd className="px-1.5 py-0.5 rounded-none bg-zinc-900 font-mono border border-zinc-700 text-white text-[10px] mx-0.5 font-bold">Space</kbd> or <kbd className="px-1.5 py-0.5 rounded-none bg-zinc-900 font-mono border border-zinc-700 text-white text-[10px] mx-0.5 font-bold">↑</kbd> to jump. Press mid-air for **Double Jump**.
                </div>
                <div className="bg-black p-3.5 rounded-none border border-zinc-800">
                  <span className="font-mono text-white font-black flex items-center gap-1.5 mb-1.5 uppercase tracking-tighter">
                    <ChevronRight className="w-3.5 h-3.5 text-[#ef4444]" />
                    B. COMPRESSION LOGIC
                  </span>
                  Hold <kbd className="px-1.5 py-0.5 rounded-none bg-zinc-900 font-mono border border-zinc-700 text-white text-[10px] font-bold">↓</kbd> to crouch flat under pterodactyls or fast debris.
                </div>
                <div className="bg-black p-3.5 rounded-none border border-zinc-800">
                  <span className="font-mono text-white font-black flex items-center gap-1.5 mb-1.5 uppercase tracking-tighter">
                    <ChevronRight className="w-3.5 h-3.5 text-[#ef4444]" />
                    C. KINETIC DRIFT
                  </span>
                  The runner speeds up automatically in accordance with system scores. Act fast to bypass obstacles!
                </div>
              </div>
            </div>
          </main>

          {/* Right / Teachable Machine Configuration Bar container */}
          <aside className="lg:col-span-5 xl:col-span-4" id="right-teachable-machine-sub-column">
            <TeachableMachinePanel
              onAction={handleTMAction}
              onActiveStateChange={handleTMStateActive}
            />
          </aside>
        </div>

        {/* Dynamic educational guidelines on linking custom Teachable Machine models */}
        <section className="bg-[#111111] p-6 rounded-none border-2 border-white shadow-[4px_4px_0_0_#ef4444]" id="teachable-machine-guidelines-box">
          <div className="flex items-center gap-2.5 border-b-2 border-zinc-800 pb-3.5 mb-4">
            <HelpCircle className="w-5 h-5 text-[#ef4444]" />
            <h2 className="text-xs font-mono font-black tracking-wide text-white uppercase">
              // TELEMETRY SETTINGS: 3 STEPS TO INTEGRATE SENSORY TRAINED MODELS
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-zinc-400">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-none bg-white text-black font-mono font-black flex items-center justify-center border-2 border-black">
                  1
                </span>
                <span className="font-mono font-bold text-white uppercase tracking-tight">TRAIN MODEL ON WEB</span>
              </div>
              <p className="leading-relaxed pl-8">
                Go to <a href="https://teachablemachine.withgoogle.com/" target="_blank" rel="noreferrer" className="text-[#ef4444] font-bold underline hover:text-red-500">teachablemachine.withgoogle.com</a> and create an **Image**, **Pose** or **Audio** module. Model 3 postures or triggers (e.g. "Neutral", "Jump Gesture", "Crouch Gesture").
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-none bg-white text-black font-mono font-black flex items-center justify-center border-2 border-black">
                  2
                </span>
                <span className="font-mono font-bold text-white uppercase tracking-tight">EXPORT CLOUD SHARABLE LINK</span>
              </div>
              <p className="leading-relaxed pl-8">
                Click **Export Model** once trained. Choose **Upload (shareable link)**, generate the URL, and copy the produced path (e.g., <code className="text-[10px] font-mono text-zinc-300">https://teachablemachine.withgoogle.com/models/xyz...</code>).
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-none bg-white text-black font-mono font-black flex items-center justify-center border-2 border-black">
                  3
                </span>
                <span className="font-mono font-bold text-white uppercase tracking-tight">LINK CONTROLS & TEST</span>
              </div>
              <p className="leading-relaxed pl-8">
                Paste the copied route inside the telemetry panel on the right, click **Link Model**, and bind your custom postures to action keys. Engage neural control in seconds!
              </p>
            </div>
          </div>
        </section>

      </div>

      {/* Footer copyright */}
      <footer className="w-full text-center text-[10px] font-mono text-zinc-600 mt-8 select-none" id="credit-footer-label">
        NEURAL RUNNER ENGINE // HIGH FREQUENCY FRAMEWORK // RUNNING AT 60FPS STABILIZED
      </footer>
    </div>
  );
}
