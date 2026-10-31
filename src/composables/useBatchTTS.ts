import { ref, computed } from 'vue'
import type { BatchItem, BatchStatus, VoiceConfigData } from '../types'

export function useBatchTTS() {
  const items = ref<BatchItem[]>([
    {
      id: 'item-1',
      sequence: 1,
      sequenceBadge: '0001',
      text: 'Welcome to TTS Studio. This state-of-the-art interface is powered by VoxCPM 2 and Litestar.',
      characterCount: 92,
      status: 'pending',
      progress: 0,
      outputFileName: 'speech_0001.wav',
    },
    {
      id: 'item-2',
      sequence: 2,
      sequenceBadge: '0002',
      text: 'With zero-shot voice cloning, you can provide a reference audio clip to match the exact vocal timbre.',
      characterCount: 104,
      status: 'pending',
      progress: 0,
      outputFileName: 'speech_0002.wav',
    },
  ])

  const startingSequence = ref<number>(1)
  const batchStatus = ref<BatchStatus>('idle')
  const currentProcessingId = ref<string | null>(null)
  const abortController = ref<AbortController | null>(null)

  function recalculateSequences() {
    items.value.forEach((item, index) => {
      const seq = startingSequence.value + index
      item.sequence = seq
      item.sequenceBadge = seq.toString().padStart(4, '0')
      item.outputFileName = `speech_${item.sequenceBadge}.wav`
      item.characterCount = item.text.length
    })
  }

  function addItem(initialText = '') {
    const newItem: BatchItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sequence: 1,
      sequenceBadge: '0001',
      text: initialText,
      characterCount: initialText.length,
      status: 'pending',
      progress: 0,
    }
    items.value.push(newItem)
    recalculateSequences()
  }

  function removeItem(id: string) {
    items.value = items.value.filter((item) => item.id !== id)
    if (items.value.length === 0) {
      addItem('')
    } else {
      recalculateSequences()
    }
  }

  function duplicateItem(id: string) {
    const idx = items.value.findIndex((item) => item.id === id)
    if (idx !== -1) {
      const target = items.value[idx]
      const duplicated: BatchItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sequence: target.sequence + 1,
        sequenceBadge: '',
        text: target.text,
        characterCount: target.text.length,
        status: 'pending',
        progress: 0,
      }
      items.value.splice(idx + 1, 0, duplicated)
      recalculateSequences()
    }
  }

  function moveItem(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= items.value.length) return

    const temp = items.value[index]
    items.value[index] = items.value[targetIndex]
    items.value[targetIndex] = temp
    recalculateSequences()
  }

  function updateText(id: string, text: string) {
    const target = items.value.find((item) => item.id === id)
    if (target) {
      target.text = text
      target.characterCount = text.length
    }
  }

  function clearAll() {
    items.value = []
    addItem('')
  }

  function importBulkText(rawText: string, splitMode: 'lines' | 'sentences') {
    let segments: string[] = []
    if (splitMode === 'lines') {
      segments = rawText
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    } else {
      // Split on sentence boundaries (. ! ?)
      segments = rawText
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    }

    if (segments.length > 0) {
      items.value = segments.map((seg, idx) => ({
        id: `item-${Date.now()}-${idx}`,
        sequence: startingSequence.value + idx,
        sequenceBadge: (startingSequence.value + idx).toString().padStart(4, '0'),
        text: seg,
        characterCount: seg.length,
        status: 'pending',
        progress: 0,
        outputFileName: `speech_${(startingSequence.value + idx).toString().padStart(4, '0')}.wav`,
      }))
      recalculateSequences()
    }
  }

  // Computed summary stats
  const totalCharacters = computed(() => {
    return items.value.reduce((acc, item) => acc + item.characterCount, 0)
  })

  const completedCount = computed(() => {
    return items.value.filter((item) => item.status === 'completed').length
  })

  const batchProgressPercent = computed(() => {
    if (items.value.length === 0) return 0
    return Math.round((completedCount.value / items.value.length) * 100)
  })

  async function startBatchSynthesis(
    outputDir: string,
    voiceConfig: VoiceConfigData,
    onFileGenerated?: (outputPath: string) => void
  ) {
    if (batchStatus.value === 'generating') return
    if (!outputDir) {
      throw new Error('Please select an output directory before synthesizing.')
    }

    // Reset status of non-completed items
    items.value.forEach((item) => {
      if (item.status !== 'completed') {
        item.status = 'pending'
        item.progress = 0
        item.error = undefined
      }
    })

    batchStatus.value = 'generating'
    abortController.value = new AbortController()

    try {
      const response = await fetch('http://127.0.0.1:8000/api/tts/batch-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.value.map((item) => ({
            id: item.id,
            sequence: item.sequence,
            text: item.text,
            outputFileName: item.outputFileName,
            outputPath: `${outputDir}/${item.outputFileName}`,
          })),
          voice_config: voiceConfig,
          output_dir: outputDir,
        }),
        signal: abortController.value.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error(`Failed to start batch synthesis: HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''

        for (const rawEvent of events) {
          if (!rawEvent.trim()) continue
          const lines = rawEvent.split('\n')
          let eventType = 'message'
          let eventData = ''

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.replace('event:', '').trim()
            } else if (line.startsWith('data:')) {
              eventData = line.replace('data:', '').trim()
            }
          }

          if (!eventData) continue

          try {
            const data = JSON.parse(eventData)

            if (eventType === 'item_start') {
              currentProcessingId.value = data.itemId
              const target = items.value.find((i) => i.id === data.itemId)
              if (target) {
                target.status = 'processing'
                target.progress = 5
              }
            } else if (eventType === 'progress') {
              const target = items.value.find((i) => i.id === data.itemId)
              if (target) {
                target.progress = data.progress || 0
              }
            } else if (eventType === 'item_complete') {
              const target = items.value.find((i) => i.id === data.itemId)
              if (target) {
                target.status = 'completed'
                target.progress = 100
                target.outputPath = data.outputPath
                target.outputFileName = data.outputFileName
                target.duration = data.duration
                if (onFileGenerated && data.outputPath) {
                  onFileGenerated(data.outputPath)
                }
              }
            } else if (eventType === 'error') {
              const target = items.value.find((i) => i.id === data.itemId)
              if (target) {
                target.status = 'failed'
                target.error = data.error
              }
            } else if (eventType === 'batch_complete') {
              batchStatus.value = 'completed'
              currentProcessingId.value = null
            }
          } catch (e) {
            console.warn('Error parsing SSE payload:', e, rawEvent)
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        batchStatus.value = 'cancelled'
      } else {
        console.error('Batch synthesis error:', err)
        batchStatus.value = 'idle'
        throw err
      }
    } finally {
      currentProcessingId.value = null
      abortController.value = null
      if (batchStatus.value === 'generating') {
        batchStatus.value = 'completed'
      }
    }
  }

  function cancelBatch() {
    if (abortController.value) {
      abortController.value.abort()
      batchStatus.value = 'cancelled'
    }
  }

  return {
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
  }
}

