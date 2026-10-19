import { useEffect, useState } from 'react';
import { startGpuEffects } from '../lib/gpuSetting';
import { showStudio } from '../state/projects';
import { PhotoWorkspace } from './studio/PhotoWorkspace';
import { MODES, modeOf, type StudioMode } from './studio/Shell';
import { VideoWorkspace } from './studio/VideoWorkspace';

/**
 * The media studio (#/instagram): Instagram photos, Reels & Shorts, and YouTube videos, in one editor layout
 * (components/studio/). The mode follows the URL: #/instagram, #/instagram/video, #/instagram/youtube.
 */
export function InstagramStudio() {
  const [mode, setMode] = useState<StudioMode>(() => modeOf(location.hash));
  useEffect(startGpuEffects, []);
  // The studio's project (408): the one open, else the last one used, else a new one.
  const studio = mode === 'photos' ? 'photo' : 'video';
  useEffect(() => {
    showStudio(studio, mode === 'vlog' ? 'vlog' : 'reel');
    // The kind matters only for a new project: switching Reels and YouTube keeps the one open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio]);
  useEffect(() => {
    const on = () => setMode(modeOf(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const choose = (nextMode: StudioMode) => {
    setMode(nextMode);
    const hash = MODES.find((candidate) => candidate.id === nextMode)?.hash;
    if (hash) history.replaceState(null, '', hash);
  };
  return mode === 'photos' ? (
    <PhotoWorkspace mode={mode} onMode={choose} />
  ) : (
    <VideoWorkspace mode={mode} onMode={choose} />
  );
}
