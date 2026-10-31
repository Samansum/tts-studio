<script setup lang="ts">
  import { ref } from 'vue'
  import {
    Plus,
    Play,
    Square,
    ArrowUp,
    ArrowDown,
    Copy,
    Trash2,
    FileText,
    Split,
    CheckCircle2,
    Clock,
    AlertCircle,
    Loader2,
    Hash,
  } from 'lucide-vue-next'
  import type { BatchItem, BatchStatus } from '../types'

  defineProps<{
    items: BatchItem[]
    batchStatus: BatchStatus
    currentProcessingId?: string | null
    totalCharacters: number
    completedCount: number
    batchProgressPercent: number
  }>()

  const emit = defineEmits<{
    (e: 'addItem'): void
    (e: 'removeItem', id: string): void
    (e: 'duplicateItem', id: string): void
    (e: 'moveItem', index: number, direction: 'up' | 'down'): void
    (e: 'updateText', id: string, text: string): void
    (e: 'clearAll'): void
    (e: 'importBulk', rawText: string, mode: 'lines' | 'sentences'): void
    (e: 'startBatch'): void
    (e: 'cancelBatch'): void
    (e: 'synthesizeItem', id: string): void
    (e: 'cancelSingleItem', id: string): void
  }>()

  const showImportModal = ref(false)
  const bulkText = ref('')
  const splitMode = ref<'lines' | 'sentences'>('sentences')

  function getItemSynthesizeTooltip(item: BatchItem): string {
    if (item.status === 'processing') return 'Cancel synthesis'
    if (!item.text.trim()) return 'Enter text to synthesize'
    if (item.status === 'completed') return 'Re-synthesize this segment (overwrite audio)'
    return 'Synthesize this segment'
  }

  function handleBulkImportConfirm() {
    if (bulkText.value.trim()) {
      emit('importBulk', bulkText.value, splitMode.value)
      bulkText.value = ''
      showImportModal.value = false
    }
  }
</script>

