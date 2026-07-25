/**
 * Oasis FaceTime — Supabase DB Signaling + PeerJS WebRTC
 *
 * HOW IT WORKS (bulletproof):
 *  1. User selects role (Husband / Wife) → stored in localStorage.
 *  2. On "Enter FaceTime":
 *      a. Camera/mic captured.
 *      b. PeerJS connects to its cloud broker server → receives a random peer_id.
 *      c. We UPSERT { username, peer_id, last_seen } into Supabase `online_status` table.
 *      d. We subscribe to Supabase Realtime changes on `online_status`.
 *  3. When the PARTNER'S row appears / updates in the DB:
 *      → Husband (initiator) calls partner's real peer_id via PeerJS.
 *      → Wife (answerer) auto-answers any incoming PeerJS call.
 *  4. PeerJS negotiates WebRTC directly (STUN+TURN for NAT traversal).
 *  5. On disconnect / end-call → row is deleted from `online_status`.
 *
 * Supabase setup required (run in SQL editor):
 *   CREATE TABLE IF NOT EXISTS online_status (
 *     username TEXT PRIMARY KEY,
 *     peer_id  TEXT,
 *     last_seen TIMESTAMPTZ DEFAULT NOW()
 *   );
 *   ALTER TABLE online_status ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "public_access" ON online_status FOR ALL USING (true) WITH CHECK (true);
 *   -- Only add to realtime publication if not already done:
 *   -- ALTER PUBLICATION supabase_realtime ADD TABLE online_status;
 */

/* ── Supabase ─────────────────────────────────────── */
const SUPABASE_URL  = 'https://ufiwakxqrepwnngspjxv.supabase.co';
const SUPABASE_ANON = 'sb_publishable_Ft_wdmxDIjL9ngoihVFKPA_EnYoD3r8';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ── Roles ────────────────────────────────────────── */
const HUSBAND = 'husband';
const WIFE    = 'wife';

/* ── ICE config (STUN + free TURN relay) ─────────── */
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302'  },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    /* Free TURN via Metered OpenRelay — handles all NAT/firewall scenarios */
    { urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject', credential: 'openrelayproject' },
];

/* ── App State ────────────────────────────────────── */
let myRole       = null;
let partnerRole  = null;
let peer         = null;       // PeerJS instance
let myPeerId     = null;       // PeerJS-assigned peer id
let activeCall   = null;       // current MediaConnection
let localStream  = null;
let realtimeSub  = null;       // Supabase realtime subscription
let timerInterval = null;
let timerStart   = null;

let isMuted    = false;
let isCamOff   = false;
let isIsolation = false;

/* ── DOM ──────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const setupScreen   = $('screen-setup');
const callScreen    = $('screen-call');
const rolePicker    = $('role-picker');
const joinPanel     = $('join-panel');
const roleLabel     = $('role-label');
const btnHusband    = $('btn-husband');
const btnWife       = $('btn-wife');
const btnJoin       = $('btn-join');
const btnSwitch     = $('btn-switch');
const remoteVideo   = $('remote-video');
const localVideo    = $('local-video');
const pipWrap       = $('pip-wrap');
const statusText    = $('call-status-text');
const callTimer     = $('call-timer');
const btnIsolation  = $('btn-isolation');
const btnMic        = $('btn-mic');
const btnCam        = $('btn-cam');
const btnEnd        = $('btn-end');
const toastEl       = $('toast');

/* ══════════════════════════════════════════════════
   1. ROLE SETUP
══════════════════════════════════════════════════ */
(function loadSavedRole() {
    const saved = localStorage.getItem('oasis_role_v2');
    if (saved) applyRole(saved, false);
})();

function applyRole(role, save = true) {
    myRole      = role;
    partnerRole = (role === HUSBAND) ? WIFE : HUSBAND;
    if (save) localStorage.setItem('oasis_role_v2', role);
    roleLabel.textContent = role === HUSBAND ? 'Husband 💙' : 'Wife 🌹';
    rolePicker.classList.add('hidden');
    joinPanel.classList.remove('hidden');
}

btnHusband.addEventListener('click', () => applyRole(HUSBAND));
btnWife.addEventListener('click',    () => applyRole(WIFE));
btnSwitch.addEventListener('click',  () => {
    localStorage.removeItem('oasis_role_v2');
    myRole = null;
    joinPanel.classList.add('hidden');
    rolePicker.classList.remove('hidden');
});

/* ══════════════════════════════════════════════════
   2. ENTER ROOM
══════════════════════════════════════════════════ */
btnJoin.addEventListener('click', async () => {
    if (!myRole) { toast('Select a role first'); return; }
    btnJoin.disabled = true;
    btnJoin.textContent = 'Starting…';

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true,
        });
        localVideo.srcObject = localStream;

        // Switch screens
        setupScreen.classList.remove('active');
        setupScreen.classList.add('hidden');
        callScreen.classList.remove('hidden');
        callScreen.classList.add('active');

        setStatus('Connecting…');
        initPeer();

    } catch (err) {
        console.error(err);
        toast('Camera / Microphone permission required');
        btnJoin.disabled = false;
        btnJoin.textContent = 'Enter FaceTime';
    }
});

