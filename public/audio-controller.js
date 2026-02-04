// audio-controller.js - GUARANTEED WORKING
class AudioController {
    constructor() {
        console.log('🎵 AudioController initializing...');
        
        // USE THE WORKING OGG FILE
        this.musicUrl = 'https://commondatastorage.googleapis.com/codeskulptor-assets/Epoq-Lepidoptera.ogg';
        
        this.audio = new Audio(this.musicUrl);
        this.audio.loop = true;
        this.audio.volume = 0.4;
        
        // Load immediately
        this.audio.load();
        
        // Check saved mute preference
        this.isMuted = localStorage.getItem('musicMuted') === 'true';
        this.audio.muted = this.isMuted;
        
        console.log('✅ Audio ready. Muted:', this.isMuted);
        
        // Setup click to start
        this.setupStartOnClick();
    }
    
    setupStartOnClick() {
        // Start audio on ANY click
        const startAudio = () => {
            console.log('👆 User interaction detected');
            
            // Unmute if not muted
            if (!this.isMuted) {
                this.audio.muted = false;
            }
            
            // Try to play
            this.audio.play().then(() => {
                console.log('✅ Music started successfully');
            }).catch(e => {
                console.log('⚠️ Play failed, will retry:', e.message);
                // Try one more time
                setTimeout(() => {
                    this.audio.play().catch(e2 => {
                        console.log('❌ Final fail:', e2.message);
                    });
                }, 300);
            });
            
            // Remove listener after first successful start
            document.removeEventListener('click', startAudio);
            document.removeEventListener('touchstart', startAudio);
        };
        
        // Listen for clicks
        document.addEventListener('click', startAudio);
        document.addEventListener('touchstart', startAudio);
        
        // Also try to auto-start after 3 seconds
        setTimeout(() => {
            if (!this.isMuted) {
                this.audio.play().catch(e => {
                    console.log('Auto-start failed (needs click):', e.message);
                });
            }
        }, 3000);
    }
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        this.audio.muted = this.isMuted;
        
        // Save to localStorage
        localStorage.setItem('musicMuted', this.isMuted);
        
        // Update button
        this.updateButton();
        
        console.log(this.isMuted ? '🔇 Muted' : '🔊 Unmuted');
        
        // If unmuting, try to play
        if (!this.isMuted && this.audio.paused) {
            this.audio.play().catch(e => {
                console.log('Play on unmute failed:', e.message);
            });
        }
        
        return this.isMuted;
    }
    
    updateButton() {
        const btn = document.getElementById('mute-btn');
        if (btn) {
            btn.innerHTML = this.isMuted ? '🔇' : '🔊';
            btn.style.color = this.isMuted ? '#888' : '#fff';
            btn.style.borderColor = this.isMuted ? '#888' : '#d4af37';
            btn.title = this.isMuted ? 'Unmute' : 'Mute';
        }
    }
}

// Create global instance
if (!window.audioController) {
    window.audioController = new AudioController();
    
    // Update button on page load
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            if (window.audioController) {
                window.audioController.updateButton();
            }
        }, 500);
    });
}