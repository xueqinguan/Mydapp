const express = require('express');
const fs = require('fs');
const router = express.Router();

// session
const passport = require('passport');
const LocalStrategy = require('passport-local');


const config = JSON.parse(fs.readFileSync('./config/server_config.json', 'utf-8'));
var contract_address = config.contracts.identityManagerAddress;
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.WebsocketProvider(config.web3_provider));

// DB config

// DB 
const Org = require('../../models/organization');
const Manufacturer = require('../../models/manufacturer');

const require_signature = "government?nonce:666";

var isAuthenticated = function (req, res, next) {
    // console.log('isAuthenticated : ' + req.isAuthenticated());
    if (req.isAuthenticated()) {
        next();
    } else {
        req.flash('info', 'Login first.');
        res.redirect('/appChain/MinistryOfHealthandWelfare');
    }
};

// render to MinistryofHealthandWelfare homepage
// url : http://localhost:3000/appChain/MinistryofHealthandWelfare
router.get('/', (req, res) => {
    res.render('appChain/MinistryOfHealthandWelfare/homepage', { 'require_signature': require_signature, 'contract_address': contract_address });
});

// Override those field if you don'y need it
// https://stackoverflow.com/questions/35079795/passport-login-authentication-without-password-field
passport.use('verifySign_MinistryOfHealthandWelfare', new LocalStrategy({
    usernameField: 'account',
    passwordField: 'signature',
    passReqToCallback: true
},
    async function (req, username, password, done) {
        await Org.findOne({ address: username.toLowerCase() })
            .then(function (obj) {
                if (!obj) {
                    // console.log('only organization can login');
                    return done(null, false);
                    // res.render('appChain/MinistryOfHealthandWelfare/apply', { address: address });
                } else {
                    let account = username.toLowerCase(); //address
                    let signature = password;
                    signingAccount = web3.eth.accounts.recover(require_signature, signature).toLowerCase();

                    if (signingAccount == account) {
                        return done(null, { "address": account });
                    }
                    else {
                        return done(null, false);
                    }
                }
            })
            .catch(function (err) {
                console.log(err);
            });

    }
));

router.post('/loginWithMetamask', passport.authenticate('verifySign_MinistryOfHealthandWelfare', {
    failureRedirect: '/appChain/MinistryOfHealthandWelfare'
}), async function (req, res) {
    const address = req.user.address;
    res.send({ 'url': '/appChain/MinistryOfHealthandWelfare/profile?address=' + address });
});


router.get('/profile', isAuthenticated, async (req, res) => {
    const address = req.query.address;
    //console.log('profile = ' + address);
    await Manufacturer.findOne({ address: address })
        .then(function (obj) {
            if (!obj) {
                // console.log('obj not found');
                res.render('appChain/MinistryOfHealthandWelfare/apply', { address: address });
            } else {
                // console.log('obj found');
                res.render('appChain/MinistryOfHealthandWelfare/profile', { address: address, devices: obj.device });
            }
        })
        .catch(function (err) {
            console.log(err);
            res.redirect('appChain/MinistryOfHealthandWelfare/apply', { address: address });
        });
})
const generateDeviceId = () => {
    const deviceIdLength = 20; // Set the desired length of the device ID
    let deviceId = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < deviceIdLength; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        deviceId += characters.charAt(randomIndex);
    }

    return deviceId;
}

router.post('/deviceRegister', isAuthenticated, async (req, res) => {
    let { manufacturer, address, type, number } = req.body;
    let obj = await Manufacturer.findOne({ address: address.toLowerCase() });

    // The first applying manufacturer will first store the 
    // manufacturer name and address in the database
    if (!obj) {
        let newManufacturer = new Manufacturer({
            Manufacturer: manufacturer,
            address: address.toLowerCase()
        })
        await newManufacturer.save();
    }


    // Generate device ID and its associated information
    let deviceArr = [];
    for (let i = 0; i < number; i++) {
        let tmp = {
            device_ID: generateDeviceId(),
            device_type: type,
            manufactured_Date: new Date()
        }

        deviceArr.push(tmp);
    }



    await Manufacturer.findOneAndUpdate(
        { address: address.toLowerCase() },
        { $push: { device: deviceArr } },
        { new: true }
    )
        .then((doc) => {
            res.redirect('/appChain/MinistryOfHealthandWelfare/profile?address=' + address.toLowerCase());
            // res.redirect('appChain/MinistryOfHealthandWelfare/profile', { address: address, devices: doc.device });
        })
        .catch((err) => {
            console.error(err);
        });
});

router.get('/apply', (req, res) => {
    res.render('appChain/MinistryOfHealthandWelfare/apply');
});

router.get('/logout', function (req, res) {
    req.session.destroy(function (err) {
        if (err) {
            console.error(err);
        } else {
            res.redirect('/appChain/MinistryOfHealthandWelfare');
        }
    });
});



module.exports = router; 