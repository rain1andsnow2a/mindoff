import { useEffect } from 'react';

/** 给所有 .reveal 元素挂 IntersectionObserver,进入视口时加 .in 触发过渡。 */
export function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.22 },
    );
    document.querySelectorAll('.reveal, #chatPanel').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}
