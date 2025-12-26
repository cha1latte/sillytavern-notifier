// SillyTavern Notifier - Cross-client notification extension
// Notifies other connected clients when bot messages are received

import { getContext } from "../../../extensions.js";

const extensionName = "sillytavern-notifier";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// SSE configuration
const SSE_ENDPOINT = '/api/plugins/message-ding-relay/events';
const NOTIFY_ENDPOINT = '/api/plugins/message-ding-relay/notify';
let eventSource = null;
let clientId = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 3000;

// Event types (must match server-plugin)
const EVENT_TYPES = {
    CHARACTER_MESSAGE: 'character_message',
    USER_MESSAGE: 'user_message',
};

// Notification sound (base64 encoded short beep)
const NOTIFICATION_SOUND_DATA = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2NlZqThn53eoeLkpGJfXNxd4KNlZSMgHZzeIGMk5KLgHd0eIGLkpGKf3Z0eYKLkZGJfnV0eYKKkJCIfnV1eoKKj4+IfXV1eoOKj46HeXR1e4OJjo2Gd3R2e4OIjYyEdnN2e4OIjIuDdXN3fIOHi4qCdHN4fIOGiomBc3N4fYKFiIeAc3N5fYKEh4Z/cnN5fYGDhoV+cnN6foGChYR9cXN6foGBhIN8cXN7foCAg4J7cHN7foCAgIF6cHN8fn9/gIB5b3N8fn9/f395b3N9fn5/fn94b3N9fn5+fX13bnN+fn5+fXx2bnR+fn59fXt1bnR+fn59fHp0bXR/fn58fHlzbXV/fn58e3hybnV/fn57enZxbnZ/fn56eXVwbnaAfn55eHRvb3aAfn54d3Nubnd/fn54dnJtb3h/fn53dXFtcHh/fn52dHBsb3mAfn51c29rb3qAfn50cm5qcHuAfX1zca8=';
let notificationAudio = null;

/**
 * Initialize the notification sound
 */
function initNotificationSound() {
    notificationAudio = new Audio(NOTIFICATION_SOUND_DATA);
    notificationAudio.volume = 0.5;
}

/**
 * Play the notification sound
 */
function playNotificationSound() {
    if (notificationAudio) {
        notificationAudio.currentTime = 0;
        notificationAudio.play().catch((error) => {
            console.warn(`[${extensionName}] Could not play sound:`, error);
        });
    }
}

/**
 * Request permission for desktop notifications
 */
async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        console.warn(`[${extensionName}] Desktop notifications not supported`);
        return false;
    }

    if (Notification.permission === "granted") {
        return true;
    }

    if (Notification.permission !== "denied") {
        const permission = await Notification.requestPermission();
        return permission === "granted";
    }

    return false;
}

/**
 * Show a desktop notification
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 */
function showDesktopNotification(title, body) {
    if (Notification.permission === "granted") {
        const notification = new Notification(title, {
            body: body,
            icon: '/img/ai4.png',
            tag: 'sillytavern-notifier',
        });

        setTimeout(() => notification.close(), 5000);

        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    }
}

/**
 * Handle incoming notification from another client
 * @param {object} data - The notification data
 */
function handleIncomingNotification(data) {
    console.log(`[${extensionName}] Received notification:`, data.event);

    playNotificationSound();

    let title = 'SillyTavern';
    let body = 'New message received';

    if (data.event === EVENT_TYPES.CHARACTER_MESSAGE) {
        title = 'New Bot Message';
        body = 'A character has responded in the chat';
    } else if (data.event === EVENT_TYPES.USER_MESSAGE) {
        title = 'New User Message';
        body = 'Someone sent a message in the chat';
    }

    showDesktopNotification(title, body);
}

/**
 * Send a notification event to other clients via POST
 * @param {string} eventType - The event type to broadcast
 * @param {object} data - Optional data to include
 */
async function notifyOtherClients(eventType, data = {}) {
    if (!clientId) {
        console.warn(`[${extensionName}] Not connected, cannot send notification`);
        return;
    }

    try {
        const response = await fetch(NOTIFY_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                clientId: clientId,
                event: eventType,
                data: data,
            }),
        });

        if (response.ok) {
            const result = await response.json();
            console.log(`[${extensionName}] Sent ${eventType} notification to ${result.recipients} client(s)`);
        } else {
            console.error(`[${extensionName}] Failed to send notification:`, response.status);
        }
    } catch (error) {
        console.error(`[${extensionName}] Error sending notification:`, error);
    }
}

