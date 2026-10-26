// Alarm sounds generated with WebAudio: no audio files, works offline.

let ctx: AudioContext | null = null

/** Must be called from a user gesture (e.g. starting the timer) so iOS allows playback later. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') ctx.resume()
  } catch {
    /* WebAudio unavailable */
  }
}

function tone(freq: number, start: number, dur: number, gain = 0.35) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, start)
  g.gain.linearRampToValueAtTime(gain, start + 0.02)
  g.gain.exponentialRampToValueAtTime(0.001, start + dur)
  osc.connect(g).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + dur + 0.05)
}

/** 'extra': two short beeps (extra time begins). 'turns': fanfare repeated 3 times (extra turns begin). */
export function playAlarm(kind: 'extra' | 'turns') {
  unlockAudio()
  navigator.vibrate?.(kind === 'turns' ? [400, 150, 400, 150, 700] : [250, 120, 250])
  if (!ctx) return
  const t0 = ctx.currentTime + 0.05
  if (kind === 'extra') {
    tone(880, t0, 0.25)
    tone(880, t0 + 0.35, 0.25)
  } else {
    for (let r = 0; r < 3; r++) {
      const b = t0 + r * 1.1
      tone(523, b, 0.22)
      tone(659, b + 0.2, 0.22)
      tone(784, b + 0.4, 0.5)
    }
  }
}
