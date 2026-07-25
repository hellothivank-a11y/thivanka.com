/**
 * Oasis FaceTime
 *
 * ARCHITECTURE (Simple & Reliable):
 * ────────────────────────────────────
 * 1. PeerJS connects → gets a RANDOM peer_id from the broker server.
 * 2. We track { role, peer_id } in Supabase Realtime PRESENCE.
 *    (No SQL tables, no RLS, no publications needed — presence is in-memory.)
 * 3. When partner's presence appears, we read their peer_id.
 * 4. Husband calls partner's peer_id. Wife auto-answers.
 * 5. TURN servers relay media if direct P2P is blocked by firewall/NAT.
 *
 * NO database tables required. Works with just the Supabase anon key.
 */

// ── Supabase ──────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://ufiwakxqrepwnngspjxv.supabase.co';
const SUPABASE_ANON = 'sb_publishable_Ft_wdmxDIjL9ngoihVFKPA_EnYoD3r8';
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Roles ────────────────────────────────────────────────────────
const HUSBAND = 'husband';
const WIFE    = 'wife';

// ── ICE Servers (STUN + TURN via OpenRelay) ──────────────────────
const ICE = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302'  },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject', credential: 'openrelayproject' },
    ]
};

// ── State ────────────────────────────────────────────────────────
const S = {
    role: null,        // 'husband' | 'wife'
    partner: null,     // opposite role string
    peerId: null,      // my PeerJS id (random, assigned by broker)
    peer: null,        // Peer instance
    call: null,        // active MediaConnection
    stream: null,      // local MediaStream
    presence: null,    // Supabase channel
    muted: false,
    camOff: false,
    isolation: false,
    timerInterval: null,
    timerStart: null,
};

// ── DOM helpers ──────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const setupScreen = $('screen-setup');
const callScreen  = $('screen-call');
const rolePicker  = $('role-picker');
const joinPanel   = $('join-panel');
const roleLabel   = $('role-label');
const remoteVid   = $('remote-video');
const localVid    = $('local-video');
const pipWrap     = $('pip-wrap');
const statusEl    = $('call-status');
const timerEl     = $('call-timer');
const toastEl     = $('toast');

// ── Boot ─────────────────────────────────────────────────────────
(function boot() {
    const saved = localStorage.getItem('oasis_role_v3');
    if (saved) applyRole(saved, false);
})();

// ── Role Selection ───────────────────────────────────────────────
function applyRole(role, save = true) {
    S.role    = role;
    S.partner = role === HUSBAND ? WIFE : HUSBAND;
    if (save) localStorage.setItem('oasis_role_v3', role);
    roleLabel.textContent = role === HUSBAND ? 'Husband 💙' : 'Wife 🌹';
    rolePicker.classList.add('hidden');
    joinPanel.classList.remove('hidden');
}

$('btn-husband').addEventListener('click', () => applyRole(HUSBAND));
$('btn-wife').addEventListener('click',    () => applyRole(WIFE));
$('btn-switch').addEventListener('click',  () => {
    localStorage.removeItem('oasis_role_v3');
    S.role = null;
    joinPanel.classList.add('hidden');
    rolePicker.classList.remove('hidden');
});

// ── Enter Room ───────────────────────────────────────────────────
$('btn-join').addEventListener('click', async () => {
    if (!S.role) { toast('Please select a role first.'); return; }

    const btn = $('btn-join');
    btn.disabled = true;
    btn.textContent = 'Starting…';

    try {
        // 1. Get camera + mic
        S.stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true,
        });
        localVid.srcObject = S.stream;

        // 2. Show call screen
        setupScreen.classList.remove('active');
        setupScreen.classList.add('hidden');
        callScreen.classList.remove('hidden');
        callScreen.classList.add('active');
        setStatus('Connecting to server…');

        // 3. Connect PeerJS (random id)
        S.peer = new Peer({ debug: 0, config: ICE });

        S.peer.on('open', async id => {
            S.peerId = id;
            console.log('[PeerJS] My peer id:', id);

            // 4. Start presence & publish my peer_id so partner can find me
            await startPresence();
            setStatus('Waiting for partner…');
        });

        // 5. Auto-answer ALL incoming calls (handles Wife side)
        S.peer.on('call', incoming => {
            if (S.call) { console.warn('[PeerJS] Ignoring duplicate incoming call'); return; }
            console.log('[PeerJS] Incoming call from', incoming.peer);
            S.call = incoming;
            incoming.answer(S.stream);
            bindCallEvents(incoming);
        });

        S.peer.on('error', err => {
            console.error('[PeerJS] Error:', err.type, err);
            toast('PeerJS error: ' + err.type);
        });

    } catch (err) {
        console.error('[Boot] Failed:', err);
        toast('Camera/mic permission required.');
        btn.disabled = false;
        btn.textContent = 'Enter FaceTime';
    }
});

