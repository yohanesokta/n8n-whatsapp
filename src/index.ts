import makeWASocket, { useMultiFileAuthState, DisconnectReason, WASocket } from "baileys";
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import qrcode from "qrcode";
import { promises as fs } from "fs";
import path from "path";

const app = express();
const server = createServer(app);
const io = new Server(server);


const PORT = process.env.PORT || 3000;
const n8nUrl = process.env.N8N_URL!

const STATUS_FILE_PATH = path.join(__dirname, "connection-status.json");
const QR_FILE_PATH = path.join(__dirname, "qr-code.txt");


app.use(express.json());

let socket: WASocket;



async function writeConnectionStatus(status: { isConnected: boolean }) {
  try {
    await fs.writeFile(STATUS_FILE_PATH, JSON.stringify(status, null, 2));
  } catch (error) {
    console.error("Gagal menulis status koneksi:", error);
  }
}

async function readConnectionStatus(): Promise<{ isConnected: boolean }> {
  try {
    const data = await fs.readFile(STATUS_FILE_PATH, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return { isConnected: false }; 
  }
}

async function deleteFile(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error.code !== 'ENOENT') { 
      console.error(`Gagal menghapus file ${filePath}:`, error);
    }
  }
}



async function main() {
  const { state, saveCreds } = await useMultiFileAuthState("cache");

  socket = makeWASocket({
    auth: state,
    printQRInTerminal: false, 
  });

  socket.ev.on("connection.update", async (update: any) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("QR Code diterima, simpan ke file...");
      const qrCodeData = await qrcode.toDataURL(qr);
      await fs.writeFile(QR_FILE_PATH, qrCodeData);
      await writeConnectionStatus({ isConnected: false });
      io.emit("qr", qrCodeData);
      io.emit("status", "Silakan pindai QR code untuk terhubung.");
    }

    if (connection === "close") {
      const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
      
      if (shouldReconnect) {
        console.log("Koneksi terputus, mencoba menyambungkan kembali...");
        io.emit("status", "Koneksi terputus. Menyambungkan kembali...");
        main();
      } else {
        console.log("Koneksi ditutup karena kesalahan otentikasi. Hapus kredensial lama.");
        await deleteFile(QR_FILE_PATH);
        await writeConnectionStatus({ isConnected: false });
        io.emit("qr", null);
        io.emit("status", "Koneksi terputus. Silakan refresh untuk QR code baru.");
      }
    } else if (connection === "open") {
      console.log("Koneksi WhatsApp berhasil dibuka!");
      await deleteFile(QR_FILE_PATH);
      await writeConnectionStatus({ isConnected: true });
      io.emit("qr", null);
      io.emit("status", "WhatsApp berhasil terhubung!");
      io.emit("connected");
    }
  });

  socket.ev.on("messages.upsert", async ({ messages }: any) => {
    const msg = messages[0];
    if (msg.key.fromMe) return; 

    const number = msg.key.remoteJid;
    const message = msg.message?.extendedTextMessage?.text ?? msg.message?.conversation;
    console.log(`Pesan diterima dari ${number}: ${message}`);

    const payload = {
      id: msg.key,
      message: message,
    };

    
    try {
        await fetch(`${n8nUrl}/webhook-test/whatsapp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        await fetch(`${n8nUrl}/webhook/whatsapp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch (error) {
        console.error("Gagal mengirim webhook ke n8n:", error);
    }
  });

  socket.ev.on("creds.update", saveCreds);
}




app.get("/", async (req, res) => {
  const status = await readConnectionStatus();
  let initialQr = null;
  let initialStatus = "Menghubungkan...";
  let isInitiallyConnected = status.isConnected;

  if (isInitiallyConnected) {
    initialStatus = "Berhasil Terkoneksi";
  } else {
    try {
      initialQr = await fs.readFile(QR_FILE_PATH, "utf-8");
      if (initialQr) {
        initialStatus = "Silakan pindai QR code untuk terhubung.";
      }
    } catch (error) {
      
    }
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp QR Login</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; background-color: #f0f2f5; margin: 0; }
            #container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            h1 { font-size: 24px; color: #1c1e21; }
            p { font-size: 16px; color: #606770; }
            #qr-code { display: ${!isInitiallyConnected && initialQr ? 'block' : 'none'}; margin-top: 20px; }
            #qr-code img { max-width: 100%; height: auto; }
            #checkmark { display: ${isInitiallyConnected ? 'block' : 'none'}; margin-top: 20px; }
        </style>
        <script src="/socket.io/socket.io.js"></script>
    </head>
    <body>
        <div id="container">
            <h1>Status Koneksi WhatsApp</h1>
            <p id="status">${initialStatus}</p>
            <div id="qr-code">
                <img src="${initialQr || ''}" alt="QR Code" />
            </div>
            <div id="checkmark">
                <svg xmlns="http:
            </div>
        </div>
        <script>
            const socket = io();
            const qrCodeDiv = document.getElementById('qr-code');
            const qrCodeImg = qrCodeDiv.querySelector('img');
            const checkmarkDiv = document.getElementById('checkmark');
            const statusP = document.getElementById('status');

            socket.on('qr', (qr) => {
                checkmarkDiv.style.display = 'none';
                if (qr) {
                    qrCodeImg.src = qr;
                    qrCodeDiv.style.display = 'block';
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
  const number = req.query.number;
  if (!number) {
     res.status(400).json({ error: "Parameter 'number' tidak ditemukan." });
     return;
  }

  const status = await readConnectionStatus();
  if (!status.isConnected) {
     res.status(409).json({ error: "WhatsApp tidak terhubung." });
     return;
  }

  try {
    await socket.sendPresenceUpdate('composing', number as string);
    res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("Gagal mengirim presence update:", error);
    res.status(500).json({ error: "Gagal mengirim presence update." });
  }
});


app.post("/webhook/send", async (req, res) => {
  const status = await readConnectionStatus();
  if (!status.isConnected) {
      res.status(409).json({ error: "WhatsApp tidak terhubung." });
      return
  }

  const { number, message } = req.body;
  if (!number || !message) {
       res.status(400).json({ error: "Parameter 'number' atau 'message' tidak ditemukan." });
       return
  }

  console.log(`Webhook diterima untuk ID: ${number}, Pesan: ${message}`);
  try {
    const [result]:any = await socket.onWhatsApp(number);
    if (!result?.exists) {
         res.status(404).json({ error: "Nomor tidak terdaftar di WhatsApp." });
         return
    }
    await socket.sendMessage(result.jid, { text: message });
    res.status(200).json({ status: "Pesan berhasil dikirim." });
  } catch (error) {
    console.error("Gagal mengirim pesan:", error);
    res.status(500).json({ error: "Gagal mengirim pesan." });
  }
});



server.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});

main();