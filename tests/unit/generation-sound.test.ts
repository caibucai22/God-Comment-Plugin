import { afterEach, describe, expect, it, vi } from "vitest";
import { playGenerationSound } from "../../src/audio/generation-sound";

describe("playGenerationSound", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("synthesizes one short local WebAudio cue and releases its context", async () => {
    const frequency = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    const gainValue = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    const oscillator = {
      type: "sine",
      frequency,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn((_type: string, listener: EventListener) => listener(new Event("ended"))),
    };
    const gain = { gain: gainValue, connect: vi.fn() };
    const context = {
      currentTime: 5,
      destination: {},
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    vi.stubGlobal("AudioContext", vi.fn(() => context));

    expect(() => playGenerationSound()).not.toThrow();
    await Promise.resolve();

    expect(context.createOscillator).toHaveBeenCalledOnce();
    expect(context.createGain).toHaveBeenCalledOnce();
    expect(oscillator.start).toHaveBeenCalledWith(5);
    expect(oscillator.stop).toHaveBeenCalledOnce();
    expect((oscillator.stop.mock.calls[0][0] as number) - 5).toBeLessThanOrEqual(0.5);
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("stays silent and non-throwing when WebAudio is missing or construction fails", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(() => playGenerationSound()).not.toThrow();
    vi.stubGlobal("AudioContext", vi.fn(() => { throw new Error("blocked"); }));
    expect(() => playGenerationSound()).not.toThrow();
  });
});
