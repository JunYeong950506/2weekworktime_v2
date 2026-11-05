import { useLayoutEffect, useRef } from 'react';

export function AutoFitText({ children }: { children: string }): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let disposed = false;
    const fit = () => {
      if (disposed || element.clientWidth === 0) return;
      element.style.fontSize = '';
      const baseSize = parseFloat(getComputedStyle(element).fontSize);
      let low = 1;
      let high = baseSize;
      if (element.scrollWidth <= element.clientWidth) return;
      for (let step = 0; step < 12; step += 1) {
        const size = (low + high) / 2;
        element.style.fontSize = `${size}px`;
        if (element.scrollWidth > element.clientWidth) high = size;
        else low = size;
      }
      element.style.fontSize = `${Math.floor(low * 10) / 10}px`;
    };
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    window.addEventListener('resize', fit);
    document.fonts.addEventListener('loadingdone', fit);
    void document.fonts.ready.then(fit);
    fit();
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener('resize', fit);
      document.fonts.removeEventListener('loadingdone', fit);
    };
  }, [children]);

  return <span ref={ref} className="block min-w-0 flex-1 whitespace-nowrap" style={{ letterSpacing: 0 }}>{children}</span>;
}
