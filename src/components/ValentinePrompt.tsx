import { useState, useRef, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { config } from '../../config/config';
import { startButtonPulseAndParticles } from '../utils/buttonPulseEmit';
import { dissipateElement } from '../utils/textDissipate';

interface ValentinePromptProps {
  onYes: (noCount: number) => void;
  hideNoButton?: boolean;
  onPlayGame?: () => void;
}

/** Physics constants for the bouncing No button */
const PHYSICS = {
  /** Friction applied each frame (0-1, closer to 1 = more slippery) */
  FRICTION: 0.985,
  /** Velocity below which the button stops */
  MIN_VELOCITY: 0.15,
  /** Initial speed when fleeing from cursor */
  LAUNCH_SPEED: 18,
  /** Bounce energy retention (0-1, 1 = perfectly elastic) */
  RESTITUTION: 0.7,
  /** Padding from container edges in pixels */
  EDGE_PADDING: 0,
  /** Extra gap between No button and Yes button on collision */
  YES_BUTTON_GAP: 2,
  /** Distance from button edge (px) to trigger dodge (negative = cursor must be inside) */
  DODGE_THRESHOLD: -5,
  /** Distance threshold multiplier to stop chase mode */
  CHASE_STOP_MULTIPLIER: 2.5,
};

export function ValentinePrompt({ onYes, hideNoButton, onPlayGame }: ValentinePromptProps) {
  const [noButtonPosition, setNoButtonPosition] = useState({ x: 20, y: 70 });
  const [isChasing, setIsChasing] = useState(false);
  const [noButtonOpacity, setNoButtonOpacity] = useState(1);
  const [noClickCount, setNoClickCount] = useState(0);
  const [noClickMessage, setNoClickMessage] = useState<string | null>(null);
  const noButtonRef = useRef<HTMLButtonElement>(null);
  const yesButtonRef = useRef<HTMLButtonElement>(null);
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(0);
  const messageTimerRef = useRef<number | null>(null);
  const pulseCleanupRef = useRef<(() => void) | null>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const yesAnimatedRef = useRef(false);

  // Physics state stored in refs for use inside requestAnimationFrame
  const velocityRef = useRef({ vx: 0, vy: 0 });
  const positionRef = useRef({ x: 20, y: 70 });
  const animFrameRef = useRef<number | null>(null);

  const handleYesClick = () => {
    // Guard: only run non-confetti animations once
    if (!yesAnimatedRef.current) {
      yesAnimatedRef.current = true;

      setIsChasing(false);

      // Stop physics animation
      velocityRef.current = { vx: 0, vy: 0 };
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      // Animate No button: spin + shrink + fade out via Web Animations API
      // (WAAPI overrides CSS animation's transform while it keeps providing background-color)
      const noBtn = noButtonRef.current;
      if (noBtn && noBtn.animate) {
        noBtn.animate(
          [
            { transform: 'scale(1) rotate(0deg)', opacity: 1 },
            { transform: 'scale(0) rotate(720deg)', opacity: 0 },
          ],
          { duration: 800, easing: 'ease-in', fill: 'forwards' },
        );
      }
      // Fallback: hide after animation duration
      setTimeout(() => setNoButtonOpacity(0), 850);

      // Start heartbeat pulsation and particle emission on Yes button
      if (yesButtonRef.current) {
        pulseCleanupRef.current = startButtonPulseAndParticles(yesButtonRef.current);
      }

      // Explode subtitle and hint text into particles
      if (subtitleRef.current) dissipateElement(subtitleRef.current);
      if (hintRef.current) dissipateElement(hintRef.current);
    }

    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

    const randomInRange = (min: number, max: number) => {
      return Math.random() * (max - min) + min;
    };

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      const particleCount = 50 * (timeLeft / duration);

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ['#ff1744', '#ff5252', '#ff6e40', '#ff9100', '#ffc400'],
      });

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ['#ff1744', '#ff5252', '#ff6e40', '#ff9100', '#ffc400'],
      });
    }, 250);

    setTimeout(() => {
      onYes(noClickCount);
    }, 500);
  };

  /**
   * Resolve collision between the No button rect and the Yes button rect.
   * Returns corrected position and reflected velocity.
   */
  const resolveYesButtonCollision = useCallback(
    (
      noX: number,
      noY: number,
      noW: number,
      noH: number,
      vx: number,
      vy: number,
    ): { x: number; y: number; vx: number; vy: number } | null => {
      if (!yesButtonRef.current || !buttonContainerRef.current) return null;

      const containerRect = buttonContainerRef.current.getBoundingClientRect();
      const yesRect = yesButtonRef.current.getBoundingClientRect();

      // Convert Yes button to container-relative coordinates
      const yesLeft = yesRect.left - containerRect.left;
      const yesTop = yesRect.top - containerRect.top;
      const yesRight = yesLeft + yesRect.width;
      const yesBottom = yesTop + yesRect.height;

      const gap = PHYSICS.YES_BUTTON_GAP;

      // Check AABB overlap
      const noRight = noX + noW;
      const noBottom = noY + noH;

      if (
        noX < yesRight + gap &&
        noRight > yesLeft - gap &&
        noY < yesBottom + gap &&
        noBottom > yesTop - gap
      ) {
        // Compute overlap on each axis to find smallest penetration
        const overlapLeft = noRight - (yesLeft - gap);
        const overlapRight = (yesRight + gap) - noX;
        const overlapTop = noBottom - (yesTop - gap);
        const overlapBottom = (yesBottom + gap) - noY;

        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

        let newX = noX;
        let newY = noY;
        let newVx = vx;
        let newVy = vy;

        if (minOverlap === overlapLeft) {
          // Push No button to the left of Yes
          newX = yesLeft - gap - noW;
          newVx = -Math.abs(vx) * PHYSICS.RESTITUTION;
        } else if (minOverlap === overlapRight) {
          // Push No button to the right of Yes
          newX = yesRight + gap;
          newVx = Math.abs(vx) * PHYSICS.RESTITUTION;
        } else if (minOverlap === overlapTop) {
          // Push No button above Yes
          newY = yesTop - gap - noH;
          newVy = -Math.abs(vy) * PHYSICS.RESTITUTION;
        } else {
          // Push No button below Yes
          newY = yesBottom + gap;
          newVy = Math.abs(vy) * PHYSICS.RESTITUTION;
        }

        return { x: newX, y: newY, vx: newVx, vy: newVy };
      }

      return null;
    },
    [],
  );

  /**
   * Physics animation loop. Runs via requestAnimationFrame while the button
   * has non-trivial velocity. Updates position, handles wall & Yes-button
   * collisions, and applies friction until the button comes to rest.
   */
  const physicsStep = useCallback(() => {
    const container = buttonContainerRef.current;
    const noBtn = noButtonRef.current;
    if (!container || !noBtn) {
      animFrameRef.current = null;
      return;
    }

    const vel = velocityRef.current;
    const pos = positionRef.current;

    // Apply velocity
    let newX = pos.x + vel.vx;
    let newY = pos.y + vel.vy;

    const containerRect = container.getBoundingClientRect();
    const noW = noBtn.offsetWidth;
    const noH = noBtn.offsetHeight;

    const pad = PHYSICS.EDGE_PADDING;
    const maxX = containerRect.width - noW - pad;
    const maxY = containerRect.height - noH - pad;

    // Wall collisions — reflect velocity on the axis of collision
    if (newX < pad) {
      newX = pad;
      vel.vx = Math.abs(vel.vx) * PHYSICS.RESTITUTION;
    } else if (newX > maxX) {
      newX = maxX;
      vel.vx = -Math.abs(vel.vx) * PHYSICS.RESTITUTION;
    }

    if (newY < pad) {
      newY = pad;
      vel.vy = Math.abs(vel.vy) * PHYSICS.RESTITUTION;
    } else if (newY > maxY) {
      newY = maxY;
      vel.vy = -Math.abs(vel.vy) * PHYSICS.RESTITUTION;
    }

    // Yes-button collision
    const yesCollision = resolveYesButtonCollision(
      newX,
      newY,
      noW,
      noH,
      vel.vx,
      vel.vy,
    );
    if (yesCollision) {
      newX = yesCollision.x;
      newY = yesCollision.y;
      vel.vx = yesCollision.vx;
      vel.vy = yesCollision.vy;
    }

    // Clamp again after Yes-button push (in case it pushed us out of bounds)
    newX = Math.max(pad, Math.min(newX, maxX));
    newY = Math.max(pad, Math.min(newY, maxY));

    // Apply friction
    vel.vx *= PHYSICS.FRICTION;
    vel.vy *= PHYSICS.FRICTION;

    // Update refs and DOM directly (avoid React re-render lag during animation)
    positionRef.current = { x: newX, y: newY };
    velocityRef.current = vel;
    noBtn.style.left = `${newX}px`;
    noBtn.style.top = `${newY}px`;

    // Continue animating or stop
    const speed = Math.sqrt(vel.vx ** 2 + vel.vy ** 2);
    if (speed > PHYSICS.MIN_VELOCITY) {
      animFrameRef.current = requestAnimationFrame(physicsStep);
    } else {
      vel.vx = 0;
      vel.vy = 0;
      animFrameRef.current = null;
      // Sync final position to React state
      setNoButtonPosition({ x: newX, y: newY });
    }
  }, [resolveYesButtonCollision]);

  /**
   * Launch the No button away from the pointer position with physics-based
   * velocity. Starts (or restarts) the animation loop.
   */
  const launchNoButton = useCallback(
    (pointerX: number, pointerY: number) => {
      if (!noButtonRef.current || !buttonContainerRef.current) return;

      const buttonRect = noButtonRef.current.getBoundingClientRect();
      const buttonCenterX = buttonRect.left + buttonRect.width / 2;
      const buttonCenterY = buttonRect.top + buttonRect.height / 2;

      // Direction away from pointer
      let angle = Math.atan2(buttonCenterY - pointerY, buttonCenterX - pointerX);

      // Add slight randomness to the angle (up to +-10 degrees)
      angle += (Math.random() - 0.5) * (Math.PI / 9);

      const speed = PHYSICS.LAUNCH_SPEED + Math.random() * 4;
      velocityRef.current = {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      };

      // Start the animation loop if not already running
      if (animFrameRef.current === null) {
        animFrameRef.current = requestAnimationFrame(physicsStep);
      }
    },
    [physicsStep],
  );

  const moveNoButton = (pointerX: number, pointerY: number) => {
    if (!noButtonRef.current || !buttonContainerRef.current) return;

    const buttonRect = noButtonRef.current.getBoundingClientRect();

    // Signed distance from pointer to button edge
    // Positive = outside the button, negative = inside the button
    const dx = Math.max(buttonRect.left - pointerX, pointerX - buttonRect.right);
    const dy = Math.max(buttonRect.top - pointerY, pointerY - buttonRect.bottom);
    const edgeDistance = (dx > 0 || dy > 0)
      ? Math.sqrt(Math.max(0, dx) ** 2 + Math.max(0, dy) ** 2)  // outside: Euclidean
      : Math.max(dx, dy);  // inside: largest (least negative) = closest edge

    if (edgeDistance < PHYSICS.DODGE_THRESHOLD) {
      if (!isChasing) {
        setIsChasing(true);
        countRef.current += 1;
        setNoClickCount(countRef.current);
      }

      // Only re-launch if button has slowed down enough (prevents trembling)
      const currentSpeed = Math.sqrt(
        velocityRef.current.vx ** 2 + velocityRef.current.vy ** 2,
      );
      if (currentSpeed < PHYSICS.LAUNCH_SPEED * 0.3) {
        launchNoButton(pointerX, pointerY);
      }
    } else if (edgeDistance > PHYSICS.DODGE_THRESHOLD * PHYSICS.CHASE_STOP_MULTIPLIER) {
      // Stop chase mode when far away
      if (isChasing) {
        setIsChasing(false);
      }
    }
  };

  // Position the No button below the Yes button on mount
  useEffect(() => {
    const yes = yesButtonRef.current;
    const container = buttonContainerRef.current;
    const no = noButtonRef.current;
    if (!yes || !container || !no) return;

    const containerRect = container.getBoundingClientRect();
    const yesRect = yes.getBoundingClientRect();
    const noW = no.offsetWidth;

    const x = (yesRect.left - containerRect.left) + (yesRect.width / 2) - (noW / 2);
    const y = (yesRect.bottom - containerRect.top) + 16;

    setNoButtonPosition({ x, y });
    positionRef.current = { x, y };
  }, []);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) {
        clearTimeout(messageTimerRef.current);
      }
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (pulseCleanupRef.current) {
        pulseCleanupRef.current();
      }
    };
  }, []);

  const NO_CLICK_MESSAGES = config.valentine.noClickMessages;

  const handleNoClick = () => {
    const currentCount = countRef.current;
    const message = NO_CLICK_MESSAGES[currentCount % NO_CLICK_MESSAGES.length];
    setNoClickMessage(message!);

    countRef.current += 1;
    setNoClickCount(countRef.current);

    // Launch the button in a random direction on click
    if (noButtonRef.current) {
      const buttonRect = noButtonRef.current.getBoundingClientRect();
      const buttonCenterX = buttonRect.left + buttonRect.width / 2;
      const buttonCenterY = buttonRect.top + buttonRect.height / 2;

      // Random direction
      const angle = Math.random() * Math.PI * 2;
      const speed = PHYSICS.LAUNCH_SPEED + Math.random() * 4;
      velocityRef.current = {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      };

      // Also nudge away from center of container for variety
      if (buttonContainerRef.current) {
        const containerRect = buttonContainerRef.current.getBoundingClientRect();
        const containerCenterX = containerRect.left + containerRect.width / 2;
        const containerCenterY = containerRect.top + containerRect.height / 2;
        const awayAngle = Math.atan2(
          buttonCenterY - containerCenterY,
          buttonCenterX - containerCenterX,
        );
        velocityRef.current.vx += Math.cos(awayAngle) * 2;
        velocityRef.current.vy += Math.sin(awayAngle) * 2;
      }

      if (animFrameRef.current === null) {
        animFrameRef.current = requestAnimationFrame(physicsStep);
      }
    }

    // Clear the message after 2 seconds
    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current);
    }

    messageTimerRef.current = window.setTimeout(() => {
      setNoClickMessage(null);
      messageTimerRef.current = null;
    }, 2000);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    moveNoButton(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      if (touch) {
        moveNoButton(touch.clientX, touch.clientY);
      }
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-100 via-pink-50 to-rose-200 dark:from-slate-950 dark:via-gray-900 dark:to-slate-950 px-4 sm:px-6 lg:px-8 py-8 sm:py-12 relative overflow-hidden transition-colors duration-500"
    >
      {/* Floating background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-[5%] text-rose-300 opacity-20 dark:opacity-10 text-6xl animate-[float-1_8s_ease-in-out_infinite]">💕</div>
        <div className="absolute top-[20%] right-[10%] text-pink-300 opacity-20 dark:opacity-10 text-5xl animate-[float-2_10s_ease-in-out_infinite]" style={{ animationDelay: '1s' }}>✨</div>
        <div className="absolute bottom-[15%] left-[15%] text-rose-300 opacity-20 dark:opacity-10 text-5xl animate-[float-3_9s_ease-in-out_infinite]" style={{ animationDelay: '2s' }}>💖</div>
        <div className="absolute bottom-[25%] right-[8%] text-pink-300 opacity-20 dark:opacity-10 text-6xl animate-[float-1_11s_ease-in-out_infinite]" style={{ animationDelay: '1.5s' }}>💝</div>
      </div>

      <div className="max-w-2xl w-full relative z-10">
        {/* Liquid glass card */}
        <div className="bg-white/40 dark:bg-white/[0.07] backdrop-blur-xl rounded-3xl shadow-2xl shadow-rose-200/50 dark:shadow-black/30 p-8 sm:p-12 border border-white/60 dark:border-white/[0.12] relative overflow-hidden transition-colors duration-500">
          {/* Glass reflection effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/30 dark:from-white/[0.08] via-transparent to-transparent pointer-events-none" />

          <div className="text-center relative">
            <div className="mb-8 sm:mb-12">
              <div className="text-6xl sm:text-7xl mb-6 animate-[bounce_2s_ease-in-out_infinite]">
                💝
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-rose-900 dark:text-rose-100 mb-4">
                {config.valentine.question}
              </h1>
              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: hideNoButton ? '0fr' : '1fr',
                  transition: 'grid-template-rows 500ms ease-in-out 300ms',
                }}
              >
                <div style={{ overflow: 'hidden' }}>
                  <div ref={subtitleRef} className="bg-white/20 dark:bg-white/[0.06] backdrop-blur-md rounded-2xl p-4 border border-white/40 dark:border-white/[0.08] shadow-inner inline-block">
                    <p className="text-lg sm:text-xl text-rose-900 dark:text-rose-100 font-medium">
                      {config.valentine.subtitle} 💕
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div
              ref={buttonContainerRef}
              className="relative h-72 -mx-6 sm:-mx-10 -mt-10 sm:-mt-14 -mb-12 sm:-mb-16"
              onMouseMove={handleMouseMove}
              onTouchStart={handleTouchStart}
              onTouchMove={(e: React.TouchEvent) => {
                if (e.touches.length > 0) {
                  const touch = e.touches[0];
                  if (touch) {
                    moveNoButton(touch.clientX, touch.clientY);
                  }
                }
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  ref={yesButtonRef}
                  type="button"
                  onClick={handleYesClick}
                  className="group relative px-12 py-4 bg-gradient-to-r from-rose-500 via-pink-500 to-rose-500 hover:from-rose-600 hover:via-pink-600 hover:to-rose-600 text-white text-xl font-bold rounded-full shadow-2xl shadow-rose-400/50 transition-all duration-300 hover:scale-110 hover:shadow-rose-500/60 active:scale-95 z-10 overflow-hidden"
                >
                  {/* Glass shine effect on hover */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <span className="relative">{config.valentine.yesButton} 💖</span>
                </button>
              </div>

              {!hideNoButton && (
              <button
                ref={noButtonRef}
                type="button"
                onClick={handleNoClick}
                style={{
                  position: 'absolute',
                  left: `${noButtonPosition.x}px`,
                  top: `${noButtonPosition.y}px`,
                  opacity: noButtonOpacity,
                }}
                className="px-8 py-2.5 text-white text-sm font-semibold rounded-full cursor-pointer border-0 animate-[no-button-chase_2s_ease-in-out_infinite]"
              >
                {config.valentine.noButton}
              </button>
              )}
            </div>

            {noClickMessage && (
              <div className="absolute inset-x-0 flex justify-center" style={{ top: '50%' }}>
                <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm text-rose-600 dark:text-rose-400 font-semibold px-6 py-3 rounded-full shadow-lg border border-rose-200 dark:border-white/10 animate-[fadeIn_0.3s_ease-out]">
                  {noClickMessage}
                </div>
              </div>
            )}

            <div className="relative mt-10 sm:mt-14 flex items-center justify-center" style={{ minHeight: '2.75rem' }}>
              {!hideNoButton && (
                <p ref={hintRef} className="text-xs text-rose-700 dark:text-rose-300 font-medium bg-white/20 dark:bg-white/[0.06] backdrop-blur-sm rounded-full px-6 py-2 inline-block border border-white/40 dark:border-white/[0.08]">
                  {config.valentine.hintText} <span className="not-italic">😏</span>
                </p>
              )}

              {hideNoButton && onPlayGame && (
                <div className="animate-[fadeIn_0.5s_ease-out_1s_both]">
                  <button
                    type="button"
                    onClick={onPlayGame}
                    className="px-8 py-3 bg-white/40 dark:bg-white/10 hover:bg-white/60 dark:hover:bg-white/20 text-rose-700 dark:text-rose-300 text-sm font-bold rounded-full shadow-lg border border-rose-200/60 dark:border-white/10 transition-all duration-200 hover:scale-105 active:scale-95 backdrop-blur-sm"
                  >
                    {config.game.playButton} 🎮
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
