// ===================================
// EDP 360 - Evidence Playback Script
// ===================================

// Global State
const state = {
    video: null,
    scene: null,
    camera: null,
    renderer: null,
    sphere: null,
    videoTexture: null,
    isPlaying: false,
    isDragging: false,
    previousMousePosition: { x: 0, y: 0 },
    currentView: 'stitched',
    pan: 0,    // Rotation in degrees
    tilt: 0,   // Vertical angle in degrees
    zoom: 75,  // Field of view in degrees
    animationFrameId: null,
    viewLocked: false,  // Lock camera movement for front/back views
    rawViewInitialized: false,  // Track if raw view has been initialized
    // Front lens calibration offset (adjust this to align with actual front direction)
    frontLensOffset: 91,  // Default: 91° in equirectangular = 0° front lens
    initialOrientation: { pan: 0, tilt: 0, zoom: 75 } // Store initial view for reset
};

// ===================================
// Initialization
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Get video element
    state.video = document.getElementById('video360');
    
    // Initialize Three.js scene
    initThreeJS();
    
    // Setup event listeners
    setupEventListeners();
    
    // Start render loop
    animate();
    
    console.log('EDP 360 Evidence Playback initialized');
}

// ===================================
// Three.js Setup
// ===================================

function initThreeJS() {
    const container = document.getElementById('threejsContainer');
    
    // Create scene
    state.scene = new THREE.Scene();
    
    // Create camera
    state.camera = new THREE.PerspectiveCamera(
        state.zoom,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    state.camera.position.set(0, 0, 0.1);
    
    // Create renderer
    state.renderer = new THREE.WebGLRenderer({ antialias: true });
    state.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(state.renderer.domElement);
    
    // Create video texture (will be populated when video loads)
    state.videoTexture = new THREE.VideoTexture(state.video);
    state.videoTexture.minFilter = THREE.LinearFilter;
    state.videoTexture.magFilter = THREE.LinearFilter;
    
    // Create sphere geometry for 360 video
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1); // Invert for inside viewing
    
    const material = new THREE.MeshBasicMaterial({
        map: state.videoTexture
    });
    
    state.sphere = new THREE.Mesh(geometry, material);
    state.scene.add(state.sphere);
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    const container = document.getElementById('threejsContainer');
    state.camera.aspect = container.clientWidth / container.clientHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    state.animationFrameId = requestAnimationFrame(animate);
    
    // Update video texture if video is playing
    if (state.video && state.video.readyState >= state.video.HAVE_CURRENT_DATA) {
        if (state.videoTexture) {
            state.videoTexture.needsUpdate = true;
        }
    }
    
    // Update camera rotation based on pan/tilt with front lens offset
    const radPan = THREE.MathUtils.degToRad(state.pan + state.frontLensOffset);
    const radTilt = THREE.MathUtils.degToRad(state.tilt);
    
    state.camera.rotation.order = 'YXZ';
    state.camera.rotation.y = radPan;
    state.camera.rotation.x = radTilt;
    
    // Update zoom (FOV)
    state.camera.fov = state.zoom;
    state.camera.updateProjectionMatrix();
    
    // Render scene
    if (state.renderer && state.scene && state.camera) {
        state.renderer.render(state.scene, state.camera);
    }
    
    // Update UI
    updateTimeDisplay();
    updateOrientationWidget();
}

// ===================================
// Event Listeners
// ===================================

