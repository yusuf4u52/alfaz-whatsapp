require('dotenv').config();

const express = require('express');
const session = require('express-session');
const https = require('https');
const app = express();
const fs = require('fs');
const path = require('path');
const options = {
    key: fs.readFileSync(path.resolve(__dirname, 'ssl/private.key')),
    cert: fs.readFileSync(path.resolve(__dirname, 'ssl/certificate.crt')),
    ca: fs.readFileSync(path.resolve(__dirname, 'ssl/ca_bundle.crt'))
};
const server = https.createServer(options, app);

const socketIo = require('socket.io');
const io = socketIo(server);
const { Client, LocalAuth, WAState, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const bodyParser = require('body-parser');
const db = require('./db');
const multer = require('multer');
const upload = multer();
const authRouter = require('./routes/auth');
const passport = require('passport');
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn;
const ensureLoggedIn = ensureLogIn();
// pass the session to the connect sqlite3 module
// allowing it to inherit from session.Store
const SQLiteStore = require('connect-sqlite3')(session);


// create rooms for each client
io.on('connection', (socket) => {
    console.log('Websocket connected');

    // Listen for a custom event from the client
    socket.on('subscribe', (room) => {
        // Join a room based on the data from the client
        socket.join(room);
        console.log(`Websocket joined room: ${room}`);
    });
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(bodyParser.json());
const sessionMiddleware = session({
    secret: process.env['SECRET'],
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore({ db: 'sessions.db', dir: './var/db' })
});
app.use(sessionMiddleware);
app.use(passport.authenticate('session'));
app.use('/', authRouter);

// io.engine.use(sessionMiddleware);

const clients = new Map();

// initialize all saved clients in database at the start of the program
initializeAllClients();

function initializeAllClients() {
    db.each("SELECT session FROM wasessions", (err, row) => {
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
        existingSession = qrDataURL; // Update existing session
        io.to(sessionName).emit('newQRCode', qrDataURL);
        io.to(sessionName).emit('connecting');
    });

    client.on('ready', () => {
        console.log('Whatsapp Is Ready!');
        io.to(sessionName).emit('ready');
        db.get('SELECT * FROM wasessions WHERE session = ?', [sessionName], function (err, row) {
            if (!row) {
                // make entry in db
                db.run('INSERT INTO wasessions (session) VALUES (?)', [
                    sessionName
                ]);
            }
        });

    });

    client.on('auth_failure', () => {
        console.log('Whatsapp  Authentication Failure!');
        io.to(sessionName).emit('connecting');
    });

    client.on('authenticated', () => {
        console.log('Whatsapp is Authenticated');
        io.to(sessionName).emit('connecting');
    });

    client.on('disconnected', () => {
        console.log('Whatsapp Disconnected ' + sessionName);
        io.to(sessionName).emit('disconnected');
        db.run('DELETE from wasessions WHERE session = ?', [
            sessionName
        ]);
    });
    client.initialize();
    clients.set(sessionName, client);
}

// Example GET endpoint to generate QR code
app.get('/api/generate-qr/:sessionName', ensureLoggedIn, (req, res) => {
    const sessionName = req.params.sessionName;
    if (!clients.has(sessionName)) {
        initializeClient(sessionName);
    }
    res.json({ status: 'QR request submitted succesfully' });
});


function processNumbers(phoneNumbers) {
    if (phoneNumbers) {
        return phoneNumbers.split(",");
    }
}

// Endpoint to send WhatsApp message
app.post('/api/send-whatsapp/:sessionName', upload.single('file'), async (req, res) => {
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
app.get('/', ensureLoggedIn, (req, res) => {
    console.log(req.user);
    res.sendFile(__dirname + '/index.html'); // Make sure ui.html is in the same directory as this script
});

const httpsPort = 443;
const hostname = "0.0.0.0"
server.listen(httpsPort, hostname, () => {
    console.log(`HTTPS server listening on port ${httpsPort}`);
});