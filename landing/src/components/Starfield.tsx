import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface Star {
  x: number; y: number; r: number; p: number; s: number; warm: boolean;
}

/** 全屏固定星野:暖白双色星星,轻微闪烁;reduced-motion 时只画静态一帧。 */
export default function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let stars: Star[] = [];
    let W = 0, H = 0, raf = 0;

    const build = () => {
      W = canvas.width = window.innerWidth * dpr;
      H = canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      stars = [];
      const n = Math.min(150, Math.floor((window.innerWidth * window.innerHeight) / 11000));
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: (Math.random() * 1.1 + 0.4) * dpr,
          p: Math.random() * Math.PI * 2,
          s: Math.random() * 0.9 + 0.35,
          warm: Math.random() < 0.18,
        });
      }
    };

    const paint = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      for (const s of stars) {
        const a = reduced ? 0.7 : 0.35 + 0.45 * (Math.sin((t / 1000) * s.s + s.p) * 0.5 + 0.5);
        ctx.globalAlpha = a;
        ctx.fillStyle = s.warm ? '#ffd98c' : '#e8e9ff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    build();
    paint(0);
    const onResize = () => { build(); paint(0); };
    window.addEventListener('resize', onResize);
    if (!reduced) {
      const loop = (t: number) => { paint(t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return <canvas id="stars" ref={ref} />;
}
