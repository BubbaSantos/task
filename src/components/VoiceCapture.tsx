import { useEffect, useRef, useState } from 'react';
import type { VoiceCaptureState } from '../types';
import { formatElapsed } from '../utils/dates';
import styles from './VoiceCapture.module.css';

// Web Speech API types (not in lib.dom.d.ts by default)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
declare const SpeechRecognition: new () => SpeechRecognitionInstance;
declare const webkitSpeechRecognition: new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionInstance | null {
  const Ctor = (typeof SpeechRecognition !== 'undefined' && SpeechRecognition)
    || (typeof webkitSpeechRecognition !== 'undefined' && webkitSpeechRecognition);
  return Ctor ? new Ctor() : null;
}

interface Props {
  state: VoiceCaptureState;
  elapsedMs: number;
  transcriptText: string;
  onTranscriptUpdate: (text: string) => void;
  onStop: (finalText: string) => void;
  onCancel: () => void;
  onSave: (text: string) => void;
}

export function VoiceCapture({
  state, elapsedMs, transcriptText,
  onTranscriptUpdate, onStop, onCancel, onSave,
}: Props) {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTextRef = useRef('');
  const [waveHeights, setWaveHeights] = useState([8, 18, 26, 34, 28, 16, 10, 20]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    if (state !== 'listening') return;

    finalTextRef.current = '';
    onTranscriptUpdate('');

    const recognition = getSpeechRecognition();
    if (!recognition) {
      setUnsupported(true);
      return;
    }

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = '';
      let final = finalTextRef.current;
      for (let i = e.results.length - 1; i >= 0; i--) {
        if (e.results[i].isFinal) {
          final += e.results[i][0].transcript;
          finalTextRef.current = final;
          break;
        } else {
          interim = e.results[i][0].transcript;
        }
      }
      onTranscriptUpdate((final + ' ' + interim).trim());
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed') setUnsupported(true);
    };

    // Auto-restart if recognition ends while still listening (browser timeout)
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        try { recognition.start(); } catch { /* already stopped by user */ }
      }
    };

    recognitionRef.current = recognition;

    // Waveform visualiser via AudioContext
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      streamRef.current = stream;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      source.connect(analyser);
      analyserRef.current = analyser;

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
    }).catch(() => { /* no visualiser if mic permission denied separately */ });

    try { recognition.start(); } catch { /* already running */ }

    return () => {
      recognition.onend = null;
      recognitionRef.current = null;
      try { recognition.stop(); } catch { /* ignore */ }
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleStop() {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onend = null;
      recognitionRef.current = null;
      try { recognition.stop(); } catch { /* ignore */ }
    }
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    onStop(finalTextRef.current.trim() || transcriptText.trim());
  }

  if (state === 'idle') return null;

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={styles.sheet} role="dialog" aria-label="Voice capture">
        <div className={styles.handle} />

        {state === 'listening' && (
          <>
            <div className={styles.listeningLabel}>
              {unsupported ? 'Not supported in this browser' : 'Listening…'}
            </div>

            <div className={styles.micAvatar}>
              <div className={styles.pulseRing} />
              <div className={styles.micCircle}>
                <span className="msym" style={{ fontSize: 32, color: '#fff' }}>mic</span>
              </div>
            </div>

            {transcriptText ? (
              <div className={styles.liveTranscript}>{transcriptText}</div>
            ) : (
              <div className={styles.waveform}>
                {waveHeights.map((h, i) => (
                  <div key={i} className={styles.bar} style={{ height: h }} />
                ))}
              </div>
            )}

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
              <span className={styles.listeningLabel} style={{ marginBottom: 0 }}>Review</span>
            </div>

            <div className={styles.transcriptBox}>
              <span>{transcriptText}</span>
              {!transcriptText && (
                <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                  Nothing captured — try again?
                </span>
              )}
            </div>

            <div className={styles.fieldHint}>
              <span className={styles.hintText}>New task from voice</span>
              <span className="msym" style={{ fontSize: 18, color: 'var(--text-secondary)' }}>expand_more</span>
            </div>

            <div className={styles.rowBtns}>
              <button className={`${styles.rowBtn} ${styles.rowCancel}`} onClick={onCancel}>Cancel</button>
              <button
                className={`${styles.rowBtn} ${styles.rowSave}`}
                onClick={() => onSave(transcriptText)}
                disabled={!transcriptText.trim()}
              >
                Save
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
