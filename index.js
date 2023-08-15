const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app);
const socketIo = require('socket.io');
const io = socketIo(server);
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const bodyParser = require('body-parser');

app.use(bodyParser.json());

const clients = new Map();

// Example GET endpoint to generate QR code
app.get('/api/generate-qr/:sessionName', (req, res) => {
    const sessionName = req.params.sessionName;
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionName })
    });
    client.on('qr', async (qr) => {
        const qrDataURL = await qrcode.toDataURL(qr);
        existingSession = qrDataURL; // Update existing session
        io.emit('newQRCode', qrDataURL);
    });

    client.on('ready', () => {
        io.emit('ready', "Client is ready!");
        console.log('Client is ready!');
    });

    client.initialize();
    clients.set(sessionName, client);
    res.json({ status: 'QR request submitted succesfully' });
});



// Endpoint to send WhatsApp message
app.post('/api/send-whatsapp/:sessionName', async (req, res) => {
    const sessionName = req.params.sessionName;
    const phoneNumber = req.body.phoneNumber;
    const message = req.body.message;

    try {
        if (clients.has(sessionName)) {
            const client = clients.get(sessionName);

            // const chat = await client.getChatById(phoneNumber + '@c.us');
            await client.sendMessage(phoneNumber + '@c.us', message);

            res.json({
                sessionName: sessionName,
                phoneNumber: phoneNumber,
                message: message,
                status: 'Message sent'
            });
        } else {
            res.status(400).json({ error: 'Session not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve the UI HTML page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html'); // Make sure ui.html is in the same directory as this script
});

server.listen(3000, () => {
    console.log(`Server is running on port 3000`);
});
