const { Client, LocalAuth, WAState, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const db = require('../db');
const multer = require('multer');
const upload = multer();
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn;
const ensureLoggedIn = ensureLogIn();
const express = require('express');

const clients = new Map();

// initialize all saved clients in database at the start of the program
initializeAllClients();

function initializeAllClients() {
    db.each("SELECT session FROM wasessions where status='ready'", (err, row) => {
        initializeClient(row.session);
    });
}

// initialize a whatsapp client
function initializeClient(sessionName) {
    console.log("initialzing whatsapp for " + sessionName);
    const client = new Client({
        puppeteer: {
            args: ['--no-sandbox']
        },
        authStrategy: new LocalAuth({ clientId: sessionName })
    });
    client.on('qr', async (qr) => {
        console.log('QR Received!');
        const qrDataURL = await qrcode.toDataURL(qr);
        db.run(
            'insert or replace INTO wasessions (session,qrcode) VALUES (?,?)',
            [sessionName, qrDataURL],
            function (err) {
                if (err) {
                    return console.log(err.message);
                }
            }
        );
    });

    client.on('ready', () => {
        console.log('Whatsapp Is Ready!');
        db.run("UPDATE wasessions SET status='ready' WHERE session = ?",
            [sessionName],
            function (err) {
                if (err) {
                    return console.log(err.message);
                }
            }
        );
    });

    client.on('disconnected', () => {
        console.log('Whatsapp Disconnected ' + sessionName);
        db.run('DELETE from wasessions WHERE session = ?', [
            sessionName
        ]);
    });
    client.initialize();
    clients.set(sessionName, client);
}

const router = express.Router();

// Example GET endpoint to generate QR code
router.get('/api/generate-qr/:sessionName', ensureLoggedIn, (req, res) => {
    const sessionName = req.params.sessionName;
    if (!clients.has(sessionName)) {
        initializeClient(sessionName);
    }
    db.get('SELECT * FROM wasessions WHERE session = ?', [sessionName], function (err, row) {
        if (row.status == 'ready') {
            const client = clients.get(sessionName);
            let info = client.info;
            res.json({ qr: info.wid.user + ' already connected' })
        } else {
            res.json({ qr: row.qrcode })
        }
    });
});

function processNumbers(phoneNumbers) {
    if (phoneNumbers) {
        return phoneNumbers.split(",");
    }
}

// Endpoint to send WhatsApp message
router.post('/api/send-whatsapp/:sessionName', upload.single('file'), async (req, res) => {
    const file = req.file;
    const sessionName = req.params.sessionName;
    const phoneNumbers = req.body.phoneNumber;
    const message = req.body.message;

    const dest = processNumbers(phoneNumbers);

    try {
        if (clients.has(sessionName)) {
            const client = clients.get(sessionName);
            const state = await client.getState();
            console.log("Whatsapp state is " + state);
            await dest.forEach(element => {
                if (state == WAState.CONNECTED) {
                    if (file) {
                        const media = new MessageMedia(file.mimetype, file.buffer.toString('base64'), file.originalname, file.size);
                        client.sendMessage(element + '@c.us', media, { caption: message });
                    } else {
                        client.sendMessage(element + '@c.us', message);
                    }
                }
            });

            res.json({
                sessionName: sessionName,
                phoneNumber: phoneNumbers,
                message: message,
                status: 'Message sent'
            });
        } else {
            res.status(400).json({ error: 'Session not found' });
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
});

// Serve the UI HTML page
router.get('/', ensureLoggedIn, (req, res) => {
    res.render('index', { user: req.user });
});

module.exports = router;