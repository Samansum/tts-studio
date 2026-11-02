<script setup lang="ts">
  import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
    Volume1,
    ExternalLink,
    Disc,
  } from 'lucide-vue-next'
  import { useAudioPlayer } from '../composables/useAudioPlayer'

  const {
    activeTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    setPlaybackRate,
    playNext,
    playPrevious,
    formatTime,
  } = useAudioPlayer()

  const rates = [0.8, 1.0, 1.2, 1.5, 2.0]

  function cycleRate() {
    const currentIdx = rates.indexOf(playbackRate.value)
    const nextIdx = (currentIdx + 1) % rates.length
    setPlaybackRate(rates[nextIdx])
  }

  function handleScrub(e: Event) {
    const target = e.target as HTMLInputElement
    seek(parseFloat(target.value))
  }

  function openCurrentFile() {
    if (activeTrack.value?.path) {
      window.electronAPI?.openPath(activeTrack.value.path)
    }
  }
</script>

<template>
  <div
    class="h-20 border-t border-zinc-800/80 bg-zinc-900/95 backdrop-blur-xl px-5 flex items-center justify-between z-30 select-none flex-shrink-0"
  >
    <!-- Left: Track info -->
    <div class="flex items-center space-x-3 w-1/4 min-w-[220px]">
      <div
        class="w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-700/80 flex items-center justify-center flex-shrink-0 relative overflow-hidden"
        :class="{ 'border-zinc-500 shadow-[0_0_12px_rgba(255,255,255,0.08)]': isPlaying }"
      >
        <Disc
          class="w-6 h-6 text-zinc-400"
          :class="{ 'animate-spin text-white': isPlaying }"
          style="animation-duration: 4s"
        />
      </div>

      <div class="truncate">
        <p class="text-xs font-mono font-medium text-zinc-100 truncate">
          {{ activeTrack?.name || 'No Track Selected' }}
        </p>
        <p class="text-[11px] text-zinc-500 font-mono mt-0.5 truncate">
          {{ activeTrack?.path || 'Select audio file to play' }}
        </p>
      </div>

      <button
        v-if="activeTrack"
        @click="openCurrentFile"
        class="p-1 text-zinc-500 hover:text-white transition"
        title="Open in File Explorer"
      >
        <ExternalLink class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Center: Playback Controls & Progress Bar -->
    <div class="flex flex-col items-center w-2/4 max-w-xl px-4 space-y-1.5">
      <!-- Buttons -->
      <div class="flex items-center space-x-4">
        <!-- Previous -->
        <button
          @click="playPrevious"
          class="p-1.5 text-zinc-400 hover:text-white transition disabled:opacity-30"
          :disabled="!activeTrack"
        >
          <SkipBack class="w-4 h-4" />
        </button>

        <!-- Play / Pause Main CTA -->
        <button
          @click="togglePlay"
          :disabled="!activeTrack"
          class="w-9 h-9 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 flex items-center justify-center shadow-lg shadow-black/40 transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
        >
          <Pause v-if="isPlaying" class="w-4 h-4" />
          <Play v-else class="w-4 h-4 ml-0.5" />
        </button>

        <!-- Next -->
        <button
          @click="playNext"
          class="p-1.5 text-zinc-400 hover:text-white transition disabled:opacity-30"
          :disabled="!activeTrack"
        >
          <SkipForward class="w-4 h-4" />
        </button>
      </div>

      <!-- Scrub Bar -->
      <div class="w-full flex items-center space-x-3 text-[11px] font-mono text-zinc-400">
        <span class="w-10 text-right">{{ formatTime(currentTime) }}</span>
        <div class="flex-1 relative flex items-center">
          <input
            type="range"
            min="0"
            :max="duration || 100"
            step="0.05"
            :value="currentTime"
            @input="handleScrub"
            class="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
          />
        </div>
        <span class="w-10">{{ formatTime(duration) }}</span>
      </div>
    </div>

    <!-- Right: Rate & Volume Controls -->
    <div class="flex items-center justify-end space-x-4 w-1/4 min-w-[200px]">
      <!-- Playback Speed Pill -->
      <button
        @click="cycleRate"
        class="px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/80 text-[11px] font-mono text-zinc-200 font-semibold transition"
        title="Playback Speed"
      >
        {{ playbackRate }}x
      </button>

      <!-- Volume -->
      <div class="flex items-center space-x-2">
        <button @click="toggleMute" class="text-zinc-400 hover:text-white transition">
          <VolumeX v-if="isMuted || volume === 0" class="w-4 h-4 text-rose-400" />
          <Volume1 v-else-if="volume < 0.5" class="w-4 h-4" />
          <Volume2 v-else class="w-4 h-4 text-zinc-300" />
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          :value="isMuted ? 0 : volume"
          @input="setVolume(parseFloat(($event.target as HTMLInputElement).value))"
          class="w-20 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
        />
      </div>
    </div>
  </div>
</template>
