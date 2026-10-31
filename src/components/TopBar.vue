<script setup lang="ts">
  import { ref, onMounted, onUnmounted } from 'vue'
  import {
    Cpu,
    RefreshCw,
    Minus,
    Square,
    X,
    Sparkles,
    Zap,
    HardDrive,
  } from 'lucide-vue-next'
  import type { BackendStatus } from '../types'

  const status = ref<BackendStatus>({
    connected: false,
    port: 8000,
    cudaAvailable: false,
    deviceName: 'Checking...',
    vramAllocatedMB: 0,
    vramReservedMB: 0,
    vramTotalMB: 0,
    modelName: 'openbmb/VoxCPM2',
    modelReady: false,
    activeJob: null,
  })

  const isChecking = ref(false)
  let checkInterval: any = null

  async function fetchStatus() {
    isChecking.value = true
    try {
      const res = await fetch('http://127.0.0.1:8000/api/status', {
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) {
        const data = await res.json()
        status.value = {
          connected: true,
          port: data.port || 8000,
          cudaAvailable: data.cuda_available || false,
          deviceName: data.device_name || 'CPU',
          vramAllocatedMB: data.vram_allocated_mb || 0,
          vramReservedMB: data.vram_reserved_mb || 0,
          vramTotalMB: data.vram_total_mb || 0,
          modelName: data.model_name || 'VoxCPM2',
          modelReady: data.model_ready || false,
          activeJob: null,
          isFallbackMock: data.is_fallback_mock,
        }
      } else {
        status.value.connected = false
      }
    } catch {
      status.value.connected = false
    } finally {
      isChecking.value = false
    }
  }

  function handleMinimize() {
    window.electronAPI?.minimize()
  }

  function handleMaximize() {
    window.electronAPI?.maximize()
  }

  function handleClose() {
    window.electronAPI?.close()
  }

  onMounted(() => {
    fetchStatus()
    checkInterval = setInterval(fetchStatus, 4000)
  })

  onUnmounted(() => {
    if (checkInterval) clearInterval(checkInterval)
  })
</script>

<template>
  <header
    class="h-14 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md px-4 flex items-center justify-between select-none z-30 flex-shrink-0"
    style="-webkit-app-region: drag"
  >
    <!-- Left: Brand -->
    <div class="flex items-center space-x-3" style="-webkit-app-region: no-drag">
      <div
        class="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 via-indigo-600 to-purple-600 p-[1.5px] shadow-lg shadow-cyan-500/10"
      >
        <div class="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
          <Sparkles class="w-5 h-5 text-cyan-400" />
        </div>
      </div>
      <div>
        <div class="flex items-center space-x-2">
          <span class="font-bold text-base tracking-tight text-white">TTS Studio</span>
          <span
            class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-700/50 text-cyan-300 uppercase tracking-wider"
          >
            VoxCPM 2
          </span>
        </div>
        <p class="text-[11px] text-slate-400 font-mono -mt-0.5">Desktop Sidecar Architecture</p>
      </div>
    </div>

    <!-- Center: Telemetry (CUDA, VRAM, Litestar Port) -->
    <div
      class="flex items-center space-x-2.5 text-xs font-mono"
      style="-webkit-app-region: no-drag"
    >
      <!-- Backend Port Connection Pill -->
      <div
        class="flex items-center space-x-1.5 px-2.5 py-1 rounded-full border transition-all duration-300"
        :class="
          status.connected
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
            : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
        "
      >
        <div
          class="w-2 h-2 rounded-full transition-all"
          :class="
            status.connected
              ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
              : 'bg-rose-400 animate-pulse'
          "
        ></div>
        <span class="font-medium">
          {{ status.connected ? `Litestar :${status.port}` : 'Backend Offline' }}
        </span>
      </div>

      <!-- CUDA Status Badge -->
      <div
        class="flex items-center space-x-1.5 px-2.5 py-1 rounded-full border"
        :class="
          status.cudaAvailable
            ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-300'
            : 'bg-slate-800/60 border-slate-700 text-slate-400'
        "
        :title="status.cudaAvailable ? `GPU: ${status.deviceName}` : 'Running on CPU'"
      >
        <Zap v-if="status.cudaAvailable" class="w-3.5 h-3.5 text-indigo-400" />
        <Cpu v-else class="w-3.5 h-3.5 text-slate-400" />
        <span class="max-w-[150px] truncate">
          {{ status.cudaAvailable ? status.deviceName : 'CPU Mode' }}
        </span>
      </div>

      <!-- VRAM Usage Pill -->
      <div
        v-if="status.cudaAvailable && status.vramTotalMB > 0"
        class="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-800/70 border border-slate-700/60 text-slate-300"
        :title="`Allocated: ${status.vramAllocatedMB} MB / Total: ${status.vramTotalMB} MB`"
      >
        <HardDrive class="w-3.5 h-3.5 text-cyan-400" />
        <span
          >VRAM: {{ (status.vramAllocatedMB / 1024).toFixed(1) }} /
          {{ (status.vramTotalMB / 1024).toFixed(1) }} GB</span
        >
      </div>

      <!-- Model Status Badge -->
      <div
        class="px-2.5 py-1 rounded-full border text-[11px]"
        :class="
          status.isFallbackMock
            ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
            : status.modelReady
              ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
              : 'bg-slate-800 border-slate-700 text-slate-400'
        "
      >
        <span>{{
          status.isFallbackMock
            ? 'Acoustic Emulation'
            : status.modelReady
              ? 'Model Ready'
              : 'Standby'
        }}</span>
      </div>

      <!-- Reconnect / Refresh button -->
      <button
        @click="fetchStatus"
        class="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
        :class="{ 'animate-spin': isChecking }"
        title="Check Backend Telemetry"
      >
        <RefreshCw class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Right: Window Controls -->
    <div class="flex items-center space-x-1" style="-webkit-app-region: no-drag">
      <button
        @click="handleMinimize"
        class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition"
      >
        <Minus class="w-3.5 h-3.5" />
      </button>
      <button
        @click="handleMaximize"
        class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition"
      >
        <Square class="w-3 h-3" />
      </button>
      <button
        @click="handleClose"
        class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-rose-600 text-slate-400 hover:text-white transition"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
  </header>
</template>
