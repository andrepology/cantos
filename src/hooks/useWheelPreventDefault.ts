import { useEffect, type RefObject } from 'react';

export const useWheelPreventDefault = <T extends HTMLElement>(
  ref: RefObject<T | null>,
  condition: (e: WheelEvent) => boolean = () => true
) => {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleWheel = (e: WheelEvent) => {
      if (condition(e)) {
        e.preventDefault();
      }
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [ref, condition]);
};
