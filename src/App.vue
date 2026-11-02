<script setup lang="ts">
  import { ref, onMounted, watch } from 'vue'
  import TopBar from './components/TopBar.vue'
  import VoiceConfig from './components/VoiceConfig.vue'
  import OutputManager from './components/OutputManager.vue'
  import BatchTextInput from './components/BatchTextInput.vue'
  import AudioPreviewList from './components/AudioPreviewList.vue'
  import AudioPlayerBar from './components/AudioPlayerBar.vue'
  import DeleteModal from './components/DeleteModal.vue'

  import { useBatchTTS, getNextSequenceFromFiles } from './composables/useBatchTTS'
  import { useAudioPlayer } from './composables/useAudioPlayer'
  import type { AudioFileItem, VoiceConfigData } from './types'

  // Batch TTS orchestration
  const {
    items,
    startingSequence,
    batchStatus,
    currentProcessingId,
    totalCharacters,
    completedCount,
    batchProgressPercent,
    addItem,
    removeItem,
    duplicateItem,
    moveItem,
    updateText,
    clearAll,
    importBulkText,
    recalculateSequences,
    startBatchSynthesis,
    cancelBatch,
    startSingleSynthesis,
    cancelSingleSynthesis,
  } = useBatchTTS()

  // Audio Player orchestration
  const { activeTrack, isPlaying, loadTrack, reloadCurrentTrack, togglePlay, setPlaylist } =
    useAudioPlayer()

  // Voice Configuration state
  const voiceConfig = ref<VoiceConfigData>({
    referenceWavPath: null,
    referenceWavName: null,
    voicePrompt: '(warm male narrator, calm, confident)',
    cfgValue: 2.0,
    inferenceTimesteps: 10,
    denoise: false,
  })

  // Output folder & library files
  const outputDir = ref<string>('')
  const audioFiles = ref<AudioFileItem[]>([])

  // Delete modal state
  const showDeleteModal = ref(false)
  const fileToDelete = ref<AudioFileItem | null>(null)

  // Refresh output directory files
  async function refreshFiles(autoSyncSeq = false) {
    if (!outputDir.value) return
    let list: AudioFileItem[] = []
    if (window.electronAPI) {
      list = await window.electronAPI.listFiles(outputDir.value)
    } else {
      // Web fallback test via backend API
      try {
        const res = await fetch(
          `http://127.0.0.1:8000/api/files/list?directory=${encodeURIComponent(outputDir.value)}`
        )
        if (res.ok) {
          list = await res.json()
        }
      } catch (e) {
        console.warn('Could not fetch file list from backend:', e)
      }
    }
    audioFiles.value = list
    setPlaylist(list)

    if (activeTrack.value) {
      const match = list.find((f) => f.path === activeTrack.value?.path)
      if (match) {
        activeTrack.value = match
      }
    }

    if (autoSyncSeq && batchStatus.value !== 'generating') {
      const nextSeq = getNextSequenceFromFiles(list)
      startingSequence.value = nextSeq
      recalculateSequences()
    }
  }

  // Update output directory and sync start sequence with destination
  async function handleOutputDirUpdate(dir: string) {
    outputDir.value = dir
    await refreshFiles(true)
  }

  // Explicitly sync starting sequence from current audio files in output dir
  function handleSyncSequence() {
    const nextSeq = getNextSequenceFromFiles(audioFiles.value)
    startingSequence.value = nextSeq
    recalculateSequences()
  }

  // When clearing all batch items, ensure startingSequence follows biggest number in output dir
  function handleClearAll() {
    const nextSeq = getNextSequenceFromFiles(audioFiles.value)
    clearAll(nextSeq)
  }

  // When importing bulk text, if untouched/empty, start after highest existing number
  function handleImportBulk(rawText: string, mode: 'lines' | 'sentences') {
    const isEmptyOrUntouched =
      items.value.length === 0 || (items.value.length === 1 && items.value[0].text.trim() === '')
    if (isEmptyOrUntouched) {
      const nextSeq = getNextSequenceFromFiles(audioFiles.value)
      startingSequence.value = nextSeq
    }
    importBulkText(rawText, mode)
  }

  // When removing an item, if all items were cleared, align start sequence with files
  function handleRemoveItem(id: string) {
    removeItem(id)
    if (items.value.length === 1 && items.value[0].text.trim() === '') {
      const nextSeq = getNextSequenceFromFiles(audioFiles.value)
      startingSequence.value = nextSeq
      recalculateSequences()
    }
  }

  // Start batch trigger
  async function handleStartBatch() {
    if (!outputDir.value) {
      if (window.electronAPI) {
        const picked = await window.electronAPI.selectDirectory()
        if (picked) {
          outputDir.value = picked
        } else {
          return
        }
      }
    }

    try {
      await startBatchSynthesis(outputDir.value, voiceConfig.value, (_newFile) => {
        // Refresh audio preview list as each file is completed
        refreshFiles(false)
      })
      // Refresh files after batch completes
      await refreshFiles(false)
    } catch (err: any) {
      alert(`Batch Synthesis Error: ${err.message || err}`)
    }
  }

  // Single Item Synthesis trigger
  async function handleSynthesizeItem(itemId: string) {
    if (!outputDir.value) {
      if (window.electronAPI) {
        const picked = await window.electronAPI.selectDirectory()
        if (picked) {
          outputDir.value = picked
        } else {
          return
        }
      } else {
        alert('Please select an output directory before synthesizing.')
        return
      }
    }

    try {
      await startSingleSynthesis(itemId, outputDir.value, voiceConfig.value, (newPath) => {
        refreshFiles(false)
        if (activeTrack.value?.path === newPath) {
          reloadCurrentTrack()
        }
      })
      await refreshFiles(false)
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        alert(`Synthesis Error: ${err.message || err}`)
      }
    }
  }

  function handleCancelSingleItem(itemId: string) {
    cancelSingleSynthesis(itemId)
  }

  // Track selection & playback from preview list
  function handleSelectTrack(track: AudioFileItem) {
    loadTrack(track, true)
  }

  function handleToggleTrackPlay(track: AudioFileItem) {
    if (activeTrack.value?.path === track.path) {
      togglePlay()
    } else {
      loadTrack(track, true)
    }
  }

  // Delete handling
  function handleRequestDelete(track: AudioFileItem) {
    fileToDelete.value = track
    showDeleteModal.value = true
  }

  async function handleConfirmDelete(track: AudioFileItem) {
    let success = false
    if (window.electronAPI) {
      success = await window.electronAPI.deleteFile(track.path)
    } else {
      try {
        const res = await fetch(
          `http://127.0.0.1:8000/api/files?path=${encodeURIComponent(track.path)}`,
          {
            method: 'DELETE',
          }
        )
        success = res.ok
      } catch {
        success = false
      }
    }

    if (success) {
      if (activeTrack.value?.path === track.path) {
        activeTrack.value = null
      }
      showDeleteModal.value = false
      fileToDelete.value = null
      await refreshFiles(false)
    } else {
      alert('Failed to delete file from disk.')
    }
  }

  // Recalculate sequences when startingSequence changes
  watch(startingSequence, () => {
    recalculateSequences()
  })

  onMounted(async () => {
    // Set default output dir under user Documents if not set
    const defaultDocs = 'C:\\Users\\Saman\\Documents\\tts-studio\\output'
    outputDir.value = defaultDocs
    await refreshFiles(true)
  })
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
    <!-- Top Bar with Hardware & Backend Telemetry -->
    <TopBar />

    <!-- Main Workspace -->
    <main class="flex-1 flex overflow-hidden p-3 gap-3">
      <!-- Left Column: Controls & Dynamic Text Batch Input -->
      <section class="flex-1 flex flex-col min-w-0 space-y-3 h-full">
        <!-- Top configuration row: Output Manager & Voice Config -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-3 flex-shrink-0">
          <OutputManager
            :output-dir="outputDir"
            :starting-sequence="startingSequence"
            @update:output-dir="handleOutputDirUpdate"
            @update:starting-sequence="startingSequence = $event"
            @refresh-files="() => refreshFiles(false)"
            @sync-sequence="handleSyncSequence"
          />

          <VoiceConfig v-model="voiceConfig" />
        </div>

        <!-- Dynamic Multi-textarea Batch Editor Area -->
        <div class="flex-1 min-h-0">
          <BatchTextInput
            :items="items"
            :batch-status="batchStatus"
            :current-processing-id="currentProcessingId"
            :total-characters="totalCharacters"
            :completed-count="completedCount"
            :batch-progress-percent="batchProgressPercent"
            @add-item="addItem()"
            @remove-item="handleRemoveItem"
            @duplicate-item="duplicateItem($event)"
            @move-item="(idx, dir) => moveItem(idx, dir)"
            @update-text="(id, txt) => updateText(id, txt)"
            @clear-all="handleClearAll"
            @import-bulk="handleImportBulk"
            @start-batch="handleStartBatch"
            @cancel-batch="cancelBatch"
            @synthesize-item="handleSynthesizeItem"
            @cancel-single-item="handleCancelSingleItem"
          />
        </div>
      </section>

      <!-- Right Column: Audio Preview Library -->
      <aside class="w-80 lg:w-96 flex flex-col h-full flex-shrink-0">
        <AudioPreviewList
          :files="audioFiles"
          :active-track="activeTrack"
          :is-playing="isPlaying"
          :output-dir="outputDir"
          @select-track="handleSelectTrack"
          @toggle-play="handleToggleTrackPlay"
          @request-delete="handleRequestDelete"
          @refresh="refreshFiles"
        />
      </aside>
    </main>

    <!-- Fixed Bottom Audio Player Bar -->
    <AudioPlayerBar />

    <!-- File Delete Confirmation Modal -->
    <DeleteModal
      :show="showDeleteModal"
      :file="fileToDelete"
      @confirm="handleConfirmDelete"
      @cancel="showDeleteModal = false"
    />
  </div>
</template>
