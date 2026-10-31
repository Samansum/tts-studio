<script setup lang="ts">
  import { ref } from 'vue'
  import { Mic, FolderOpen, X, Play, Pause, Sliders, Sparkles } from 'lucide-vue-next'
  import type { VoiceConfigData } from '../types'

  const props = defineProps<{
    modelValue: VoiceConfigData
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', value: VoiceConfigData): void
  }>()

  const isReferencePlaying = ref(false)
  const refAudioElement = ref<HTMLAudioElement | null>(null)
  const showAdvanced = ref(false)

  const presetStyles = [
    'warm male narrator, calm and confident',
    'energetic female presenter, upbeat and clear',
    'deep cinematic voice, dramatic and articulate',
    'storyteller, soft-spoken and engaging',
    'casual conversational tone, friendly',
  ]

  async function handleBrowseReference() {
    if (window.electronAPI) {
      const selected = await window.electronAPI.selectFile([
        { name: 'Audio Files (*.wav, *.mp3, *.ogg)', extensions: ['wav', 'mp3', 'ogg', 'flac'] },
      ])
      if (selected) {
        const fileName = selected.split(/[/\\]/).pop() || selected
        emit('update:modelValue', {
          ...props.modelValue,
          referenceWavPath: selected,
          referenceWavName: fileName,
        })
      }
    }
  }

  function handleClearReference() {
    if (refAudioElement.value) {
      refAudioElement.value.pause()
      isReferencePlaying.value = false
    }
    emit('update:modelValue', {
      ...props.modelValue,
      referenceWavPath: null,
      referenceWavName: null,
    })
  }

  function togglePreviewReference() {
    if (!props.modelValue.referenceWavPath) return

    if (isReferencePlaying.value && refAudioElement.value) {
      refAudioElement.value.pause()
      isReferencePlaying.value = false
      return
    }

    if (!refAudioElement.value) {
      refAudioElement.value = new Audio()
      refAudioElement.value.onended = () => {
        isReferencePlaying.value = false
      }
      refAudioElement.value.onerror = () => {
        isReferencePlaying.value = false
      }
    }

    refAudioElement.value.src = `http://127.0.0.1:8000/api/files/audio?path=${encodeURIComponent(
      props.modelValue.referenceWavPath
    )}`
    refAudioElement.value
      .play()
      .then(() => {
        isReferencePlaying.value = true
      })
      .catch((err) => {
        console.error('Failed to preview reference audio:', err)
        isReferencePlaying.value = false
      })
  }

  function applyPreset(style: string) {
    emit('update:modelValue', {
      ...props.modelValue,
      voicePrompt: `(${style})`,
    })
  }

  function updatePrompt(e: Event) {
    const val = (e.target as HTMLTextAreaElement).value
    emit('update:modelValue', {
      ...props.modelValue,
      voicePrompt: val,
    })
  }

  function updateCfg(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value)
    emit('update:modelValue', {
      ...props.modelValue,
      cfgValue: val,
    })
  }

  function updateSteps(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value, 10)
    emit('update:modelValue', {
      ...props.modelValue,
      inferenceTimesteps: val,
    })
  }
</script>

