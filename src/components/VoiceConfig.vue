<script setup lang="ts">
  import { ref, computed, onMounted, onUnmounted } from 'vue'
  import {
    Mic,
    FolderOpen,
    X,
    Play,
    Pause,
    Sliders,
    Sparkles,
    Layers,
    ChevronDown,
    Check,
  } from 'lucide-vue-next'
  import type { VoiceConfigData, LoraItem } from '../types'

  const props = defineProps<{
    modelValue: VoiceConfigData
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', value: VoiceConfigData): void
  }>()

  const isReferencePlaying = ref(false)
  const refAudioElement = ref<HTMLAudioElement | null>(null)
  const showAdvanced = ref(false)

  // LoRA State
  const loraDropdownRef = ref<HTMLElement | null>(null)
  const isLoraDropdownOpen = ref(false)

  const predefinedLoras = ref<LoraItem[]>([
    {
      id: 'adam',
      name: 'Adam',
      actorName: 'Adam',
      path: 'loras/Adam-vox-cpm-1100-steps-lora.safetensors',
      isPredefined: true,
    },
  ])

  const customLoras = ref<LoraItem[]>([])
  const STORAGE_KEY = 'tts_custom_loras'

  function loadCustomLoras() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        customLoras.value = JSON.parse(raw)
      }
    } catch (e) {
      console.error('Failed to load custom LoRAs from localStorage:', e)
    }
  }

  function saveCustomLoras() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customLoras.value))
    } catch (e) {
      console.error('Failed to save custom LoRAs to localStorage:', e)
    }
  }

  async function fetchPredefinedLoras() {
    if (window.electronAPI?.getPredefinedLoras) {
      try {
        const list = await window.electronAPI.getPredefinedLoras()
        if (list && list.length > 0) {
          predefinedLoras.value = list
          return
        }
      } catch (e) {
        console.warn('Could not fetch predefined loras from electron API:', e)
      }
    }

    try {
      const res = await fetch('http://127.0.0.1:8000/api/loras/predefined')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          predefinedLoras.value = data
        }
      }
    } catch (e) {
      console.warn('Could not fetch predefined loras from backend API:', e)
    }
  }

  function handleOutsideClick(event: MouseEvent) {
    if (
      isLoraDropdownOpen.value &&
      loraDropdownRef.value &&
      !loraDropdownRef.value.contains(event.target as Node)
    ) {
      isLoraDropdownOpen.value = false
    }
  }

  onMounted(() => {
    loadCustomLoras()
    fetchPredefinedLoras()
    window.addEventListener('click', handleOutsideClick)
  })

  onUnmounted(() => {
    window.removeEventListener('click', handleOutsideClick)
  })

  const isNoneSelected = computed(() => {
    return (
      !props.modelValue.loraId || props.modelValue.loraId === 'none' || !props.modelValue.loraPath
    )
  })

  const selectedLoraDisplayName = computed(() => {
    if (isNoneSelected.value) {
      return 'None'
    }
    return props.modelValue.loraName || 'Selected LoRA'
  })

  const selectedLoraTypeBadge = computed(() => {
    if (isNoneSelected.value) {
      return 'None'
    }
    const isPredef = predefinedLoras.value.some((l) => l.id === props.modelValue.loraId)
    if (isPredef) return 'Actor: Adam'
    return 'Custom'
  })

  function selectLora(item: LoraItem | null) {
    if (!item || item.id === 'none') {
      emit('update:modelValue', {
        ...props.modelValue,
        loraId: 'none',
        loraName: 'None',
        loraPath: null,
      })
    } else {
      emit('update:modelValue', {
        ...props.modelValue,
        loraId: item.id,
        loraName: item.name,
        loraPath: item.path,
      })
    }
    isLoraDropdownOpen.value = false
  }

  function removeCustomLora(id: string, event?: Event) {
    event?.stopPropagation()
    customLoras.value = customLoras.value.filter((l) => l.id !== id)
    saveCustomLoras()

    // If the currently selected LoRA was removed, automatically revert to None
    if (props.modelValue.loraId === id) {
      selectLora(null)
    }
  }

  async function handlePickCustomLoraFile() {
    isLoraDropdownOpen.value = false
    if (window.electronAPI) {
      const selected = await window.electronAPI.selectFile(
        [
          {
            name: 'LoRA Checkpoint (*.safetensors, *.ckpt, *.pth)',
            extensions: ['safetensors', 'ckpt', 'pth'],
          },
          { name: 'All Files', extensions: ['*'] },
        ],
        'Select Custom LoRA Checkpoint File'
      )

      if (selected) {
        const fullFileName = selected.split(/[/\\]/).pop() || selected
        const cleanName = fullFileName.replace(/\.(safetensors|ckpt|pth)$/i, '')

        // Check if already in custom list
        const existing = customLoras.value.find((l) => l.path === selected)
        if (existing) {
          selectLora(existing)
          return
        }

        const newItem: LoraItem = {
          id: `custom-${Date.now()}`,
          name: cleanName || fullFileName,
          actorName: cleanName,
          path: selected,
          isPredefined: false,
        }

        customLoras.value.push(newItem)
        saveCustomLoras()
        selectLora(newItem)
      }
    }
  }

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
    <div class="flex items-center justify-between border-b border-zinc-800 pb-2">
      <div class="flex items-center space-x-2">
        <Mic class="w-4 h-4 text-zinc-400" />
        <h3 class="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
          Voice Architecture
        </h3>
      </div>
      <button
        @click="showAdvanced = !showAdvanced"
        class="text-xs flex items-center space-x-1 text-zinc-400 hover:text-zinc-200 transition"
      >
        <Sliders class="w-3.5 h-3.5" />
        <span>{{ showAdvanced ? 'Simple' : 'Parameters' }}</span>
      </button>
    </div>

    <!-- Voice Cloning Reference Audio -->
    <div class="space-y-1.5">
      <div class="flex items-center justify-between text-xs">
        <span class="font-medium text-zinc-300">Reference WAV (Zero-Shot Cloning)</span>
        <span class="text-[11px] text-zinc-500 font-mono">Optional</span>
      </div>

      <!-- File Selected State -->
      <div
        v-if="modelValue.referenceWavPath"
        class="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-700 text-xs"
      >
        <div class="flex items-center space-x-2.5 truncate mr-2">
          <button
            @click="togglePreviewReference"
            class="w-7 h-7 flex-shrink-0 rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center text-zinc-200 hover:bg-zinc-700 hover:text-white transition"
            :title="isReferencePlaying ? 'Pause Reference' : 'Play Reference'"
          >
            <Pause v-if="isReferencePlaying" class="w-3.5 h-3.5" />
            <Play v-else class="w-3.5 h-3.5 ml-0.5" />
          </button>
          <div class="truncate">
            <p class="font-mono font-medium text-zinc-200 truncate">
              {{ modelValue.referenceWavName }}
            </p>
            <p class="text-[10px] text-zinc-500 truncate font-mono">
              {{ modelValue.referenceWavPath }}
            </p>
          </div>
        </div>

        <button
          @click="handleClearReference"
          class="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 transition"
          title="Remove Reference"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Dropzone / Browse Button -->
      <div
        v-else
        @click="handleBrowseReference"
        class="border border-dashed border-zinc-800 hover:border-zinc-600 rounded-lg p-3 text-center cursor-pointer transition bg-zinc-900/40 hover:bg-zinc-900/70 group"
      >
        <FolderOpen
          class="w-5 h-5 mx-auto mb-1 text-zinc-400 group-hover:text-zinc-200 transition"
        />
        <p class="text-xs text-zinc-300 font-medium">Browse Reference Audio (.wav, .mp3)</p>
        <p class="text-[10px] text-zinc-500 mt-0.5">
          Clones voice timbre and acoustic tone directly
        </p>
      </div>
    </div>

    <!-- LoRA Selection Section -->
    <div class="space-y-1.5" ref="loraDropdownRef">
      <div class="flex items-center justify-between text-xs">
        <span class="font-medium text-zinc-300 flex items-center space-x-1.5">
          <Layers class="w-3.5 h-3.5 text-indigo-400" />
          <span>LoRA Model</span>
        </span>
        <span class="text-[11px] text-zinc-500 font-mono">
          {{ selectedLoraTypeBadge }}
        </span>
      </div>

      <!-- Custom LoRA Dropdown Trigger -->
      <div class="relative">
        <button
          type="button"
          @click="isLoraDropdownOpen = !isLoraDropdownOpen"
          class="w-full flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 text-xs text-left transition focus:outline-none focus:border-zinc-500"
        >
          <div class="flex items-center space-x-2.5 truncate mr-2">
            <span
              class="w-2 h-2 rounded-full flex-shrink-0"
              :class="
                !isNoneSelected
                  ? 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.7)]'
                  : 'bg-zinc-600'
              "
            ></span>
            <span class="font-medium text-zinc-200 truncate">
              {{ selectedLoraDisplayName }}
            </span>
            <span
              v-if="!isNoneSelected"
              class="text-[10px] px-1.5 py-0.5 rounded font-mono"
              :class="
                predefinedLoras.some((l) => l.id === modelValue.loraId)
                  ? 'bg-indigo-950 border border-indigo-800/60 text-indigo-300'
                  : 'bg-emerald-950 border border-emerald-800/60 text-emerald-300'
              "
            >
              {{
                predefinedLoras.some((l) => l.id === modelValue.loraId) ? 'Predefined' : 'Custom'
              }}
            </span>
          </div>
          <ChevronDown
            class="w-4 h-4 text-zinc-400 transition-transform duration-200 flex-shrink-0"
            :class="{ 'rotate-180': isLoraDropdownOpen }"
          />
        </button>

        <!-- Dropdown Menu List -->
        <div
          v-if="isLoraDropdownOpen"
          class="absolute z-50 left-0 right-0 mt-1 rounded-lg bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden py-1 max-h-72 overflow-y-auto"
        >
          <!-- Option: None -->
          <button
            type="button"
            @click="selectLora(null)"
            class="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-zinc-800 transition"
            :class="isNoneSelected ? 'text-white bg-zinc-800/60 font-medium' : 'text-zinc-300'"
          >
            <div class="flex items-center space-x-2">
              <span class="w-2 h-2 rounded-full bg-zinc-600"></span>
              <span>None</span>
            </div>
            <Check v-if="isNoneSelected" class="w-3.5 h-3.5 text-zinc-300" />
          </button>

          <!-- Section: Predefined -->
          <div
            class="px-3 pt-2.5 pb-1 text-[10px] uppercase tracking-wider font-semibold text-zinc-500 font-mono border-t border-zinc-800/80 mt-1"
          >
            Predefined
          </div>

          <div
            v-for="lora in predefinedLoras"
            :key="lora.id"
            @click="selectLora(lora)"
            class="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-zinc-800/80 cursor-pointer transition"
            :class="
              modelValue.loraId === lora.id
                ? 'text-indigo-300 bg-indigo-950/30 font-medium'
                : 'text-zinc-300'
            "
          >
            <div class="flex items-center space-x-2 truncate mr-2">
              <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
              <span class="truncate font-medium">{{ lora.name }}</span>
              <span
                class="text-[9px] px-1.5 py-0.2 rounded bg-indigo-950 border border-indigo-800/60 text-indigo-300 font-mono"
              >
                Actor: {{ lora.actorName || lora.name }}
              </span>
            </div>
            <Check
              v-if="modelValue.loraId === lora.id"
              class="w-3.5 h-3.5 text-indigo-400 flex-shrink-0"
            />
          </div>

          <!-- Section: Custom LoRA -->
          <div
            class="px-3 pt-2.5 pb-1 text-[10px] uppercase tracking-wider font-semibold text-zinc-500 font-mono border-t border-zinc-800/80 mt-1 flex items-center justify-between"
          >
            <span>Custom Lora</span>
            <span v-if="customLoras.length > 0" class="text-[9px] text-zinc-600 font-mono">{{
              customLoras.length
            }}</span>
          </div>

          <div v-if="customLoras.length === 0" class="px-3 py-1.5 text-[11px] text-zinc-500 italic">
            No custom LoRA selected yet
          </div>

          <div
            v-for="lora in customLoras"
            :key="lora.id"
            @click="selectLora(lora)"
            class="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-zinc-800/80 cursor-pointer transition group"
            :class="
              modelValue.loraId === lora.id
                ? 'text-emerald-300 bg-emerald-950/30 font-medium'
                : 'text-zinc-300'
            "
          >
            <div class="flex items-center space-x-2 truncate mr-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span class="truncate">{{ lora.name }}</span>
            </div>

            <div class="flex items-center space-x-1.5 flex-shrink-0">
              <Check
                v-if="modelValue.loraId === lora.id"
                class="w-3.5 h-3.5 text-emerald-400 mr-1"
              />
              <button
                type="button"
                @click.stop="removeCustomLora(lora.id, $event)"
                class="p-1 rounded hover:bg-zinc-700/80 text-zinc-500 hover:text-rose-400 transition"
                title="Remove Custom LoRA"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Bottom Action: Select from File Picker -->
          <div class="border-t border-zinc-800/90 mt-1 pt-1">
            <button
              type="button"
              @click="handlePickCustomLoraFile"
              class="w-full flex items-center space-x-2 px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
            >
              <FolderOpen class="w-3.5 h-3.5 text-zinc-400" />
              <span>Select from file picker...</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Voice Style & Prompt Input -->
    <div class="space-y-1.5">
      <div class="flex items-center justify-between text-xs">
        <span class="font-medium text-zinc-300 flex items-center space-x-1.5">
          <Sparkles class="w-3.5 h-3.5 text-amber-400" />
          <span>Voice Style & Prompt</span>
        </span>
        <span class="text-[10px] text-zinc-500 font-mono">Natural Language</span>
      </div>

      <textarea
        :value="modelValue.voicePrompt"
        @input="updatePrompt"
        rows="2"
        placeholder="(e.g. warm male narrator, calm, confident, expressive prosody)"
        class="w-full text-xs font-mono bg-zinc-950/70 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500/20 transition resize-none"
      ></textarea>

      <!-- Preset Pills -->
      <div class="flex flex-wrap gap-1.5 pt-1">
        <button
          v-for="preset in presetStyles"
          :key="preset"
          @click="applyPreset(preset)"
          class="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-750 text-zinc-300 hover:text-white border border-zinc-700/80 hover:border-zinc-600 transition truncate max-w-[210px]"
        >
          {{ preset }}
        </button>
      </div>
    </div>

    <!-- Advanced Parameters Drawer -->
    <div v-if="showAdvanced" class="pt-2 border-t border-zinc-800/80 space-y-3">
      <!-- Guidance Scale CFG -->
      <div class="space-y-1">
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-zinc-400">CFG Guidance Scale</span>
          <span class="font-mono text-zinc-200 font-semibold">{{
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
          class="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-200"
        />
        <div class="flex justify-between text-[9px] text-zinc-500 font-mono">
          <span>Natural (1.5)</span>
          <span>Balanced (2.0)</span>
          <span>Strong Prompt (4.0)</span>
        </div>
      </div>

      <!-- Inference Steps -->
      <div class="space-y-1">
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-zinc-400">Inference Timesteps</span>
          <span class="font-mono text-zinc-200 font-semibold"
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
          class="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-200"
        />
        <div class="flex justify-between text-[9px] text-zinc-500 font-mono">
          <span>Fast (5)</span>
          <span>Standard (10)</span>
          <span>High Detail (25)</span>
        </div>
      </div>
    </div>
  </div>
</template>
