import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { spawn, execSync, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import http from 'http'
import type { AudioFileItem, LoraItem } from '../src/types'

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null
const BACKEND_PORT = 8000

function naturalSortKey(s: string) {
  return s.split(/(\d+)/).map((part) => {
    const num = parseInt(part, 10)
    return isNaN(num) ? part.toLowerCase() : num
  })
}

function findPythonExecutable(): string {
  const isWin = process.platform === 'win32'
  const projectRoot = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..')

  // Check server/.venv
  const venvPython = isWin
    ? path.join(projectRoot, 'server', '.venv', 'Scripts', 'python.exe')
    : path.join(projectRoot, 'server', '.venv', 'bin', 'python')

  if (fs.existsSync(venvPython)) {
    return venvPython
  }

  // Check uv python paths
  if (isWin) {
    const localUvPython = path.join(
      process.env.USERPROFILE || '',
      '.local',
      'bin',
      'python3.11.exe'
    )
    if (fs.existsSync(localUvPython)) return localUvPython
  }

  return isWin ? 'python.exe' : 'python3'
}

function startBackendSidecar(): Promise<boolean> {
  return new Promise((resolve) => {
    const pythonExe = findPythonExecutable()
    const projectRoot = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..')
    const serverDir = path.join(projectRoot, 'server')
    const mainScript = path.join(serverDir, 'main.py')

    console.log(`[Sidecar] Launching Litestar using: ${pythonExe} (${mainScript})`)
    console.log(`[Sidecar] Server working directory: ${serverDir}`)

    try {
      backendProcess = spawn(pythonExe, ['main.py'], {
        cwd: serverDir,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PORT: BACKEND_PORT.toString(),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      backendProcess.stdout?.on('data', (data) => {
        const line = data.toString().trim()
        if (line) console.log(`[Litestar] ${line}`)
      })

      backendProcess.stderr?.on('data', (data) => {
        const line = data.toString().trim()
        if (line) console.warn(`[Litestar stderr] ${line}`)
      })

      backendProcess.on('error', (err) => {
        console.error('[Sidecar] Failed to start backend process:', err)
        resolve(false)
      })

      backendProcess.on('exit', (code, signal) => {
        console.log(`[Sidecar] Backend exited with code ${code} and signal ${signal}`)
        backendProcess = null
      })

      // Poll status endpoint until backend is responsive (up to 15 seconds)
      let retries = 30
      const checkHealth = () => {
        const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/api/status`, (res) => {
          if (res.statusCode === 200) {
            console.log('[Sidecar] Litestar backend ready and responsive on port', BACKEND_PORT)
            resolve(true)
          } else if (--retries > 0) {
            setTimeout(checkHealth, 500)
          } else {
            resolve(false)
          }
        })
        req.on('error', () => {
          if (--retries > 0) {
            setTimeout(checkHealth, 500)
          } else {
            console.warn('[Sidecar] Backend startup timed out. Proceeding anyway.')
            resolve(false)
          }
        })
        req.end()
      }
      setTimeout(checkHealth, 600)
    } catch (err) {
      console.error('[Sidecar] Process execution error:', err)
      resolve(false)
    }
  })
}

function killBackendProcess() {
  if (backendProcess && backendProcess.pid) {
    console.log(`[Sidecar] Terminating backend PID ${backendProcess.pid}...`)
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${backendProcess.pid} /f /t`)
      } else {
        backendProcess.kill('SIGTERM')
      }
    } catch (e) {
      console.error('[Sidecar] Error killing process:', e)
    }
    backendProcess = null
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    title: 'TTS Studio — VoxCPM 2',
    backgroundColor: '#090d16',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#090d16',
      symbolColor: '#94a3b8',
      height: 38,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // In dev mode, load Vite dev server
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Register IPC handlers
function registerIpcHandlers() {
  ipcMain.handle('dialog:selectDirectory', async (_event, defaultPath?: string) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Output Directory for Synthesized Audio',
      defaultPath: defaultPath || app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  ipcMain.handle(
    'dialog:selectFile',
    async (_event, filters?: { name: string; extensions: string[] }[], title?: string) => {
      if (!mainWindow) return null
      const result = await dialog.showOpenDialog(mainWindow, {
        title: title || 'Select File',
        properties: ['openFile'],
        filters: filters || [
          { name: 'Audio Files', extensions: ['wav', 'mp3', 'flac', 'ogg', 'm4a'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })
      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0]
      }
      return null
    }
  )

  ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
    if (!targetPath) return
    if (fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath)
      if (stat.isDirectory()) {
        await shell.openPath(targetPath)
      } else {
        shell.showItemInFolder(targetPath)
      }
    }
  })

  ipcMain.handle('file:delete', async (_event, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath)
        return true
      }
      return false
    } catch (e) {
      console.error('Failed to unlink file:', e)
      return false
    }
  })

  ipcMain.handle('file:deleteAll', async (_event, filePaths: string[]) => {
    let allOk = true
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath)
        }
      } catch (e) {
        console.error('Failed to unlink file:', filePath, e)
        allOk = false
      }
    }
    return allOk
  })

  ipcMain.handle('file:list', async (_event, dirPath: string) => {
    if (!dirPath || !fs.existsSync(dirPath)) return []
    try {
      const entries = await fs.promises.readdir(dirPath)
      const wavFiles = entries.filter((f) => f.toLowerCase().endsWith('.wav'))

      // Sort naturally
      wavFiles.sort((a, b) => {
        const keyA = naturalSortKey(a)
        const keyB = naturalSortKey(b)
        for (let i = 0; i < Math.max(keyA.length, keyB.length); i++) {
          if (keyA[i] === undefined) return -1
          if (keyB[i] === undefined) return 1
          if (keyA[i] !== keyB[i]) {
            return keyA[i] < keyB[i] ? -1 : 1
          }
        }
        return 0
      })

      const items: AudioFileItem[] = []
      for (const name of wavFiles) {
        const fullPath = path.join(dirPath, name)
        try {
          const st = await fs.promises.stat(fullPath)
          const m =
            name.match(/speech_(\d+)\.wav$/i) ||
            name.match(/(?:^|_)(\d+)\.wav$/i) ||
            name.match(/(\d+)/)
          const seq = m ? parseInt(m[1], 10) : undefined
          items.push({
            id: name,
            name,
            path: fullPath,
            size: st.size,
            mtime: st.mtimeMs,
            duration: 0, // Filled by player / backend inspect
            sequenceNumber: seq,
          })
        } catch {
          // Ignore read errors
        }
      }
      return items
    } catch (err) {
      console.error('Error listing audio files:', err)
      return []
    }
  })

  ipcMain.handle('backend:getStatus', async () => {
    return {
      pid: backendProcess ? (backendProcess.pid ?? null) : null,
      port: BACKEND_PORT,
      status: backendProcess ? 'running' : 'stopped',
    }
  })

  ipcMain.handle('lora:getPredefined', async (): Promise<LoraItem[]> => {
    const projectRoot = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..')
    const adamPath = path.join(projectRoot, 'loras', 'Adam-vox-cpm-1100-steps-lora.safetensors')
    return [
      {
        id: 'adam',
        name: 'Adam',
        actorName: 'Adam',
        path: adamPath,
        isPredefined: true,
        exists: fs.existsSync(adamPath),
      },
    ]
  })

  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.on('window:close', () => {
    mainWindow?.close()
  })
}

// App lifecycle
app.whenReady().then(async () => {
  registerIpcHandlers()
  createWindow()
  await startBackendSidecar()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  killBackendProcess()
})

app.on('window-all-closed', () => {
  killBackendProcess()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
