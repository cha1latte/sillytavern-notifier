# Message Ding - SillyTavern Cross-Client Notifier

Notifies you when there's a new bot reply on another client. Perfect for shared accounts where multiple people are participating in the same chat from different computers.

## Features

- Notifies other connected clients when a bot message is received
- Desktop notifications (browser push notifications)
- Audio notification sound
- Automatic reconnection on connection loss
- Low server overhead (SSE-based, no extra ports needed)

## Installation

This extension has two components that need to be installed:

### 1. Server Plugin (required)

Clone the server plugin into your SillyTavern plugins directory:

```bash
cd /path/to/SillyTavern/plugins
git clone https://github.com/cha1latte/sillytavern-notifier-server
```

Make sure server plugins are enabled in your `config.yaml`:

```yaml
enableServerPlugins: true
```

Then restart SillyTavern. You should see in the logs:
```
[message-ding-relay] Initializing plugin...
[message-ding-relay] Plugin initialized successfully
```

### 2. UI Extension (required)

Clone this repo into your third-party extensions folder:

```bash
cd /path/to/SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/cha1latte/sillytavern-notifier
```

Then refresh your browser.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     SillyTavern Server                          │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Server Plugin (SSE relay via /api/plugins/...)           │ │
│  │  - Tracks connected clients                                │ │
│  │  - Broadcasts events to OTHER clients only                 │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS (same port as SillyTavern)
                ┌─────────────┴─────────────┐
                │                           │
     ┌──────────▼──────────┐     ┌──────────▼──────────┐
     │   Client A           │     │   Client B           │
     │   (triggers message) │     │   (receives notif)   │
     └─────────────────────┘     └──────────────────────┘
```

1. Client A sends a message, bot responds
2. Client A's extension detects `CHARACTER_MESSAGE_RENDERED` event
3. Client A POSTs notification to server (`/api/plugins/message-ding-relay/notify`)
4. Server broadcasts to all OTHER clients via SSE (`/api/plugins/message-ding-relay/events`)
5. Client B receives notification, plays sound + shows desktop notification

## Extending

To add support for additional events (like user messages), edit both repos:

1. [sillytavern-notifier-server](https://github.com/cha1latte/sillytavern-notifier-server) - Add event type to `EVENT_TYPES`
2. This repo (`index.js`) - Add event listener and handling

User message notifications are already stubbed out in the code - just uncomment to enable.

## Requirements

- SillyTavern 1.12+ with server plugin support enabled
- Modern browser with Notification API and EventSource support

## Author

cha1latte
