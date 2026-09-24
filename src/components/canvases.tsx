import { memo, useEffect, useRef } from 'react';
import { cardMM } from '../engine/design';
import { renderCard, renderThemeTile } from '../engine/render';
import type { Design, LayoutId, Photo, Theme } from '../types';

export const ThemeTile = memo(function ThemeTile({ theme, fontTick }: { theme: Theme; fontTick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderThemeTile(ref.current, theme);
  }, [theme, fontTick]);
  return <canvas ref={ref} width={240} height={160} aria-hidden="true" />;
});

export const LayoutThumb = memo(function LayoutThumb({
  layout,
  design,
  photos,
  fontTick,
}: {
  layout: LayoutId;
  design: Design;
  photos: Photo[];
  fontTick: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { w, h } = cardMM(design);
  useEffect(() => {
    if (ref.current)
      renderCard(ref.current, 'front', 220 / Math.max(w, h), 0, { d: design, photos }, { layout, hint: true, thumb: true });
  }, [layout, design, photos, fontTick, w, h]);
  return <canvas ref={ref} style={{ width: `${(w / Math.max(w, h)) * 100}%` }} aria-hidden="true" />;
});

export const PhotoThumb = memo(function PhotoThumb({ photo }: { photo: Photo }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    const s = Math.max(116 / photo.sw, 116 / photo.sh);
    c.clearRect(0, 0, 116, 116);
    c.drawImage(photo.src, (116 - photo.sw * s) / 2, (116 - photo.sh * s) / 2, photo.sw * s, photo.sh * s);
  }, [photo.src, photo.sw, photo.sh]);
  return <canvas ref={ref} width={116} height={116} aria-hidden="true" />;
});