function setupEventListeners() {
    // Video loading
    document.getElementById('loadVideoHeaderBtn').addEventListener('click', () => {
        document.getElementById('videoFileInput').click();
    });
    
    document.getElementById('videoFileInput').addEventListener('change', handleVideoUpload);
    
    // View control selector
    document.getElementById('viewControlSelect').addEventListener('change', handleViewChange);
    
    // Play/Pause
    document.getElementById('playPauseBtn').addEventListener('click', togglePlayPause);
    
    // Skip buttons
    document.getElementById('skipBackBtn').addEventListener('click', () => skipTime(-10));
    document.getElementById('skipForwardBtn').addEventListener('click', () => skipTime(10));
    
    // Volume
    document.getElementById('muteBtn').addEventListener('click', toggleMute);
    document.getElementById('volumeSlider').addEventListener('input', handleVolumeChange);
    
    // Speed
    document.getElementById('speedSelect').addEventListener('change', handleSpeedChange);
    
    // Fullscreen
    document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
    
    // Timeline
    const timeline = document.getElementById('timeline');
    timeline.addEventListener('click', handleTimelineClick);
    timeline.addEventListener('mousedown', startTimelineDrag);
    
    // PTZ Controls
    document.getElementById('resetViewBtn').addEventListener('click', resetView);
    document.getElementById('calibrateFrontBtn').addEventListener('click', () => {
        calibrateFrontLens();
        // Visual feedback
        const btn = document.getElementById('calibrateFrontBtn');
        btn.classList.add('active');
        setTimeout(() => btn.classList.remove('active'), 2000);
    });
    setupPTZInputs();
    
    // Mouse controls for 360 view
    const container = document.getElementById('threejsContainer');
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onMouseWheel);
    
    // Touch controls for mobile
    container.addEventListener('touchstart', onTouchStart);
    container.addEventListener('touchmove', onTouchMove);
    container.addEventListener('touchend', onTouchEnd);
    
    // Sidebar tabs
    setupSidebarTabs();
    
    // Modals
    setupModals();
    
    // Transcript entries (click to jump to time)
    setupTranscriptEntries();
    
    // Markers
    setupMarkers();
}

// ===================================
// Video Loading
// ===================================

function handleVideoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const url = URL.createObjectURL(file);
    state.video.src = url;
    
    state.video.addEventListener('loadedmetadata', () => {
        console.log('Video loaded:', state.video.duration);
        console.log('Video dimensions:', state.video.videoWidth, 'x', state.video.videoHeight);
        updateDurationDisplay();
        
        // Update texture after video loads
        if (state.videoTexture) {
            state.videoTexture.needsUpdate = true;
        }
        
        // Start playing automatically
        state.video.play().then(() => {
            console.log('Video playing successfully');
            state.isPlaying = true;
            updatePlayPauseButton();
        }).catch(err => {
            console.error('Error playing video:', err);
        });
    });
    
    state.video.addEventListener('canplay', () => {
        console.log('Video can play - texture ready');
        if (state.videoTexture) {
            state.videoTexture.needsUpdate = true;
        }
    });
}

// ===================================
// View Mode Switching
// ===================================

function handleViewChange(event) {
    const newView = event.target.value;
    state.currentView = newView;
    
    console.log('Switching to view:', newView);
    
    const threejsContainer = document.getElementById('threejsContainer');
    const unstitchedView = document.getElementById('unstitchedView');
    const rawView = document.getElementById('rawView');
    
    // Hide all views
    threejsContainer.style.display = 'none';
    unstitchedView.style.display = 'none';
    rawView.style.display = 'none';
    
    // Update cursor style based on view lock
    const container = document.getElementById('threejsContainer');
    
    switch (newView) {
        case 'stitched':
            threejsContainer.style.display = 'block';
            state.viewLocked = false;
            container.classList.remove('view-locked');
            console.log('Stitched view active - 360° navigation enabled');
            break;
        case 'front':
            threejsContainer.style.display = 'block';
            state.viewLocked = true;
            container.classList.add('view-locked');
            setFrontView();
            break;
        case 'back':
            threejsContainer.style.display = 'block';
            state.viewLocked = true;
            container.classList.add('view-locked');
            setBackView();
            break;
        case 'rawview':
            rawView.style.display = 'block';
            state.rawViewInitialized = false;  // Reset for fresh render
            updateRawView();
            console.log('Raw view active');
            break;
        case 'flatview':
            threejsContainer.style.display = 'block';
            state.viewLocked = true;
            container.classList.add('view-locked');
            setFrontView();
            console.log('Flat view active');
            break;
    }
    
    // Force renderer resize to ensure proper display
    if (state.renderer && threejsContainer.style.display === 'block') {
        const width = threejsContainer.clientWidth;
        const height = threejsContainer.clientHeight;
        console.log('Renderer size:', width, 'x', height);
        state.renderer.setSize(width, height);
        state.camera.aspect = width / height;
        state.camera.updateProjectionMatrix();
    }
    
    updatePTZDisplay();
}

