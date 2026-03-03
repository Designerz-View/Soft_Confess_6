/**
 * Dissolves an HTML element by fading it out while emitting particles
 * from all four edges that fly outward and disappear. The particles
 * stream from the element's perimeter, creating the visual of the
 * element breaking apart at its borders as it vanishes.
 */
export function dissipateElement(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();

  // Fade out the element
  if (element.animate) {
    element.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 600, easing: 'ease-in', fill: 'forwards' },
    );
  } else {
    element.style.opacity = '0';
  }

  const colors = [
    'rgb(244, 63, 94)',   // rose-500
    'rgb(236, 72, 153)',  // pink-500
    'rgb(251, 113, 133)', // rose-400
    'rgb(253, 164, 175)', // rose-300
    'rgb(190, 18, 60)',   // rose-800
  ];

  // Collect emission points along all four edges
  const edgeSpacing = 4; // one particle every ~4px
  const points: { x: number; y: number; angle: number }[] = [];

  // Top edge → particles fly upward
  for (let x = rect.left; x <= rect.right; x += edgeSpacing) {
    points.push({ x, y: rect.top, angle: -Math.PI / 2 });
  }
  // Bottom edge → particles fly downward
  for (let x = rect.left; x <= rect.right; x += edgeSpacing) {
    points.push({ x, y: rect.bottom, angle: Math.PI / 2 });
  }
  // Left edge → particles fly left
  for (let y = rect.top; y <= rect.bottom; y += edgeSpacing) {
    points.push({ x: rect.left, y, angle: Math.PI });
  }
  // Right edge → particles fly right
  for (let y = rect.top; y <= rect.bottom; y += edgeSpacing) {
    points.push({ x: rect.right, y, angle: 0 });
  }

  for (const pt of points) {
    const particle = document.createElement('div');
    const size = 3 + Math.random() * 2; // 3-5px
    const color = colors[Math.floor(Math.random() * colors.length)];

    // Perpendicular to edge with angular spread for organic feel
    const outAngle = pt.angle + (Math.random() - 0.5) * 1.0;
    const distance = 40 + Math.random() * 60; // 40-100px

    particle.style.cssText = `
      position: fixed;
      left: ${pt.x}px;
      top: ${pt.y}px;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: ${color};
      pointer-events: none;
      z-index: 9999;
      opacity: 0;
    `;

    document.body.appendChild(particle);

    if (!particle.animate) {
      particle.remove();
      continue;
    }

    const delay = Math.random() * 300; // stagger over 300ms
    const duration = 600 + Math.random() * 600; // 600-1200ms

    const animation = particle.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.8 },
        {
          transform: `translate(calc(-50% + ${Math.cos(outAngle) * distance}px), calc(-50% + ${Math.sin(outAngle) * distance}px)) scale(0)`,
          opacity: 0,
        },
      ],
      {
        duration,
        delay,
        easing: 'ease-out',
        fill: 'forwards',
      },
    );

    animation.onfinish = () => particle.remove();
  }
}
