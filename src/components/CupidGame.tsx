import { useRef, useEffect, useCallback, useState } from 'react';
import confetti from 'canvas-confetti';
import { config } from '../../config/config';
import {
  sfxFlap, sfxCollectHeart, sfxPillarPass, sfxDie,
  sfxBossShoot, sfxBossExplode, sfxBossFreeze, sfxLevelComplete, sfxVictory,
  sfxCountdownTick, sfxCountdownGo, registerAudioUnlock,
} from '../utils/gameFeedback';

interface CupidGameProps {
  onBack: () => void;
}

// ─── Game types ──────────────────────────────────────────────────────

type GameScreen = 'countdown' | 'playing' | 'levelComplete' | 'gameOver' | 'bossIntro' | 'bossFreeze' | 'bossExplode' | 'victory';

interface Player {
  x: number;
  y: number;
  vy: number;
  width: number;
  height: number;
}

interface Pillar {
  x: number;
  gapY: number;
  gapSize: number;
  width: number;
  passed: boolean;
  /** Sine-wave offset phase for level 2 moving pillars */
  phase: number;
}

interface Heart {
  x: number;
  y: number;
  collected: boolean;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
}

interface PlayerArrow {
  x: number;
  y: number;
  vx: number;
}

interface WindZone {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Vertical push force (negative = up, positive = down) */
  force: number;
  /** Animation phase */
  phase: number;
}

interface Boss {
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  phase: number;
  /** Time since boss appeared (frames) */
  timer: number;
  /** Frames until next projectile */
  shootCooldown: number;
}

interface FlyingHeart {
  x: number;
  y: number;
  vx: number;
  vy: number;
  emoji: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

// ─── Level configs ───────────────────────────────────────────────────

interface LevelConfig {
  pillarCount: number;
  gapSize: number;
  speed: number;
  heartCount: number;
  /** Points awarded per heart collected */
  heartPoints: number;
  movingPillars: boolean;
  /** Sine wave amplitude for moving pillars (px per frame) */
  pillarWaveAmplitude: number;
  hasBoss: boolean;
  /** Whether this level has wind zones between pillars */
  hasWind: boolean;
}

const LEVELS: LevelConfig[] = [
  { pillarCount: 6, gapSize: 240, speed: 1.2, heartCount: 4, heartPoints: 2, movingPillars: false, pillarWaveAmplitude: 0, hasBoss: false, hasWind: false },
  { pillarCount: 8, gapSize: 220, speed: 1.4, heartCount: 6, heartPoints: 3, movingPillars: true, pillarWaveAmplitude: 0.4, hasBoss: false, hasWind: false },
  { pillarCount: 10, gapSize: 205, speed: 1.6, heartCount: 10, heartPoints: 4, movingPillars: true, pillarWaveAmplitude: 0.6, hasBoss: true, hasWind: false },
  { pillarCount: 13, gapSize: 175, speed: 2.0, heartCount: 12, heartPoints: 5, movingPillars: true, pillarWaveAmplitude: 0.8, hasBoss: true, hasWind: true },
];

// ─── Constants ───────────────────────────────────────────────────────

const GRAVITY = 0.20;
const FLAP_STRENGTH = -5;
const PILLAR_WIDTH = 52;
const PILLAR_SPACING = 250;
const PLAYER_SIZE = 32;
const HEART_SIZE = 24;
const BOSS_SIZE = 48;
const MEGA_BOSS_SIZE = 64;
const PROJECTILE_SIZE = 20;
const ARROW_SIZE = 14;
const ARROW_SPEED = 5;
const BOSS_SHOOT_INTERVAL = 78; // frames (~1.3s at 60fps, ~13% faster than original)
const MEGA_BOSS_SHOOT_INTERVAL = 52; // ~50% more frequent than regular boss
const MEGA_BOSS_HP = 3;
const PLAYER_ARROW_INTERVAL = 80; // auto-fire rate (~1.4s)
const BOSS_ADVANCE_SPEED = 0.34; // px per frame the player advances toward boss
const FRAME_MS = 1000 / 110; // physics step duration — targets 110 ticks/sec on all devices

// ─── Mobile-adaptive physics ──────────────────────────────────────────
// On mobile, asymmetric gravity creates the classic "flappy" feel:
// - Rising phase uses stronger gravity → each tap produces a sharp,
//   pointed arc that decelerates quickly (not a smooth glide up).
// - Falling phase uses normal gravity → gentle, controlled descent.
// Rapid tapping creates a visible sawtooth/staircase pattern instead of
// smooth upward flight. Desktop uses symmetric gravity (1.0x).
const _isMobileGame = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
const GRAVITY_EFF = _isMobileGame ? 0.18 : GRAVITY;
const FLAP_EFF = _isMobileGame ? -4.7 : FLAP_STRENGTH;
const DT_CAP = _isMobileGame ? 3 : 6;
const RISE_GRAVITY_MULT = _isMobileGame ? 2.5 : 1.0;

// Module-level best score — survives component unmount/remount (same browser session)
let sessionBestScore = 0;

// ─── Emoji sprite cache (pre-renders for consistent mobile display) ─

const emojiCache = new Map<string, HTMLCanvasElement>();

function getEmojiSprite(emoji: string, size: number): HTMLCanvasElement {
  const key = `${emoji}_${size}`;
  const cached = emojiCache.get(key);
  if (cached) return cached;

  const scale = 2; // render at 2x for crisp display
  const canvas = document.createElement('canvas');
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${size * scale * 0.75}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, canvas.width / 2, canvas.height / 2);

  emojiCache.set(key, canvas);
  return canvas;
}

/** Draw a cached emoji sprite centered at (cx, cy). */
function drawEmoji(ctx: CanvasRenderingContext2D, emoji: string, size: number, cx: number, cy: number): void {
  const sprite = getEmojiSprite(emoji, size);
  ctx.drawImage(sprite, cx - size / 2, cy - size / 2, size, size);
}

// ─── Helpers ─────────────────────────────────────────────────────────

function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

