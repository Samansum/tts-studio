import { ref, computed } from 'vue'
import type { AudioFileItem } from '../types'

const activeTrack = ref<AudioFileItem | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(0.85)
const isMuted = ref(false)
const playbackRate = ref(1.0)
const playlist = ref<AudioFileItem[]>([])

let audioElement: HTMLAudioElement | null = null

function getStreamUrl(filePath: string): string {
  // Use Litestar audio streaming endpoint with encoded path
  return `http://127.0.0.1:8000/api/files/audio?path=${encodeURIComponent(filePath)}`
}

function loadTrack(track: AudioFileItem, autoPlay = true) {
  const audio = getAudioElement()
  activeTrack.value = track
  currentTime.value = 0
  duration.value = track.duration || 0

  audio.src = getStreamUrl(track.path)
  audio.playbackRate = playbackRate.value

  if (autoPlay) {
    audio
      .play()
      .then(() => {
        isPlaying.value = true
      })
      .catch((err) => {
        console.warn('Playback initiation failed:', err)
        isPlaying.value = false
      })
  } else {
    isPlaying.value = false
  }
}

function playNext() {
  if (!playlist.value.length || !activeTrack.value) return
  const idx = playlist.value.findIndex((item) => item.path === activeTrack.value?.path)
  if (idx !== -1 && idx < playlist.value.length - 1) {
    loadTrack(playlist.value[idx + 1], true)
  }
}

function getAudioElement(): HTMLAudioElement {
  if (!audioElement) {
    audioElement = new Audio()
    audioElement.volume = volume.value
    audioElement.playbackRate = playbackRate.value

    audioElement.addEventListener('timeupdate', () => {
      if (audioElement) {
        currentTime.value = audioElement.currentTime
      }
    })

    audioElement.addEventListener('loadedmetadata', () => {
      if (audioElement && audioElement.duration && !isNaN(audioElement.duration)) {
        duration.value = audioElement.duration
        if (
          activeTrack.value &&
          (!activeTrack.value.duration || activeTrack.value.duration === 0)
        ) {
          activeTrack.value.duration = Math.round(audioElement.duration * 100) / 100
        }
      }
    })

    audioElement.addEventListener('ended', () => {
      isPlaying.value = false
      playNext()
    })

    audioElement.addEventListener('error', (e) => {
      console.error('Audio playback error:', e)
      isPlaying.value = false
    })
  }
  return audioElement
}

export function useAudioPlayer() {
  const progressPercent = computed(() => {
    if (!duration.value || duration.value === 0) return 0
    return Math.min(100, Math.max(0, (currentTime.value / duration.value) * 100))
  })

  function togglePlay() {
    const audio = getAudioElement()
    if (!activeTrack.value && playlist.value.length > 0) {
      loadTrack(playlist.value[0], true)
      return
    }

    if (isPlaying.value) {
      audio.pause()
      isPlaying.value = false
    } else {
      audio
        .play()
        .then(() => {
          isPlaying.value = true
        })
        .catch((err) => {
          console.warn('Play error:', err)
        })
    }
  }

  function seek(targetSeconds: number) {
    const audio = getAudioElement()
    const clamped = Math.max(0, Math.min(duration.value, targetSeconds))
    audio.currentTime = clamped
    currentTime.value = clamped
  }

  function setVolume(v: number) {
    const audio = getAudioElement()
    volume.value = Math.max(0, Math.min(1, v))
    if (audio) {
      audio.volume = isMuted.value ? 0 : volume.value
    }
  }

  function toggleMute() {
    const audio = getAudioElement()
    isMuted.value = !isMuted.value
    if (audio) {
      audio.volume = isMuted.value ? 0 : volume.value
    }
  }

  function setPlaybackRate(rate: number) {
    const audio = getAudioElement()
    playbackRate.value = rate
    if (audio) {
      audio.playbackRate = rate
    }
  }

  function playPrevious() {
    if (!playlist.value.length || !activeTrack.value) return
    const idx = playlist.value.findIndex((item) => item.path === activeTrack.value?.path)
    if (idx > 0) {
      loadTrack(playlist.value[idx - 1], true)
    }
  }

  function setPlaylist(list: AudioFileItem[]) {
    playlist.value = [...list]
  }

  function formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return {
    activeTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    playlist,
    progressPercent,
    loadTrack,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    setPlaybackRate,
    playNext,
    playPrevious,
    setPlaylist,
    formatTime,
  }
}
