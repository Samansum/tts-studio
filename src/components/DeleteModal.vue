<script setup lang="ts">
  import { ref } from 'vue'
  import { AlertTriangle, Trash2 } from 'lucide-vue-next'
  import type { AudioFileItem } from '../types'

  const props = defineProps<{
    show: boolean
    file: AudioFileItem | null
  }>()

  const emit = defineEmits<{
    (e: 'confirm', file: AudioFileItem): void
    (e: 'cancel'): void
  }>()

  const isDeleting = ref(false)

  function handleConfirm() {
    if (props.file) {
      isDeleting.value = true
      emit('confirm', props.file)
      isDeleting.value = false
    }
  }
</script>

<template>
  <div
    v-if="show && file"
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none"
  >
    <div
      class="studio-card rounded-2xl w-full max-w-md p-5 border border-rose-900/60 shadow-2xl bg-slate-900/95 space-y-4 animate-in fade-in zoom-in-95 duration-150"
    >
      <div class="flex items-start space-x-3">
        <div
          class="w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-600/50 flex items-center justify-center flex-shrink-0 text-rose-400"
        >
          <AlertTriangle class="w-5 h-5" />
        </div>
        <div class="space-y-1">
          <h3 class="text-sm font-bold text-white">Delete Audio Track?</h3>
          <p class="text-xs text-slate-300">
            This action will permanently delete the audio file from your hard drive. This operation
            cannot be undone.
          </p>
        </div>
      </div>

      <!-- File Details Box -->
      <div class="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1 font-mono">
        <div class="text-slate-200 font-semibold truncate">{{ file.name }}</div>
        <div class="text-slate-500 text-[11px] truncate">{{ file.path }}</div>
      </div>

      <!-- Modal Footer -->
      <div class="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
        <button
          @click="emit('cancel')"
          class="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition"
        >
          Cancel
        </button>
        <button
          @click="handleConfirm"
          :disabled="isDeleting"
          class="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs text-white font-medium shadow-lg shadow-rose-600/30 transition flex items-center space-x-1.5 active:scale-95 disabled:opacity-50"
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span>{{ isDeleting ? 'Deleting...' : 'Delete File' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