// ── Supabase Presence ────────────────────────────────────────────
async function startPresence() {
    S.presence = supa.channel('oasis-room', {
        config: { presence: { key: S.role } }
    });

    S.presence
        .on('presence', { event: 'sync' }, () => {
            const state = S.presence.presenceState();
            console.log('[Presence] sync', JSON.stringify(state));
            handlePresenceSync(state);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.log('[Presence] join', key, newPresences);
        })
        .on('presence', { event: 'leave' }, ({ key }) => {
            console.log('[Presence] leave', key);
            if (key === S.partner) partnerLeft();
        })
        .subscribe(async status => {
            console.log('[Presence] subscribe status:', status);
            if (status === 'SUBSCRIBED') {
                // Track myself with my peer_id included
                const res = await S.presence.track({
                    role:    S.role,
                    peer_id: S.peerId,
                });
                console.log('[Presence] track result:', res);
            }
        });
}

function handlePresenceSync(state) {
    const partnerEntries = state[S.partner];
    if (!partnerEntries || partnerEntries.length === 0) {
        if (!S.call) setStatus('Waiting for partner…');
        return;
    }

    const partnerPeerId = partnerEntries[0]?.peer_id;
    console.log('[Presence] Partner peer_id detected:', partnerPeerId);

    if (!partnerPeerId) return;
    if (S.call)         return; // already in a call

    setStatus('Partner online! Connecting…');

    // Only Husband initiates (prevents both sides calling each other simultaneously)
    if (S.role === HUSBAND) {
        // Small delay so both peers are fully registered before calling
        setTimeout(() => {
            if (S.call) return;
            console.log('[PeerJS] Calling partner:', partnerPeerId);
            const out = S.peer.call(partnerPeerId, S.stream);
            if (!out) { console.error('[PeerJS] peer.call() returned null'); return; }
            S.call = out;
            bindCallEvents(out);
        }, 1500);
    }
}

function partnerLeft() {
    if (S.call) { S.call.close(); S.call = null; }
    remoteVid.srcObject = null;
    stopTimer();
    timerEl.classList.add('hidden');
    setStatus('Partner disconnected. Waiting…');
}

// ── Call Event Binding ───────────────────────────────────────────
function bindCallEvents(call) {
    call.on('stream', remoteStream => {
        console.log('[Call] Remote stream received. Tracks:', remoteStream.getTracks().map(t => `${t.kind}:${t.readyState}`).join(', '));
        remoteVid.srcObject = remoteStream;
        remoteVid.play().catch(() => {
            remoteVid.muted = true;
            remoteVid.play().catch(console.error);
        });
        setStatus('');
        timerEl.classList.remove('hidden');
        startTimer();
    });

    call.on('close', () => {
        console.log('[Call] Closed');
        S.call = null;
        remoteVid.srcObject = null;
        stopTimer();
        timerEl.classList.add('hidden');
        setStatus('Waiting for partner…');
    });

    call.on('error', err => {
        console.error('[Call] Error:', err);
        S.call = null;
        setStatus('Call error. Waiting…');
    });

    // Log ICE state for diagnostics
    const pc = call.peerConnection;
    if (pc) {
        pc.oniceconnectionstatechange = () => {
            console.log('[ICE] State:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'failed') {
                toast('Network relay failed. Check your connection.');
            }
        };
        pc.onconnectionstatechange = () => {
            console.log('[PC] Connection state:', pc.connectionState);
        };
    }
}

// ── End Call ─────────────────────────────────────────────────────
$('btn-end').addEventListener('click', hangUp);

