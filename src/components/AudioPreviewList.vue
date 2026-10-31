<script setup lang="ts">
  import { ref, computed } from 'vue'
  import {
    Music,
    Play,
    Pause,
    Trash2,
    RefreshCw,
    FolderOpen,
    Search,
    ExternalLink,
  } from 'lucide-vue-next'
  import type { AudioFileItem } from '../types'

  const props = defineProps<{
    files: AudioFileItem[]
    activeTrack: AudioFileItem | null
    isPlaying: boolean
    outputDir: string
  }>()

  const emit = defineEmits<{
    (e: 'selectTrack', track: AudioFileItem): void
    (e: 'togglePlay', track: AudioFileItem): void
    (e: 'requestDelete', track: AudioFileItem): void
    (e: 'refresh'): void
  }>()

  const searchQuery = ref('')
  const isRefreshing = ref(false)

  const filteredFiles = computed(() => {
    if (!searchQuery.value.trim()) return props.files
    const q = searchQuery.value.toLowerCase()
    return props.files.filter((f) => f.name.toLowerCase().includes(q))
  })

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  function formatDuration(sec: number): string {
    if (!sec || isNaN(sec)) return '--:--'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  function formatDate(ms: number): string {
    if (!ms) return ''
    const d = new Date(ms)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function handleRefresh() {
    isRefreshing.value = true
    emit('refresh')
    setTimeout(() => {
      isRefreshing.value = false
    }, 400)
  }

  function openInExplorer(path: string) {
    window.electronAPI?.openPath(path)
  }
</script>

<template>
  <div class="studio-card rounded-xl p-3.5 flex flex-col h-full space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
      <div class="flex items-center space-x-2">
        <Music class="w-4 h-4 text-cyan-400" />
        <h3 class="text-xs font-semibold text-slate-200 uppercase tracking-wider">
          Generated Audio Library
        </h3>
        <span
          class="font-mono text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-cyan-400 font-bold border border-slate-700/60"
        >
          {{ files.length }}
        </span>
      </div>

      <div class="flex items-center space-x-1.5">
        <button
          @click="handleRefresh"
          class="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          :class="{ 'animate-spin': isRefreshing }"
          title="Refresh Directory"
        >
          <RefreshCw class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Search Input -->
    <div class="relative">
      <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        type="text"
        v-model="searchQuery"
        placeholder="Filter audio files..."
        class="w-full text-xs bg-slate-900/80 border border-slate-700/70 rounded-lg pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition"
      />
    </div>

    <!-- Audio List -->
    <div class="flex-1 overflow-y-auto space-y-1.5 pr-1">
      <div
        v-if="filteredFiles.length === 0"
        class="h-44 flex flex-col items-center justify-center text-center text-slate-500 p-4 border border-dashed border-slate-800/80 rounded-xl"
      >
        <FolderOpen class="w-7 h-7 mb-2 text-slate-600" />
        <p class="text-xs font-medium">No audio files found</p>
        <p class="text-[10px] text-slate-600 mt-1 max-w-[200px]">
          Synthesize text segments above to generate .wav output in the selected folder.
        </p>
      </div>

      <div
        v-for="file in filteredFiles"
        :key="file.id"
        class="group flex items-center justify-between p-2 rounded-lg border transition-all duration-150 cursor-pointer"
        :class="[
          activeTrack?.path === file.path
            ? 'bg-cyan-950/40 border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
            : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700',
        ]"
        @click="emit('selectTrack', file)"
      >
        <!-- Left: Play button & Track Info -->
        <div class="flex items-center space-x-2.5 min-w-0 mr-2">
          <!-- Play / Pause Button -->
          <button
            @click.stop="emit('togglePlay', file)"
            class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition border"
            :class="[
              activeTrack?.path === file.path && isPlaying
                ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-[0_0_8px_#38bdf8]'
                : 'bg-slate-800 text-slate-300 border-slate-700 group-hover:border-cyan-500/50 group-hover:text-cyan-400',
            ]"
          >
            <Pause v-if="activeTrack?.path === file.path && isPlaying" class="w-3.5 h-3.5" />
            <Play v-else class="w-3.5 h-3.5 ml-0.5" />
          </button>

          <!-- Equalizer animation if active playing -->
          <div
            v-if="activeTrack?.path === file.path && isPlaying"
            class="flex items-end space-x-0.5 h-3 w-3 flex-shrink-0"
          >
            <span class="w-0.5 bg-cyan-400 rounded-full animate-eq-1"></span>
            <span class="w-0.5 bg-cyan-400 rounded-full animate-eq-2"></span>
            <span class="w-0.5 bg-cyan-400 rounded-full animate-eq-3"></span>
          </div>

          <!-- Title & metadata -->
          <div class="truncate">
            <p
              class="text-xs font-mono font-medium truncate"
              :class="
                activeTrack?.path === file.path ? 'text-cyan-300 font-semibold' : 'text-slate-200'
              "
            >
              {{ file.name }}
            </p>
            <div class="flex items-center space-x-2 text-[10px] text-slate-500 font-mono mt-0.5">
              <span>{{ formatDuration(file.duration) }}</span>
              <span>•</span>
              <span>{{ formatFileSize(file.size) }}</span>
              <span>•</span>
              <span>{{ formatDate(file.mtime) }}</span>
            </div>
          </div>
        </div>

        <!-- Right: Actions (Reveal in Explorer, Delete) -->
        <div
          class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <button
            @click.stop="openInExplorer(file.path)"
            class="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-cyan-300 transition"
            title="Reveal in File Explorer"
          >
            <ExternalLink class="w-3.5 h-3.5" />
          </button>

          <button
            @click.stop="emit('requestDelete', file)"
            class="p-1 rounded hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition"
            title="Delete Audio File"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
