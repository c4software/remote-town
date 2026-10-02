// Audio local : micro, mesure du niveau, bips du talkie-walkie, effet « haut-parleur » du pupitre.
import { toast } from './dom.js';
import { S } from './state.js';
import { PROX_RADIUS } from './world.js';

export async function initMic() {
  if (S.micTrack) return true;
  try {
    S.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    S.micTrack = S.micStream.getAudioTracks()[0];
    S.localAnalyser = makeAnalyser(S.micStream);
    return true;
  } catch (err) {
    console.warn('Micro indisponible', err);
    toast('Micro indisponible : vous pourrez écouter mais pas parler.');
    return false;
  }
}

export function makeAnalyser(stream) {
  if (!S.audioCtx) return null;
  try {
    const src = S.audioCtx.createMediaStreamSource(stream);
    const an = S.audioCtx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    return { an, buf: new Uint8Array(an.fftSize), level: 0 };
  } catch { return null; }
}
export function sampleLevel(a) {
  if (!a) return 0;
  a.an.getByteTimeDomainData(a.buf);
  let sum = 0;
  for (const v of a.buf) { const d = (v - 128) / 128; sum += d * d; }
  a.level = Math.sqrt(sum / a.buf.length);
  return a.level;
}

// ============================================================
// Talkie-walkie : bips d'ouverture / fin de N et dessin de l'appareil
// ============================================================
// N d'un autre participant qui nous parvient (indépendamment du micro de pièce ou du côte à côte)
export const pttReaches = (u) => !!S.me && !!u.ptt && u.zone === S.me.zone && Math.hypot(u.x - S.me.x, u.y - S.me.y) <= PROX_RADIUS;

export function walkieBeep(kind, volume) {
  if (!S.audioCtx) return;
  S.audioCtx.resume?.();
  const t0 = S.audioCtx.currentTime + 0.01;
  const out = S.audioCtx.createGain();
  out.gain.value = volume;
  out.connect(S.audioCtx.destination);
  // Deux tons courts : montant à l'ouverture, descendant à la fin
  const notes = kind === 'start' ? [[1300, 0, 0.06], [1850, 0.075, 0.08]] : [[1850, 0, 0.05], [1150, 0.065, 0.09]];
  for (const [freq, at, dur] of notes) {
    const osc = S.audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const env = S.audioCtx.createGain();
    env.gain.setValueAtTime(0, t0 + at);
    env.gain.linearRampToValueAtTime(0.3, t0 + at + 0.005);
    env.gain.setValueAtTime(0.3, t0 + at + dur - 0.01);
    env.gain.linearRampToValueAtTime(0, t0 + at + dur);
    osc.connect(env).connect(out);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.02);
  }
  if (kind === 'end') {
    // Petit souffle radio (squelch) après le bip de fin
    const len = Math.floor(S.audioCtx.sampleRate * 0.14);
    const buf = S.audioCtx.createBuffer(1, len, S.audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = S.audioCtx.createBufferSource();
    noise.buffer = buf;
    const band = S.audioCtx.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = 2200; band.Q.value = 0.8;
    const ng = S.audioCtx.createGain();
    ng.gain.value = 0.18;
    noise.connect(band).connect(ng).connect(out);
    noise.start(t0 + 0.17);
  }
}

