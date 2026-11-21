let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!context) context = new AudioContextCtor();
  return context;
}

export function primeNotificationSound() {
  const ctx = getContext();
  if (ctx?.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
}

export function playNotificationSound() {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
  const now = ctx.currentTime;
  [0, 0.16].forEach((offset, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(
      index === 0 ? 880 : 1174.66,
      now + offset,
    );
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.14, now + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.15);
  });
}
