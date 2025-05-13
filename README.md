# WEBSOCKET SERVER

This Node.js WebSocket server is part of the <a href="https://github.com/HimanthaMarasinghe/TradeTrack" target="_blank" rel="noopener noreferrer">TradeTrack</a> project and is used for sending notifications and handling chat communication.

## 🔧 Features

- Handles WebSocket handshake and communication.
- Accepts authentication tokens from a PHP backend.
- Authenticates clients based on ID and token.
- Supports message delivery to specific users or broadcast by user type.
- Cleans up inactive users every 5 minutes.

## ⚙️ How It Works
1. PHP Server ➝ WebSocket Server (Port 9000)
- Sends an auth request with some data (id, token, userType) to store.

```
{
  type: auth,
  id: user123,
  data: {
    token: abc123, // Random string genarated when the user log in
    userType: customer
    }
}
```

- Sends a notification to deliver a message to a specific client.
```
{
  type: notification,
  id: user123,
  data: {... Actual notification and some mata data ...}
}
```
- Sends a broadcast to deliver a message to all connected clients of a certain user type.
```
{
  type: broadcast,
  id: admin, // Not used for processing, but required for consistency
  data: {... Actual notification and some mata data ...}
}
```

2. WebSocket Client ➝ WebSocket Server (Port 8080)
- Client connects and performs the WebSocket handshake.
- Sends a JSON payload: { id, token }.
```
{
  id: user123,
  token: abc123
}
```
- If token matches the one stored from PHP, the client is authenticated.

## 🚀 Running the Server

```
node server.js
```
- WebSocket server: ws://localhost:8080
- PHP backend connection: localhost:9000

## 🛡️ Message Limit
- WebSocket message size is limited to 1KB (1024 bytes).
- Larger messages will result in disconnection.


## 🧹 Cleanup
- Users not reconnected within 30 seconds after disconnection are removed.
- Cleanup runs every 5 minutes.