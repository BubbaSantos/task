import { useEffect, useRef, useState } from 'react';
import type { VoiceCaptureState } from '../types';
import { formatElapsed } from '../utils/dates';
import styles from './VoiceCapture.module.css';

interface Props {
  state: VoiceCaptureState;
  elapsedMs: number;
  transcriptText: string;
  onStop: (audioBlob: Blob) => void;
  onCancel: () => void;
  onSave: (text: string) => void;
}

export function VoiceCapture({ state, elapsedMs, transcriptText, onStop, onCancel, onSave }: Props) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [waveHeights, setWaveHeights] = useState([8, 18, 26, 34, 28, 16, 10, 20]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  // Start microphone when listening begins
  useEffect(() => {
    if (state !== 'listening') return;

    let stream: MediaStream;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 32;
        source.connect(analyser);
        analyserRef.current = analyser;

        const mr = new MediaRecorder(stream);
        chunksRef.current = [];
        mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        mr.start(100);
        mediaRecorderRef.current = mr;

        function tick() {
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          const bars = Array.from({ length: 8 }, (_, i) => {
            const raw = data[Math.floor(i * (data.length / 8))] ?? 0;
            return Math.max(8, Math.min(34, 8 + (raw / 255) * 26));
          });
          setWaveHeights(bars);
          animFrameRef.current = requestAnimationFrame(tick);
        }
        tick();
      } catch {
        // microphone denied — stay in listening state with static bars
      }
    }

    start();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop();
      }
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [state]);

  function handleStop() {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onStop(blob);
      };
      mr.stop();
    } else {
      onStop(new Blob([], { type: 'audio/webm' }));
    }
  }

  if (state === 'idle') return null;

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={styles.sheet} role="dialog" aria-label="Voice capture">
        <div className={styles.handle} />

        {state === 'listening' && (
          <>
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
          </>
        )}

        {state === 'transcribing' && (
          <>
            <div className={styles.transcribingHeader}>
              <div className={styles.spinner} aria-hidden="true" />
              <span className={styles.listeningLabel} style={{ marginBottom: 0 }}>Transcribing…</span>
            </div>

            <div className={styles.transcriptBox}>
              <span>{transcriptText}</span>
              <span className={styles.cursor}>|</span>
            </div>

            <div className={styles.fieldHint}>
              <span className={styles.hintText}>New task from voice</span>
              <span className="msym" style={{ fontSize: 18, color: 'var(--text-secondary)' }}>expand_more</span>
            </div>

            <div className={styles.rowBtns}>
              <button className={`${styles.rowBtn} ${styles.rowCancel}`} onClick={onCancel}>Cancel</button>
              <button className={`${styles.rowBtn} ${styles.rowSave}`} onClick={() => onSave(transcriptText)}>Save</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
