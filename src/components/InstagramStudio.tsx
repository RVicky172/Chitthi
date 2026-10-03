import { useEffect, useState } from 'react';
import { PhotoWorkspace } from './studio/PhotoWorkspace';
import { MODES, modeOf, type StudioMode } from './studio/Shell';
import { VideoWorkspace } from './studio/VideoWorkspace';

/*
 * The media studio (#/instagram): Instagram photos, Reels & Shorts, and YouTube videos, in one editor layout
 * (components/studio/). The mode follows the URL: #/instagram, #/instagram/video, #/instagram/youtube.
 */
export function InstagramStudio() {
  const [mode, setMode] = useState<StudioMode>(() => modeOf(location.hash));
  useEffect(() => {
    const on = () => setMode(modeOf(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const choose = (m: StudioMode) => {
    setMode(m);
    history.replaceState(null, '', MODES.find((x) => x.id === m)!.hash);
  };
  return mode === 'photos' ? <PhotoWorkspace mode={mode} onMode={choose} /> : <VideoWorkspace mode={mode} onMode={choose} />;
}