async function hangUp() {
    if (S.call)     { S.call.close(); S.call = null; }
    if (S.presence) { await S.presence.untrack(); await supa.removeChannel(S.presence); S.presence = null; }
    if (S.peer)     { S.peer.destroy(); S.peer = null; }
    if (S.stream)   { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; }
    remoteVid.srcObject = null;
    localVid.srcObject  = null;
    stopTimer();
    timerEl.classList.add('hidden');

    callScreen.classList.remove('active');
    callScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    setupScreen.classList.add('active');

    $('btn-join').disabled = false;
    $('btn-join').textContent = 'Enter FaceTime';

    S.muted = false; S.camOff = false; S.isolation = false;
    updateBtns();
}

// ── Media Controls ────────────────────────────────────────────────
$('btn-mic').addEventListener('click', () => {
    if (!S.stream) return;
    S.muted = !S.muted;
    S.stream.getAudioTracks().forEach(t => (t.enabled = !S.muted));
    updateBtns();
});

$('btn-cam').addEventListener('click', () => {
    if (!S.stream) return;
    S.camOff = !S.camOff;
    S.stream.getVideoTracks().forEach(t => (t.enabled = !S.camOff));
    updateBtns();
});

$('btn-isolation').addEventListener('click', async () => {
    if (!S.stream) return;
    S.isolation = !S.isolation;
    const at = S.stream.getAudioTracks()[0];
    if (at) {
        try {
            await at.applyConstraints({ noiseSuppression: S.isolation, echoCancellation: true });
            toast(S.isolation ? 'Voice Isolation ON' : 'Voice Isolation OFF');
        } catch { toast('Voice Isolation not supported'); S.isolation = !S.isolation; }
    }
    updateBtns();
});

function updateBtns() {
    $('btn-mic').classList.toggle('active', S.muted);
    $('btn-cam').classList.toggle('active', S.camOff);
    $('btn-isolation').classList.toggle('active', S.isolation);
}

// ── Timer ─────────────────────────────────────────────────────────
function startTimer() {
    stopTimer();
    S.timerStart = Date.now();
    S.timerInterval = setInterval(() => {
        const s = Math.floor((Date.now() - S.timerStart) / 1000);
        timerEl.textContent = `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
    }, 1000);
}
function stopTimer() {
    clearInterval(S.timerInterval);
    S.timerInterval = null;
    timerEl.textContent = '00:00';
}

// ── PiP Drag ─────────────────────────────────────────────────────
let drag = false, px0, py0, mx0, my0;
const cx = e => e.touches ? e.touches[0].clientX : e.clientX;
const cy = e => e.touches ? e.touches[0].clientY : e.clientY;

pipWrap.addEventListener('mousedown',  e => { drag=true; const r=pipWrap.getBoundingClientRect(); px0=r.left; py0=r.top; mx0=cx(e); my0=cy(e); });
pipWrap.addEventListener('touchstart', e => { drag=true; const r=pipWrap.getBoundingClientRect(); px0=r.left; py0=r.top; mx0=cx(e); my0=cy(e); e.preventDefault(); }, {passive:false});
window.addEventListener('mousemove',  e => { if(!drag) return; pipWrap.style.cssText+=`;right:auto;bottom:auto;left:${px0+cx(e)-mx0}px;top:${py0+cy(e)-my0}px`; });
window.addEventListener('touchmove',  e => { if(!drag) return; e.preventDefault(); pipWrap.style.cssText+=`;right:auto;bottom:auto;left:${px0+cx(e)-mx0}px;top:${py0+cy(e)-my0}px`; }, {passive:false});
window.addEventListener('mouseup',    () => { if(!drag) return; drag=false; snapPip(); });
window.addEventListener('touchend',   () => { if(!drag) return; drag=false; snapPip(); });

function snapPip() {
    const r=pipWrap.getBoundingClientRect(), m=18;
    const nl = r.left < window.innerWidth/2 ? m : window.innerWidth - r.width - m;
    let nt = r.top;
    if (nt < m+60) nt = m+60;
    if (r.bottom > window.innerHeight-m-90) nt = window.innerHeight-r.height-m-90;
    pipWrap.style.transition='left .28s,top .28s';
    pipWrap.style.left=`${nl}px`; pipWrap.style.top=`${nt}px`;
    setTimeout(() => pipWrap.style.transition='', 300);
}

// ── Toast & Status ────────────────────────────────────────────────
function setStatus(msg) { statusEl.textContent = msg; }

let toastT;
function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.add('hidden'), 3500);
}

// ── Cleanup on page close ────────────────────────────────────────
window.addEventListener('beforeunload', () => {
    if (S.presence) S.presence.untrack();
    if (S.peer)     S.peer.destroy();
});