function generatePillars(levelCfg: LevelConfig, canvasHeight: number): Pillar[] {
  const pillars: Pillar[] = [];
  const startX = 500;
  for (let i = 0; i < levelCfg.pillarCount; i++) {
    const minGapY = levelCfg.gapSize / 2 + 50;
    const maxGapY = canvasHeight - levelCfg.gapSize / 2 - 50;
    const gapY = minGapY + Math.random() * (maxGapY - minGapY);
    pillars.push({
      x: startX + i * PILLAR_SPACING,
      gapY,
      gapSize: levelCfg.gapSize,
      width: PILLAR_WIDTH,
      passed: false,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return pillars;
}

function generateHearts(pillars: Pillar[], count: number): Heart[] {
  // Randomly select which pillars get hearts
  const indices = pillars.map((_, i) => i);
  // Shuffle (Fisher-Yates)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }
  const selected = indices.slice(0, Math.min(count, pillars.length)).sort((a, b) => a - b);

  return selected.map(idx => {
    const p = pillars[idx]!;
    return {
      x: p.x + p.width / 2,
      y: p.gapY,
      collected: false,
    };
  });
}

/** Generate wind zones between some pillars (only for levels with hasWind). */
function generateWindZones(pillars: Pillar[], canvasHeight: number): WindZone[] {
  const zones: WindZone[] = [];
  // Place wind zones between every 2nd and 3rd pillar
  for (let i = 1; i < pillars.length - 1; i += 2) {
    const p1 = pillars[i]!;
    const p2 = pillars[i + 1];
    if (!p2) break;
    const midX = (p1.x + p1.width + p2.x) / 2;
    const zoneW = 35;
    const zoneH = canvasHeight * 0.25;
    // Alternate up/down forces
    const force = i % 4 === 1 ? -0.15 : 0.15;
    zones.push({
      x: midX - zoneW / 2,
      y: canvasHeight / 2 - zoneH / 2 + (Math.random() - 0.5) * canvasHeight * 0.2,
      width: zoneW,
      height: zoneH,
      force,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return zones;
}

// ─── Victory fireworks ───────────────────────────────────────────────

function triggerVictoryFireworks(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const duration = 4000;
  const end = Date.now() + duration;
  const colors = ['#ff1744', '#ff5252', '#ff6e40', '#ff9100', '#ffc400', '#e040fb', '#7c4dff'];

  const frame = () => {
    const timeLeft = end - Date.now();
    if (timeLeft <= 0) return;

    // Firework bursts from random positions
    confetti({
      particleCount: 40,
      startVelocity: 30,
      spread: 360,
      origin: { x: Math.random(), y: Math.random() * 0.4 },
      colors,
      gravity: 0.7,
      scalar: 1.3,
      ticks: 80,
      zIndex: 9999,
    });

    // Side cannons
    confetti({
      particleCount: 20,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors,
      zIndex: 9999,
    });
    confetti({
      particleCount: 20,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors,
      zIndex: 9999,
    });

    setTimeout(frame, 250);
  };

  frame();
}

// ─── Component ───────────────────────────────────────────────────────

export function CupidGame({ onBack }: CupidGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Game state in refs to avoid re-renders during game loop
  const screenRef = useRef<GameScreen>('countdown');
  const levelRef = useRef(0);
  const scoreRef = useRef(0);
  const bestScoreRef = useRef(sessionBestScore);
  const levelStartScoreRef = useRef(0);
  const countdownRef = useRef(3);
  const countdownTimerRef = useRef(0);
  const hasFlappedRef = useRef(false);
  const diedDuringBossRef = useRef(false);
  const bossStartScoreRef = useRef(0);
  const explodeTimerRef = useRef(0);
  const explodePosRef = useRef({ x: 0, y: 0 });
  const bossIntroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playStartTimeRef = useRef(0); // timestamp when screen last became 'playing'

  const playerRef = useRef<Player>({ x: 80, y: 200, vy: 0, width: PLAYER_SIZE, height: PLAYER_SIZE });
  const pillarsRef = useRef<Pillar[]>([]);
  const heartsRef = useRef<Heart[]>([]);
  const bossRef = useRef<Boss | null>(null);
  const projectilesRef = useRef<Projectile[]>([]);
  const playerArrowsRef = useRef<PlayerArrow[]>([]);
  const arrowCooldownRef = useRef(0);
  const windZonesRef = useRef<WindZone[]>([]);
  const bossStunTimerRef = useRef(0);   // ticks remaining in angry/stun phase
  const bossStunDurationRef = useRef(0); // total duration of current stun
  const flyingHeartsRef = useRef<FlyingHeart[]>([]);
  const frameRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);

  // React state for overlay screens only
  const [screen, setScreen] = useState<GameScreen>('countdown');
  const [level, setLevel] = useState(0);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(sessionBestScore);
  const [countdown, setCountdown] = useState(3);
  const newHighScoreRef = useRef(false);
  const [highScoreAnimating, setHighScoreAnimating] = useState(false);
  const [showBonusCta, setShowBonusCta] = useState(false);
  const highScoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canvasSizeRef = useRef({ w: 400, h: 500 });

  // ─── Resize canvas ──────────────────────────────────────────────

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const w = Math.min(rect.width, 700);
    const h = Math.min(rect.height - 60, 600);
    canvas.width = w;
    canvas.height = h;
    canvasSizeRef.current = { w, h };
  }, []);

  // ─── Drawing helpers ────────────────────────────────────────────

  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const dark = isDark();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (dark) {
      grad.addColorStop(0, '#1e1b4b');
      grad.addColorStop(1, '#0f172a');
    } else {
      grad.addColorStop(0, '#fecdd3');
      grad.addColorStop(0.5, '#ffe4e6');
      grad.addColorStop(1, '#fff1f2');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Floating emoji clouds
    ctx.globalAlpha = 0.15;
    const t = frameRef.current * 0.01;
    drawEmoji(ctx, '☁️', 20, (w * 0.1 + Math.sin(t) * 20) % w, 60);
    drawEmoji(ctx, '✨', 20, (w * 0.5 + Math.sin(t + 1) * 30) % w, 40);
    drawEmoji(ctx, '☁️', 20, (w * 0.8 + Math.sin(t + 2) * 25) % w, 80);
    ctx.globalAlpha = 1;
  }, []);

  const drawPillar = useCallback((ctx: CanvasRenderingContext2D, x: number, gapY: number, gapSize: number, width: number, h: number) => {
    const dark = isDark();
    const topH = gapY - gapSize / 2;
    const bottomY = gapY + gapSize / 2;
    const radius = 8;

    // Top pillar
    const topGrad = ctx.createLinearGradient(x, 0, x + width, 0);
    if (dark) {
      topGrad.addColorStop(0, '#831843');
      topGrad.addColorStop(1, '#9d174d');
    } else {
      topGrad.addColorStop(0, '#f43f5e');
      topGrad.addColorStop(1, '#fb7185');
    }
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + width, 0);
    ctx.lineTo(x + width, topH - radius);
    ctx.quadraticCurveTo(x + width, topH, x + width - radius, topH);
    ctx.lineTo(x + radius, topH);
    ctx.quadraticCurveTo(x, topH, x, topH - radius);
    ctx.closePath();
    ctx.fill();

    // Bottom pillar
    const botGrad = ctx.createLinearGradient(x, bottomY, x + width, h);
    if (dark) {
      botGrad.addColorStop(0, '#9d174d');
      botGrad.addColorStop(1, '#831843');
    } else {
      botGrad.addColorStop(0, '#fb7185');
      botGrad.addColorStop(1, '#f43f5e');
    }
    ctx.fillStyle = botGrad;
    ctx.beginPath();
    ctx.moveTo(x + radius, bottomY);
    ctx.lineTo(x + width - radius, bottomY);
    ctx.quadraticCurveTo(x + width, bottomY, x + width, bottomY + radius);
    ctx.lineTo(x + width, h);
    ctx.lineTo(x, h);
    ctx.lineTo(x, bottomY + radius);
    ctx.quadraticCurveTo(x, bottomY, x + radius, bottomY);
    ctx.closePath();
    ctx.fill();
  }, []);

  /** Draw the full game scene (background, pillars, hearts, boss, player, HUD) */
  const drawScene = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const lvl = levelRef.current;
    const player = playerRef.current;
    const pillars = pillarsRef.current;
    const hearts = heartsRef.current;
    const boss = bossRef.current;

    drawBackground(ctx, w, h);

    // Pillars
    for (const p of pillars) {
      if (p.x + p.width < 0 || p.x > w) continue;
      drawPillar(ctx, p.x, p.gapY, p.gapSize, p.width, h);
    }

    // Wind zones (semi-transparent swirl indicators)
    for (const wz of windZonesRef.current) {
      if (wz.x + wz.width < 0 || wz.x > w) continue;
      const isUp = wz.force < 0;
      ctx.save();
      ctx.globalAlpha = 0.18 + Math.sin(wz.phase) * 0.06;
      // Gradient streak
      const grad = ctx.createLinearGradient(wz.x, wz.y, wz.x, wz.y + wz.height);
      if (isUp) {
        grad.addColorStop(0, 'rgba(96, 165, 250, 0.5)');
        grad.addColorStop(1, 'rgba(96, 165, 250, 0)');
      } else {
        grad.addColorStop(0, 'rgba(251, 146, 60, 0)');
        grad.addColorStop(1, 'rgba(251, 146, 60, 0.5)');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(wz.x, wz.y, wz.width, wz.height);
      ctx.restore();
      // Arrow emojis indicating direction
      const arrowEmoji = isUp ? '🌬️' : '💨';
      const arrowY = wz.y + wz.height / 2 + Math.sin(wz.phase * 2) * 15;
      ctx.globalAlpha = 0.5 + Math.sin(wz.phase) * 0.2;
      drawEmoji(ctx, arrowEmoji, 20, wz.x + wz.width / 2, arrowY);
      ctx.globalAlpha = 1;
    }

    // Hearts
    for (const heart of hearts) {
      if (heart.collected || heart.x < -HEART_SIZE || heart.x > w + HEART_SIZE) continue;
      drawEmoji(ctx, '💖', HEART_SIZE, heart.x, heart.y);
    }

    // Projectiles
    for (const proj of projectilesRef.current) {
      drawEmoji(ctx, '💔', PROJECTILE_SIZE, proj.x, proj.y);
    }

    // Boss
    if (boss) {
      const isMega = lvl >= 3;
      const bossSize = isMega ? MEGA_BOSS_SIZE : BOSS_SIZE;
      const stunActive = isMega && bossStunTimerRef.current > 0;
      const stunProgress = stunActive
        ? 1 - bossStunTimerRef.current / bossStunDurationRef.current
        : 0;

      if (stunActive) {
        // ── Angry freeze: boss does frustrated wobble in place ──
        const stunT = bossStunDurationRef.current - bossStunTimerRef.current;
        const intensity = 1 + stunProgress * 0.6; // escalates through stun
        // Chaotic micro-movements: small up/down + left/right jitter
        const wobbleY = Math.sin(stunT * 0.18 * intensity) * 6 * intensity
          + Math.sin(stunT * 0.31) * 3;
        const wobbleX = Math.sin(stunT * 0.14 * intensity) * 4 * intensity;
        // Head-shake rotation (frustrated nodding)
        const wobbleAngle = Math.sin(stunT * 0.22 * intensity) * 0.18 * intensity
          + Math.sin(stunT * 0.37) * 0.06;
        // Size pulsation — angry breathing (more pronounced)
        const sizePulse = 1 + Math.sin(stunT * 0.2) * 0.14 * intensity;
        ctx.save();
        ctx.translate(boss.x + wobbleX, boss.y + wobbleY);
        ctx.rotate(wobbleAngle);
        drawEmoji(ctx, '👹', bossSize * sizePulse, 0, 0);
        ctx.restore();
      } else {
        drawEmoji(ctx, isMega ? '👹' : '😈', bossSize, boss.x, boss.y);
      }

      if (isMega) {
        // Mega boss: hearts-based HP display
        const heartsText = '❤️'.repeat(boss.health) + '🖤'.repeat(boss.maxHealth - boss.health);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (stunActive) {
          // Pulsate remaining hearts in SIZE — scale up to ~1.5x
          const stunT = bossStunDurationRef.current - bossStunTimerRef.current;
          const heartScale = 1 + Math.sin(stunT * 0.3) * 0.4;
          ctx.save();
          ctx.translate(boss.x, boss.y - bossSize / 2 - 16);
          ctx.scale(heartScale, heartScale);
          ctx.font = '16px system-ui, sans-serif';
          ctx.fillText(heartsText, 0, 0);
          ctx.restore();
        } else {
          ctx.font = '16px system-ui, sans-serif';
          ctx.fillText(heartsText, boss.x, boss.y - bossSize / 2 - 16);
        }
      } else {
        // Regular boss: distance-based HP bar
        const player = playerRef.current;
        const bossLeft = boss.x - bossSize / 2;
        const playerRight = player.x + player.width;
        const totalDist = bossLeft - (80 + PLAYER_SIZE);
        const currentDist = bossLeft - playerRight;
        const remaining = Math.max(0, Math.min(1, currentDist / totalDist));
        const barW = 80;
        const barH = 8;
        const barX = boss.x - barW / 2;
        const barY = boss.y - bossSize / 2 - 16;
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = remaining > 0.5 ? '#22c55e' : remaining > 0.25 ? '#eab308' : '#ef4444';
        ctx.fillRect(barX, barY, barW * remaining, barH);
        ctx.strokeStyle = isDark() ? '#e5e7eb' : '#1f2937';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);
      }

      // Boss name
      const bossNameY = boss.y - bossSize / 2 - (isMega ? 32 : 28) - 8;
      ctx.font = `bold ${isMega ? 10 : 12}px system-ui, sans-serif`;
      ctx.fillStyle = isDark() ? '#fda4af' : '#881337';
      if (stunActive) {
        // Pulsate name during angry freeze
        const stunT = bossStunDurationRef.current - bossStunTimerRef.current;
        ctx.globalAlpha = 0.5 + Math.sin(stunT * 0.25) * 0.5;
      }
      ctx.textAlign = 'center';
      ctx.fillText(isMega ? config.game.megaBossName : config.game.bossName, boss.x, bossNameY);
      ctx.globalAlpha = 1;
    }

    // Flying hearts (lost heart animation during angry phase & death)
    for (const fh of flyingHeartsRef.current) {
      if (fh.opacity <= 0) continue;
      ctx.save();
      ctx.globalAlpha = fh.opacity;
      ctx.translate(fh.x, fh.y);
      ctx.rotate(fh.rotation);
      drawEmoji(ctx, fh.emoji, fh.size, 0, 0);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Player arrows (mega boss fight)
    for (const arrow of playerArrowsRef.current) {
      drawEmoji(ctx, '🏹', ARROW_SIZE, arrow.x, arrow.y);
    }

    // Player (cupid emoji)
    drawEmoji(ctx, '💘', PLAYER_SIZE, player.x + player.width / 2, player.y + player.height / 2);

    // HUD
    const dark = isDark();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = dark ? '#fecdd3' : '#881337';
    ctx.fillText(`${config.game.scoreLabel}: ${scoreRef.current}`, 12, 12);
    ctx.textAlign = 'right';
    ctx.fillText(`${config.game.levelLabel} ${lvl + 1}`, w - 12, 12);
  }, [drawBackground, drawPillar]);

  // ─── Init level ─────────────────────────────────────────────────

  const initLevel = useCallback((lvl: number, resetScore: boolean, bossRespawn?: boolean) => {
    const cfg = LEVELS[lvl]!;
    const { w, h } = canvasSizeRef.current;
    playerRef.current = { x: 80, y: h * 0.4, vy: 0, width: PLAYER_SIZE, height: PLAYER_SIZE };
    projectilesRef.current = [];
    playerArrowsRef.current = [];
    arrowCooldownRef.current = 0;
    bossStunTimerRef.current = 0;
    bossStunDurationRef.current = 0;
    flyingHeartsRef.current = [];
    frameRef.current = 0;
    hasFlappedRef.current = false;
    diedDuringBossRef.current = false;
    newHighScoreRef.current = false;
    if (bossIntroTimerRef.current !== null) {
      clearTimeout(bossIntroTimerRef.current);
      bossIntroTimerRef.current = null;
    }
    screenRef.current = 'countdown';
    countdownRef.current = 3;
    countdownTimerRef.current = 0;

    if (bossRespawn && cfg.hasBoss) {
      // Skip pillars — go straight to boss fight
      const isMega = lvl >= 3;
      pillarsRef.current = pillarsRef.current.map(p => ({ ...p, passed: true, x: -100 }));
      heartsRef.current = [];
      bossRef.current = {
        x: w - 80,
        y: h / 2,
        health: isMega ? MEGA_BOSS_HP : 1,
        maxHealth: isMega ? MEGA_BOSS_HP : 1,
        phase: 0,
        timer: 0,
        shootCooldown: isMega ? MEGA_BOSS_SHOOT_INTERVAL : BOSS_SHOOT_INTERVAL,
      };
    } else {
      pillarsRef.current = generatePillars(cfg, h);
      heartsRef.current = generateHearts(pillarsRef.current, cfg.heartCount);
      windZonesRef.current = cfg.hasWind ? generateWindZones(pillarsRef.current, h) : [];
      bossRef.current = null;
    }

    if (resetScore) {
      // Boss retry: reset to score when boss appeared (keeps pillar/heart points)
      // Normal retry: reset to level start score
      scoreRef.current = bossRespawn ? bossStartScoreRef.current : levelStartScoreRef.current;
      setScore(scoreRef.current);
    } else {
      levelStartScoreRef.current = scoreRef.current;
    }
    setScreen('countdown');
    setCountdown(3);
  }, []);

  // ─── Best score updater ────────────────────────────────────────

  const updateBestScore = useCallback(() => {
    if (scoreRef.current > bestScoreRef.current) {
      bestScoreRef.current = scoreRef.current;
      sessionBestScore = scoreRef.current;
      setBestScore(scoreRef.current);
      newHighScoreRef.current = true;
    }
  }, []);

  /** Transition to a screen, showing the high-score animation first if earned. */
  const transitionToScreen = useCallback((target: GameScreen, extraFn?: () => void) => {
    updateBestScore();
    const isNew = newHighScoreRef.current;

    // Always freeze the game loop immediately
    screenRef.current = target;

    if (isNew) {
      // Show high-score animation overlay first; delay the actual screen overlay
      setHighScoreAnimating(true);
      // Don't set React screen yet — the overlay is hidden by highScoreAnimating
      setScreen(target);
      highScoreTimerRef.current = setTimeout(() => {
        setHighScoreAnimating(false);
        extraFn?.();
      }, 3200);
    } else {
      setScreen(target);
      extraFn?.();
    }
  }, [updateBestScore]);

  // ─── Flap ───────────────────────────────────────────────────────

  const flap = useCallback(() => {
    if (screenRef.current === 'playing') {
      // Grace period: ignore taps for 150ms after screen transitions to 'playing'
      // to prevent race conditions where a touch event fires between the countdown
      // ending (screenRef = 'playing') and the first game loop frame (which needs
      // to render the "tap to start" hint before accepting input).
      if (performance.now() - playStartTimeRef.current < 150) return;
      hasFlappedRef.current = true;
      playerRef.current.vy = FLAP_EFF;
      sfxFlap();
    }
  }, []);

  // ─── Input handlers ─────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [flap]);

  // ─── Game loop ──────────────────────────────────────────────────

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ── Delta-time scaling ──
    // Physics runs once per rendered frame, scaled by dt so speed is
    // identical on every device. FRAME_MS = 1000/110 (110fps target).
    // On 60fps: dt≈0.75. On slow mobile (30fps): dt≈1.5.
    const now = performance.now();
    const elapsed = Math.min(now - lastTimeRef.current, 100); // cap to avoid spiral
    lastTimeRef.current = now;
    const dt = Math.min(elapsed / FRAME_MS, DT_CAP); // float ratio, no rounding

    const { w, h } = canvasSizeRef.current;
    const currentScreen = screenRef.current;
    const lvl = levelRef.current;
    const cfg = LEVELS[lvl]!;

    // ── Countdown ──
    // Draw the frozen scene with countdown overlay
    if (currentScreen === 'countdown') {
      drawScene(ctx, w, h);

      // Semi-transparent overlay
      ctx.fillStyle = isDark() ? 'rgba(15, 23, 42, 0.5)' : 'rgba(255, 241, 242, 0.5)';
      ctx.fillRect(0, 0, w, h);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Level name
      const dark = isDark();
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillStyle = dark ? '#fda4af' : '#881337';
      ctx.fillText(`${config.game.levelLabel} ${lvl + 1}: ${config.game.levelNames[lvl]}`, w / 2, h / 2 - 50);

      // Countdown number
      ctx.font = 'bold 72px system-ui, sans-serif';
      ctx.fillStyle = dark ? '#fecdd3' : '#e11d48';
      ctx.fillText(String(countdownRef.current), w / 2, h / 2 + 20);

      // Advance countdown timer by dt
      countdownTimerRef.current += dt;
      if (countdownTimerRef.current >= 60) {
        countdownTimerRef.current = 0;
        countdownRef.current--;
        setCountdown(countdownRef.current);
        if (countdownRef.current <= 0) {
          sfxCountdownGo();
          hasFlappedRef.current = false; // ensure tap-to-start after every countdown
          playStartTimeRef.current = performance.now(); // grace period for flap()
          screenRef.current = 'playing';
          setScreen('playing');
        } else {
          sfxCountdownTick();
        }
      }

      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // ── Boss intro announcement (frozen scene) ──
    if (currentScreen === 'bossIntro') {
      drawScene(ctx, w, h);
      // Dark overlay — the React overlay renders the retro text
      ctx.fillStyle = isDark() ? 'rgba(15, 23, 42, 0.6)' : 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, 0, w, h);
      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // ── Playing ──
    if (currentScreen === 'playing') {
      const player = playerRef.current;

      // Run physics once per frame, scaled by dt for smooth rendering
      frameRef.current += dt;

      if (hasFlappedRef.current) {
        const isMegaStunned = levelRef.current >= 3 && bossStunTimerRef.current > 0;

        // ── During mega boss stun: everything freezes except flying hearts ──
        if (isMegaStunned) {
          frameRef.current += dt;

          // Update flying hearts (lost heart animation — slow fade for visibility)
          for (const fh of flyingHeartsRef.current) {
            fh.x += fh.vx * dt;
            fh.y += fh.vy * dt;
            fh.vy += 0.02 * dt;  // gentler gravity
            fh.rotation += fh.rotationSpeed * dt;
            fh.opacity -= 0.002 * dt;  // slow fade — visible for ~half the stun
          }
          flyingHeartsRef.current = flyingHeartsRef.current.filter(fh => fh.opacity > 0);

          // Decrement stun timer
          bossStunTimerRef.current -= dt;
          if (bossStunTimerRef.current <= 0) {
            bossStunTimerRef.current = 0;
            const boss = bossRef.current;
            if (boss) {
              boss.shootCooldown = MEGA_BOSS_SHOOT_INTERVAL;
            }
          }

          // Let existing projectiles drain off-screen
          for (const proj of projectilesRef.current) {
            proj.x += proj.vx * dt;
          }
          projectilesRef.current = projectilesRef.current.filter(p => p.x > -PROJECTILE_SIZE);

          // Let existing arrows drain off-screen
          for (const arrow of playerArrowsRef.current) {
            arrow.x += arrow.vx * dt;
          }
          playerArrowsRef.current = playerArrowsRef.current.filter(a => a.x < w + ARROW_SIZE);

          // Draw frozen scene + angry boss overlay
          drawScene(ctx, w, h);

          rafRef.current = requestAnimationFrame(gameLoop);
          return;
        }

        // Asymmetric gravity: stronger when rising (vy < 0) for "flappy" arcs,
        // normal when falling for a gentle descent.
        const g = GRAVITY_EFF * (player.vy < 0 ? RISE_GRAVITY_MULT : 1.0);
        const vy_old = player.vy;
        player.vy += g * dt;
        player.y += vy_old * dt + g * dt * (dt + 1) / 2;

        // Move pillars
        const pillars = pillarsRef.current;
        for (const p of pillars) {
          p.x -= cfg.speed * dt;
          if (cfg.movingPillars) {
            p.gapY += Math.sin(frameRef.current * 0.03 + p.phase) * cfg.pillarWaveAmplitude * dt;
          }
        }

        // Move hearts with pillars
        const hearts = heartsRef.current;
        for (const heart of hearts) {
          heart.x -= cfg.speed * dt;
        }

        // Move and animate wind zones
        const windZones = windZonesRef.current;
        for (const wz of windZones) {
          wz.x -= cfg.speed * dt;
          wz.phase += 0.06 * dt;
        }

        // Apply wind forces to player
        for (const wz of windZones) {
          const px = player.x + player.width / 2;
          const py = player.y + player.height / 2;
          if (px > wz.x && px < wz.x + wz.width && py > wz.y && py < wz.y + wz.height) {
            player.vy += wz.force * dt;
          }
        }

        // Check pillar passing
        for (const p of pillars) {
          if (!p.passed && p.x + p.width < player.x) {
            p.passed = true;
            scoreRef.current += 1;
            setScore(scoreRef.current);
            updateBestScore();
            sfxPillarPass();
          }
        }

        // Heart collection
        for (const heart of hearts) {
          if (heart.collected) continue;
          const dx = player.x + player.width / 2 - heart.x;
          const dy = player.y + player.height / 2 - heart.y;
          if (Math.sqrt(dx * dx + dy * dy) < (player.width / 2 + HEART_SIZE / 2)) {
            heart.collected = true;
            scoreRef.current += cfg.heartPoints;
            setScore(scoreRef.current);
            updateBestScore();
            sfxCollectHeart();
          }
        }

        // Collision with pillars
        // The emoji glyph has transparent padding around the visible shape,
        // so we inset the hitbox by HITBOX_INSET px on every side to match
        // what the player actually sees on screen.
        const HITBOX_INSET = 6;
        for (const p of pillars) {
          if (
            player.x + player.width - HITBOX_INSET > p.x &&
            player.x + HITBOX_INSET < p.x + p.width
          ) {
            const topH = p.gapY - p.gapSize / 2;
            const bottomY = p.gapY + p.gapSize / 2;
            if (player.y + HITBOX_INSET < topH || player.y + player.height - HITBOX_INSET > bottomY) {
              sfxDie();
              transitionToScreen('gameOver');
              rafRef.current = requestAnimationFrame(gameLoop);
              return;
            }
          }
        }

        // Ceiling clamp — hard boundary, not death
        if (player.y < 0) {
          player.y = 0;
          player.vy = 0;
        }

        // Floor death — only when fully off-screen below
        if (player.y + player.height > h + PLAYER_SIZE) {
          sfxDie();
          if (bossRef.current) {
            diedDuringBossRef.current = true;
          }
          transitionToScreen('gameOver');
          rafRef.current = requestAnimationFrame(gameLoop);
          return;
        }

        // ── Boss logic ──
        const boss = bossRef.current;
        const allPillarsPassed = pillars.every(p => p.passed);

        if (cfg.hasBoss && allPillarsPassed && !boss && screenRef.current !== 'bossIntro') {
          // Show "FINAL BOSS" / "MEGA BOSS" announcement before spawning
          bossStartScoreRef.current = scoreRef.current;
          screenRef.current = 'bossIntro';
          setScreen('bossIntro');
          // After 3.2s, spawn the boss and show 3-2-1 countdown
          bossIntroTimerRef.current = setTimeout(() => {
            const { w: cw, h: ch } = canvasSizeRef.current;
            const isMega = levelRef.current >= 3;
            bossRef.current = {
              x: cw - 80,
              y: ch / 2,
              health: isMega ? MEGA_BOSS_HP : 1,
              maxHealth: isMega ? MEGA_BOSS_HP : 1,
              phase: 0,
              timer: 0,
              shootCooldown: isMega ? MEGA_BOSS_SHOOT_INTERVAL : BOSS_SHOOT_INTERVAL,
            };
            // Reset countdown so player gets a 3-2-1 + tap-to-start before boss fight
            hasFlappedRef.current = false;
            playerRef.current.vy = 0;
            playerRef.current.y = canvasSizeRef.current.h * 0.4;
            countdownRef.current = 3;
            countdownTimerRef.current = 0;
            setCountdown(3);
            screenRef.current = 'countdown';
            setScreen('countdown');
          }, 3200);
          rafRef.current = requestAnimationFrame(gameLoop);
          return;
        }

        if (boss) {
          const isMega = levelRef.current >= 3;
          const bossSize = isMega ? MEGA_BOSS_SIZE : BOSS_SIZE;

          boss.timer += dt;
          boss.phase += 0.04 * dt;
          boss.y = h / 2 + Math.sin(boss.phase) * (h * 0.35);

          // Player advances toward boss (regular boss only — mega boss is stationary fight)
          if (!isMega) {
            player.x += BOSS_ADVANCE_SPEED * dt;
          }

          // Boss shooting
          const shootInterval = isMega ? MEGA_BOSS_SHOOT_INTERVAL : BOSS_SHOOT_INTERVAL;
          if (!isMega) {
            // Regular boss: shoot frequency decreases as player gets closer
            const totalDist = boss.x - bossSize / 2 - (80 + PLAYER_SIZE);
            const currentDist = boss.x - bossSize / 2 - (player.x + player.width);
            const closeness = 1 - Math.max(0, Math.min(1, currentDist / totalDist));
            const adjustedInterval = shootInterval * (1 + closeness * 2);
            boss.shootCooldown -= dt;
            if (boss.shootCooldown <= 0) {
              boss.shootCooldown = adjustedInterval;
              sfxBossShoot();
              projectilesRef.current.push({
                x: boss.x,
                y: boss.y + bossSize / 2,
                vx: -(cfg.speed + 2),
              });
            }
          } else {
            // Mega boss: chaotic dual projectiles from random spread
            boss.shootCooldown -= dt;
            if (boss.shootCooldown <= 0) {
              boss.shootCooldown = shootInterval;
              sfxBossShoot();
              const spread1 = (Math.random() - 0.5) * bossSize * 1.4;
              const spread2 = (Math.random() - 0.5) * bossSize * 1.4;
              const baseVx = cfg.speed + 2.5;
              projectilesRef.current.push(
                { x: boss.x - bossSize / 2, y: boss.y + spread1, vx: -(baseVx + Math.random() * 1.2) },
                { x: boss.x - bossSize / 2, y: boss.y + spread2, vx: -(baseVx + Math.random() * 1.2) },
              );
            }
          }

          // Move projectiles
          const projectiles = projectilesRef.current;
          for (const proj of projectiles) {
            proj.x += proj.vx * dt;
          }
          projectilesRef.current = projectiles.filter(p => p.x > -PROJECTILE_SIZE);

          // Projectile-player collision
          for (const proj of projectilesRef.current) {
            const dx = player.x + player.width / 2 - (proj.x + PROJECTILE_SIZE / 2);
            const dy = player.y + player.height / 2 - (proj.y + PROJECTILE_SIZE / 2);
            if (Math.sqrt(dx * dx + dy * dy) < (player.width / 2 + PROJECTILE_SIZE / 2) * 0.8) {
              sfxDie();
              diedDuringBossRef.current = true;
              transitionToScreen('gameOver');
              rafRef.current = requestAnimationFrame(gameLoop);
              return;
            }
          }

          // ── Mega boss: player auto-fires arrows ──
          if (isMega) {
            arrowCooldownRef.current -= dt;
            if (arrowCooldownRef.current <= 0) {
              arrowCooldownRef.current = PLAYER_ARROW_INTERVAL;
              playerArrowsRef.current.push({
                x: player.x + player.width,
                y: player.y + player.height / 2,
                vx: ARROW_SPEED,
              });
            }

            // Move arrows
            for (const arrow of playerArrowsRef.current) {
              arrow.x += arrow.vx * dt;
            }
            playerArrowsRef.current = playerArrowsRef.current.filter(a => a.x < w + ARROW_SIZE);

            // Arrow-boss collision
            for (let i = playerArrowsRef.current.length - 1; i >= 0; i--) {
              const arrow = playerArrowsRef.current[i]!;
              const dx = arrow.x - boss.x;
              const dy = arrow.y - boss.y;
              if (Math.sqrt(dx * dx + dy * dy) < (bossSize / 2 + ARROW_SIZE / 2)) {
                playerArrowsRef.current.splice(i, 1);
                boss.health--;
                sfxCollectHeart(); // satisfying hit feedback
                if (boss.health <= 0) {
                  // Boss defeated! Spawn death heart animations
                  const heartY = boss.y - bossSize / 2 - 16;
                  flyingHeartsRef.current = [
                    // Last ❤️ shatters
                    { x: boss.x - 12, y: heartY, vx: -1.5, vy: -3, emoji: '💔', size: 20, rotation: 0, rotationSpeed: -0.15, opacity: 1 },
                    // 🖤s scatter in different directions
                    { x: boss.x - 18, y: heartY, vx: -3.5, vy: -2.5, emoji: '🖤', size: 18, rotation: 0, rotationSpeed: 0.2, opacity: 1 },
                    { x: boss.x, y: heartY, vx: 0.5, vy: -4, emoji: '🖤', size: 18, rotation: 0, rotationSpeed: -0.18, opacity: 1 },
                    { x: boss.x + 18, y: heartY, vx: 3.5, vy: -1.5, emoji: '🖤', size: 18, rotation: 0, rotationSpeed: 0.15, opacity: 1 },
                  ];
                  updateBestScore();
                  explodePosRef.current = { x: boss.x, y: boss.y };
                  explodeTimerRef.current = 0;
                  sfxBossFreeze();
                  screenRef.current = 'bossFreeze';
                  setScreen('bossFreeze');
                  rafRef.current = requestAnimationFrame(gameLoop);
                  return;
                }
                // ── Non-lethal hit: trigger angry/stun phase ──
                const isSecondHit = boss.health === 1;
                const stunDuration = isSecondHit ? 550 : 330; // ~5s vs ~3s
                bossStunTimerRef.current = stunDuration;
                bossStunDurationRef.current = stunDuration;
                // Clear in-flight projectiles so player gets a breather
                projectilesRef.current = [];
                // Spawn lost heart flying away — slow drift so it's clearly visible
                const heartFlyY = boss.y - bossSize / 2 - 16;
                flyingHeartsRef.current.push({
                  x: boss.x + (isSecondHit ? -8 : 8),
                  y: heartFlyY,
                  vx: (Math.random() - 0.5) * 2,
                  vy: -1.2 - Math.random() * 0.8,
                  emoji: '💔',
                  size: 22,
                  rotation: 0,
                  rotationSpeed: (Math.random() > 0.5 ? 1 : -1) * (0.06 + Math.random() * 0.08),
                  opacity: 1,
                });
                // Immediately enter stun — early return to frozen frame
                rafRef.current = requestAnimationFrame(gameLoop);
                return;
              }
            }
          }

          // Regular boss: player reaches boss — freeze before explosion!
          if (!isMega) {
            const playerRight = player.x + player.width;
            const bossLeft = boss.x - bossSize / 2;
            if (playerRight >= bossLeft) {
              updateBestScore();
              explodePosRef.current = { x: boss.x, y: boss.y };
              explodeTimerRef.current = 0;
              sfxBossFreeze();
              screenRef.current = 'bossFreeze';
              setScreen('bossFreeze');
              rafRef.current = requestAnimationFrame(gameLoop);
              return;
            }
          }
        }

        // Level complete (no boss level)
        if (!cfg.hasBoss && allPillarsPassed) {
          sfxLevelComplete();
          transitionToScreen('levelComplete');
          rafRef.current = requestAnimationFrame(gameLoop);
          return;
        }
      } else {
        // Before first tap: gentle bob, no scrolling
        player.y += Math.sin(frameRef.current * 0.05) * 0.3;
      }

      // Draw the scene (once per render frame)
      drawScene(ctx, w, h);

      // "Tap to start" hint before first flap
      if (!hasFlappedRef.current) {
        const dark = isDark();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.fillStyle = dark ? '#fda4af' : '#881337';
        ctx.globalAlpha = 0.6 + Math.sin(frameRef.current * 0.08) * 0.4;
        ctx.fillText('Tap / Space to start!', w / 2, h - 40);
        ctx.globalAlpha = 1;
      }
    }

    // ── Boss freeze (pre-explosion) — still → tremble → swell → explode ──
    if (currentScreen === 'bossFreeze') {
      const freezeBossSize = levelRef.current >= 3 ? MEGA_BOSS_SIZE : BOSS_SIZE;
      const freezeBossEmoji = levelRef.current >= 3 ? '👹' : '😈';
      const isMegaDeath = levelRef.current >= 3;
      explodeTimerRef.current += dt;
      const t = explodeTimerRef.current;

      // Update flying hearts (death heart scatter animation)
      for (const fh of flyingHeartsRef.current) {
        fh.x += fh.vx * dt;
        fh.y += fh.vy * dt;
        fh.vy += 0.04 * dt;
        fh.rotation += fh.rotationSpeed * dt;
        fh.opacity -= 0.004 * dt;
      }
      flyingHeartsRef.current = flyingHeartsRef.current.filter(fh => fh.opacity > 0);
      // Mega boss: ~25% longer phases, more pronounced agony
      const stillDuration = isMegaDeath ? 180 : 150;     // ~1.6s vs ~1.4s
      const trembleDuration = isMegaDeath ? 330 : 250;   // ~3.0s vs ~2.3s — much more agony
      const swellDuration = isMegaDeath ? 340 : 275;     // ~3.1s vs ~2.5s
      const totalFreeze = stillDuration + trembleDuration + swellDuration;

      // Draw frozen scene
      drawScene(ctx, w, h);

      // Darkening overlay — builds through all phases
      const dark = isDark();
      const overallProgress = t / totalFreeze;
      const overlayAlpha = 0.1 + overallProgress * 0.35;
      ctx.fillStyle = dark
        ? `rgba(15, 23, 42, ${overlayAlpha})`
        : `rgba(255, 241, 242, ${overlayAlpha})`;
      ctx.fillRect(0, 0, w, h);

      // Draw player
      const player = playerRef.current;
      drawEmoji(ctx, '💘', PLAYER_SIZE, player.x + player.width / 2, player.y + player.height / 2);

      const { x: bx, y: by } = explodePosRef.current;

      if (t <= stillDuration) {
        // ── Still phase: boss frozen in place, slight pulse ──
        const pulse = 1 + Math.sin(t * 0.15) * 0.03;
        const s = freezeBossSize * pulse;
        drawEmoji(ctx, freezeBossEmoji, s, bx, by);

      } else if (t <= stillDuration + trembleDuration) {
        // ── Tremble phase: chaotic shaking that escalates ──
        // Mega boss: more violent shaking, bigger glow, more sparks
        const trembleT = t - stillDuration;
        const progress = trembleT / trembleDuration;
        const megaMult = isMegaDeath ? 1.4 : 1.0; // intensity multiplier

        // Non-linear intensity: starts mild, escalates dramatically
        const intensity = Math.pow(progress, 1.8) * 25 * megaMult;
        // Mix of high-frequency jitter + low-frequency lurches
        const jitterX = (Math.random() - 0.5) * intensity;
        const jitterY = (Math.random() - 0.5) * intensity;
        const lurchX = Math.sin(trembleT * 0.15) * intensity * 0.3;
        const lurchY = Math.cos(trembleT * 0.12) * intensity * 0.4;
        const shakeX = bx + jitterX + lurchX;
        const shakeY = by + jitterY + lurchY;

        // Boss flashes with increasing frequency and erratic alpha
        const flashSpeed = 0.3 + progress * (isMegaDeath ? 1.6 : 1.2);
        ctx.globalAlpha = 0.5 + Math.sin(trembleT * flashSpeed) * 0.3 + Math.random() * progress * 0.2;

        // Size flicker — erratic pulses (mega: bigger fluctuations)
        const flickerAmp = isMegaDeath ? 0.3 : 0.2;
        const flickerNoise = isMegaDeath ? 0.12 : 0.08;
        const sizeFlicker = 1 + Math.sin(trembleT * 0.5) * progress * flickerAmp + Math.random() * progress * flickerNoise;
        drawEmoji(ctx, freezeBossEmoji, freezeBossSize * sizeFlicker, shakeX, shakeY);
        ctx.globalAlpha = 1;

        // Pulsing warning glow — grows chaotically (mega: larger radius)
        const baseGlow = isMegaDeath ? 45 : 35;
        const glowGrowth = isMegaDeath ? 55 : 40;
        const glowRadius = baseGlow + progress * glowGrowth + Math.sin(trembleT * 0.35) * 20;
        const glowAlpha = 0.1 + progress * (isMegaDeath ? 0.5 : 0.4);
        ctx.beginPath();
        ctx.arc(bx, by, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(239, 68, 68, ${glowAlpha})`;
        ctx.fill();

        // Inner glow ring
        if (progress > 0.3) {
          const innerAlpha = (progress - 0.3) * (isMegaDeath ? 0.8 : 0.6);
          ctx.beginPath();
          ctx.arc(bx, by, glowRadius * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(251, 191, 36, ${innerAlpha})`;
          ctx.fill();
        }

        // Sparks start flying off during late tremble (mega: more sparks, earlier)
        const sparkThreshold = isMegaDeath ? 0.35 : 0.5;
        if (progress > sparkThreshold) {
          const sparkAlpha = (progress - sparkThreshold) * 1.5;
          const sparkCount = Math.floor(progress * (isMegaDeath ? 10 : 6));
          for (let i = 0; i < sparkCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 20 + Math.random() * (isMegaDeath ? 45 : 30) * progress;
            ctx.globalAlpha = sparkAlpha * (0.3 + Math.random() * 0.7);
            drawEmoji(ctx, '✨', isMegaDeath ? 18 : 14, bx + Math.cos(angle) * dist, by + Math.sin(angle) * dist);
          }
          ctx.globalAlpha = 1;
        }

      } else {
        // ── Swell phase: boss balloons up like a cartoon about to pop ──
        const swellT = t - stillDuration - trembleDuration;
        const progress = swellT / swellDuration;

        // Trembling while growing — mega boss shakes harder
        const shakeIntensity = isMegaDeath ? 18 : 12;
        const shakeGrowth = isMegaDeath ? 14 : 10;
        const jitter = (Math.random() - 0.5) * (shakeIntensity + progress * shakeGrowth);
        const shakeX = bx + jitter;
        const shakeY = by + (Math.random() - 0.5) * (shakeIntensity + progress * shakeGrowth);

        // Boss balloons — mega: 1x→2.5x, regular: 1x→2.8x
        const maxGrow = isMegaDeath ? 1.5 : 1.8;
        const baseGrow = 1 + progress * maxGrow;
        // Jerky pump pulses that get faster as it's about to pop (mega: more aggressive)
        const pumpFreq = isMegaDeath ? 0.5 + progress * 1.6 : 0.4 + progress * 1.2;
        const pumpAmp = isMegaDeath ? 0.16 + progress * 0.2 : 0.12 + progress * 0.15;
        const pumpNoise = isMegaDeath ? 0.1 : 0.06;
        const pumpScale = baseGrow + Math.sin(swellT * pumpFreq) * pumpAmp + Math.random() * progress * pumpNoise;

        // Boss stays clearly visible — full opacity with only slight flicker
        ctx.globalAlpha = 0.9 + Math.sin(swellT * 0.8) * 0.1;
        drawEmoji(ctx, freezeBossEmoji, freezeBossSize * pumpScale, shakeX, shakeY);
        ctx.globalAlpha = 1;

        // Glow behind boss (mega: brighter, larger)
        const glowRadius = freezeBossSize * pumpScale * (isMegaDeath ? 0.85 : 0.7);
        ctx.beginPath();
        ctx.arc(bx, by, glowRadius, 0, Math.PI * 2);
        const glowBase = isMegaDeath ? 0.18 : 0.12;
        const glowPeak = isMegaDeath ? 0.22 : 0.15;
        ctx.fillStyle = `rgba(239, 68, 68, ${glowBase + progress * glowPeak})`;
        ctx.fill();

        // Sparks flying off — mega boss: more and bigger
        const sparkCount = Math.floor((isMegaDeath ? 4 : 2) + progress * (isMegaDeath ? 12 : 8));
        const sparkSize = isMegaDeath ? 18 : 14;
        for (let i = 0; i < sparkCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = freezeBossSize * pumpScale * 0.5 + Math.random() * (isMegaDeath ? 45 : 30);
          ctx.globalAlpha = 0.3 + Math.random() * 0.5;
          drawEmoji(ctx, i % 2 === 0 ? '✨' : '💫', sparkSize, bx + Math.cos(angle) * dist, by + Math.sin(angle) * dist);
        }
        ctx.globalAlpha = 1;
      }

      // Draw flying hearts (death scatter — 💔 and 🖤 flying off)
      for (const fh of flyingHeartsRef.current) {
        if (fh.opacity <= 0) continue;
        ctx.save();
        ctx.globalAlpha = fh.opacity;
        ctx.translate(fh.x, fh.y);
        ctx.rotate(fh.rotation);
        drawEmoji(ctx, fh.emoji, fh.size, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // HUD
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillStyle = dark ? '#fecdd3' : '#881337';
      ctx.fillText(`${config.game.scoreLabel}: ${scoreRef.current}`, 12, 12);
      ctx.textAlign = 'right';
      ctx.fillText(`${config.game.levelLabel} ${levelRef.current + 1}`, w - 12, 12);

      // Transition to explosion
      if (t >= totalFreeze) {
        explodeTimerRef.current = 0;
        sfxBossExplode();
        screenRef.current = 'bossExplode';
        setScreen('bossExplode');
      }

      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // ── Boss explosion animation — grandiose finale ──
    if (currentScreen === 'bossExplode') {
      const explBossSize = levelRef.current >= 3 ? MEGA_BOSS_SIZE : BOSS_SIZE;
      const explBossEmoji = levelRef.current >= 3 ? '👹' : '😈';
      const isMegaExplode = levelRef.current >= 3;
      explodeTimerRef.current += dt;
      const t = explodeTimerRef.current;
      const { x: bx, y: by } = explodePosRef.current;
      const duration = isMegaExplode ? 430 : 350; // mega: ~3.9s, regular: ~3.2s

      // Continue flying hearts animation into explosion phase
      for (const fh of flyingHeartsRef.current) {
        fh.x += fh.vx * dt;
        fh.y += fh.vy * dt;
        fh.vy += 0.04 * dt;
        fh.rotation += fh.rotationSpeed * dt;
        fh.opacity -= 0.004 * dt;
      }
      flyingHeartsRef.current = flyingHeartsRef.current.filter(fh => fh.opacity > 0);

      drawBackground(ctx, w, h);

      // Draw player standing victorious
      const player = playerRef.current;
      drawEmoji(ctx, '💘', PLAYER_SIZE, player.x + player.width / 2, player.y + player.height / 2);

      // Expanding shockwave rings (mega: 9 rings, thicker, faster expanding)
      const ringCount = isMegaExplode ? 9 : 7;
      for (let i = 0; i < ringCount; i++) {
        const delay = i * (isMegaExplode ? 10 : 12);
        const ringT = t - delay;
        if (ringT <= 0) continue;
        const radius = ringT * (isMegaExplode ? 5.5 : 4.5);
        const alpha = Math.max(0, 1 - ringT / (isMegaExplode ? 85 : 70));
        ctx.beginPath();
        ctx.arc(bx, by, radius, 0, Math.PI * 2);
        const colors = [
          [239, 68, 68], [251, 146, 243], [251, 191, 36],
          [239, 68, 68], [147, 51, 234], [251, 146, 243], [251, 191, 36],
          [239, 68, 68], [147, 51, 234],
        ];
        const [r, g, b] = colors[i % colors.length]!;
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.lineWidth = (isMegaExplode ? 7 : 5) - i * 0.5;
        ctx.stroke();
      }

      // Boss shrinks, spins rapidly, and fades (mega: longer shrink)
      const shrinkDuration = isMegaExplode ? 100 : 80;
      if (t < shrinkDuration) {
        const scale = Math.max(0, 1 - t / shrinkDuration);
        const rotation = t * (isMegaExplode ? 0.4 : 0.3);
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(rotation);
        ctx.globalAlpha = scale;
        // Start large (from swell phase) and shrink
        const startScale = isMegaExplode ? 2.5 : 2.0;
        const s = explBossSize * (scale * startScale + 0.1);
        const sprite = getEmojiSprite(explBossEmoji, explBossSize);
        ctx.drawImage(sprite, -s / 2, -s / 2, s, s);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // Wave 1 — large explosion emojis flying outward
      const bursts1Base = [
        '💥', '✨', '💫', '⭐', '💥', '🔥', '✨', '💥', '⭐', '🔥',
        '💫', '✨', '💥', '⭐', '🔥', '💥', '✨', '💫', '⭐', '🔥',
        '💥', '✨', '⭐', '🔥', '💫', '💥', '✨', '⭐',
      ];
      // Mega: add extra particles
      const bursts1 = isMegaExplode
        ? [...bursts1Base, '💥', '🔥', '✨', '💫', '⭐', '💥', '🔥', '✨']
        : bursts1Base;
      const wave1Size = isMegaExplode ? 38 : 32;
      for (let i = 0; i < bursts1.length; i++) {
        const angle = (i / bursts1.length) * Math.PI * 2 + t * 0.012;
        const dist = t * (isMegaExplode ? 4.2 : 3.5);
        const alpha = Math.max(0, 1 - t / duration);
        const ex = bx + Math.cos(angle) * dist;
        const ey = by + Math.sin(angle) * dist;
        ctx.globalAlpha = alpha;
        drawEmoji(ctx, bursts1[i]!, wave1Size, ex, ey);
      }

      // Wave 2 — delayed heart burst (love conquers all)
      if (t > 20) {
        const wave2Base = [
          '💖', '💝', '💗', '💘', '💞', '💓', '💖', '💝', '💗',
          '💘', '💞', '💓', '💖', '💝', '💗', '💘', '💞', '💓',
        ];
        const wave2 = isMegaExplode
          ? [...wave2Base, '💖', '💝', '💗', '💘', '💞', '💓', '💖']
          : wave2Base;
        const wave2Size = isMegaExplode ? 32 : 26;
        for (let i = 0; i < wave2.length; i++) {
          const angle = (i / wave2.length) * Math.PI * 2 + Math.PI / 9;
          const dist = (t - 20) * (isMegaExplode ? 3.0 : 2.5);
          const alpha = Math.max(0, 1 - (t - 20) / (duration - 20));
          const ex = bx + Math.cos(angle) * dist;
          const ey = by + Math.sin(angle) * dist;
          ctx.globalAlpha = alpha;
          drawEmoji(ctx, wave2[i]!, wave2Size, ex, ey);
        }
      }

      // Wave 3 — late sparkle burst (fills the screen)
      if (t > 50) {
        const wave3Base = [
          '✨', '🌟', '⭐', '✨', '🌟', '⭐', '✨', '🌟', '⭐', '✨',
          '🌟', '⭐', '✨', '🌟', '⭐', '✨', '🌟', '⭐', '✨', '🌟',
          '⭐', '✨', '🌟', '⭐', '✨',
        ];
        const wave3 = isMegaExplode
          ? [...wave3Base, '🌟', '⭐', '✨', '🌟', '⭐', '✨', '🌟', '⭐', '✨', '🌟']
          : wave3Base;
        const wave3Size = isMegaExplode ? 24 : 20;
        for (let i = 0; i < wave3.length; i++) {
          const angle = (i / wave3.length) * Math.PI * 2 + Math.PI / 4;
          const dist = (t - 50) * (isMegaExplode ? 2.4 : 2.0);
          const alpha = Math.max(0, 1 - (t - 50) / (duration - 50));
          const ex = bx + Math.cos(angle) * dist;
          const ey = by + Math.sin(angle) * dist;
          ctx.globalAlpha = alpha;
          drawEmoji(ctx, wave3[i]!, wave3Size, ex, ey);
        }
      }
      ctx.globalAlpha = 1;

      // Screen flash — mega boss: brighter, extra purple pulse
      if (t < 15) {
        ctx.fillStyle = `rgba(255, 255, 255, ${(isMegaExplode ? 0.95 : 0.8) * (1 - t / 15)})`;
        ctx.fillRect(0, 0, w, h);
      } else if (t > 25 && t < 40) {
        const flashT = (t - 25) / 15;
        ctx.fillStyle = `rgba(251, 146, 243, ${(isMegaExplode ? 0.45 : 0.35) * (1 - flashT)})`;
        ctx.fillRect(0, 0, w, h);
      } else if (t > 55 && t < 70) {
        const flashT = (t - 55) / 15;
        ctx.fillStyle = `rgba(251, 191, 36, ${(isMegaExplode ? 0.3 : 0.2) * (1 - flashT)})`;
        ctx.fillRect(0, 0, w, h);
      }
      // Mega boss: extra purple flash
      if (isMegaExplode && t > 80 && t < 100) {
        const flashT = (t - 80) / 20;
        ctx.fillStyle = `rgba(147, 51, 234, ${0.3 * (1 - flashT)})`;
        ctx.fillRect(0, 0, w, h);
      }

      // Draw flying hearts (continue from freeze phase)
      for (const fh of flyingHeartsRef.current) {
        if (fh.opacity <= 0) continue;
        ctx.save();
        ctx.globalAlpha = fh.opacity;
        ctx.translate(fh.x, fh.y);
        ctx.rotate(fh.rotation);
        drawEmoji(ctx, fh.emoji, fh.size, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // HUD
      const dark = isDark();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillStyle = dark ? '#fecdd3' : '#881337';
      ctx.fillText(`${config.game.scoreLabel}: ${scoreRef.current}`, 12, 12);
      ctx.textAlign = 'right';
      ctx.fillText(`${config.game.levelLabel} ${levelRef.current + 1}`, w - 12, 12);

      // Transition to victory
      if (t >= duration) {
        sfxVictory();
        setShowBonusCta(false);
        transitionToScreen('victory', () => {
          triggerVictoryFireworks();
          // Show bonus level CTA after 1s delay, only if there's a next level
          if (levelRef.current + 1 < LEVELS.length) {
            setTimeout(() => setShowBonusCta(true), 1000);
          }
        });
      }

      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // ── Static screens (gameOver / levelComplete / victory) ──
    if (currentScreen === 'gameOver' || currentScreen === 'levelComplete' || currentScreen === 'victory') {
      drawScene(ctx, w, h);
      ctx.fillStyle = isDark() ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 241, 242, 0.6)';
      ctx.fillRect(0, 0, w, h);
    }

    rafRef.current = requestAnimationFrame(gameLoop);
  }, [drawScene, transitionToScreen]);

  // ─── Start / stop loop (mount-only) ─────────────────────────────

  useEffect(() => {
    registerAudioUnlock(); // prime iOS audio on first user touch
    resizeCanvas();
    lastTimeRef.current = performance.now();
    levelStartScoreRef.current = 0;
    scoreRef.current = 0;
    setScore(0);
    initLevel(0, false);
    rafRef.current = requestAnimationFrame(gameLoop);

    const handleResize = () => resizeCanvas();
    window.addEventListener('resize', handleResize);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (highScoreTimerRef.current !== null) clearTimeout(highScoreTimerRef.current);
      if (bossIntroTimerRef.current !== null) clearTimeout(bossIntroTimerRef.current);
      window.removeEventListener('resize', handleResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Actions ────────────────────────────────────────────────────

  const handleNextLevel = () => {
    const next = levelRef.current + 1;
    if (next >= LEVELS.length) {
      transitionToScreen('victory', triggerVictoryFireworks);
      return;
    }
    levelRef.current = next;
    setLevel(next);
    initLevel(next, false); // keep score between levels
  };

  const handleRetry = () => {
    const bossRetry = diedDuringBossRef.current;
    initLevel(levelRef.current, true, bossRetry);
  };

  const handleBonusLevel = () => {
    const next = levelRef.current + 1;
    if (next >= LEVELS.length) return;
    levelRef.current = next;
    setLevel(next);
    setShowBonusCta(false);
    initLevel(next, false);
  };

  const handleCanvasInteraction = () => {
    flap();
  };

  // ─── Render ─────────────────────────────────────────────────────

  const dark = isDark();
  const overlayBg = dark ? 'bg-slate-900/80' : 'bg-white/80';
  const textPrimary = dark ? 'text-rose-100' : 'text-rose-900';
  const textSecondary = dark ? 'text-rose-300' : 'text-rose-700';

  return (
    <div
      ref={containerRef}
      className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-rose-100 via-pink-50 to-rose-200 dark:from-slate-950 dark:via-gray-900 dark:to-slate-950 px-4 py-4 transition-colors duration-500"
    >
      {/* Keyframes for retro high-score and boss intro animations */}
      <style>{`
        @keyframes highScorePop {
          0%   { transform: scale(0.2) rotate(-5deg); opacity: 0; filter: blur(8px); }
          8%   { transform: scale(1.8) rotate(2deg); opacity: 1; filter: blur(0); }
          16%  { transform: scale(0.85) rotate(-1deg); opacity: 1; filter: blur(0); }
          24%  { transform: scale(1.35) rotate(1deg); opacity: 1; filter: blur(0); }
          32%  { transform: scale(0.95) rotate(0deg); opacity: 1; filter: blur(0); }
          40%  { transform: scale(1.1) rotate(0deg); opacity: 1; filter: blur(0); }
          48%  { transform: scale(1.0) rotate(0deg); opacity: 1; filter: blur(0); }
          78%  { transform: scale(1.0) rotate(0deg); opacity: 1; filter: blur(0); }
          100% { transform: scale(2.2) rotate(3deg); opacity: 0; filter: blur(10px); }
        }
        @keyframes highScoreStars {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50%      { transform: scale(1.3); opacity: 1; }
        }
        @keyframes bossIntroPop {
          0%   { transform: scale(0) rotate(-8deg); opacity: 0; filter: blur(12px); }
          6%   { transform: scale(2.2) rotate(3deg); opacity: 1; filter: blur(0); }
          12%  { transform: scale(0.7) rotate(-2deg); opacity: 1; filter: blur(0); }
          20%  { transform: scale(1.5) rotate(2deg); opacity: 1; filter: blur(0); }
          28%  { transform: scale(0.9) rotate(0deg); opacity: 1; filter: blur(0); }
          36%  { transform: scale(1.15) rotate(0deg); opacity: 1; filter: blur(0); }
          44%  { transform: scale(1.0) rotate(0deg); opacity: 1; filter: blur(0); }
          85%  { transform: scale(1.0) rotate(0deg); opacity: 1; filter: blur(0); }
          100% { transform: scale(2.5) rotate(5deg); opacity: 0; filter: blur(14px); }
        }
        @keyframes bossIntroGlow {
          0%, 100% { text-shadow: 0 0 20px rgba(239,68,68,0.6), 0 0 40px rgba(239,68,68,0.3); }
          50%      { text-shadow: 0 0 30px rgba(239,68,68,0.9), 0 0 60px rgba(239,68,68,0.5), 0 0 80px rgba(147,51,234,0.3); }
        }
        @keyframes bossIntroEmoji {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25%      { transform: scale(1.2) rotate(-5deg); }
          75%      { transform: scale(1.2) rotate(5deg); }
        }
        @keyframes bonusFadeIn {
          0%   { opacity: 0; transform: translateY(12px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-[700px] mb-3">
        <button
          type="button"
          onClick={onBack}
          className={`text-sm font-medium ${textSecondary} hover:underline`}
        >
          &larr; {config.game.backToQuiz}
        </button>
        <div className={`text-sm font-bold ${textPrimary}`}>
          {config.game.scoreLabel}: {score}
          {bestScore > 0 && <span className={`ml-2 ${textSecondary} font-normal`}>Best: {bestScore}</span>}
          &nbsp;|&nbsp; {config.game.levelLabel} {level + 1}
        </div>
      </div>

      {/* Canvas */}
      <div className="relative w-full max-w-[700px]">
        <canvas
          ref={canvasRef}
          className="rounded-2xl shadow-2xl border border-white/40 dark:border-white/10 w-full cursor-pointer"
          onClick={handleCanvasInteraction}
          onTouchStart={(e) => {
            e.preventDefault();
            flap();
          }}
        />

        {/* Overlay screens rendered on top of canvas */}

        {/* Dedicated NEW HIGH SCORE animation — plays alone, before level/victory overlay */}
        {highScoreAnimating && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-2xl ${overlayBg} backdrop-blur-sm`}>
            <div
              className="flex flex-col items-center"
              style={{ animation: 'highScorePop 3.2s ease-out forwards' }}
            >
              <div className="text-4xl mb-3" style={{ animation: 'highScoreStars 1.6s ease-in-out infinite' }}>
                ✨ 🌟 ✨
              </div>
              <p
                className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-300"
                style={{
                  fontFamily: '"Press Start 2P", "Courier New", monospace',
                  fontSize: 'clamp(1.6rem, 5vw, 2.4rem)',
                  letterSpacing: '0.06em',
                  lineHeight: 1.3,
                  textAlign: 'center',
                }}
              >
                {config.game.newHighScore}
              </p>
              <p className={`text-xl font-bold ${textPrimary} mt-3`}>
                {score}
              </p>
            </div>
          </div>
        )}

        {/* FINAL BOSS / MEGA BOSS retro announcement */}
        {screen === 'bossIntro' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl">
            <div
              className="flex flex-col items-center"
              style={{ animation: 'bossIntroPop 3.2s ease-out forwards' }}
            >
              <div className="text-5xl mb-4" style={{ animation: 'bossIntroEmoji 0.8s ease-in-out infinite' }}>
                {level >= 3 ? '👹' : '😈'}
              </div>
              <p
                className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-purple-500 to-red-500"
                style={{
                  fontFamily: '"Press Start 2P", "Courier New", monospace',
                  fontSize: 'clamp(1.8rem, 6vw, 2.8rem)',
                  letterSpacing: '0.08em',
                  lineHeight: 1.3,
                  textAlign: 'center',
                  animation: 'bossIntroGlow 1.2s ease-in-out infinite',
                }}
              >
                {level >= 3 ? config.game.megaBoss : config.game.finalBoss}
              </p>
            </div>
          </div>
        )}

        {screen === 'levelComplete' && !highScoreAnimating && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-2xl ${overlayBg} backdrop-blur-sm`}>
            <div className="text-5xl mb-4">🎉</div>
            <h2 className={`text-2xl font-bold ${textPrimary} mb-2`}>
              {config.game.levelNames[level]} Complete!
            </h2>
            <p className={`text-lg ${textSecondary} mb-6`}>
              {config.game.scoreLabel}: {score}
            </p>
            <button
              type="button"
              onClick={handleNextLevel}
              className="px-8 py-3 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-bold rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
            >
              Next Level &rarr;
            </button>
          </div>
        )}

        {screen === 'gameOver' && !highScoreAnimating && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-2xl ${overlayBg} backdrop-blur-sm`}>
            <div className="text-5xl mb-4">💔</div>
            <h2 className={`text-2xl font-bold ${textPrimary} mb-2`}>
              {config.game.gameOver}
            </h2>
            <p className={`text-lg ${textSecondary} mb-1`}>
              {config.game.scoreLabel}: {score}
            </p>
            {bestScore > 0 && (
              <p className={`text-sm ${textSecondary} mb-6`}>
                Best: {bestScore}
              </p>
            )}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleRetry}
                className="px-6 py-3 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-bold rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
              >
                {config.game.tryAgain}
              </button>
              <button
                type="button"
                onClick={onBack}
                className="px-6 py-3 bg-white/60 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 text-rose-700 dark:text-rose-300 font-bold rounded-full shadow-lg border border-rose-200 dark:border-white/10 transition-all duration-200 hover:scale-105 active:scale-95"
              >
                {config.game.backToQuiz}
              </button>
            </div>
          </div>
        )}

        {screen === 'victory' && !highScoreAnimating && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-2xl ${overlayBg} backdrop-blur-sm`}>
            <div className="text-5xl mb-4">🏆</div>
            <h2 className={`text-2xl font-bold ${textPrimary} mb-2`}>
              {config.game.victory}
            </h2>
            <p className={`text-lg ${textSecondary} mb-1`}>
              {level >= 3 ? config.game.megaVictoryMessage : config.game.victoryMessage}
            </p>
            <p className={`text-lg font-bold ${textPrimary} mb-6`}>
              {config.game.scoreLabel}: {score}
            </p>
            <button
              type="button"
              onClick={onBack}
              className="px-8 py-3 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-bold rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
            >
              {config.game.backToQuiz}
            </button>
            {/* Reserve space so layout doesn't jump when bonus button fades in */}
            {level + 1 < LEVELS.length && (
              <button
                type="button"
                onClick={showBonusCta ? handleBonusLevel : undefined}
                className={`mt-3 px-8 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-bold rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 ${
                  showBonusCta ? '' : 'opacity-0 pointer-events-none'
                }`}
                style={showBonusCta ? { animation: 'bonusFadeIn 0.6s ease-out forwards' } : undefined}
              >
                ⚡ {config.game.bonusLevel}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mobile tap hint */}
      {screen === 'playing' && (
        <p className={`mt-3 text-xs ${textSecondary} animate-pulse`}>
          Tap / Space / &uarr; to flap
        </p>
      )}
    </div>
  );
}