/* ══════════════════════════════════════════════════
   3. PEERJS INIT
══════════════════════════════════════════════════ */
function initPeer() {
    // Let PeerJS auto-generate a unique peer id (avoids "id already taken" errors)
    peer = new Peer(undefined, {
        debug: 0,
        config: { iceServers: ICE_SERVERS }
    });

    peer.on('open', async (id) => {
        myPeerId = id;
        console.log('PeerJS open, my peer id:', id);

        // Write our peer_id to Supabase
        await publishPresence();

        // Listen for the partner's peer_id via Supabase Realtime
        listenForPartner();

        setStatus('Waiting for partner…');
    });

    // Auto-answer all incoming calls (Wife receives Husband's call)
    peer.on('call', (incomingCall) => {
        console.log('Incoming call from peer:', incomingCall.peer);
        if (activeCall) {
            console.warn('Ignoring duplicate call');
            return;
        }
        activeCall = incomingCall;
        incomingCall.answer(localStream);
        wireCallEvents(incomingCall);
    });

    peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        toast(`Connection error: ${err.type}`);
    });
}

/* ══════════════════════════════════════════════════
   4. SUPABASE SIGNALING
══════════════════════════════════════════════════ */
async function publishPresence() {
    const { error } = await db.from('online_status').upsert({
        username:  myRole,
        peer_id:   myPeerId,
        last_seen: new Date().toISOString(),
    }, { onConflict: 'username' });

    if (error) console.error('Supabase upsert error:', error);
    else       console.log('Published presence to Supabase:', myRole, myPeerId);
}

async function removePresence() {
    await db.from('online_status').delete().eq('username', myRole);
}

function listenForPartner() {
    // First, check if partner is already online
    checkPartnerOnline();

    // Then subscribe to realtime changes on online_status table
    realtimeSub = db
        .channel('oasis-signaling')
        .on('postgres_changes', {
            event:  '*',
            schema: 'public',
            table:  'online_status',
            filter: `username=eq.${partnerRole}`,
        }, (payload) => {
            console.log('Realtime event:', payload.eventType, payload.new);

            if (payload.eventType === 'DELETE') {
                // Partner went offline
                handlePartnerOffline();
                return;
            }

            const partnerPeerId = payload.new?.peer_id;
            if (partnerPeerId) {
                handlePartnerOnline(partnerPeerId);
            }
        })
        .subscribe((status) => {
            console.log('Realtime subscription status:', status);
        });
}

async function checkPartnerOnline() {
    const { data, error } = await db
        .from('online_status')
        .select('peer_id')
        .eq('username', partnerRole)
        .maybeSingle();

    if (error) { console.error(error); return; }
    if (data?.peer_id) {
        console.log('Partner already online:', data.peer_id);
        handlePartnerOnline(data.peer_id);
    }
}

function handlePartnerOnline(partnerPeerId) {
    if (activeCall) return; // already connected

    setStatus('Partner online! Connecting…');

    // Only HUSBAND initiates the call (prevents dual-call glare)
    if (myRole === HUSBAND) {
        console.log('Calling partner peer id:', partnerPeerId);
        setTimeout(() => {
            if (activeCall) return; // double-check before calling
            const outCall = peer.call(partnerPeerId, localStream);
            if (!outCall) return;
            activeCall = outCall;
            wireCallEvents(outCall);
        }, 800); // small delay to let Wife's PeerJS listener settle
    }
}

function handlePartnerOffline() {
    console.log('Partner went offline');
    if (activeCall) {
        activeCall.close();
        activeCall = null;
    }
    remoteVideo.srcObject = null;
    stopTimer();
    callTimer.classList.add('hidden');
    setStatus('Partner disconnected. Waiting…');
}

/* ══════════════════════════════════════════════════
   5. CALL EVENTS & STREAM HANDLER
══════════════════════════════════════════════════ */
function wireCallEvents(call) {
    call.on('stream', (stream) => {
        console.log('Remote stream received! Tracks:', stream.getTracks().map(t => t.kind));
        remoteVideo.srcObject = stream;
        remoteVideo.play().catch(() => {
            // Autoplay blocked: unmuted fallback (user can unmute manually)
            remoteVideo.muted = true;
            remoteVideo.play().catch(console.error);
        });
        setStatus('');
        callTimer.classList.remove('hidden');
        startTimer();
    });

    call.on('close', () => {
        console.log('Call closed');
        activeCall = null;
        remoteVideo.srcObject = null;
        stopTimer();
        callTimer.classList.add('hidden');
        setStatus('Waiting for partner…');
    });

    call.on('error', (err) => {
        console.error('Call error:', err);
        activeCall = null;
        setStatus('Connection error. Waiting…');
    });

    // Monitor WebRTC ICE state for diagnostics
    if (call.peerConnection) {
        call.peerConnection.oniceconnectionstatechange = () => {
            const s = call.peerConnection.iceConnectionState;
            console.log('ICE state:', s);
            if (s === 'failed') {
                toast('Media relay failed. Check network.');
            }
        };
    }
}

