/**
 * Web Audio API synthesized sound generator for Drone Race Roulette
 * Generates realistic mechanical/electronic clicks and victory fanfare without external files.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Plays a sharp, high-tech metallic tick as a carousel slot passes the center line
 */
export function playTickSound(pitchMultiplier = 1.0) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600 * pitchMultiplier, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  } catch {
    // Audio context may be blocked before first user interaction
  }
}

/**
 * Plays an epic ascending electronic victory fanfare when a winner is chosen
 */
export function playWinnerFanfare() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [
      { freq: 440.0, time: 0.0, dur: 0.12 }, // A4
      { freq: 554.37, time: 0.12, dur: 0.12 }, // C#5
      { freq: 659.25, time: 0.24, dur: 0.14 }, // E5
      { freq: 880.0, time: 0.38, dur: 0.65 }, // A5
    ];

    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.time);

      gain.gain.setValueAtTime(0, ctx.currentTime + n.time);
      gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + n.time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.time + n.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + n.time);
      osc.stop(ctx.currentTime + n.time + n.dur);
    });
  } catch {
    // Ignore audio errors
  }
}