// Set camera to front view (0°, wide FOV)
function setFrontView() {
    state.pan = 0;
    state.tilt = 0;
    state.zoom = 100; // Wide FOV to show more of the hemisphere
    
    console.log('Front view activated - locked at 0°');
    console.log('Camera state:', {
        pan: state.pan,
        tilt: state.tilt,
        zoom: state.zoom,
        frontLensOffset: state.frontLensOffset,
        videoSrc: state.video ? state.video.src : 'no video'
    });
}

// Set camera to back view (180°, wide FOV)
function setBackView() {
    state.pan = 180;
    state.tilt = 0;
    state.zoom = 100; // Wide FOV to show more of the hemisphere
    
    console.log('Back view activated - locked at 180°');
    console.log('Camera state:', {
        pan: state.pan,
        tilt: state.tilt,
        zoom: state.zoom,
        frontLensOffset: state.frontLensOffset
    });
}

function updateRawView() {
    const frontCanvas = document.getElementById('rawFrontCanvas');
    const backCanvas = document.getElementById('rawBackCanvas');
    
    if (!frontCanvas || !backCanvas) {
        console.error('Raw view canvases not found');
        return;
    }
    
    console.log('updateRawView called');
    console.log('Video state:', {
        hasSrc: !!state.video.src,
        readyState: state.video.readyState,
        videoWidth: state.video.videoWidth,
        videoHeight: state.video.videoHeight
    });
    
    // Set canvas sizes
    const resizeCanvas = (canvas) => {
        const parent = canvas.parentElement;
        const width = parent.clientWidth - 32;
        const height = parent.clientHeight - 50;
        canvas.width = width;
        canvas.height = height;
        console.log(`Canvas ${canvas.id} sized:`, width, 'x', height);
    };
    
    resizeCanvas(frontCanvas);
    resizeCanvas(backCanvas);
    
    // Start rendering immediately
    renderRawView();
}

// Render the raw fisheye views continuously
function renderRawView() {
    // Check if we should still be rendering
    if (state.currentView !== 'rawview') {
        console.log('Stopping raw view render loop');
        return;
    }
    
    const frontCanvas = document.getElementById('rawFrontCanvas');
    const backCanvas = document.getElementById('rawBackCanvas');
    
    if (!frontCanvas || !backCanvas) {
        console.error('Canvases not found in renderRawView');
        return;
    }
    
    const frontCtx = frontCanvas.getContext('2d');
    const backCtx = backCanvas.getContext('2d');
    
    // Clear canvases
    frontCtx.fillStyle = '#000';
    frontCtx.fillRect(0, 0, frontCanvas.width, frontCanvas.height);
    backCtx.fillStyle = '#000';
    backCtx.fillRect(0, 0, backCanvas.width, backCanvas.height);
    
    if (state.video && state.video.src && state.video.readyState >= state.video.HAVE_CURRENT_DATA) {
        const videoWidth = state.video.videoWidth;
        const videoHeight = state.video.videoHeight;
        
        if (!state.rawViewInitialized) {
            console.log('Starting raw view render with video:', videoWidth, 'x', videoHeight);
            state.rawViewInitialized = true;
        }
        
        // For equirectangular 360° video, split horizontally
        // Left half = Front lens (0° to 180°)
        // Right half = Back lens (180° to 360°)
        
        const halfWidth = videoWidth / 2;
        
        // Calculate scaling to fit canvas while maintaining aspect ratio
        const frontScale = Math.min(
            frontCanvas.width / halfWidth,
            frontCanvas.height / videoHeight
        );
        
        const backScale = Math.min(
            backCanvas.width / halfWidth,
            backCanvas.height / videoHeight
        );
        
        const frontDrawWidth = halfWidth * frontScale;
        const frontDrawHeight = videoHeight * frontScale;
        const frontX = (frontCanvas.width - frontDrawWidth) / 2;
        const frontY = (frontCanvas.height - frontDrawHeight) / 2;
        
        const backDrawWidth = halfWidth * backScale;
        const backDrawHeight = videoHeight * backScale;
        const backX = (backCanvas.width - backDrawWidth) / 2;
        const backY = (backCanvas.height - backDrawHeight) / 2;
        
        try {
            // Draw front lens (left half of equirectangular)
            frontCtx.drawImage(
                state.video,
                0, 0, halfWidth, videoHeight,  // Source: left half
                frontX, frontY, frontDrawWidth, frontDrawHeight  // Destination: scaled and centered
            );
            
            // Draw back lens (right half of equirectangular)
            backCtx.drawImage(
                state.video,
                halfWidth, 0, halfWidth, videoHeight,  // Source: right half
                backX, backY, backDrawWidth, backDrawHeight  // Destination: scaled and centered
            );
        } catch (err) {
            console.error('Error drawing to canvas:', err);
        }
    } else {
        // Show placeholder if video not ready
        drawPlaceholder(frontCtx, frontCanvas, 'Front Lens', state.video && state.video.src ? 'Video loading...' : 'Load a 360° video');
        drawPlaceholder(backCtx, backCanvas, 'Back Lens', state.video && state.video.src ? 'Video loading...' : 'Load a 360° video');
    }
    
    // Continue rendering if in raw view mode
    requestAnimationFrame(renderRawView);
}

