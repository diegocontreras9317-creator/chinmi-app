/**
 * Generador de sonido de timbre para avisos de servicio en sala y restaurante (Web Audio API).
 * Genera un sonido agradable de campanilla de servicio sin dependencias externas.
 */

export function playServiceBell(type: 'waiter' | 'bill' = 'waiter') {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();

    // In modern browsers, AudioContext might need to be resumed
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    if (type === 'bill') {
      // 3-tone chime for bill request (E5 -> G5 -> C6)
      const freqs = [659.25, 783.99, 1046.5];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.65);
      });
    } else {
      // 2-tone melodic chime for calling the waiter (G5 -> E6)
      const freqs = [783.99, 1318.51];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.15);

        gain.gain.setValueAtTime(0, now + idx * 0.15);
        gain.gain.linearRampToValueAtTime(0.3, now + idx * 0.15 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.15 + 0.7);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.15);
        osc.stop(now + idx * 0.15 + 0.75);
      });
    }
  } catch (err) {
    console.debug('Audio alert playback skipped or restricted:', err);
  }
}

/**
 * Alarma sonora para alimentos vencidos o próximos a caducar (Restaurante y Bar).
 */
export function playExpiryAlarm(type: 'critical' | 'warning' = 'warning') {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    if (type === 'critical') {
      // 2 sharp warning pulses (880Hz -> 587Hz)
      const pulses = [
        { f: 880, start: 0, dur: 0.14 },
        { f: 659, start: 0.16, dur: 0.14 },
        { f: 880, start: 0.34, dur: 0.18 }
      ];

      pulses.forEach(p => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(p.f, now + p.start);

        gain.gain.setValueAtTime(0, now + p.start);
        gain.gain.linearRampToValueAtTime(0.18, now + p.start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + p.start + p.dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + p.start);
        osc.stop(now + p.start + p.dur + 0.05);
      });
    } else {
      // Gentle reminder chime for items expiring in 1-3 days (523Hz -> 659Hz)
      const notes = [523.25, 659.25];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.18);

        gain.gain.setValueAtTime(0, now + idx * 0.18);
        gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.18);
        osc.stop(now + idx * 0.18 + 0.45);
      });
    }
  } catch (err) {
    console.debug('Expiry alarm playback error:', err);
  }
}
