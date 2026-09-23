import i18n from '@/i18n'

type SignalEvent = 'focusDone' | 'breakDone'

let audio: AudioContext | undefined

/** A soft two-note chime synthesized on the fly — no audio files to ship. */
export function chime(event: SignalEvent) {
  try {
    audio ??= new AudioContext()
    const notes = event === 'focusDone' ? [659.25, 880] : [880, 659.25]
    notes.forEach((freq, i) => {
      const osc = audio!.createOscillator()
      const gain = audio!.createGain()
      const at = audio!.currentTime + i * 0.18
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.18, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.9)
      osc.connect(gain).connect(audio!.destination)
      osc.start(at)
      osc.stop(at + 1)
    })
  } catch {
    // Audio may be unavailable (autoplay policy, no device) — the visual state still changes.
  }
}

/** Asks once, from a user gesture, so phase-end notifications can be shown later. */
export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission()
  }
}

export function notify(event: SignalEvent) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  // Only when the user is elsewhere; inside the app the timer UI already shows it.
  if (document.visibilityState === 'visible' && document.hasFocus()) return
  new Notification(i18n.t(`timer.notify.${event}.title`), {
    body: i18n.t(`timer.notify.${event}.body`),
    icon: '/mito.svg',
    tag: 'mito-timer',
  })
}
