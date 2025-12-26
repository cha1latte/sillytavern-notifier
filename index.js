// Message Ding - Cross-client notification extension for SillyTavern
// Notifies other connected clients when bot messages are received

import { getContext } from "../../../extensions.js";

const extensionName = "st-message-ding";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// WebSocket configuration
const DEFAULT_WS_PORT = 5050;
let ws = null;
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
        // Reset and play
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
            icon: '/img/ai4.png', // SillyTavern default icon
            tag: 'message-ding', // Prevents duplicate notifications
        });

        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);

        // Focus window when clicked
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    }
}

/**
 * Handle incoming notification from another client
 * @param {object} message - The notification message
 */
function handleIncomingNotification(message) {
    console.log(`[${extensionName}] Received notification:`, message.event);

    // Play sound
    playNotificationSound();

    // Show desktop notification
    let title = 'SillyTavern';
    let body = 'New message received';

    if (message.event === EVENT_TYPES.CHARACTER_MESSAGE) {
        title = 'New Bot Message';
        body = 'A character has responded in the chat';
    } else if (message.event === EVENT_TYPES.USER_MESSAGE) {
        title = 'New User Message';
        body = 'Someone sent a message in the chat';
    }

    showDesktopNotification(title, body);
}

/**
 * Send a notification event to other clients
 * @param {string} eventType - The event type to broadcast
 * @param {object} data - Optional data to include
 */
function notifyOtherClients(eventType, data = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'notify',
            event: eventType,
            data: data,
        }));
        console.log(`[${extensionName}] Sent ${eventType} notification`);
    }
}

/**
 * Get the WebSocket port from the server plugin
 */
async function getWebSocketPort() {
    try {
        const response = await fetch('/api/plugins/message-ding-relay/port');
        if (response.ok) {
            const data = await response.json();
            return data.port;
        }
    } catch (error) {
        console.warn(`[${extensionName}] Could not fetch WS port from server, using default`);
    }
    return DEFAULT_WS_PORT;
}

/**
 * Connect to the WebSocket server
 */
async function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }

    const port = await getWebSocketPort();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const wsUrl = `${protocol}//${host}:${port}`;

    console.log(`[${extensionName}] Connecting to WebSocket: ${wsUrl}`);

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log(`[${extensionName}] WebSocket connected`);
            reconnectAttempts = 0;
            updateStatusDisplay('Connected', 'success');
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                switch (message.type) {
                    case 'welcome':
                        clientId = message.clientId;
                        console.log(`[${extensionName}] Assigned client ID: ${clientId}`);
                        break;

                    case 'notification':
                        handleIncomingNotification(message);
                        break;

                    case 'pong':
                        // Heartbeat response, ignore
                        break;

                    default:
                        console.log(`[${extensionName}] Unknown message type:`, message.type);
                }
            } catch (error) {
                console.error(`[${extensionName}] Error parsing WebSocket message:`, error);
            }
        };

        ws.onclose = (event) => {
            console.log(`[${extensionName}] WebSocket disconnected:`, event.reason || 'No reason');
            clientId = null;
            updateStatusDisplay('Disconnected - reconnecting...', 'warning');
            scheduleReconnect();
        };

        ws.onerror = (error) => {
            console.error(`[${extensionName}] WebSocket error:`, error);
            updateStatusDisplay('Connection error', 'error');
        };

    } catch (error) {
        console.error(`[${extensionName}] Failed to create WebSocket:`, error);
        scheduleReconnect();
    }
}

/**
 * Update the status display in the settings panel
 * @param {string} message - Status message
 * @param {string} type - Status type: 'success', 'warning', 'error'
 */
function updateStatusDisplay(message, type) {
    const statusEl = document.getElementById('message-ding-status');
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
 * Schedule a WebSocket reconnection attempt
 */
function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error(`[${extensionName}] Max reconnection attempts reached`);
        return;
    }

    reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * reconnectAttempts;
    console.log(`[${extensionName}] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    setTimeout(connectWebSocket, delay);
}

/**
 * Set up event listeners for SillyTavern events
 */
function setupEventListeners() {
    const context = getContext();
    const { eventSource, event_types } = context;

    if (!eventSource || !event_types) {
        console.error(`[${extensionName}] Could not access SillyTavern event system`);
        return;
    }

    // Listen for bot message completion
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
        console.log(`[${extensionName}] CHARACTER_MESSAGE_RENDERED event detected`);
        notifyOtherClients(EVENT_TYPES.CHARACTER_MESSAGE);
    });

    // Ready for future: user messages
    // eventSource.on(event_types.USER_MESSAGE_RENDERED, () => {
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

        // Connect to WebSocket server
        await connectWebSocket();

        // Set up SillyTavern event listeners
        setupEventListeners();

        console.log(`[${extensionName}] Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] Failed to load:`, error);
    }
});
