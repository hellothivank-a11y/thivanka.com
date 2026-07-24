        selfView.style.right = 'auto';
    }
    function stopDrag() {
        if (!isDragging) return;
        isDragging = false;
        
        document.removeEventListener("mousemove", onDrag);
        document.removeEventListener("touchmove", onDrag);
        // Snap to nearest corner (top-left, top-right, bottom-left, bottom-right)
        const parentRect = videoCanvas.getBoundingClientRect();
        const rect = selfView.getBoundingClientRect();
        
        const currentLeft = rect.left - parentRect.left;
        const currentTop = rect.top - parentRect.top;
        
        const snapLeft = currentLeft < (parentRect.width - rect.width) / 2 ? 12 : (parentRect.width - rect.width - 12);
        const snapTop = currentTop < (parentRect.height - rect.height) / 2 ? 12 : (parentRect.height - rect.height - 12);
        
        selfView.style.transition = 'left 0.3s cubic-bezier(0.16, 1, 0.3, 1), top 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        selfView.style.left = `${snapLeft}px`;
        selfView.style.top = `${snapTop}px`;
        
        setTimeout(() => {
            selfView.style.transition = 'transform 0.2s ease, border-color 0.3s';
        }, 300);
    }
}
// --- PANIC MODE & LOCKING ---
function triggerPanic() {
    const panicScreen = document.getElementById('panicScreen');
    panicScreen.classList.add('show');
    
    // End active calling and streams
    endCall();
    
    // Clean memory
    sessionStorage.clear();
    
    // Clear list from DOM so nothing is visible on screen
    document.getElementById('messageList').innerHTML = '';
}
function restoreFromPanic() {
    const phrase = prompt("Enter Unlock Key:");
    if (!phrase) return;
    
    // Reset key and restore setup
    document.getElementById('secretKeyInput').value = phrase;
    document.getElementById('panicScreen').classList.remove('show');
    showSettingsSetup();
    updateSafetyFingerprint();
}
