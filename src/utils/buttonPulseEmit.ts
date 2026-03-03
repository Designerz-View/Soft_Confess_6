const PARTICLE_COLORS = [
  'rgb(244, 63, 94)', // rose-500
  'rgb(236, 72, 153)', // pink-500
  'rgb(251, 113, 133)', // rose-400
  'rgb(253, 164, 175)', // rose-300
];

export function emitButtonParticles(button: HTMLElement): void {
  const rect = button.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const count = 24 + Math.floor(Math.random() * 10); // 24-33 particles

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');

    // Place particle on the button's elliptical perimeter
    const perimAngle = Math.random() * Math.PI * 2;
    const startX = cx + Math.cos(perimAngle) * hw + (Math.random() - 0.5) * 6;
    const startY = cy + Math.sin(perimAngle) * hh + (Math.random() - 0.5) * 6;

    // Outward direction with chaotic jitter
    const outAngle = perimAngle + (Math.random() - 0.5) * 0.8;
    const distance = 35 + Math.random() * 40; // 35-75px
    const size = 4 + Math.random() * 4; // 4-8px
    const color = PARTICLE_COLORS[i % PARTICLE_COLORS.length];

    Object.assign(particle.style, {
      position: 'fixed',
      left: `${startX}px`,
      top: `${startY}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      backgroundColor: color,
      pointerEvents: 'none',
      zIndex: '9999',
      opacity: '0.9',
    });

    document.body.appendChild(particle);

    if (!particle.animate) {
      particle.remove();
      continue;
    }

    const duration = 700 + Math.random() * 400; // 700-1100ms

    particle.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.9 },
        {
          transform: `translate(calc(-50% + ${Math.cos(outAngle) * distance}px), calc(-50% + ${Math.sin(outAngle) * distance}px)) scale(0)`,
          opacity: 0,
        },
      ],
      { duration, easing: 'ease-out', fill: 'forwards' },
    ).onfinish = () => particle.remove();
  }
}

export function startButtonPulseAndParticles(button: HTMLElement): () => void {
  let pulseAnimation: Animation | null = null;

  if (button.animate) {
    pulseAnimation = button.animate(
      [
        { transform: 'scale(1)', offset: 0 },
        { transform: 'scale(1.12)', offset: 0.18 },
        { transform: 'scale(1)', offset: 0.35 },
        { transform: 'scale(1.16)', offset: 0.52 },
        { transform: 'scale(1)', offset: 0.75 },
        { transform: 'scale(1)', offset: 1.0 },
      ],
      {
        duration: 1500,
        iterations: Infinity,
        easing: 'ease-in-out',
      },
    );
  }

  emitButtonParticles(button);

  const intervalId = setInterval(() => {
    emitButtonParticles(button);
  }, 2500);

  return () => {
    if (pulseAnimation) pulseAnimation.cancel();
    clearInterval(intervalId);
  };
}
