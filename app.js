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

const bodyParser = require('body-parser');
const authRouter = require('./routes/auth');
const indexRouter = require('./routes/index');
const passport = require('passport');

// pass the session to the connect sqlite3 module
// allowing it to inherit from session.Store
const SQLiteStore = require('connect-sqlite3')(session);

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
app.use('/', indexRouter);

const httpsPort = 443;
const hostname = "0.0.0.0"
server.listen(httpsPort, hostname, () => {
    console.log(`HTTPS server listening on port ${httpsPort}`);
});