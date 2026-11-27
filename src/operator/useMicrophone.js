import { useEffect, useRef, useState } from 'react';

// Records from the chosen microphone and hands over audio in overlapping windows (16 kHz mono),
// skipping silence so the computer only works while someone is speaking.
const RATE = 16000;
const WINDOW_S = 6;   // seconds of audio per piece
const EVERY_S = 4;    // a new piece every 4 seconds, so each piece overlaps the last by 2 s and no reference is cut in half

export function useMicrophone({ enabled, deviceId, onAudio }) {
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const cb = useRef(onAudio);
  cb.current = onAudio;

  useEffect(() => {
    if (!enabled) { setLevel(0); return undefined; }
    let stream = null;
    let ctx = null;
    let proc = null;
    let stopped = false;
    const ring = new Float32Array(RATE * WINDOW_S);
    let filled = 0;
    let sinceSend = 0;
    let speechInWindow = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: deviceId ? { exact: deviceId } : undefined, channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true }
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        ctx = new AudioContext({ sampleRate: RATE });
        const src = ctx.createMediaStreamSource(stream);
        proc = ctx.createScriptProcessor(4096, 1, 1);
        proc.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          let sum = 0;
          for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
          const rms = Math.sqrt(sum / input.length);
          setLevel(Math.min(1, rms * 8));
          if (rms > 0.012) speechInWindow += input.length;
          // slide the window
          if (filled + input.length > ring.length) {
            const drop = filled + input.length - ring.length;
            ring.copyWithin(0, drop, filled);
            filled -= drop;
          }
          ring.set(input, filled);
          filled += input.length;
          sinceSend += input.length;
          if (sinceSend >= RATE * EVERY_S) {
            sinceSend = 0;
            if (speechInWindow > RATE * 0.6) cb.current(ring.slice(0, filled)); // at least ~0.6 s of speech
            speechInWindow = 0;
          }
        };
        src.connect(proc);
        proc.connect(ctx.destination);
        setError('');
      } catch (e) {
        setError(e.name === 'NotAllowedError' ? 'Microphone permission was refused.' : e.name === 'NotFoundError' ? 'No microphone found.' : e.message);
      }
    })();
    return () => {
      stopped = true;
      if (proc) proc.disconnect();
      if (ctx) ctx.close();
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [enabled, deviceId]);

  return { level, error };
}

export async function listMicrophones() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
  } catch (_) { return []; }
}
