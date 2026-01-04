// State
const state = {
    entries: [],
    draft: {
        text: '',
        energy: null,
        timestamp: Date.now()
    },
    isDraftMode: false,
    isEnergyDragging: false
};

// Get user secret from URL
const secret = window.location.pathname.split('/u/')[1];

// DOM elements
const timeline = document.getElementById('timeline');
const timelineContent = document.getElementById('timeline-content');
const exitDraft = document.getElementById('exit-draft');
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
const PX_PER_HOUR = 150; // Base pixels per hour
const LOG_SCALE_FACTOR = 80; // For logarithmic compression
const ENTRY_HEIGHT = 80; // Approximate height of an entry
const INPUT_AREA_HEIGHT = 200; // Height of input area

// Time-to-Y position mapping
// Uses logarithmic scale: more detail for recent times, compressed for older
function minutesToY(minutes) {
    if (minutes <= 0) return 0;
    // Logarithmic scale with linear component for nearby times
    if (minutes <= 60) {
        // First hour: mostly linear for detail
        return minutes * 3;
    }
    // After first hour: log compression
    const firstHourY = 60 * 3; // 180px for first hour
    const additionalMinutes = minutes - 60;
    return firstHourY + LOG_SCALE_FACTOR * Math.log(additionalMinutes / 60 + 1) * 60;
}

// Reverse: Y position to minutes
function yToMinutes(y) {
    if (y <= 0) return 0;
    const firstHourY = 180;
    if (y <= firstHourY) {
        return y / 3;
    }
    const additionalY = y - firstHourY;
    return 60 + 60 * (Math.exp(additionalY / (LOG_SCALE_FACTOR * 60)) - 1);
}

// Convert timestamp to Y position relative to "now"
function timeToY(timestamp, nowTime) {
    const diffMs = nowTime - parseTimestamp(timestamp).getTime();
    const diffMinutes = diffMs / 60000;
    return minutesToY(diffMinutes);
}

