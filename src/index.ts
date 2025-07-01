import makeWASocket, { useMultiFileAuthState, DisconnectReason, WASocket } from "baileys";
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import qrcode from "qrcode";

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.json());
const n8nUrl = process.env.N8N_URL || "https://n8n.yohancloud.biz.id";


let socket: WASocket;
let qrCodeData;
let isConnected = false;

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState("cache");

  socket = makeWASocket({
    auth: state,
    printQRInTerminal: false, // We will handle the QR code manually
  });

  socket.ev.on("connection.update", async (update : any) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeData = await qrcode.toDataURL(qr);
      isConnected = false;
      io.emit("qr", qrCodeData); // Send QR to the frontend
      io.emit("status", "Please scan the QR code to connect.");
    }

    if (connection === "close") {
      isConnected = false;
      io.emit("status", "Connection closed. Retrying...");
      const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log("Connection closed, reconnecting...");
        main();
      } else {
        qrCodeData = null; // Clear QR on logout
        io.emit("qr", null);
        io.emit("status", "Connection closed due to authentication error. Please refresh to get a new QR code.");
        console.log("Connection closed due to authentication error, please re-authenticate.");
      }
    } else if (connection === "open") {
      isConnected = true;
      qrCodeData = null; // Clear QR on successful connection
      io.emit("qr", null);
      io.emit("status", "WhatsApp connected successfully!");
      io.emit("connected");
      console.log("Connection opened successfully!");
    }
  });

  socket.ev.on("messages.upsert", async ({ messages } : any) => {
    const number = messages[0].key.remoteJid;
    const message = messages[0].message?.extendedTextMessage?.text ?? messages[0].message?.conversation;
    console.log(`Received message from ${number}: ${message}`);
    if (messages[0].key.fromMe) {
        console.log("This is a message sent by the bot itself, ignoring...");
        return;
    }
    // Ignore messages sent by the bot itself
    await fetch(`${n8nUrl}/webhook-test/whatsapp`, {
        method : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id : messages[0].key,
          message: message,
        })
      });
      await fetch(`${n8nUrl}/webhook/whatsapp`, {
        method : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id : messages[0].key,
          message: message,
        })
      });
  });

  socket.ev.on("creds.update", saveCreds);
}

// UI Integration
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-g">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp QR Login</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; background-color: #f0f2f5; margin: 0; }
            #container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            h1 { font-size: 24px; color: #1c1e21; }
            p { font-size: 16px; color: #606770; }
            #qr-code { margin-top: 20px; display: none; }
            #checkmark { display: none; margin-top: 20px; }
        </style>
        <script src="/socket.io/socket.io.js"></script>
    </head>
    <body>
        <div id="container">
            <h1>WhatsApp Connection Status</h1>
            <p id="status">Connecting...</p>
            <div id="qr-code">
                <img src="" alt="QR Code" />
            </div>
            <div id="checkmark">
                <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="#28a745" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
        </div>
        <script>
            const socket = io();
            const qrCodeDiv = document.getElementById('qr-code');
            const qrCodeImg = qrCodeDiv.querySelector('img');
            const checkmarkDiv = document.getElementById('checkmark');
            const statusP = document.getElementById('status');

            socket.on('qr', (qr) => {
                if (qr) {
                    qrCodeImg.src = qr;
                    qrCodeDiv.style.display = 'block';
                    checkmarkDiv.style.display = 'none';
                } else {
                    qrCodeDiv.style.display = 'none';
                }
            });

            socket.on('connected', () => {
                qrCodeDiv.style.display = 'none';
                checkmarkDiv.style.display = 'block';
            });

            socket.on('status', (msg) => {
                statusP.textContent = msg;
            });
        </script>
    </body>
    </html>
  `);
});

app.get("/status", async (req, res) => {
  const number:any = req.query.number ?? "";
  if (!number) {
    res.status(400).send("Missing 'number' query parameter.");
    return;
  }

  await socket.sendPresenceUpdate('composing',number);
  res.status(200).json({ status: "success" });
})

app.post("/webhook/send", async (req, res) => {
  if (!isConnected) {
     res.status(409).send("WhatsApp not connected.");
     return;
  }
  const { number, message } = req.body;
  if (!number || !message) {
      res.status(400).send("Missing 'number' or 'message' in request body.");
      return;
  }
  console.log(`Received webhook for ID: ${number}, Message: ${message}`);
  try {
    await socket.sendMessage(number, { text: message });
    res.status(200).send("Webhook received and message sent successfully");
  } catch (error) {
    console.error("Failed to send message:", error);
    res.status(500).send("Failed to send message");
  }
});

server.listen(3000, () => {
  console.log("Server is running on port 3000. Open http://localhost:3000 to see the UI.");
});

main();