<template>
  <div class="flex flex-col h-full space-y-3">
    <!-- Toolbar / Action Bar -->
    <div class="flex items-center justify-between studio-card p-3 rounded-xl flex-shrink-0">
      <div class="flex items-center space-x-3">
        <div class="flex items-center space-x-2">
          <FileText class="w-4 h-4 text-cyan-400" />
          <h2 class="text-sm font-semibold text-slate-100">Batch Text Segments</h2>
        </div>
        <div
          class="flex items-center space-x-2 text-xs font-mono text-slate-400 border-l border-slate-700/80 pl-3"
        >
          <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
            {{ items.length }} {{ items.length === 1 ? 'item' : 'items' }}
          </span>
          <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
            {{ totalCharacters }} chars
          </span>
          <span
            v-if="completedCount > 0"
            class="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-800/60 text-emerald-300"
          >
            {{ completedCount }}/{{ items.length }} done
          </span>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <button
          @click="showImportModal = true"
          :disabled="batchStatus === 'generating' || currentProcessingId !== null"
          class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition flex items-center space-x-1.5 disabled:opacity-40"
        >
          <Split class="w-3.5 h-3.5 text-indigo-400" />
          <span>Split Import</span>
        </button>

        <button
          @click="emit('addItem')"
          :disabled="batchStatus === 'generating' || currentProcessingId !== null"
          class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition flex items-center space-x-1.5 disabled:opacity-40"
        >
          <Plus class="w-3.5 h-3.5 text-cyan-400" />
          <span>Add Segment</span>
        </button>

        <button
          @click="emit('clearAll')"
          :disabled="batchStatus === 'generating' || currentProcessingId !== null"
          class="px-2.5 py-1.5 rounded-lg hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 text-xs font-medium border border-transparent hover:border-rose-900/40 transition disabled:opacity-40"
        >
          Clear
        </button>

        <!-- Main Synthesize Button -->
        <button
          v-if="batchStatus !== 'generating'"
          @click="emit('startBatch')"
          :disabled="currentProcessingId !== null"
          class="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-medium text-xs shadow-lg shadow-cyan-500/20 transition flex items-center space-x-1.5 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
        >
          <Play class="w-3.5 h-3.5 fill-current" />
          <span>Synthesize All</span>
        </button>

        <!-- Cancel Batch Button -->
        <button
          v-else
          @click="emit('cancelBatch')"
          class="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-lg shadow-rose-600/30 transition flex items-center space-x-1.5 active:scale-95"
        >
          <Square class="w-3.5 h-3.5 fill-current" />
          <span>Cancel Batch</span>
        </button>
      </div>
    </div>

    <!-- Active Batch Progress Bar -->
    <div
      v-if="batchStatus === 'generating'"
      class="studio-card p-3 rounded-xl bg-slate-900/90 border-cyan-800/50 space-y-2"
    >
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center space-x-2 text-cyan-400 font-medium">
          <Loader2 class="w-3.5 h-3.5 animate-spin" />
          <span>Synthesizing batch through VoxCPM 2 sidecar...</span>
        </div>
        <span class="font-mono font-semibold text-cyan-300">
          {{ completedCount }}/{{ items.length }} ({{ batchProgressPercent }}%)
        </span>
      </div>
      <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-400 transition-all duration-300 rounded-full"
          :style="{ width: `${batchProgressPercent}%` }"
        ></div>
      </div>
    </div>

    <!-- Dynamic Items List -->
    <div class="flex-1 overflow-y-auto space-y-2.5 pr-1">
      <div
        v-for="(item, index) in items"
        :key="item.id"
        class="studio-card rounded-xl p-3 border transition-all duration-200"
        :class="[
          item.status === 'processing'
            ? 'border-cyan-500/80 shadow-[0_0_15px_-3px_rgba(6,182,212,0.25)] bg-slate-900/90'
            : item.status === 'completed'
              ? 'border-emerald-600/30 bg-slate-900/40'
              : item.status === 'failed'
                ? 'border-rose-600/50 bg-rose-950/20'
                : 'border-slate-800 hover:border-slate-700 bg-slate-900/60',
        ]"
      >
        <!-- Card Top Bar: Badge, status, and item controls -->
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center space-x-2">
            <!-- Padded Sequence Badge -->
            <span
              class="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700/80 text-cyan-400 shadow-sm flex items-center space-x-1"
            >
              <Hash class="w-3 h-3 text-cyan-500" />
              <span>{{ item.sequenceBadge }}</span>
            </span>

            <span class="font-mono text-[11px] text-slate-400">
              {{ item.outputFileName }}
            </span>

            <!-- Status Indicator -->
            <div class="flex items-center space-x-1 text-xs">
              <span
                v-if="item.status === 'processing'"
                class="flex items-center space-x-1 text-cyan-400 text-[11px] font-mono"
              >
                <Loader2 class="w-3 h-3 animate-spin" />
                <span>{{ item.progress }}%</span>
              </span>
              <span
                v-else-if="item.status === 'completed'"
                class="flex items-center space-x-1 text-emerald-400 text-[11px] font-mono"
              >
                <CheckCircle2 class="w-3.5 h-3.5" />
                <span>{{ item.duration ? `${item.duration}s` : 'Done' }}</span>
              </span>
              <span
                v-else-if="item.status === 'failed'"
                class="flex items-center space-x-1 text-rose-400 text-[11px] font-mono"
                :title="item.error"
              >
                <AlertCircle class="w-3.5 h-3.5" />
                <span>Error</span>
              </span>
              <span v-else class="flex items-center space-x-1 text-slate-500 text-[11px] font-mono">
                <Clock class="w-3 h-3" />
                <span>Pending</span>
              </span>
            </div>
          </div>

          <!-- Card Actions (Synthesize single item, move up, down, duplicate, delete) -->
          <div class="flex items-center space-x-1">
            <!-- Single Segment Synthesize / Cancel Button -->
            <button
              v-if="currentProcessingId === item.id && batchStatus !== 'generating'"
              @click="emit('cancelSingleItem', item.id)"
              class="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-400 border border-rose-800/60 transition flex items-center justify-center active:scale-95 shadow-sm"
              title="Cancel synthesis"
            >
              <Square class="w-3.5 h-3.5 fill-current" />
            </button>
            <button
              v-else
              @click="emit('synthesizeItem', item.id)"
              :disabled="
                batchStatus === 'generating' ||
                (currentProcessingId !== null && currentProcessingId !== item.id) ||
                !item.text.trim()
              "
              class="p-1.5 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-400 hover:text-cyan-300 border border-cyan-800/40 hover:border-cyan-700/60 disabled:opacity-25 disabled:pointer-events-none transition flex items-center justify-center active:scale-95 shadow-sm"
              :title="getItemSynthesizeTooltip(item)"
            >
              <Loader2
                v-if="item.status === 'processing'"
                class="w-3.5 h-3.5 animate-spin text-cyan-400"
              />
              <Play v-else class="w-3.5 h-3.5 fill-current" />
            </button>

            <div class="h-3.5 w-px bg-slate-800 mx-0.5"></div>

            <button
              @click="emit('moveItem', index, 'up')"
              :disabled="
                index === 0 || batchStatus === 'generating' || currentProcessingId !== null
              "
              class="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 transition"
              title="Move Up"
            >
              <ArrowUp class="w-3.5 h-3.5" />
            </button>
            <button
              @click="emit('moveItem', index, 'down')"
              :disabled="
                index === items.length - 1 ||
                batchStatus === 'generating' ||
                currentProcessingId !== null
              "
              class="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 transition"
              title="Move Down"
            >
              <ArrowDown class="w-3.5 h-3.5" />
            </button>
            <button
              @click="emit('duplicateItem', item.id)"
              :disabled="batchStatus === 'generating' || currentProcessingId !== null"
              class="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 transition"
              title="Duplicate Card"
            >
              <Copy class="w-3.5 h-3.5" />
            </button>
            <button
              @click="emit('removeItem', item.id)"
              :disabled="batchStatus === 'generating' || currentProcessingId !== null"
              class="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 disabled:opacity-20 transition"
              title="Remove Card"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Textarea for synthesis text -->
        <textarea
          :value="item.text"
          @input="emit('updateText', item.id, ($event.target as HTMLTextAreaElement).value)"
          rows="2"
          placeholder="Enter text to synthesize for this sequence segment..."
          class="w-full text-xs font-sans bg-slate-950/60 border border-slate-800 rounded-lg p-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition resize-y min-h-[56px]"
        ></textarea>

        <!-- Progress bar for individual card while processing -->
        <div v-if="item.status === 'processing'" class="mt-2">
          <div class="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-cyan-400 transition-all duration-200"
              :style="{ width: `${item.progress}%` }"
            ></div>
          </div>
        </div>

        <!-- Card bottom info -->
        <div class="flex items-center justify-between mt-1 text-[10px] text-slate-500 font-mono">
          <span
            >{{ item.characterCount }} characters (~{{ Math.ceil(item.characterCount / 15) }}s
            estimated)</span
          >
          <span v-if="item.outputPath" class="text-slate-400 truncate max-w-[280px]">
            {{ item.outputFileName }}
          </span>
        </div>
      </div>
    </div>

    <!-- Bulk Import Modal -->
    <div
      v-if="showImportModal"
      class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        class="studio-card rounded-2xl w-full max-w-lg p-5 border border-slate-700 shadow-2xl space-y-4"
      >
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center space-x-2">
            <Split class="w-5 h-5 text-indigo-400" />
            <h3 class="text-sm font-bold text-white">Split / Bulk Import Text</h3>
          </div>
          <button @click="showImportModal = false" class="text-slate-400 hover:text-white text-xs">
            ✕
          </button>
        </div>

        <div class="space-y-2">
          <label class="text-xs text-slate-300 font-medium">Paste script or long text:</label>
          <textarea
            v-model="bulkText"
            rows="6"
            placeholder="Paste multiple lines or paragraphs to automatically slice into sequential TTS segments..."
            class="w-full text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-200 focus:outline-none focus:border-indigo-500"
          ></textarea>
        </div>

        <div class="flex items-center space-x-4 text-xs text-slate-300">
          <span class="font-medium text-slate-400">Split Method:</span>
          <label class="flex items-center space-x-1.5 cursor-pointer">
            <input type="radio" value="sentences" v-model="splitMode" class="accent-indigo-500" />
            <span>By Sentences (.!?)</span>
          </label>
          <label class="flex items-center space-x-1.5 cursor-pointer">
            <input type="radio" value="lines" v-model="splitMode" class="accent-indigo-500" />
            <span>By Line Breaks</span>
          </label>
        </div>

        <div class="flex items-center justify-end space-x-2 pt-2">
          <button
            @click="showImportModal = false"
            class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition"
          >
            Cancel
          </button>
          <button
            @click="handleBulkImportConfirm"
            class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-medium transition shadow-lg shadow-indigo-600/30"
          >
            Generate Segments
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
