import React, { useState, useRef, useEffect } from 'react';

interface ImageComparerProps {
  originalUrl: string;
  correctedUrl: string;
  className?: string;
  style?: React.CSSProperties;
}

export const ImageComparer: React.FC<ImageComparerProps> = ({
  originalUrl,
  correctedUrl,
  className = '',
  style
}) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  // 이미지 실제 비율을 동적으로 반영
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 원본 이미지 로드 후 비율 계산
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setAspectRatio(img.naturalHeight / img.naturalWidth);
    };
    img.src = originalUrl;
  }, [originalUrl]);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = (x / rect.width) * 100;

    setSliderPosition(Math.max(0, Math.min(100, percentage)));
  };

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) handleMove(e.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && e.touches[0]) {
      handleMove(e.touches[0].clientX);
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // aspect-ratio + max-height 조합:
  // - aspect-ratio로 비율 고정
  // - max-height: 80vh로 화면 초과 방지
  // - 브라우저가 두 제약 중 더 작은 쪽을 선택 → 비율 유지하며 화면 안에 맞춤
  const wrapperStyle: React.CSSProperties = aspectRatio
    ? {
        aspectRatio: `1 / ${aspectRatio}`,  // width / height 비율
        maxHeight: '80vh',
        width: '100%',
        maxWidth: `calc(80vh / ${aspectRatio})`, // 높이 제한 시 너비도 비율에 맞게 축소
      }
    : { maxHeight: '80vh', width: '100%' };

  return (
    <div className={`flex justify-center ${className}`} style={style}>
      <div
        style={wrapperStyle}
        className="relative overflow-hidden select-none"
      >
      {/* 내부 absolute 컨테이너 */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        onMouseUp={handleMouseUp}
        onTouchEnd={handleMouseUp}
      >
      {/* Original Image (Right side) */}
      <div className="absolute inset-0">
        <img
          src={originalUrl}
          alt="Original"
          className="w-full h-full object-contain"
          draggable={false}
        />
        <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded-md text-sm">
          Original
        </div>
      </div>

      {/* Corrected Image (Left side, clipped) */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <img
          src={correctedUrl}
          alt="Corrected"
          className="w-full h-full object-contain"
          draggable={false}
        />
        <div className="absolute top-4 left-4 bg-blue-500 bg-opacity-90 text-white px-3 py-1 rounded-md text-sm">
          Corrected
        </div>
      </div>

      {/* Slider */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-10"
        style={{ left: `${sliderPosition}%` }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center">
          <svg
            className="w-6 h-6 text-gray-700"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 9l4-4 4 4m0 6l-4 4-4-4"
            />
          </svg>
        </div>
      </div>
      </div>
      </div>
    </div>
  );
};