// Helper function to draw placeholder text
function drawPlaceholder(ctx, canvas, title, subtitle) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 10);
    
    ctx.font = '12px sans-serif';
    ctx.fillText(subtitle, canvas.width / 2, canvas.height / 2 + 15);
}

// ===================================
// Playback Controls
// ===================================

function togglePlayPause() {
    if (!state.video.src) return;
    
    if (state.isPlaying) {
        state.video.pause();
        state.isPlaying = false;
    } else {
        state.video.play();
        state.isPlaying = true;
    }
    updatePlayPauseButton();
}

function updatePlayPauseButton() {
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    
    if (state.isPlaying) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
    } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
    }
}

function skipTime(seconds) {
    if (!state.video.src) return;
    state.video.currentTime = Math.max(0, Math.min(state.video.duration, state.video.currentTime + seconds));
}

function toggleMute() {
    if (!state.video.src) return;
    state.video.muted = !state.video.muted;
    document.getElementById('volumeSlider').value = state.video.muted ? 0 : state.video.volume * 100;
}

function handleVolumeChange(event) {
    if (!state.video.src) return;
    const volume = event.target.value / 100;
    state.video.volume = volume;
    state.video.muted = volume === 0;
}

function handleSpeedChange(event) {
    if (!state.video.src) return;
    state.video.playbackRate = parseFloat(event.target.value);
}

