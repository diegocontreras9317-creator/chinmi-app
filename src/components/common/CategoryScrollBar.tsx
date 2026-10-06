import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CategoryScrollBarProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  accentColor?: 'orange' | 'dark' | 'pink' | 'vinotinto';
  className?: string;
}

export const CategoryScrollBar: React.FC<CategoryScrollBarProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  accentColor = 'orange',
  className = ''
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftPos, setScrollLeftPos] = useState(0);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };

  useEffect(() => {
    checkScroll();
    const handleResize = () => checkScroll();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [categories]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = 220;
    el.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth'
    });
    setTimeout(checkScroll, 250);
  };

  // Wheel horizontal scroll support (desktop mouse wheel)
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (e.deltaY !== 0) {
      el.scrollLeft += e.deltaY;
      checkScroll();
    }
  };

  // Drag to scroll
  const handleMouseDown = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    setIsMouseDown(true);
    setStartX(e.pageX - el.offsetLeft);
    setScrollLeftPos(el.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown) return;
    e.preventDefault();
    const el = scrollRef.current;
    if (!el) return;
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startX) * 1.5;
    el.scrollLeft = scrollLeftPos - walk;
    checkScroll();
  };

  const handleMouseUpOrLeave = () => {
    setIsMouseDown(false);
    checkScroll();
  };

  const activeStyles = {
    orange: 'bg-orange-600 text-white shadow-xs',
    dark: 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs',
    pink: 'bg-rose-900 hover:bg-rose-800 text-white shadow-xs',
    vinotinto: 'bg-rose-900 hover:bg-rose-800 text-white shadow-xs'
  }[accentColor];

  return (
    <div className={`relative flex items-center gap-1.5 w-full min-w-0 ${className}`}>
      {/* Scroll Left Button */}
      <button
        type="button"
        onClick={() => handleScroll('left')}
        disabled={!canScrollLeft}
        aria-label="Categorías anteriores"
        title="Ver categorías anteriores"
        className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition shrink-0 ${
          !canScrollLeft ? 'opacity-30 cursor-not-allowed pointer-events-none' : 'shadow-xs cursor-pointer hover:scale-105 active:scale-95'
        }`}
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      {/* Scrollable Container */}
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        className="flex items-center gap-1.5 overflow-x-auto scroll-smooth py-1 px-1 select-none cursor-grab active:cursor-grabbing flex-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => onSelectCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${
              selectedCategory === cat
                ? activeStyles
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Scroll Right Button */}
      <button
        type="button"
        onClick={() => handleScroll('right')}
        disabled={!canScrollRight}
        aria-label="Más categorías"
        title="Ver más categorías"
        className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition shrink-0 ${
          !canScrollRight ? 'opacity-30 cursor-not-allowed pointer-events-none' : 'shadow-xs cursor-pointer hover:scale-105 active:scale-95'
        }`}
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
