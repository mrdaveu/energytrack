// State
const state = {
    entries: [],
    draft: {
        text: '',
        energy: null,
        timestamp: Date.now()
    },
    isDraftMode: false,
    isEnergyDragging: false,
    scrollOffset: 0
};

// Get user secret from URL
const secret = window.location.pathname.split('/u/')[1];

// DOM elements
const app = document.getElementById('app');
const exitDraft = document.getElementById('exit-draft');
const timelinePast = document.getElementById('timeline-past');
const descriptionInput = document.getElementById('description-input');
const energySquare = document.getElementById('energy-square');
const energyNumber = document.getElementById('energy-number');
const energyBox = document.getElementById('energy-box');
const timestampDisplay = document.getElementById('timestamp-display');
const saveBtn = document.getElementById('save-btn');
const energyTrack = document.getElementById('energy-track');
const energyTrackFill = document.getElementById('energy-track-fill');
const energyTrackIndicator = document.getElementById('energy-track-indicator');

// Constants
const MAX_SCROLL_BACK_MS = 12 * 60 * 60 * 1000; // 12 hours
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// Initialize
async function init() {
    await fetchEntries();
    renderTimeline();
    updateTimestamp();
    setupEventListeners();

    // Update timestamp every second
    setInterval(updateTimestamp, 1000);
}

// Fetch entries from API
async function fetchEntries() {
    try {
        const res = await fetch(`/api/u/${secret}/entries`);
        if (res.ok) {
            state.entries = await res.json();
        }
    } catch (err) {
        console.error('Failed to fetch entries:', err);
    }
}

