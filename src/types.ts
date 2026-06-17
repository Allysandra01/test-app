/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type GameStatus = "IDLE" | "PLAYING" | "GAMEOVER";

export interface Obstacle {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: "CACTUS_S" | "CACTUS_L" | "PTERODACTYL_HIGH" | "PTERODACTYL_LOW" | "METEOR";
  speedX: number;
  passed: boolean;
  frame: number;
}

export interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityY: number;
  isJumping: boolean;
  isDoubleJumping: boolean;
  isCrouching: boolean;
  animFrame: number;
}

export interface Particle {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  type: "DUST" | "EXPLOSION" | "STAR";
}

export type TMModelType = "IMAGE" | "POSE" | "AUDIO";

export interface ModelClassMapping {
  className: string;
  action: "NONE" | "JUMP" | "CROUCH";
}

export interface GameActionTrigger {
  action: "JUMP" | "CROUCH" | "RELEASE";
  source: "KEYBOARD" | "TEACHABLE_MACHINE" | "CLICK";
}
