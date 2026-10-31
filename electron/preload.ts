import { contextBridge, ipcRenderer } from 'electron'
import type { AudioFileItem, ElectronAPI } from '../src/types'

const api: ElectronAPI = {
  selectDirectory: (defaultPath?: string): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:selectDirectory', defaultPath)
  },
  selectFile: (filters?: { name: string; extensions: string[] }[]): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:selectFile', filters)
  },
  openPath: (filePath: string): Promise<void> => {
    return ipcRenderer.invoke('shell:openPath', filePath)
  },
  deleteFile: (filePath: string): Promise<boolean> => {
    return ipcRenderer.invoke('file:delete', filePath)
  },
  listFiles: (dirPath: string): Promise<AudioFileItem[]> => {
    return ipcRenderer.invoke('file:list', dirPath)
  },
  getBackendStatus: (): Promise<{ pid: number | null; port: number; status: string }> => {
    return ipcRenderer.invoke('backend:getStatus')
  },
  minimize: (): void => {
    ipcRenderer.send('window:minimize')
  },
  maximize: (): void => {
    ipcRenderer.send('window:maximize')
  },
  close: (): void => {
    ipcRenderer.send('window:close')
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