/* ══════════════════════════════════════════════════
   6. CONTROLS
══════════════════════════════════════════════════ */
btnEnd.addEventListener('click', hangUp);

function hangUp() {
    if (activeCall) { activeCall.close(); activeCall = null; }
    cleanup();

    callScreen.classList.remove('active');
    callScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    setupScreen.classList.add('active');

    btnJoin.disabled = false;
    btnJoin.textContent = 'Enter FaceTime';
}

async function cleanup() {
    stopTimer();
    if (realtimeSub) { await db.removeChannel(realtimeSub); realtimeSub = null; }
    await removePresence();
    if (peer) { peer.destroy(); peer = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    remoteVideo.srcObject = null;
    localVideo.srcObject  = null;
    isMuted = false; isCamOff = false; isIsolation = false;
    updateButtons();
}

btnMic.addEventListener('click', () => {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    updateButtons();
});

btnCam.addEventListener('click', () => {
    if (!localStream) return;
    isCamOff = !isCamOff;
    localStream.getVideoTracks().forEach(t => t.enabled = !isCamOff);
    updateButtons();
});

btnIsolation.addEventListener('click', async () => {
    if (!localStream) return;
    isIsolation = !isIsolation;
    const at = localStream.getAudioTracks()[0];
    if (at) {
        try {
            await at.applyConstraints({ noiseSuppression: isIsolation, echoCancellation: true });
            toast(isIsolation ? 'Voice Isolation ON' : 'Voice Isolation OFF');
        } catch { toast('Voice Isolation not supported'); isIsolation = !isIsolation; }
    }
    updateButtons();
});

function updateButtons() {
    btnMic.classList.toggle('active', isMuted);
    btnCam.classList.toggle('active', isCamOff);
    btnIsolation.classList.toggle('active', isIsolation);
}

/* ══════════════════════════════════════════════════
   7. TIMER
══════════════════════════════════════════════════ */
function startTimer() {
    stopTimer();
    timerStart = Date.now();
    timerInterval = setInterval(() => {
        const s = Math.floor((Date.now() - timerStart) / 1000);
        callTimer.textContent =
            String(Math.floor(s / 60)).padStart(2,'0') + ':' +
            String(s % 60).padStart(2,'0');
    }, 1000);
}
function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    callTimer.textContent = '00:00';
}

/* ══════════════════════════════════════════════════
   8. PiP DRAG
══════════════════════════════════════════════════ */
let dragging = false, px0, py0, mx0, my0;

pipWrap.addEventListener('mousedown',  dragStart);
pipWrap.addEventListener('touchstart', dragStart, { passive: false });
window.addEventListener('mousemove',  dragMove);
window.addEventListener('touchmove',  dragMove,  { passive: false });
window.addEventListener('mouseup',    dragEnd);
window.addEventListener('touchend',   dragEnd);

function cx(e) { return e.touches ? e.touches[0].clientX : e.clientX; }
function cy(e) { return e.touches ? e.touches[0].clientY : e.clientY; }

function dragStart(e) {
    dragging = true;
    mx0 = cx(e); my0 = cy(e);
    const r = pipWrap.getBoundingClientRect();
    px0 = r.left; py0 = r.top;
    if (e.cancelable) e.preventDefault();
}
function dragMove(e) {
    if (!dragging) return;
    if (e.cancelable) e.preventDefault();
    pipWrap.style.right  = 'auto';
    pipWrap.style.bottom = 'auto';
    pipWrap.style.left   = `${px0 + cx(e) - mx0}px`;
    pipWrap.style.top    = `${py0 + cy(e) - my0}px`;
}
function dragEnd() {
    if (!dragging) return;
    dragging = false;
    const r = pipWrap.getBoundingClientRect();
    const m = 18;
    const nl = r.left < window.innerWidth / 2 ? m : window.innerWidth - r.width - m;
    let   nt = r.top;
    if (r.top    < m + 60) nt = m + 60;
    if (r.bottom > window.innerHeight - m - 90) nt = window.innerHeight - r.height - m - 90;
    pipWrap.style.transition = 'left .28s, top .28s';
    pipWrap.style.left = `${nl}px`;
    pipWrap.style.top  = `${nt}px`;
    setTimeout(() => { pipWrap.style.transition = ''; }, 300);
}

/* ══════════════════════════════════════════════════
   9. HELPERS
══════════════════════════════════════════════════ */
function setStatus(msg) { statusText.textContent = msg; }

let toastTimer;
function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 3200);
}

/* Cleanup on page close/refresh */
window.addEventListener('beforeunload', () => {
    removePresence();
    if (peer) peer.destroy();
});