function toggleFullscreen() {
    const viewport = document.getElementById('videoViewport');
    
    if (!document.fullscreenElement) {
        viewport.requestFullscreen().catch(err => {
            console.error('Error attempting to enable fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// ===================================
// Timeline
// ===================================

function handleTimelineClick(event) {
    if (!state.video.src) return;
    
    const timeline = event.currentTarget;
    const rect = timeline.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = x / rect.width;
    
    state.video.currentTime = percentage * state.video.duration;
    updateTimelineProgress();
}

function startTimelineDrag(event) {
    if (!state.video.src) return;
    
    state.isDraggingTimeline = true;
    
    const onDrag = (e) => {
        if (!state.isDraggingTimeline) return;
        
        const timeline = document.getElementById('timeline');
        const rect = timeline.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const percentage = x / rect.width;
        
        state.video.currentTime = percentage * state.video.duration;
    };
    
    const stopDrag = () => {
        state.isDraggingTimeline = false;
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', stopDrag);
    };
    
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
}

function updateTimelineProgress() {
    if (!state.video.src || !state.video.duration) return;
    
    const percentage = (state.video.currentTime / state.video.duration) * 100;
    document.getElementById('timelineProgress').style.width = percentage + '%';
    document.getElementById('timelineScrubber').style.left = percentage + '%';
}

function updateTimeDisplay() {
    if (!state.video.src) return;
    
    const current = formatTime(state.video.currentTime);
    document.getElementById('currentTime').textContent = current;
    
    updateTimelineProgress();
}

function updateDurationDisplay() {
    if (!state.video.src) return;
    
    const duration = formatTime(state.video.duration);
    document.getElementById('duration').textContent = duration;
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00.000';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

// ===================================
// Pan/Tilt/Zoom Controls
// ===================================

function resetView() {
    // Reset based on current view mode
    if (state.currentView === 'front' || state.currentView === 'flatview') {
        setFrontView();
    } else if (state.currentView === 'back') {
        setBackView();
    } else {
        // Reset to initial orientation (front lens view) for stitched
        state.pan = state.initialOrientation.pan;
        state.tilt = state.initialOrientation.tilt;
        state.zoom = state.initialOrientation.zoom;
    }
    updatePTZDisplay();
}

// Function to calibrate front lens alignment
function calibrateFrontLens() {
    // Set current view as the "front" reference point
    state.frontLensOffset = -state.pan;
    state.initialOrientation.pan = 0;
    state.pan = 0;
    updatePTZDisplay();
    
    console.log(`Front lens calibrated. Offset: ${state.frontLensOffset}°`);
}

function setupPTZInputs() {
    const ptzItems = document.querySelectorAll('.ptz-item');
    
    ptzItems.forEach(item => {
        const type = item.dataset.ptz;
        const valueSpan = item.querySelector('.ptz-value');
        const input = item.querySelector('.ptz-input');
        
        // Click to toggle input
        item.addEventListener('click', (e) => {
            if (e.target === input) return;
            
            const isInputVisible = input.style.display !== 'none';
            
            if (isInputVisible) {
                valueSpan.style.display = 'inline';
                input.style.display = 'none';
            } else {
                valueSpan.style.display = 'none';
                input.style.display = 'inline';
                input.focus();
                input.select();
            }
        });
        
        // Handle input changes
        input.addEventListener('change', () => {
            const value = parseFloat(input.value);
            
            switch (type) {
                case 'pan':
                    state.pan = Math.max(-180, Math.min(180, value));
                    break;
                case 'tilt':
                    state.tilt = Math.max(-90, Math.min(90, value));
                    break;
                case 'zoom':
                    state.zoom = Math.max(20, Math.min(120, value));
                    break;
            }
            
            updatePTZDisplay();
            valueSpan.style.display = 'inline';
            input.style.display = 'none';
        });
        
        // Hide input on blur
        input.addEventListener('blur', () => {
            setTimeout(() => {
                valueSpan.style.display = 'inline';
                input.style.display = 'none';
            }, 200);
        });
    });
}

function updatePTZDisplay() {
    document.getElementById('panValue').textContent = Math.round(state.pan) + '°';
    document.getElementById('panInput').value = Math.round(state.pan);
    
    document.getElementById('tiltValue').textContent = Math.round(state.tilt) + '°';
    document.getElementById('tiltInput').value = Math.round(state.tilt);
    
    document.getElementById('zoomValue').textContent = Math.round(state.zoom) + '°';
    document.getElementById('zoomInput').value = Math.round(state.zoom);
}

function updateOrientationWidget() {
    // Update compass degrees display
    const normalizedPan = ((state.pan % 360) + 360) % 360;
    document.getElementById('compassDegrees').textContent = Math.round(normalizedPan) + '°';
    
    // Rotate the direction arrow
    // Invert the rotation so arrow points in the correct direction
    // Add 180° offset to change the visual starting position
    const arrow = document.getElementById('directionArrow');
    if (arrow) {
        // Negative rotation to invert direction, plus 180° offset for visual
        const rotation = -normalizedPan + 180;
        arrow.setAttribute('transform', `rotate(${rotation} 50 50)`);
    }
}

// ===================================
// Mouse/Touch Interaction
// ===================================

function onMouseDown(event) {
    if (state.viewLocked) return; // Disable dragging in locked views
    
    state.isDragging = true;
    state.previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };
    document.getElementById('threejsContainer').classList.add('dragging');
}

function onMouseMove(event) {
    if (!state.isDragging) return;
    
    const deltaX = event.clientX - state.previousMousePosition.x;
    const deltaY = event.clientY - state.previousMousePosition.y;
    
    state.pan -= deltaX * 0.3;
    state.tilt += deltaY * 0.3;
    
    // Clamp tilt
    state.tilt = Math.max(-90, Math.min(90, state.tilt));
    
    state.previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };
    
    updatePTZDisplay();
}

function onMouseUp() {
    state.isDragging = false;
    document.getElementById('threejsContainer').classList.remove('dragging');
}

function onMouseWheel(event) {
    event.preventDefault();
    
    // Allow zoom even in locked views
    const delta = event.deltaY * -0.05;
    state.zoom = Math.max(20, Math.min(120, state.zoom - delta));
    
    updatePTZDisplay();
}

// Touch events
let touchStartDistance = 0;

function onTouchStart(event) {
    if (event.touches.length === 1) {
        state.isDragging = true;
        state.previousMousePosition = {
            x: event.touches[0].clientX,
            y: event.touches[0].clientY
        };
    } else if (event.touches.length === 2) {
        // Pinch to zoom
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        touchStartDistance = Math.sqrt(dx * dx + dy * dy);
    }
}

function onTouchMove(event) {
    event.preventDefault();
    
    if (event.touches.length === 1 && state.isDragging) {
        const deltaX = event.touches[0].clientX - state.previousMousePosition.x;
        const deltaY = event.touches[0].clientY - state.previousMousePosition.y;
        
        state.pan -= deltaX * 0.3;
        state.tilt += deltaY * 0.3;
        state.tilt = Math.max(-90, Math.min(90, state.tilt));
        
        state.previousMousePosition = {
            x: event.touches[0].clientX,
            y: event.touches[0].clientY
        };
        
        updatePTZDisplay();
    } else if (event.touches.length === 2) {
        // Pinch to zoom
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        const delta = (touchStartDistance - distance) * 0.1;
        state.zoom = Math.max(20, Math.min(120, state.zoom + delta));
        
        touchStartDistance = distance;
        updatePTZDisplay();
    }
}

function onTouchEnd() {
    state.isDragging = false;
}

// ===================================
// Sidebar
// ===================================

function setupSidebarTabs() {
    const tabs = document.querySelectorAll('.sidebar-tab');
    const contents = document.querySelectorAll('.sidebar-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            // Update active states
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            contents.forEach(content => {
                if (content.dataset.content === targetTab) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
        });
    });
}

// ===================================
// Transcript
// ===================================

function setupTranscriptEntries() {
    const entries = document.querySelectorAll('.transcript-entry');
    
    entries.forEach(entry => {
        entry.addEventListener('click', () => {
            const time = parseFloat(entry.dataset.time);
            if (state.video.src && !isNaN(time)) {
                state.video.currentTime = time;
            }
        });
    });
}

// ===================================
// Markers
// ===================================

function setupMarkers() {
    // Timeline markers
    const timelineMarkers = document.querySelectorAll('.timeline-markers .marker');
    timelineMarkers.forEach(marker => {
        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            const time = parseFloat(marker.dataset.time);
            if (state.video.src && !isNaN(time)) {
                state.video.currentTime = time;
            }
        });
    });
    
    // Sidebar marker actions
    const markerActionBtns = document.querySelectorAll('.marker-action-btn');
    markerActionBtns.forEach(btn => {
        if (btn.textContent === 'Jump to') {
            btn.addEventListener('click', () => {
                const markerItem = btn.closest('.marker-item');
                const timeText = markerItem.querySelector('.marker-time').textContent;
                const time = parseTimeString(timeText);
                if (state.video.src && !isNaN(time)) {
                    state.video.currentTime = time;
                }
            });
        }
    });
    
    // Add marker button
    document.getElementById('addMarkerSidebarBtn').addEventListener('click', () => {
        document.getElementById('addMarkerModal').classList.add('show');
        // Set current time
        if (state.video.src) {
            document.getElementById('markerTime').value = formatTime(state.video.currentTime);
        }
    });
}

function parseTimeString(timeStr) {
    // Parse "0:15.500" format
    const parts = timeStr.split(':');
    if (parts.length !== 2) return 0;
    
    const minutes = parseInt(parts[0]);
    const secondsParts = parts[1].split('.');
    const seconds = parseInt(secondsParts[0]);
    const milliseconds = secondsParts.length > 1 ? parseInt(secondsParts[1]) : 0;
    
    return minutes * 60 + seconds + milliseconds / 1000;
}

// ===================================
// Modals
// ===================================

function setupModals() {
    // Share modal
    document.getElementById('shareBtn').addEventListener('click', () => {
        document.getElementById('shareModal').classList.add('show');
    });
    
    document.getElementById('closeShareModal').addEventListener('click', () => {
        document.getElementById('shareModal').classList.remove('show');
    });
    
    document.getElementById('cancelShare').addEventListener('click', () => {
        document.getElementById('shareModal').classList.remove('show');
    });
    
    // Export modal
    document.getElementById('exportBtn').addEventListener('click', () => {
        document.getElementById('exportModal').classList.add('show');
    });
    
    document.getElementById('closeExportModal').addEventListener('click', () => {
        document.getElementById('exportModal').classList.remove('show');
    });
    
    document.getElementById('cancelExport').addEventListener('click', () => {
        document.getElementById('exportModal').classList.remove('show');
    });
    
    // Add marker modal
    document.getElementById('closeMarkerModal').addEventListener('click', () => {
        document.getElementById('addMarkerModal').classList.remove('show');
    });
    
    document.getElementById('cancelMarker').addEventListener('click', () => {
        document.getElementById('addMarkerModal').classList.remove('show');
    });
    
    // Create recipe modal
    document.getElementById('createRecipeBtn').addEventListener('click', () => {
        document.getElementById('createRecipeModal').classList.add('show');
    });
    
    document.getElementById('closeRecipeModal').addEventListener('click', () => {
        document.getElementById('createRecipeModal').classList.remove('show');
    });
    
    document.getElementById('cancelRecipe').addEventListener('click', () => {
        document.getElementById('createRecipeModal').classList.remove('show');
    });
    
    // Close modals on outside click
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    });
}

