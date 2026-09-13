type AudioContextGlobal = typeof globalThis & {
  readonly webkitAudioContext?: typeof AudioContext;
};

function closeSilently(context: AudioContext): void {
  try {
    void Promise.resolve(context.close()).catch(() => undefined);
  } catch {
    // Audio feedback must never block card generation.
  }
}

/** Plays a short, synthesized local cue. It never loads an audio asset or performs network I/O. */
export function playGenerationSound(): void {
  const AudioContextConstructor = globalThis.AudioContext
    ?? (globalThis as AudioContextGlobal).webkitAudioContext;
  if (!AudioContextConstructor) return;

  let context: AudioContext | undefined;
  try {
    context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = context.currentTime;
    const stopAt = startAt + 0.16;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(440, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(660, startAt + 0.11);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.055, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.addEventListener("ended", () => closeSilently(context!), { once: true });
    void Promise.resolve(context.resume()).catch(() => undefined);
    oscillator.start(startAt);
    oscillator.stop(stopAt);
  } catch {
    if (context) closeSilently(context);
  }
}
