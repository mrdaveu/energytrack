// Statetesttest
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
const INPUT_AREA_HEIGHT = 250; // Height of input area (increased for visibility)

// Block-based Y-axis: fixed distances for time intervals
// 80% more sparse, longer gaps get more space
function allocateGapSpace(gapMinutes) {
    if (gapMinutes <= 0) return 0;
    if (gapMinutes <= 5) return 110;      // 0-5 min: tight
    if (gapMinutes <= 30) return 145;     // 5-30 min: small
    if (gapMinutes <= 60) return 180;     // 30-60 min: medium
    if (gapMinutes <= 120) return 220;    // 1-2 hours: larger
    if (gapMinutes <= 360) return 280;    // 2-6 hours: big
    if (gapMinutes <= 720) return 350;    // 6-12 hours: bigger
    return 420;                           // 12+ hours: max
}

// Build anchor map from entries (sorted newest first)
function buildAnchorMap(entries, now) {
    // Sort entries newest first
    const sorted = [...entries].sort((a, b) =>
        parseTimestamp(b.timestamp).getTime() - parseTimestamp(a.timestamp).getTime()
    );

    // Start with "now" as first anchor at y=0
    const anchors = [{ time: now, y: 0, isNow: true }];
    let currentY = 0;

    sorted.forEach(entry => {
        const entryTime = parseTimestamp(entry.timestamp).getTime();
        const prevAnchor = anchors[anchors.length - 1];
        const gapMs = prevAnchor.time - entryTime;
        const gapMinutes = gapMs / 60000;

        const gapY = allocateGapSpace(gapMinutes);
        currentY += gapY;

        anchors.push({
            time: entryTime,
            y: currentY,
            gapFromPrev: gapMinutes,
            gapY: gapY,
            entry: entry
        });
    });

    return anchors;
}

// Convert timestamp to Y using entry-centric mapping
// Linear interpolation within each gap (simple block-based)
function timeToY_entryCentric(timestamp, anchors) {
    const time = typeof timestamp === 'number' ? timestamp : parseTimestamp(timestamp).getTime();

    // Find which gap this time falls into
    for (let i = 0; i < anchors.length - 1; i++) {
        const upper = anchors[i];     // More recent
        const lower = anchors[i + 1]; // Older

        if (time <= upper.time && time >= lower.time) {
            const gapDuration = upper.time - lower.time;
            if (gapDuration === 0) return upper.y;
            // Linear interpolation within gap
            const ratio = (upper.time - time) / gapDuration;
            return upper.y + ratio * lower.gapY;
        }
    }

    // Time is before all entries - extrapolate
    if (anchors.length > 0) {
        const oldest = anchors[anchors.length - 1];
        const extraMs = oldest.time - time;
        const extraMinutes = extraMs / 60000;
        return oldest.y + allocateGapSpace(extraMinutes);
    }

    return 0;
}

// Convert Y to time using entry-centric mapping (for scroll)
// Linear interpolation within each gap
function yToTime_entryCentric(y, anchors) {
    // Find which gap this Y falls into
    for (let i = 0; i < anchors.length - 1; i++) {
        const upper = anchors[i];
        const lower = anchors[i + 1];

        if (y >= upper.y && y <= lower.y) {
            const yWithinGap = y - upper.y;
            const gapDuration = upper.time - lower.time;
            // Linear interpolation
            const ratio = lower.gapY > 0 ? yWithinGap / lower.gapY : 0;
            return upper.time - ratio * gapDuration;
        }
    }

    // Y is beyond all entries - extrapolate linearly
    if (anchors.length > 0) {
        const oldest = anchors[anchors.length - 1];
        if (y > oldest.y) {
            const extraY = y - oldest.y;
            // Rough inverse: assume max gap size maps to ~12 hours
            const extraMinutes = (extraY / 420) * 720;
            return oldest.time - extraMinutes * 60000;
        }
    }

    return Date.now();
}

// Store current anchor map globally for scroll calculations
let currentAnchors = [];

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
            // Ensure new entry is visible
            setTimeout(scrollToBottom, 50);
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

    if (state.entries.length === 0) {
        timelineContent.innerHTML = '<div class="empty-state">no entries yet</div>';
        timelineContent.style.height = `${viewportHeight}px`;
        currentAnchors = [{ time: now, y: 0, isNow: true }];
        return;
    }

    // Build entry-centric anchor map
    currentAnchors = buildAnchorMap(state.entries, now);

    // Get total Y extent from oldest entry
    const oldestAnchor = currentAnchors[currentAnchors.length - 1];
    const totalTimelineHeight = oldestAnchor.y + 200; // Extra padding

    // Calculate content height
    const contentHeight = totalTimelineHeight + viewportHeight;

    // "now" Y position is near the bottom (above input area)
    const nowY = contentHeight - INPUT_AREA_HEIGHT - 50;

    // Set content height
    timelineContent.style.height = `${contentHeight}px`;

    // Calculate positions for all entries using anchor map
    const entryPositions = currentAnchors
        .filter(a => !a.isNow && a.entry)
        .map(anchor => ({
            entry: anchor.entry,
            y: nowY - anchor.y
        }));

    // Render day separators when day changes between entries
    let lastDayKey = null;

    // Render entries and day separators
    entryPositions.forEach(({ entry, y }, index) => {
        const entryDate = parseTimestamp(entry.timestamp);
        const dayKey = entryDate.toDateString();

        // Show day separator when day changes (between entries)
        if (lastDayKey !== null && lastDayKey !== dayKey) {
            // Place separator between this entry and the previous one
            const prevY = entryPositions[index - 1].y;
            const separatorY = (y + prevY) / 2;

            const separator = document.createElement('div');
            separator.className = 'day-separator';
            separator.style.top = `${separatorY}px`;
            separator.innerHTML = `
                <div class="day-separator-line"></div>
                <span class="day-separator-label">${DAYS[entryDate.getDay()]}</span>
                <div class="day-separator-line"></div>
            `;
            timelineContent.appendChild(separator);
        }
        lastDayKey = dayKey;
    });

    // Render entries
    entryPositions.forEach(({ entry, y }) => {

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
    const timeOffset = timeToY_entryCentric(state.draft.timestamp, currentAnchors);
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

    // Use entry-centric mapping to convert scroll position to time
    const now = Date.now();
    const targetTime = yToTime_entryCentric(scrollFromBottom, currentAnchors);

    // Enforce 12h limit in draft mode
    const msBack = now - targetTime;
    const clampedMs = Math.min(Math.max(0, msBack), MAX_SCROLL_BACK_MS);
    state.draft.timestamp = now - clampedMs;

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
            const now = Date.now();
            const twelveHoursAgo = now - MAX_SCROLL_BACK_MS;
            const maxScrollUp = timeToY_entryCentric(twelveHoursAgo, currentAnchors);
            const maxScroll = timeline.scrollHeight - timeline.clientHeight;
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