// Parse timestamp from server (ensures UTC interpretation)
function parseTimestamp(ts) {
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

// Initialize
async function init() {
    await fetchEntries();
    renderTimeline();
    setupEventListeners();

    // Scroll to bottom (now) on load
    scrollToBottom();

    // Update timestamp display every second
    setInterval(updateTimestampDisplay, 1000);
}

// Scroll to bottom of timeline (where "now" is)
function scrollToBottom() {
    timeline.scrollTop = timeline.scrollHeight;
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

// Render the timeline with absolute positioning
function renderTimeline() {
    const now = Date.now();
    timelineContent.innerHTML = '';

    const viewportHeight = window.innerHeight;
    const inputAreaHeight = 180; // Approximate height of input area

    if (state.entries.length === 0) {
        timelineContent.innerHTML = '<div class="empty-state">no entries yet</div>';
        timelineContent.style.height = `${viewportHeight}px`;
        return;
    }

    // Find the oldest entry to determine total timeline height
    let maxMinutesAgo = 0;
    state.entries.forEach(entry => {
        const diffMs = now - parseTimestamp(entry.timestamp).getTime();
        const diffMinutes = diffMs / 60000;
        if (diffMinutes > maxMinutesAgo) maxMinutesAgo = diffMinutes;
    });

    // Calculate total content height
    // "now" is at the bottom, older entries are above
    const totalTimelineHeight = minutesToY(maxMinutesAgo) + 200;
    const contentHeight = totalTimelineHeight + viewportHeight;

    // "now" Y position is near the bottom (above input area)
    const nowY = contentHeight - inputAreaHeight - 50;

    // Set content height
    timelineContent.style.height = `${contentHeight}px`;

    // Calculate positions for all entries (older = higher up = lower Y value)
    const entryPositions = state.entries.map(entry => {
        const timeOffset = timeToY(entry.timestamp, now);
        const y = nowY - timeOffset; // Subtract to put older entries ABOVE
        return { entry, y };
    });

    // Render gridlines (every hour for first 12 hours)
    for (let hour = 1; hour <= 12; hour++) {
        const y = nowY - minutesToY(hour * 60);
        const gridline = document.createElement('div');
        gridline.className = 'gridline';
        gridline.style.top = `${y}px`;
        timelineContent.appendChild(gridline);
    }

    // Track days for separators
    let lastDay = null;

    // Render entries
    entryPositions.forEach(({ entry, y }) => {
        const entryDate = parseTimestamp(entry.timestamp);
        const dayKey = entryDate.toDateString();

        // Add day separator if different day
        if (lastDay !== null && lastDay !== dayKey) {
            const separator = document.createElement('div');
            separator.className = 'day-separator';
            separator.style.top = `${y - 40}px`;
            separator.innerHTML = `
                <div class="day-separator-line"></div>
                <span class="day-separator-label">${DAYS[entryDate.getDay()]}</span>
                <div class="day-separator-line"></div>
            `;
            timelineContent.appendChild(separator);
        }
        lastDay = dayKey;

        // Create entry element
        const entryEl = document.createElement('div');
        entryEl.className = 'entry';
        entryEl.style.top = `${y}px`;

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
        timelineContent.appendChild(entryEl);
    });

    // Render draft preview if in draft mode
    if (state.isDraftMode && (state.draft.text || state.draft.energy !== null)) {
        renderDraftPreview(now, nowY);
    }
}

// Render draft preview at target position
function renderDraftPreview(now, nowY) {
    const timeOffset = timeToY(state.draft.timestamp, now);
    const draftY = nowY - timeOffset; // Subtract to match entry positioning

    const draftEl = document.createElement('div');
    draftEl.className = 'entry draft';
    draftEl.style.top = `${draftY}px`;

    let html = `<span class="entry-time">${formatTime(state.draft.timestamp)}</span>`;
    html += `<span class="entry-description">${state.draft.text || '...'}</span>`;

    if (state.draft.energy !== null) {
        const opacity = state.draft.energy / 10;
        html += `
            <div class="entry-energy">
                <span class="entry-energy-number">${state.draft.energy}</span>
                <div class="entry-energy-box" style="opacity: ${opacity}"></div>
            </div>
        `;
    }

    draftEl.innerHTML = html;
    timelineContent.appendChild(draftEl);
}

// Update timestamp display based on scroll position
function updateTimestampFromScroll() {
    // Calculate how far we've scrolled UP from the bottom
    const maxScroll = timeline.scrollHeight - timeline.clientHeight;
    const scrollFromBottom = maxScroll - timeline.scrollTop;

    // scrollFromBottom = 0 means we're at the bottom (now)
    // scrollFromBottom > 0 means we've scrolled up (back in time)
    const minutes = yToMinutes(scrollFromBottom);
    const msBack = minutes * 60000;

    // Enforce 12h limit in draft mode
    const clampedMs = Math.min(msBack, MAX_SCROLL_BACK_MS);
    state.draft.timestamp = Date.now() - clampedMs;

    updateTimestampDisplay();
}

// Update the timestamp display text
function updateTimestampDisplay() {
    const now = Date.now();
    const diffMs = now - state.draft.timestamp;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
        timestampDisplay.textContent = 'now';
    } else if (diffMins < 60) {
        timestampDisplay.textContent = `${diffMins}m ago`;
    } else {
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        if (mins === 0) {
            timestampDisplay.textContent = `${hours}h ago`;
        } else {
            timestampDisplay.textContent = `${hours}h ${mins}m ago`;
        }
    }
}

// Enter draft mode
function enterDraftMode() {
    if (!state.isDraftMode) {
        state.isDraftMode = true;
        exitDraft.classList.remove('hidden');
        renderTimeline(); // Re-render to show draft preview
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

    descriptionInput.value = '';
    energyNumber.textContent = '';
    energySquare.dataset.energy = '';
    energyBox.style.setProperty('--energy-opacity', '0.1');
    exitDraft.classList.add('hidden');

    // Scroll back to bottom (now)
    scrollToBottom();
    updateTimestampDisplay();
    renderTimeline();
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
        renderTimeline(); // Update draft preview
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

    // Scroll handling - update timestamp based on scroll position
    timeline.addEventListener('scroll', () => {
        if (state.isDraftMode) {
            updateTimestampFromScroll();

            // Enforce scroll limit for 12h (can't scroll too far up)
            const maxScroll = timeline.scrollHeight - timeline.clientHeight;
            const maxScrollUp = minutesToY(12 * 60);
            const minScrollTop = maxScroll - maxScrollUp;

            if (timeline.scrollTop < minScrollTop) {
                timeline.scrollTop = minScrollTop;
            }
        }
    });

    // Energy square drag
    const startDrag = (e) => {
        e.preventDefault();
        state.isEnergyDragging = true;
        energyTrack.classList.remove('hidden');

        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
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

    // Handle window resize
    window.addEventListener('resize', () => {
        renderTimeline();
    });
}

// Start the app
init();
