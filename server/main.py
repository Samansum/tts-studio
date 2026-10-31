import os
import re
import json
import asyncio
from typing import AsyncGenerator, Dict, Any, List, Optional
from collections.abc import AsyncGenerator as AsyncGenType

import soundfile as sf
from litestar import Litestar, get, post, delete, Request
from litestar.config.cors import CORSConfig
from litestar.response import Stream, Response, File
from litestar.exceptions import NotFoundException, HTTPException
from litestar.status_codes import HTTP_200_OK, HTTP_400_BAD_REQUEST

from engine import engine

def natural_sort_key(s: str):
    """Sort strings containing numbers naturally (e.g. 1, 2, 10 instead of 1, 10, 2)."""
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', s)]

@get("/api/status")
async def get_status() -> Dict[str, Any]:
    """Returns GPU status, VRAM consumption, and model readiness."""
    hw = engine.get_hardware_status()
    return {
        "status": "online",
        "port": 8000,
        "cuda_available": hw["cuda_available"],
        "device_name": hw["device_name"],
        "vram_allocated_mb": hw["vram_allocated_mb"],
        "vram_reserved_mb": hw["vram_reserved_mb"],
        "vram_total_mb": hw["vram_total_mb"],
        "model_name": hw["model_name"],
        "model_ready": hw["model_ready"],
        "is_fallback_mock": hw["is_fallback_mock"],
        "load_error": hw.get("error")
    }

@post("/api/tts/synthesize")
async def synthesize_single(data: Dict[str, Any]) -> Dict[str, Any]:
    """Synchronous single-item TTS synthesis endpoint."""
    text = data.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="Text cannot be empty")

    output_path = data.get("output_path")
    if not output_path:
        raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="output_path is required")

    reference_wav_path = data.get("reference_wav_path")
    voice_prompt = data.get("voice_prompt")
    cfg_value = float(data.get("cfg_value", 2.0))
    inference_timesteps = int(data.get("inference_timesteps", 10))
    denoise = bool(data.get("denoise", False))

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        lambda: engine.synthesize(
            text=text,
            output_path=output_path,
            reference_wav_path=reference_wav_path,
            voice_prompt=voice_prompt,
            cfg_value=cfg_value,
            inference_timesteps=inference_timesteps,
            denoise=denoise
        )
    )
    return {"status": "ok", "result": result}

