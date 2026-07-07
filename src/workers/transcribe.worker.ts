import { pipeline, env } from '@huggingface/transformers';

// Force single-threaded WASM — avoids SharedArrayBuffer requirement (GitHub Pages has no COOP/COEP)
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;
env.allowLocalModels = false;

type ASRPipeline = Awaited<ReturnType<typeof pipeline<'automatic-speech-recognition'>>>;
let asr: ASRPipeline | null = null;

async function load() {
  if (asr) return asr;
  asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-large-v3-turbo', {
    dtype: { encoder_model: 'q4', decoder_model_merged: 'q4' },
    progress_callback: (p: { status: string; progress?: number; name?: string }) => {
      if (p.status === 'progress') {
        self.postMessage({ type: 'load-progress', progress: p.progress ?? 0, name: p.name ?? '' });
      } else if (p.status === 'done') {
        self.postMessage({ type: 'load-progress', progress: 100, name: p.name ?? '' });
      }
    },
  } as Parameters<typeof pipeline>[2]);
  self.postMessage({ type: 'ready' });
  return asr;
}

self.addEventListener('message', async (e: MessageEvent) => {
  const { type, audio } = e.data as { type: string; audio?: Float32Array };

  if (type === 'preload') {
    await load();
    return;
  }

  if (type === 'transcribe') {
    try {
      const model = await load();
      const result = await model(audio!, {
        language: 'english',
        task: 'transcribe',
        // chunk_length_s and stride_length_s help with longer recordings
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
      } as Parameters<ASRPipeline>[1]);
      const text = Array.isArray(result)
        ? result.map(r => r.text).join(' ').trim()
        : (result as { text: string }).text.trim();
      self.postMessage({ type: 'result', text });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) });
    }
  }
});