/**
 * Connect to the SSE endpoint
 */
function connectSSE() {
    if (eventSource) {
        eventSource.close();
    }

    console.log(`[${extensionName}] Connecting to SSE: ${SSE_ENDPOINT}`);

    try {
        eventSource = new EventSource(SSE_ENDPOINT);

        eventSource.onopen = () => {
            console.log(`[${extensionName}] SSE connected`);
            reconnectAttempts = 0;
        };

        // Handle welcome event
        eventSource.addEventListener('welcome', (event) => {
            try {
                const data = JSON.parse(event.data);
                clientId = data.clientId;
                console.log(`[${extensionName}] Assigned client ID: ${clientId}`);
                updateStatusDisplay('Connected!', 'success');
            } catch (error) {
                console.error(`[${extensionName}] Error parsing welcome:`, error);
            }
        });

        // Handle notification events
        eventSource.addEventListener('notification', (event) => {
            try {
                const data = JSON.parse(event.data);
                handleIncomingNotification(data);
            } catch (error) {
                console.error(`[${extensionName}] Error parsing notification:`, error);
            }
        });

        // Handle heartbeat (just for keep-alive, no action needed)
        eventSource.addEventListener('heartbeat', () => {
            // Connection is alive
        });

        eventSource.onerror = (error) => {
            console.error(`[${extensionName}] SSE error:`, error);
            clientId = null;

            if (eventSource.readyState === EventSource.CLOSED) {
                updateStatusDisplay('Disconnected - reconnecting...', 'warning');
                scheduleReconnect();
            } else {
                updateStatusDisplay('Connection error', 'error');
            }
        };

    } catch (error) {
        console.error(`[${extensionName}] Failed to create EventSource:`, error);
        scheduleReconnect();
    }
}

/**
 * Update the status display in the settings panel
 * @param {string} message - Status message
 * @param {string} type - Status type: 'success', 'warning', 'error'
 */
function updateStatusDisplay(message, type) {
    const statusEl = document.getElementById('sillytavern-notifier-status');
    if (statusEl) {
        const icons = {
            success: '<i class="fa-solid fa-circle-check" style="color: #4caf50;"></i>',
            warning: '<i class="fa-solid fa-circle-exclamation" style="color: #ff9800;"></i>',
            error: '<i class="fa-solid fa-circle-xmark" style="color: #f44336;"></i>',
        };
        statusEl.innerHTML = `${icons[type] || ''} ${message}`;
    }
}

/**
 * Schedule a reconnection attempt
 */
function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error(`[${extensionName}] Max reconnection attempts reached`);
        updateStatusDisplay('Connection failed', 'error');
        return;
    }

    reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * reconnectAttempts;
    console.log(`[${extensionName}] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    setTimeout(connectSSE, delay);
}

/**
 * Set up event listeners for SillyTavern events
 */
function setupEventListeners() {
    const context = getContext();
    const { eventSource: stEventSource, event_types } = context;

    if (!stEventSource || !event_types) {
        console.error(`[${extensionName}] Could not access SillyTavern event system`);
        return;
    }

    // Listen for bot message completion
    stEventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
        console.log(`[${extensionName}] CHARACTER_MESSAGE_RENDERED event detected`);
        notifyOtherClients(EVENT_TYPES.CHARACTER_MESSAGE);
    });

    // Ready for future: user messages
    // stEventSource.on(event_types.USER_MESSAGE_RENDERED, () => {
    //     notifyOtherClients(EVENT_TYPES.USER_MESSAGE);
    // });

    console.log(`[${extensionName}] Event listeners registered`);
}

/**
 * Initialize the extension
 */
jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);

    try {
        // Load HTML settings panel
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);

        // Initialize notification sound
        initNotificationSound();

        // Request desktop notification permission
        await requestNotificationPermission();

        // Connect to SSE endpoint
        connectSSE();

        // Set up SillyTavern event listeners
        setupEventListeners();

        console.log(`[${extensionName}] Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] Failed to load:`, error);
    }
});
