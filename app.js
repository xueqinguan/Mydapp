const path = require('path')
const express = require('express');
const mongoose = require('mongoose');
const flash = require('connect-flash');
const session = require('express-session');
const passport = require('passport');
const bodyParser = require('body-parser');


const app = express();

// DB config
const db1 = require('./config/keys').GovernmentDB_URI;
const db2 = require('./config/keys').DataCustodianDB_1_URI;


//connect to Mongo(success)
// mongoose.connect(db, { useNewUrlParser: true })
//     .then(() => console.log('MongoDB connected....'))
//     .catch(err => console.log(err));

const db1Connection = mongoose.createConnection(db1, { useNewUrlParser: true });
db1Connection.once('open', () => console.log(`Connected to ${db1}...`));

// const db2Connection = mongoose.createConnection(db2, { useNewUrlParser: true });
// db1Connection.once('open', () => console.log(`Connected to ${db2}...`));


// Body parser
app.use(express.urlencoded({ extended: false }));

// Express session
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true,
}));

// Connect flash
app.use(flash());

// Global Vars
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msh');
    next();
});


app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
passport.serializeUser(function (user, done) {
    done(null, user);
});

passport.deserializeUser(function (user, done) {
    done(null, user);
});

//EJS 
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/contracts', express.static(__dirname + '/contracts/identityChain/'));
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))


// Routes
app.use('/identityChain', require('./routes/identityChain/identityChain')(db1Connection));
app.use('/appChain', require('./routes/appchain'));
const PORT = process.env.PORT || 3000;

app.listen(PORT, console.log(`http://localhost:${PORT}/identityChain`));