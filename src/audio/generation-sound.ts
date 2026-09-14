type AudioContextGlobal = typeof globalThis & {
  readonly webkitAudioContext?: typeof AudioContext;
};

export type GenerationSoundCue = "start" | "success" | "failure";

interface Note {
  readonly offset: number;
  readonly duration: number;
  readonly from: number;
  readonly to: number;
  readonly volume: number;
  readonly type: OscillatorType;
}

const CUES: Record<GenerationSoundCue, readonly Note[]> = {
  start: [{ offset: 0, duration: 0.24, from: 280, to: 620, volume: 0.075, type: "sine" }],
  success: [
    { offset: 0, duration: 0.22, from: 660, to: 760, volume: 0.07, type: "sine" },
    { offset: 0.2, duration: 0.28, from: 880, to: 1_080, volume: 0.065, type: "triangle" },
  ],
  failure: [{ offset: 0, duration: 0.22, from: 360, to: 180, volume: 0.06, type: "triangle" }],
};

function closeSilently(context: AudioContext): void {
  try {
    void Promise.resolve(context.close()).catch(() => undefined);
  } catch {
    // Audio feedback must never block card generation.
  }
}

/** Plays one synthesized local transaction cue without network or persistent audio resources. */
export function playGenerationSound(cue: GenerationSoundCue): void {
  const AudioContextConstructor = globalThis.AudioContext
    ?? (globalThis as AudioContextGlobal).webkitAudioContext;
  if (!AudioContextConstructor) return;

  let context: AudioContext | undefined;
  try {
    context = new AudioContextConstructor();
    const startAt = context.currentTime;
    const notes = CUES[cue];
    notes.forEach((note, index) => {
      const oscillator = context!.createOscillator();
      const gain = context!.createGain();
      const noteStart = startAt + note.offset;
      const noteStop = noteStart + note.duration;
      oscillator.type = note.type;
      oscillator.frequency.setValueAtTime(note.from, noteStart);
      oscillator.frequency.exponentialRampToValueAtTime(note.to, noteStop - 0.03);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(note.volume, noteStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStop);
      oscillator.connect(gain);
      gain.connect(context!.destination);
      if (index === notes.length - 1) {
        oscillator.addEventListener("ended", () => closeSilently(context!), { once: true });
      }
      oscillator.start(noteStart);
      oscillator.stop(noteStop);
    });
    void Promise.resolve(context.resume()).catch(() => undefined);
  } catch {
    if (context) closeSilently(context);
  }
}
