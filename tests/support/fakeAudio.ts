// A stand-in for an <audio> element in tests (Node has no DOM): what the preview's sound reads and writes. Moved out of
// the preview sound test (407 T012) so other tests can use it.

/** A stand-in for <audio> (unit tests have no DOM): what previewSound reads and writes. */
export class FakeAudio {
  paused = true;
  currentTime = 0;
  playbackRate = 1;
  volume = 1;
  muted = false;
  preload = '';
  src = '';
  dataset: Record<string, string> = {};
  /** Events are never fired: a test plays, pauses and seeks the element itself. */
  addEventListener() {
    // never fires: the tests play, pause and seek the element themselves
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {
    this.src = '';
  }
  load() {
    // nothing to load: there is no media
  }
}