// Save entry to API
async function saveEntry() {
    const { text, energy, timestamp } = state.draft;

    if (!text && energy === null) return;

    const entry = {
        timestamp: new Date(timestamp).toISOString(),
        description: text || null,
        energy: energy
    };

    try {
        const res = await fetch(`/api/u/${secret}/entries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
        });

        if (res.ok) {
            const newEntry = await res.json();
            state.entries.unshift(newEntry);
            exitDraftMode();
            renderTimeline();
        }
    } catch (err) {
        console.error('Failed to save entry:', err);
    }
}

// Calculate visual gap using logarithmic scale
function getVisualGap(minutesDelta) {
    if (minutesDelta <= 0) return 4;
    // Log scale: compresses large gaps
    return Math.min(20 * Math.log10(minutesDelta + 1) + 8, 120);
}

// Parse timestamp from server (ensures UTC interpretation)
function parseTimestamp(ts) {
    // Server returns ISO without Z, so add it to ensure UTC parsing
    if (typeof ts === 'string' && !ts.endsWith('Z') && !ts.includes('+')) {
        return new Date(ts + 'Z');
    }
    return new Date(ts);
}

// Format timestamp for display
function formatTime(date) {
    const d = parseTimestamp(date);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;

    return d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).toLowerCase();
}

// Check if two dates are on different days
function isDifferentDay(date1, date2) {
    const d1 = parseTimestamp(date1);
    const d2 = parseTimestamp(date2);
    return d1.toDateString() !== d2.toDateString();
}

// Render timeline
function renderTimeline() {
    timelinePast.innerHTML = '';

    if (state.entries.length === 0) {
        timelinePast.innerHTML = '<div class="empty-state">no entries yet</div>';
        return;
    }

    let prevTimestamp = null;

    for (let i = 0; i < state.entries.length; i++) {
        const entry = state.entries[i];
        const entryDate = parseTimestamp(entry.timestamp);

        // Add day separator if different day from previous
        if (prevTimestamp && isDifferentDay(entryDate, prevTimestamp)) {
            const separator = document.createElement('div');
            separator.className = 'day-separator';
            separator.innerHTML = `
                <div class="day-separator-line"></div>
                <span class="day-separator-label">${DAYS[entryDate.getDay()]}</span>
                <div class="day-separator-line"></div>
            `;
            timelinePast.appendChild(separator);
        }

        // Add time-based spacer
        if (prevTimestamp) {
            const minutesDelta = (parseTimestamp(prevTimestamp) - entryDate) / 60000;
            const gap = getVisualGap(minutesDelta);
            if (gap > 8) {
                const spacer = document.createElement('div');
                spacer.className = 'time-spacer';
                spacer.style.height = `${gap}px`;
                timelinePast.appendChild(spacer);
            }
        }

        // Create entry element
        const entryEl = document.createElement('div');
        entryEl.className = 'entry';

        let html = `<span class="entry-time">${formatTime(entry.timestamp)}</span>`;
        html += `<span class="entry-description">${entry.description || ''}</span>`;

        if (entry.energy !== null) {
            const opacity = entry.energy / 10;
            html += `
                <div class="entry-energy">
                    <span class="entry-energy-number">${entry.energy}</span>
                    <div class="entry-energy-box" style="opacity: ${opacity}"></div>
                </div>
            `;
        }

        entryEl.innerHTML = html;
        timelinePast.appendChild(entryEl);

        prevTimestamp = entry.timestamp;
    }
}

// Update timestamp display
function updateTimestamp() {
    const date = new Date(state.draft.timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
        timestampDisplay.textContent = 'now';
    } else if (diffMins < 60) {
        timestampDisplay.textContent = `${diffMins}m ago`;
    } else {
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        timestampDisplay.textContent = `${hours}h ${mins}m ago`;
    }
}

// Enter draft mode
function enterDraftMode() {
    if (!state.isDraftMode) {
        state.isDraftMode = true;
        exitDraft.classList.remove('hidden');
    }
}

// Exit draft mode
function exitDraftMode() {
    state.isDraftMode = false;
    state.draft = {
        text: '',
        energy: null,
        timestamp: Date.now()
    };
    state.scrollOffset = 0;

    descriptionInput.value = '';
    energyNumber.textContent = '';
    energySquare.dataset.energy = '';
    energyBox.style.setProperty('--energy-opacity', '0.1');
    exitDraft.classList.add('hidden');
    updateTimestamp();
}

// Set energy value
function setEnergy(value) {
    state.draft.energy = value;
    energyNumber.textContent = value;
    energySquare.dataset.energy = value;
    energyBox.style.setProperty('--energy-opacity', value / 10);
    enterDraftMode();
}

// Setup event listeners
function setupEventListeners() {
    // Text input
    descriptionInput.addEventListener('input', (e) => {
        state.draft.text = e.target.value;
        if (e.target.value) {
            enterDraftMode();
        }
    });

    // Save button
    saveBtn.addEventListener('click', saveEntry);

    // Enter to save
    descriptionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveEntry();
        }
    });

    // Exit draft mode
    exitDraft.addEventListener('click', exitDraftMode);

    // Energy square drag
    let dragStartY = 0;
    let dragStartEnergy = 5;

    const startDrag = (e) => {
        e.preventDefault();
        state.isEnergyDragging = true;
        energyTrack.classList.remove('hidden');

        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        dragStartY = clientY;
        dragStartEnergy = state.draft.energy || 5;

        updateEnergyFromDrag(clientY);
    };

    const moveDrag = (e) => {
        if (!state.isEnergyDragging) return;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        updateEnergyFromDrag(clientY);
    };

    const endDrag = () => {
        if (!state.isEnergyDragging) return;
        state.isEnergyDragging = false;
        energyTrack.classList.add('hidden');
    };

    const updateEnergyFromDrag = (clientY) => {
        const trackRect = energyTrack.getBoundingClientRect();
        const relativeY = clientY - trackRect.top;
        const percentage = Math.max(0, Math.min(1, relativeY / trackRect.height));

        // Up = lower energy (1 at top, 10 at bottom)
        const energy = Math.round(1 + percentage * 9);

        setEnergy(energy);

        // Update track visuals
        const fillHeight = percentage * 100;
        energyTrackFill.style.height = `${fillHeight}%`;
        energyTrackIndicator.style.top = `${relativeY}px`;
        energyTrackIndicator.textContent = energy;
    };

    energySquare.addEventListener('mousedown', startDrag);
    energySquare.addEventListener('touchstart', startDrag);
    document.addEventListener('mousemove', moveDrag);
    document.addEventListener('touchmove', moveDrag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);

    // Scroll to adjust timestamp in draft mode
    timelinePast.addEventListener('wheel', (e) => {
        if (!state.isDraftMode) return;

        e.preventDefault();

        // Scroll up = go back in time
        const delta = e.deltaY * 100; // Convert to milliseconds
        const newOffset = Math.max(0, Math.min(MAX_SCROLL_BACK_MS, state.scrollOffset + delta));

        state.scrollOffset = newOffset;
        state.draft.timestamp = Date.now() - newOffset;

        updateTimestamp();
    }, { passive: false });
}

// Start the app
init();