async def batch_generator(request_payload: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """Async generator yielding Server-Sent Events (SSE) for batch synthesis."""
    items: List[Dict[str, Any]] = request_payload.get("items", [])
    voice_config: Dict[str, Any] = request_payload.get("voice_config", {})
    output_dir: str = request_payload.get("output_dir", "")

    total = len(items)
    completed_count = 0

    yield f"event: batch_start\ndata: {json.dumps({'total': total})}\n\n"

    loop = asyncio.get_running_loop()

    for idx, item in enumerate(items):
        item_id = item.get("id", str(idx))
        sequence = item.get("sequence", idx + 1)
        text = item.get("text", "").strip()
        filename = item.get("outputFileName", f"speech_{sequence:04d}.wav")
        dest_path = os.path.join(output_dir, filename) if output_dir else item.get("outputPath", filename)

        if not text:
            yield f"event: error\ndata: {json.dumps({'itemId': item_id, 'sequence': sequence, 'error': 'Empty text segment'})}\n\n"
            continue

        # Item Start event
        yield f"event: item_start\ndata: {json.dumps({'itemId': item_id, 'sequence': sequence, 'outputFileName': filename, 'destPath': dest_path})}\n\n"

        queue: asyncio.Queue = asyncio.Queue()

        def on_step_progress(step: int, total_steps: int, desc: str):
            pct = round((step / total_steps) * 100, 1)
            loop.call_soon_threadsafe(
                queue.put_nowait,
                {
                    "type": "progress",
                    "step": step,
                    "totalSteps": total_steps,
                    "progress": pct,
                    "desc": desc
                }
            )

        # Run synthesis in executor thread
        def run_sync():
            try:
                res = engine.synthesize(
                    text=text,
                    output_path=dest_path,
                    reference_wav_path=voice_config.get("referenceWavPath"),
                    voice_prompt=voice_config.get("voicePrompt"),
                    cfg_value=float(voice_config.get("cfgValue", 2.0)),
                    inference_timesteps=int(voice_config.get("inferenceTimesteps", 10)),
                    denoise=bool(voice_config.get("denoise", False)),
                    progress_callback=on_step_progress
                )
                loop.call_soon_threadsafe(queue.put_nowait, {"type": "done", "result": res})
            except Exception as e:
                loop.call_soon_threadsafe(queue.put_nowait, {"type": "error", "error": str(e)})

        synth_future = loop.run_in_executor(None, run_sync)

        while True:
            msg = await queue.get()
            if msg["type"] == "progress":
                yield f"event: progress\ndata: {json.dumps({'itemId': item_id, 'sequence': sequence, 'progress': msg['progress'], 'step': msg['step'], 'totalSteps': msg['totalSteps'], 'desc': msg['desc']})}\n\n"
            elif msg["type"] == "done":
                res = msg["result"]
                completed_count += 1
                yield f"event: item_complete\ndata: {json.dumps({'itemId': item_id, 'sequence': sequence, 'outputFileName': filename, 'outputPath': dest_path, 'duration': res.get('duration', 0), 'elapsed': res.get('elapsed_sec', 0)})}\n\n"
                break
            elif msg["type"] == "error":
                yield f"event: error\ndata: {json.dumps({'itemId': item_id, 'sequence': sequence, 'error': msg['error']})}\n\n"
                break

        await synth_future

    yield f"event: batch_complete\ndata: {json.dumps({'total': total, 'completed': completed_count})}\n\n"

@post("/api/tts/batch-stream")
async def batch_tts_stream(data: Dict[str, Any]) -> Stream:
    """Server-Sent Event streaming endpoint for real-time batch synthesis feedback."""
    return Stream(content=batch_generator(data), media_type="text/event-stream")

@get("/api/files/list")
async def list_audio_files(directory: str) -> List[Dict[str, Any]]:
    """Lists WAV audio files in the target directory with duration and natural sorting."""
    if not directory or not os.path.isdir(directory):
        return []

    files = []
    try:
        entries = os.listdir(directory)
        wav_names = [f for f in entries if f.lower().endswith(".wav")]
        wav_names.sort(key=natural_sort_key)

        for name in wav_names:
            full_path = os.path.join(directory, name)
            try:
                st = os.stat(full_path)
                duration = 0.0
                try:
                    info = sf.info(full_path)
                    duration = round(info.duration, 2)
                except Exception:
                    pass

                # Extract sequence number if present
                m = (
                    re.search(r'speech_(\d+)\.wav$', name, re.IGNORECASE)
                    or re.search(r'(?:^|_)(\d+)\.wav$', name, re.IGNORECASE)
                    or re.search(r'(\d+)', name)
                )
                seq_num = int(m.group(1)) if m else None

                files.append({
                    "id": name,
                    "name": name,
                    "path": full_path,
                    "size": st.st_size,
                    "mtime": int(st.st_mtime * 1000),
                    "duration": duration,
                    "sequenceNumber": seq_num
                })
            except Exception:
                continue
    except Exception as e:
        print(f"Error reading directory {directory}: {e}")

    return files

@get("/api/files/audio")
async def stream_audio_file(path: str) -> File:
    """Streams a WAV audio file for playback with range support."""
    if not path or not os.path.exists(path):
        raise NotFoundException(detail="Audio file not found")
    return File(path=path, media_type="audio/wav", filename=os.path.basename(path), content_disposition_type="inline")

@delete("/api/files", status_code=200)
async def delete_audio_file(path: str) -> Dict[str, Any]:
    """Deletes an audio file from disk."""
    if not path or not os.path.exists(path):
        raise NotFoundException(detail="Audio file not found")
    try:
        os.remove(path)
        return {"status": "ok", "deleted": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

cors_config = CORSConfig(
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

async def on_app_startup():
    print("[Litestar] Backend sidecar starting up...")
    try:
        engine.start_background_loading()
    except Exception as err:
        print(f"[Litestar] Model pre-load warning: {err}")

async def on_app_shutdown():
    print("[Litestar] Backend sidecar shutting down...")

app = Litestar(
    route_handlers=[
        get_status,
        synthesize_single,
        batch_tts_stream,
        list_audio_files,
        stream_audio_file,
        delete_audio_file
    ],
    cors_config=cors_config,
    on_startup=[on_app_startup],
    on_shutdown=[on_app_shutdown]
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False, access_log=False)
