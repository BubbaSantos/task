import { useEffect, useRef, useState } from 'react';
import type { VoiceCaptureState } from '../types';
import { formatElapsed } from '../utils/dates';
import styles from './VoiceCapture.module.css';

interface Props {
  state: VoiceCaptureState;
  elapsedMs: number;
  loadProgress: number;
  onStop: (blob: Blob) => void;
  onCancel: () => void;
}

export function VoiceCapture({ state, elapsedMs, loadProgress, onStop, onCancel }: Props) {
  const [waveHeights, setWaveHeights] = useState([8, 18, 26, 34, 28, 16, 10, 20]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (state !== 'listening') return;

    chunksRef.current = [];

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      streamRef.current = stream;

      // Waveform visualiser
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      ctx.createMediaStreamSource(stream).connect(analyser);
      function tick() {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        setWaveHeights(Array.from({ length: 8 }, (_, i) => {
          const raw = data[Math.floor(i * (data.length / 8))] ?? 0;
          return Math.max(8, Math.min(34, 8 + (raw / 255) * 26));
        }));
        animFrameRef.current = requestAnimationFrame(tick);
      }
      tick();

      // Pick best supported format
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find(t => MediaRecorder.isTypeSupported(t)) ?? '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(100); // collect chunks every 100ms
      recorderRef.current = recorder;
    }).catch(err => console.error('Mic error:', err));

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      recorderRef.current?.stop();
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [state]);

  function handleStop() {
    const recorder = recorderRef.current;
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    if (!recorder) return;
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      onStop(blob);
    };
    try { recorder.stop(); } catch { /* ignore */ }
    recorderRef.current = null;
  }

  if (state === 'idle') return null;

  if (state === 'loading') {
    return (
      <div className={styles.backdrop}>
        <div className={styles.sheet} role="dialog" aria-label="Loading model">
          <div className={styles.handle} />
          <div className={styles.listeningLabel} style={{ color: 'var(--text-secondary)' }}>
            Loading Whisper…
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressBar} style={{ width: `${loadProgress}%` }} />
          </div>
          <p className={styles.progressNote}>
            Downloading model (~400 MB) — cached after first use
          </p>
          <button className={`${styles.iconBtn} ${styles.cancel}`} style={{ marginTop: 8 }} onClick={onCancel}>
            <span className="msym" style={{ fontSize: 24 }}>close</span>
          </button>
        </div>
      </div>
    );
  }

  if (state === 'transcribing') {
    return (
      <div className={styles.backdrop}>
        <div className={styles.sheet} role="dialog" aria-label="Transcribing">
          <div className={styles.handle} />
          <div className={styles.listeningLabel} style={{ color: 'var(--text-secondary)' }}>
            Transcribing…
          </div>
          <div className={styles.parsingSpinner} />
        </div>
      </div>
    );
  }

  if (state === 'parsing') {
    return (
      <div className={styles.backdrop}>
        <div className={styles.sheet} role="dialog" aria-label="Parsing task">
          <div className={styles.handle} />
          <div className={styles.listeningLabel} style={{ color: 'var(--text-secondary)' }}>
            Understanding your task…
          </div>
          <div className={styles.parsingSpinner} />
        </div>
      </div>
    );
  }

  // state === 'listening'
  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={styles.sheet} role="dialog" aria-label="Voice capture">
        <div className={styles.handle} />
        <div className={styles.listeningLabel}>Listening…</div>

        <div className={styles.micAvatar}>
          <div className={styles.pulseRing} />
          <div className={styles.micCircle}>
            <span className="msym" style={{ fontSize: 32, color: '#fff' }}>mic</span>
          </div>
        </div>

        <div className={styles.waveform}>
          {waveHeights.map((h, i) => (
            <div key={i} className={styles.bar} style={{ height: h }} />
          ))}
        </div>

        <div className={styles.timer}>{formatElapsed(elapsedMs)}</div>

        <div className={styles.actions}>
          <div className={styles.actionItem}>
            <button className={`${styles.iconBtn} ${styles.cancel}`} onClick={onCancel} aria-label="Cancel">
              <span className="msym" style={{ fontSize: 24 }}>close</span>
            </button>
            <span className={styles.actionLabel}>Cancel</span>
          </div>
          <div className={styles.actionItem}>
            <button className={`${styles.iconBtn} ${styles.stop}`} onClick={handleStop} aria-label="Stop recording">
              <span className="msym" style={{ fontSize: 24, color: '#fff' }}>stop</span>
            </button>
            <span className={`${styles.actionLabel} ${styles.stopLabel}`}>Stop</span>
          </div>
        </div>
      </div>
    </div>
  );
}
