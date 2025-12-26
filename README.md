# Message Ding - SillyTavern Cross-Client Notifier

Notifies you when there's a new bot reply on another client. Perfect for shared accounts where multiple people are participating in the same chat from different computers.

## Features

- Notifies other connected clients when a bot message is received
- Desktop notifications (browser push notifications)
- Audio notification sound
- Automatic reconnection on connection loss
- Low server overhead (WebSocket-based)

## Installation

This extension has two components that need to be installed:

### 1. Server Plugin (required)

Copy the `server-plugin` folder to your SillyTavern plugins directory:

```bash
cp -r server-plugin /path/to/SillyTavern/plugins/message-ding-relay
cd /path/to/SillyTavern/plugins/message-ding-relay
npm install
```

Then restart SillyTavern.

### 2. UI Extension (required)

Copy the UI extension files to your SillyTavern third-party extensions:

```bash
mkdir -p /path/to/SillyTavern/public/scripts/extensions/third-party/st-message-ding
cp index.js manifest.json example.html /path/to/SillyTavern/public/scripts/extensions/third-party/st-message-ding/
```

Then refresh your browser.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     SillyTavern Server                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Server Plugin (WebSocket relay on port 5050)             │  │
│  │  - Tracks connected clients                               │  │
│  │  - Broadcasts events to OTHER clients only                │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ WebSocket
                ┌─────────────┴─────────────┐
                │                           │
     ┌──────────▼──────────┐     ┌──────────▼──────────┐
     │  Client A           │     │   Client B          │
     │  (triggers message) │     │   (receives notif)  │
     └─────────────────────┘     └─────────────────────┘
```

1. Client A sends a message, bot responds
2. Client A's extension detects `CHARACTER_MESSAGE_RENDERED` event
3. Client A sends notification to server
4. Server broadcasts to all OTHER clients (not A)
5. Client B receives notification, plays sound + shows desktop notification

## Configuration

The WebSocket server runs on port `5050` by default. To change this, set the environment variable:

```bash
MESSAGE_DING_PORT=5051 node server.js
```

## Extending

To add support for additional events (like user messages), edit:

1. `server-plugin/index.js` - Add event type to `EVENT_TYPES`
2. `index.js` (UI extension) - Add event listener and handling

User message notifications are already stubbed out in the code - just uncomment to enable.

## Requirements

- SillyTavern with server plugin support
- Modern browser with Notification API support
- Clients must be able to reach the WebSocket port (5050)

## Author

cha1latte
