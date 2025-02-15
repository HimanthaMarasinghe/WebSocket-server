const net = require("net");
const crypto = require("crypto");

const wsServer = net.createServer();
const phpServer = net.createServer();
const authTokens = {}; // Stores { id: token } from PHP
const clients = {}; // Store connected WebSocket clients by ID
const MAX_MESSAGE_SIZE = 1024; // 1KB limit

wsServer.on("connection", (socket) => {
    socket.once("data", (data) => {
        const key = data.toString().match(/Sec-WebSocket-Key: (.+)/)[1].trim();
        const acceptKey = crypto
            .createHash("sha1")
            .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
            .digest("base64");

        socket.write(
            "HTTP/1.1 101 Switching Protocols\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
        );

        socket.once("data", (buffer) => {
            if (buffer.length > MAX_MESSAGE_SIZE) {
                console.log("Message too large. Disconnecting client.\n");
                socket.end();
            }
            const payload = decodeFrame(buffer);
            try {
                const data = JSON.parse(payload);
                if (data.id && data.token) {
                    if (authTokens[data.id].token === data.token) {
                        clients[data.id] = socket;
                        console.log(`Client ${data.id} authenticated\n`);
                    } else {
                        socket.write(encodeFrame(JSON.stringify({ error: "Authentication failed" })));
                        console.log(`Authentication failed for ${data.id}\n`);
                        socket.end();
                    }
                }
            } catch (e) {
                socket.write(encodeFrame(JSON.stringify({ error: "Invalid data" })));
                socket.end;
                console.log("Invalid data received\n");
            }
        });

        socket.on("close", () => {
            Object.keys(clients).forEach((id) => {
                if (clients[id] === socket) {
                    delete clients[id];
                    authTokens[id].lastOnline = Date.now();
                    console.log(`Client ${id} disconnected\n`);
                };
            });
        });
    });
});

// PHP backend can send messages to ws server
phpServer.on("connection", (phpSocket) => {
    phpSocket.on("data", (buffer) => {
        try {
            const dataString = buffer.toString().trim();
            console.log("Received data:", dataString); // Debugging log

            const {type, id, data } = JSON.parse(dataString);

            if (type === "auth") {
                const { userType, token } = JSON.parse(data);
                authTokens[id] = {token: token, userType: userType, lastOnline: Date.now()}; // Store token from PHP
                console.log(`Stored token for ${id}: ${data}\n`);
                phpSocket.write("auth_success");
            }
            else if (type === "notification") {
                if (clients[id]) {
                    clients[id].write(encodeFrame(data)); // Send message as JSON
                    console.log(`Message sent to ${id}:`, data, "\n");
                    phpSocket.write("success");
                } else if (authTokens[id]) {
                    console.log(`Client ${id} not connected but have a valid token. Retry in 30 seconds\n`);
                    phpSocket.write("retry");
                    setTimeout(() => {
                        if (clients[id]) {
                            clients[id].write(encodeFrame(data));
                            console.log(`Message sent to ${id}:`, data, "\n");
                        } else {
                            console.log(`Client ${id} still not connected\n`);
                        }
                    }, 30000);
                } else {
                    console.log(`Client ${id} not connected\n`);
                    phpSocket.write("failed");
                }
            }
            else if (type === "broadcast") {
                const {userType, message} = JSON.parse(data);
                Object.keys(clients).forEach((clientId) => {
                    if (authTokens[clientId].userType === userType) {
                        clients[clientId].write(encodeFrame(message));
                    }
                });
            }
            else {
                console.log("Invalid message type from PHP\n");
                phpSocket.write("failed");
            }
        } catch (e) {
            console.log("Invalid message format from PHP", e, "\n");
        }
    });
});

// Start servers
wsServer.listen(8080, () => console.log("WebSocket server running on ws://localhost:8080"));
phpServer.listen(9000, () => console.log("PHP backend server listening on port 9000\n"));

// Periodic cleanup function (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const userId in authTokens) {
        if (!clients[userId] && now - authTokens[userId].lastOnline > 30000) {
            // user have disconnected and not reconnected within 30 seconds
            console.log(`Removing inactive user ${userId}`);
            delete authTokens[userId];
        }
    }
}, 5 * 60 * 1000);

// WebSocket Message Encoding & Decoding
function encodeFrame(message) {
    const messageBuffer = Buffer.from(message);
    const length = messageBuffer.length;
    const frame = [0x81];

    if (length < 126) {
        frame.push(length);
    } else if (length < 65536) {
        frame.push(126, (length >> 8) & 0xff, length & 0xff);
    } else {
        frame.push(
            127,
            0, 0, 0, 0, // 32-bit high-order bits (zero since we don't support large messages)
            (length >> 24) & 0xff,
            (length >> 16) & 0xff,
            (length >> 8) & 0xff,
            length & 0xff
        );
    }

    return Buffer.concat([Buffer.from(frame), messageBuffer]);
}

function decodeFrame(buffer) {
    const length = buffer[1] & 0x7F;
    const maskStart = 2;
    const dataStart = maskStart + 4;
    const mask = buffer.slice(maskStart, maskStart + 4);
    const payload = buffer.slice(dataStart, dataStart + length);
    const decoded = Buffer.alloc(length);

    for (let i = 0; i < length; i++) {
        decoded[i] = payload[i] ^ mask[i % 4];
    }

    return decoded.toString();
}
