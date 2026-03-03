/**
 * Game Sound Effects & Haptic Feedback
 *
 * Sound: Web Audio API oscillator-based (no asset files).
 * Haptics: Navigator.vibrate() for Android; iOS Safari does not support it.
 * Both respect prefers-reduced-motion.
 */

// ─── Audio context (lazy singleton) ─────────────────────────────────

let audioCtx: AudioContext | null = null;
let audioUnlocked = false;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  // Resume if suspended (browsers require user gesture first)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  // iOS Safari workaround: play a silent buffer on first interaction to
  // unlock the audio pipeline. Without this, the first real sound is swallowed.
  if (!audioUnlocked) {
    audioUnlocked = true;
    try {
      const buf = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start(0);
    } catch {
      // ignore — unlock is best-effort
    }
  }
  return audioCtx;
}

function isReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ─── Haptics ────────────────────────────────────────────────────────

function vibrate(pattern: number | number[]): void {
  if (isReducedMotion()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Silently ignore — not supported on this device/browser
  }
}

// ─── Sound helpers ──────────────────────────────────────────────────

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume: number = 0.15,
  freqEnd?: number,
): void {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    if (freqEnd !== undefined) {
      osc.frequency.linearRampToValueAtTime(freqEnd, ctx.currentTime + duration);
    }

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Silently ignore audio errors
  }
}

/** Play a short noise burst (for impact/explosion textures). */
function playNoise(duration: number, volume: number = 0.08): void {
  try {
    const ctx = getAudioCtx();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); // decaying noise
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(ctx.currentTime);
  } catch {
    // Silently ignore
  }
}

// ─── Mobile detection (cached) ───────────────────────────────────────

let _isMobile: boolean | null = null;

function isMobile(): boolean {
  if (_isMobile === null) {
    _isMobile = window.matchMedia('(pointer: coarse)').matches;
  }
  return _isMobile;
}

// ─── iOS audio unlock ───────────────────────────────────────────────
// iOS Safari requires AudioContext to be created AND resumed during a
// user gesture. Register a one-time document-level listener that unlocks
// audio on the very first touch/click, before any game interaction.

let _audioUnlockRegistered = false;

/** Call once on mount to register the iOS audio unlock listener. */
export function registerAudioUnlock(): void {
  if (_audioUnlockRegistered) return;
  _audioUnlockRegistered = true;

  const unlock = () => {
    getAudioCtx(); // creates context + plays silent buffer
    document.removeEventListener('touchstart', unlock, true);
    document.removeEventListener('touchend', unlock, true);
    document.removeEventListener('click', unlock, true);
  };
  // Use capture phase to fire before any preventDefault
  document.addEventListener('touchstart', unlock, true);
  document.addEventListener('touchend', unlock, true);
  document.addEventListener('click', unlock, true);
}

// ─── Game sound effects ─────────────────────────────────────────────

/** Quick ascending blip when the player flaps. Softer on mobile. */
export function sfxFlap(): void {
  if (isMobile()) {
    // Softer sine tone for mobile — louder than initial attempt so it's
    // actually audible on iOS speakers (0.04 was inaudible).
    playTone(400, 0.07, 'sine', 0.10, 540);
    return;
  }
  playTone(420, 0.07, 'square', 0.06, 650);
}

/** Joyful musical pickup when collecting a heart. */
export function sfxCollectHeart(): void {
  // Quick ascending arpeggio — C6 E6 G6
  playTone(1047, 0.06, 'sine', 0.12);
  setTimeout(() => playTone(1319, 0.06, 'sine', 0.11), 40);
  setTimeout(() => playTone(1568, 0.10, 'sine', 0.13), 80);
  // Sparkle overtone
  setTimeout(() => playTone(2093, 0.08, 'triangle', 0.05), 110);
  vibrate(15);
}

/** Subtle tick when passing a pillar. */
export function sfxPillarPass(): void {
  playTone(520, 0.04, 'triangle', 0.05);
}

/** Descending sad tone on death. */
export function sfxDie(): void {
  playTone(500, 0.15, 'square', 0.10, 200);
  setTimeout(() => playTone(200, 0.20, 'sawtooth', 0.08, 80), 100);
  vibrate(60);
}

/** Quick "pew" when boss fires a projectile. */
export function sfxBossShoot(): void {
  playTone(900, 0.10, 'square', 0.07, 300);
}

/** Ominous rising drone during boss freeze phase (plays for ~5s). */
export function sfxBossFreeze(): void {
  // Low ominous drone that builds
  playTone(80, 5.0, 'sawtooth', 0.04, 200);
  // Pulsing mid-tone that enters after the still phase
  setTimeout(() => playTone(250, 3.0, 'square', 0.03, 500), 2000);
  // High tension riser
  setTimeout(() => playTone(400, 2.5, 'sine', 0.04, 1200), 2500);
}

/** Big multi-layered impact for boss explosion (~2.3s). */
export function sfxBossExplode(): void {
  // Deep boom
  playTone(60, 0.6, 'sawtooth', 0.20, 30);
  // Noise crunch
  playNoise(0.3, 0.12);
  // Mid impact
  setTimeout(() => playTone(200, 0.3, 'square', 0.14, 80), 40);
  // Cascading sparkles
  setTimeout(() => playTone(800, 0.2, 'sine', 0.08, 400), 100);
  setTimeout(() => playTone(1200, 0.15, 'sine', 0.06, 600), 200);
  setTimeout(() => playTone(1600, 0.12, 'triangle', 0.05, 800), 300);
  // Trailing rumble
  setTimeout(() => {
    playTone(50, 0.5, 'sawtooth', 0.08, 25);
    playNoise(0.25, 0.06);
  }, 500);
  vibrate([80, 30, 120, 40, 80]);
}

/** Celebratory ascending tones on level complete. */
export function sfxLevelComplete(): void {
  playTone(523, 0.12, 'sine', 0.12); // C5
  setTimeout(() => playTone(659, 0.12, 'sine', 0.12), 100); // E5
  setTimeout(() => playTone(784, 0.20, 'sine', 0.14), 200); // G5
  // Bright overtone
  setTimeout(() => playTone(1047, 0.10, 'triangle', 0.06), 320);
  vibrate(40);
}

/** Victory fanfare after defeating the boss. */
export function sfxVictory(): void {
  // Triumphant ascending fanfare
  playTone(523, 0.15, 'sine', 0.14);  // C5
  setTimeout(() => playTone(659, 0.15, 'sine', 0.14), 120);  // E5
  setTimeout(() => playTone(784, 0.15, 'sine', 0.14), 240);  // G5
  setTimeout(() => playTone(1047, 0.25, 'sine', 0.16), 380); // C6
  // Harmony layer
  setTimeout(() => playTone(659, 0.30, 'triangle', 0.06), 380); // E5 sustained
  setTimeout(() => playTone(784, 0.30, 'triangle', 0.06), 380); // G5 sustained
  // Final sparkle
  setTimeout(() => playTone(2093, 0.12, 'sine', 0.05), 550); // C7 twinkle
  vibrate([50, 30, 50, 30, 200]);
}

/** Countdown beep (one per count). */
export function sfxCountdownTick(): void {
  playTone(440, 0.08, 'sine', 0.10);
}

/** Final countdown beep ("Go!"). */
export function sfxCountdownGo(): void {
  playTone(660, 0.15, 'sine', 0.14);
}