// Carillon : notes successives, sinusoïdes et deux harmoniques. Rendu une fois
// en WAV puis joué par un élément <audio>, comme les voix : il sort ainsi par le
// même chemin qu'elles, quel que soit l'état du contexte Web Audio (suspendu,
// resté sur une ancienne sortie…), et ne touche pas au son des voix.
const NOTE_GAP = 0.32, NOTE_LEN = 1.35;
const chimes = new Map();
function scheduleChime(ac, notes, volume, t0) {
  notes.forEach((freq, i) => {
    const at = t0 + i * NOTE_GAP;
    for (const [mult, amp] of [[1, 1], [2, 0.25], [3, 0.08]]) {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      const env = ac.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(volume * amp, at + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_LEN - 0.05);
      osc.connect(env).connect(ac.destination);
      osc.start(at);
      osc.stop(at + NOTE_LEN);
    }
  });
}
// AudioBuffer mono → fichier WAV 16 bits
function toWav(buf) {
  const pcm = buf.getChannelData(0), view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const text = (at, str) => [...str].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, buf.sampleRate, true); view.setUint32(28, buf.sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((v, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  return new Blob([view], { type: 'audio/wav' });
}
// Son rendu une seule fois (au premier usage : quelques millisecondes) → URL d'un WAV
function rendered(key, seconds, build) {
  if (!chimes.has(key)) {
    const rate = 44100, off = new OfflineAudioContext(1, Math.ceil(rate * seconds), rate);
    build(off);
    chimes.set(key, off.startRendering().then((buf) => URL.createObjectURL(toWav(buf))));
  }
  return chimes.get(key);
}
const chimeUrl = (notes, volume) =>
  rendered(`${notes}|${volume}`, (notes.length - 1) * NOTE_GAP + NOTE_LEN, (off) => scheduleChime(off, notes, volume, 0));
export function chime(notes, volume) {
  chimeUrl(notes, volume)
    .then((url) => new Audio(url).play())
    .catch(() => { // repli : directement par Web Audio
      if (!S.audioCtx) return;
      S.audioCtx.resume?.();
      scheduleChime(S.audioCtx, notes, volume, S.audioCtx.currentTime + 0.02);
    });
}

// Musique de transition de la porte des espaces (~3,6 s, jouée seulement chez la
// personne qui passe la porte) : souffle qui monte, nappe d'accord, arpège
// ascendant façon harpe, souffle qui redescend et petite cloche à l'arrivée.
const PORTAL_SECONDS = 3.6;
function schedulePortalMusic(ac) {
  const out = ac.createGain();
  out.gain.value = 1.4; // pic ≈ 0,35 : audible sans couvrir les voix
  out.connect(ac.destination);
  const tone = (freq, at, len, amp, type = 'sine', attack = 0.01) => {
    const osc = ac.createOscillator();
    osc.type = type; osc.frequency.value = freq;
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(amp, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(env).connect(out);
    osc.start(at); osc.stop(at + len + 0.05);
  };
  // Souffle : bruit filtré dont la fréquence balaie vers le haut, puis vers le bas
  const whoosh = (at, len, from, to, amp) => {
    const n = Math.floor(ac.sampleRate * len), buf = ac.createBuffer(1, n, ac.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf;
    const band = ac.createBiquadFilter(); band.type = 'bandpass'; band.Q.value = 1.2;
    band.frequency.setValueAtTime(from, at); band.frequency.exponentialRampToValueAtTime(to, at + len);
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(amp, at + len * 0.6);
    env.gain.linearRampToValueAtTime(0, at + len);
    src.connect(band).connect(env).connect(out);
    src.start(at);
  };
  whoosh(0, 1.0, 250, 3200, 0.22);
  // Nappe : do majeur 7e (do, mi, sol, si), attaque lente
  for (const f of [261.63, 329.63, 392, 493.88]) {
    tone(f, 0.05, 3.2, 0.035, 'triangle', 0.5);
    tone(f * 1.003, 0.05, 3.2, 0.025, 'sine', 0.5); // léger désaccord : nappe plus ample
  }
  // Arpège ascendant, puis quelques notes qui retombent
  const arp = [523.25, 659.25, 783.99, 987.77, 1174.66, 1318.51, 1567.98, 2093];
  arp.forEach((f, i) => { tone(f, 0.15 + i * 0.1, 0.9, 0.09); tone(f * 2, 0.15 + i * 0.1, 0.4, 0.02); });
  [1567.98, 1318.51, 987.77].forEach((f, i) => tone(f, 1.25 + i * 0.13, 0.8, 0.06));
  whoosh(1.9, 0.9, 3000, 500, 0.14);
  // Arrivée : petite cloche (sol et do), avec ses harmoniques
  for (const [f, at] of [[783.99, 2.3], [1046.5, 2.42]]) {
    tone(f, at, 1.2, 0.12); tone(f * 2.01, at, 0.7, 0.04); tone(f * 3.02, at, 0.4, 0.015);
  }
}
export function portalMusic() {
  rendered('portal', PORTAL_SECONDS, schedulePortalMusic)
    .then((url) => new Audio(url).play())
    .catch(() => {}); // pas de musique plutôt qu'une erreur
}

// ============================================================
// Pupitre : effet « haut-parleur » sur la voix diffusée à tout le monde.
// Seulement pendant la diffusion : la voix passe alors par Web Audio (filtre
// de sonorisation, légère saturation, écho de salle) et l'élément <audio> est coupé.
// Si Web Audio n'est pas disponible, on garde le son normal.
// ============================================================
let roomImpulse = null;
function getRoomImpulse() {
  if (roomImpulse) return roomImpulse;
  const len = Math.floor(S.audioCtx.sampleRate * 0.7);
  roomImpulse = S.audioCtx.createBuffer(2, len, S.audioCtx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = roomImpulse.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return roomImpulse;
}

export function setSpeakerFx(L, on) {
  if (!L?.audioEl) return;
  const ready = S.audioCtx && S.audioCtx.state === 'running' && L.audioStream;
  if (on && ready && !L.fx) {
    try {
      const src = S.audioCtx.createMediaStreamSource(L.audioStream);
      const hp = S.audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350;
      const lp = S.audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
      const mid = S.audioCtx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1800; mid.gain.value = 6; mid.Q.value = 0.9;
      const shaper = S.audioCtx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
      shaper.curve = curve;
      const dry = S.audioCtx.createGain(); dry.gain.value = 0.7;
      const verb = S.audioCtx.createConvolver(); verb.buffer = getRoomImpulse();
      const wet = S.audioCtx.createGain(); wet.gain.value = 0.22;
      src.connect(hp).connect(lp).connect(mid).connect(shaper);
      shaper.connect(dry).connect(S.audioCtx.destination);
      shaper.connect(verb).connect(wet).connect(S.audioCtx.destination);
      L.fx = { src, out: [dry, wet] };
      L.audioEl.muted = true;
    } catch {
      L.fx = null;
      L.audioEl.muted = false;
    }
  } else if (!on && L.fx) {
    try { L.fx.src.disconnect(); L.fx.out.forEach((n) => n.disconnect()); } catch {}
    L.fx = null;
    L.audioEl.muted = false;
  }
}
