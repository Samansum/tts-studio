export interface AudioFileItem {
  id: string
  name: string
  path: string
  size: number
  mtime: number
  duration: number
  sequenceNumber?: number
}

export type BatchItemStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface BatchItem {
  id: string
  sequence: number
  sequenceBadge: string
  text: string
  characterCount: number
  status: BatchItemStatus
  progress: number
  outputFileName?: string
  outputPath?: string
  error?: string
  duration?: number
}

export type BatchStatus = 'idle' | 'generating' | 'completed' | 'cancelled'

export interface LoraItem {
  id: string
  name: string
  actorName?: string
  path: string | null
  isPredefined?: boolean
  exists?: boolean
}

export interface VoiceConfigData {
  referenceWavPath: string | null
  referenceWavName: string | null
  voicePrompt: string
  cfgValue: number
  inferenceTimesteps: number
  denoise: boolean
  loraId: string | null
  loraName: string | null
  loraPath: string | null
}

export interface BackendStatus {
  connected: boolean
  port: number
  cudaAvailable: boolean
  deviceName: string
  vramAllocatedMB: number
  vramReservedMB: number
  vramTotalMB: number
  modelName: string
  modelReady: boolean
  activeJob: string | null
  isFallbackMock?: boolean
  currentLora?: string | null
}

export interface SSEProgressEvent {
  event: 'progress' | 'item_start' | 'item_complete' | 'batch_complete' | 'error'
  itemId: string
  sequence: number
  progress: number
  step?: number
  totalSteps?: number
  outputPath?: string
  outputFileName?: string
  duration?: number
  error?: string
  stats?: {
    completed: number
    total: number
  }
}

export interface ElectronAPI {
  selectDirectory: (defaultPath?: string) => Promise<string | null>
  selectFile: (
    filters?: { name: string; extensions: string[] }[],
    title?: string
  ) => Promise<string | null>
  openPath: (filePath: string) => Promise<void>
  deleteFile: (filePath: string) => Promise<boolean>
  listFiles: (dirPath: string) => Promise<AudioFileItem[]>
  getBackendStatus: () => Promise<{ pid: number | null; port: number; status: string }>
  getPredefinedLoras: () => Promise<LoraItem[]>
  minimize: () => void
  maximize: () => void
  close: () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