<template>
  <div class="studio-card rounded-xl p-4 flex flex-col space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-slate-800 pb-2">
      <div class="flex items-center space-x-2">
        <Mic class="w-4 h-4 text-cyan-400" />
        <h3 class="text-xs font-semibold text-slate-200 uppercase tracking-wider">
          Voice Architecture
        </h3>
      </div>
      <button
        @click="showAdvanced = !showAdvanced"
        class="text-xs flex items-center space-x-1 text-slate-400 hover:text-cyan-300 transition"
      >
        <Sliders class="w-3.5 h-3.5" />
        <span>{{ showAdvanced ? 'Simple' : 'Parameters' }}</span>
      </button>
    </div>

    <!-- Voice Cloning Reference Audio -->
    <div class="space-y-1.5">
      <div class="flex items-center justify-between text-xs">
        <span class="font-medium text-slate-300">Reference WAV (Zero-Shot Cloning)</span>
        <span class="text-[11px] text-slate-500 font-mono">Optional</span>
      </div>

      <!-- File Selected State -->
      <div
        v-if="modelValue.referenceWavPath"
        class="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/90 border border-cyan-800/50 text-xs"
      >
        <div class="flex items-center space-x-2.5 truncate mr-2">
          <button
            @click="togglePreviewReference"
            class="w-7 h-7 flex-shrink-0 rounded-full bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-cyan-400 hover:bg-cyan-900 transition"
            :title="isReferencePlaying ? 'Pause Reference' : 'Play Reference'"
          >
            <Pause v-if="isReferencePlaying" class="w-3.5 h-3.5" />
            <Play v-else class="w-3.5 h-3.5 ml-0.5" />
          </button>
          <div class="truncate">
            <p class="font-mono font-medium text-cyan-300 truncate">
              {{ modelValue.referenceWavName }}
            </p>
            <p class="text-[10px] text-slate-400 truncate font-mono">
              {{ modelValue.referenceWavPath }}
            </p>
          </div>
        </div>

        <button
          @click="handleClearReference"
          class="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition"
          title="Remove Reference"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Dropzone / Browse Button -->
      <div
        v-else
        @click="handleBrowseReference"
        class="border border-dashed border-slate-700 hover:border-cyan-500/60 rounded-lg p-3 text-center cursor-pointer transition bg-slate-900/40 hover:bg-slate-900/70 group"
      >
        <FolderOpen
          class="w-5 h-5 mx-auto mb-1 text-slate-400 group-hover:text-cyan-400 transition"
        />
        <p class="text-xs text-slate-300 font-medium">Browse Reference Audio (.wav, .mp3)</p>
        <p class="text-[10px] text-slate-500 mt-0.5">
          Clones voice timbre and acoustic tone directly
        </p>
      </div>
    </div>

    <!-- Voice Style & Prompt Input -->
    <div class="space-y-1.5">
      <div class="flex items-center justify-between text-xs">
        <span class="font-medium text-slate-300 flex items-center space-x-1.5">
          <Sparkles class="w-3.5 h-3.5 text-amber-400" />
          <span>Voice Style & Prompt</span>
        </span>
        <span class="text-[10px] text-slate-500 font-mono">Natural Language</span>
      </div>

      <textarea
        :value="modelValue.voicePrompt"
        @input="updatePrompt"
        rows="2"
        placeholder="(e.g. warm male narrator, calm, confident, expressive prosody)"
        class="w-full text-xs font-mono bg-slate-900/90 border border-slate-700/80 rounded-lg p-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/30 transition resize-none"
      ></textarea>

      <!-- Preset Pills -->
      <div class="flex flex-wrap gap-1.5 pt-1">
        <button
          v-for="preset in presetStyles"
          :key="preset"
          @click="applyPreset(preset)"
          class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 hover:bg-cyan-950/70 text-slate-300 hover:text-cyan-300 border border-slate-700 hover:border-cyan-600/50 transition truncate max-w-[210px]"
        >
          {{ preset }}
        </button>
      </div>
    </div>

    <!-- Advanced Parameters Drawer -->
    <div v-if="showAdvanced" class="pt-2 border-t border-slate-800/80 space-y-3">
      <!-- Guidance Scale CFG -->
      <div class="space-y-1">
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-slate-400">CFG Guidance Scale</span>
          <span class="font-mono text-cyan-400 font-semibold">{{
            modelValue.cfgValue.toFixed(1)
          }}</span>
        </div>
        <input
          type="range"
          min="1.0"
          max="5.0"
          step="0.1"
          :value="modelValue.cfgValue"
          @input="updateCfg"
          class="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
        />
        <div class="flex justify-between text-[9px] text-slate-500 font-mono">
          <span>Natural (1.5)</span>
          <span>Balanced (2.0)</span>
          <span>Strong Prompt (4.0)</span>
        </div>
      </div>

      <!-- Inference Steps -->
      <div class="space-y-1">
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-slate-400">Inference Timesteps</span>
          <span class="font-mono text-cyan-400 font-semibold"
            >{{ modelValue.inferenceTimesteps }} steps</span
          >
        </div>
        <input
          type="range"
          min="5"
          max="30"
          step="1"
          :value="modelValue.inferenceTimesteps"
          @input="updateSteps"
          class="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
        />
        <div class="flex justify-between text-[9px] text-slate-500 font-mono">
          <span>Fast (5)</span>
          <span>Standard (10)</span>
          <span>High Detail (25)</span>
        </div>
      </div>
    </div>
  </div>
</template>
