<script setup lang="ts">
  import { Folder, ExternalLink, Hash, RotateCcw } from 'lucide-vue-next'

  const props = defineProps<{
    outputDir: string
    startingSequence: number
  }>()

  const emit = defineEmits<{
    (e: 'update:outputDir', dir: string): void
    (e: 'update:startingSequence', seq: number): void
    (e: 'refreshFiles'): void
    (e: 'syncSequence'): void
  }>()

  async function handleBrowseDir() {
    if (window.electronAPI) {
      const selected = await window.electronAPI.selectDirectory(props.outputDir)
      if (selected) {
        emit('update:outputDir', selected)
        emit('refreshFiles')
      }
    }
  }

  function handleOpenExplorer() {
    if (props.outputDir && window.electronAPI) {
      window.electronAPI.openPath(props.outputDir)
    }
  }

  function handleSeqInput(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value, 10)
    if (!isNaN(val) && val >= 1) {
      emit('update:startingSequence', val)
    }
  }
</script>

<template>
  <div class="studio-card rounded-xl p-3.5 flex flex-col space-y-2.5">
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-2">
        <Folder class="w-4 h-4 text-zinc-400" />
        <h3 class="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
          Output Destination
        </h3>
      </div>
      <div class="flex items-center space-x-2">
        <div
          class="flex items-center space-x-1.5 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-0.5 text-xs"
        >
          <Hash class="w-3 h-3 text-zinc-500" />
          <span class="text-zinc-400 text-[11px]">Start Seq:</span>
          <input
            type="number"
            min="1"
            max="9999"
            :value="startingSequence"
            @input="handleSeqInput"
            class="w-12 bg-transparent text-right font-mono text-zinc-100 font-bold focus:outline-none"
          />
          <button
            type="button"
            @click="emit('syncSequence')"
            title="Auto-detect next sequence number from existing audio files"
            class="p-0.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <RotateCcw class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>

    <!-- Folder Path Banner -->
    <div class="flex items-center space-x-2">
      <div
        class="flex-1 flex items-center justify-between bg-zinc-950/80 border border-zinc-800/80 rounded-lg px-3 py-2 text-xs font-mono truncate"
      >
        <span class="text-zinc-300 truncate font-medium">
          {{ outputDir || 'No output directory selected' }}
        </span>
        <span class="text-[10px] text-zinc-500 uppercase ml-2 flex-shrink-0">
          Pattern: speech_XXXX.wav
        </span>
      </div>

      <button
        @click="handleBrowseDir"
        class="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-xs font-medium border border-zinc-700 transition flex items-center space-x-1.5 flex-shrink-0"
      >
        <Folder class="w-3.5 h-3.5 text-zinc-400" />
        <span>Change</span>
      </button>

      <button
        @click="handleOpenExplorer"
        :disabled="!outputDir"
        class="p-2 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg border border-zinc-700 transition disabled:opacity-40 disabled:pointer-events-none flex-shrink-0"
        title="Open in Windows File Explorer"
      >
        <ExternalLink class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