// ===================================
// Utility Functions
// ===================================

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }
    
    switch (event.key) {
        case ' ':
            event.preventDefault();
            togglePlayPause();
            break;
        case 'ArrowLeft':
            event.preventDefault();
            skipTime(-5);
            break;
        case 'ArrowRight':
            event.preventDefault();
            skipTime(5);
            break;
        case 'ArrowUp':
            event.preventDefault();
            state.tilt = Math.max(-90, state.tilt + 5);
            updatePTZDisplay();
            break;
        case 'ArrowDown':
            event.preventDefault();
            state.tilt = Math.min(90, state.tilt - 5);
            updatePTZDisplay();
            break;
        case 'f':
            event.preventDefault();
            toggleFullscreen();
            break;
        case 'm':
            event.preventDefault();
            toggleMute();
            break;
        case 'r':
            event.preventDefault();
            resetView();
            break;
        case 'c':
            event.preventDefault();
            calibrateFrontLens();
            break;
        case 'a':
            event.preventDefault();
            state.pan -= 5;
            updatePTZDisplay();
            break;
        case 'd':
            event.preventDefault();
            state.pan += 5;
            updatePTZDisplay();
            break;
        case 'w':
            event.preventDefault();
            state.tilt = Math.max(-90, state.tilt + 5);
            updatePTZDisplay();
            break;
        case 's':
            event.preventDefault();
            state.tilt = Math.min(90, state.tilt - 5);
            updatePTZDisplay();
            break;
        case '+':
        case '=':
            event.preventDefault();
            state.zoom = Math.max(20, state.zoom - 5);
            updatePTZDisplay();
            break;
        case '-':
        case '_':
            event.preventDefault();
            state.zoom = Math.min(120, state.zoom + 5);
            updatePTZDisplay();
            break;
    }
});

console.log('Script loaded successfully');
console.log('Keyboard shortcuts:');
console.log('  Space - Play/Pause');
console.log('  ← → - Skip 5s | ↑ ↓ - Tilt camera');
console.log('  A D - Pan left/right | W S - Tilt up/down');
console.log('  + - - Zoom in/out');
console.log('  F - Fullscreen | M - Mute | R - Reset view');
console.log('  C - Calibrate current view as front lens');

