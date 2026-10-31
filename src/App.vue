<script setup lang="ts">
  import { ref, onMounted, watch } from 'vue'
  import TopBar from './components/TopBar.vue'
  import VoiceConfig from './components/VoiceConfig.vue'
  import OutputManager from './components/OutputManager.vue'
  import BatchTextInput from './components/BatchTextInput.vue'
  import AudioPreviewList from './components/AudioPreviewList.vue'
  import AudioPlayerBar from './components/AudioPlayerBar.vue'
  import DeleteModal from './components/DeleteModal.vue'

  import { useBatchTTS } from './composables/useBatchTTS'
  import { useAudioPlayer } from './composables/useAudioPlayer'
  import type { AudioFileItem, VoiceConfigData } from './types'

  // Batch TTS orchestration
  const {
    items,
    startingSequence,
    batchStatus,
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
  } = useBatchTTS()

  // Audio Player orchestration
  const { activeTrack, isPlaying, loadTrack, togglePlay, setPlaylist } = useAudioPlayer()

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
  async function refreshFiles() {
    if (!outputDir.value) return
    if (window.electronAPI) {
      const list = await window.electronAPI.listFiles(outputDir.value)
      audioFiles.value = list
      setPlaylist(list)
    } else {
      // Web fallback test via backend API
      try {
        const res = await fetch(
          `http://127.0.0.1:8000/api/files/list?directory=${encodeURIComponent(outputDir.value)}`
        )
        if (res.ok) {
          const list = await res.json()
          audioFiles.value = list
          setPlaylist(list)
        }
      } catch (e) {
        console.warn('Could not fetch file list from backend:', e)
      }
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
        refreshFiles()
      })
    } catch (err: any) {
      alert(`Batch Synthesis Error: ${err.message || err}`)
    }
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
      await refreshFiles()
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
    if (window.electronAPI) {
      const defaultDocs = 'C:\\Users\\Saman\\Documents\\tts-studio\\output'
      outputDir.value = defaultDocs
      refreshFiles()
    } else {
      outputDir.value = 'C:\\Users\\Saman\\Documents\\tts-studio\\output'
      refreshFiles()
    }
  })
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
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
            @update:output-dir="outputDir = $event"
            @update:starting-sequence="startingSequence = $event"
            @refresh-files="refreshFiles"
          />

          <VoiceConfig v-model="voiceConfig" />
        </div>

        <!-- Dynamic Multi-textarea Batch Editor Area -->
        <div class="flex-1 min-h-0">
          <BatchTextInput
            :items="items"
            :batch-status="batchStatus"
            :total-characters="totalCharacters"
            :completed-count="completedCount"
            :batch-progress-percent="batchProgressPercent"
            @add-item="addItem()"
            @remove-item="removeItem($event)"
            @duplicate-item="duplicateItem($event)"
            @move-item="(idx, dir) => moveItem(idx, dir)"
            @update-text="(id, txt) => updateText(id, txt)"
            @clear-all="clearAll()"
            @import-bulk="(raw, mode) => importBulkText(raw, mode)"
            @start-batch="handleStartBatch"
            @cancel-batch="cancelBatch"
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
