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


const require_signature = "DataCustodian?nonce:778";

const mongoose = require('mongoose');



var isAuthenticated = function (req, res, next) {
    // console.log('isAuthenticated : ' + req.isAuthenticated());
    if (req.isAuthenticated()) {
        next();
    } else {
        req.flash('info', 'Login first.');
        res.redirect('/appChain/DataCustodian');
    }
};

// render to MinistryofHealthandWelfare homepage
// url : http://localhost:3000/appChain/DataCustodian
router.get('/', (req, res) => {
    res.render('appChain/DataCustodian/homepage', { 'require_signature': require_signature, 'contract_address': contract_address });
});
// Override those field if you don'y need it
// https://stackoverflow.com/questions/35079795/passport-login-authentication-without-password-field
passport.use('verifySign_DataCustodian', new LocalStrategy({
    usernameField: 'account',
    passwordField: 'signature',
    passReqToCallback: true
},
    async function (req, username, password, done) {
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
));

router.post('/loginWithMetamask', passport.authenticate('verifySign_DataCustodian', {
    failureRedirect: '/appChain/DataCustodian'
}), async function (req, res) {
    const address = req.user.address;
    console.log('loginWithMetamask = ' + address);
    res.send({ 'url': '/appChain/DataCustodian/profile?address=' + address });
});



//04585a8fca69fd68282d08e1c9b751f7037e59f7642a83bca8178018a25c1b9d769c0088e288836abd1de418cf772c9ccf2746c795d574a072110011e847937d9e
router.get('/profile', isAuthenticated, async (req, res) => {
    const address = req.query.address;

    // await deviceBinding.findOne({ address: address })
    //     .then(function (obj) {
    //         if (!obj) {
    //             console.log('obj not found');
    //             res.render('appChain/DataCustodian/deviceBinding', { address: address });
    //         } else {
    //             console.log('obj found');
    //             res.render('appChain/DataCustodian/profile', { address: address, devices: obj.device });
    //         }
    //     })
    //     .catch(function (err) {
    //         console.log(err);
    //         res.redirect('appChain/DataCustodian/deviceBinding', { address: address });
    //     });
});

router.get('/deviceBinding', (req, res) => {
    res.render('appChain/DataCustodian/deviceBinding');
});

router.post('/deviceBinding', (req, res) => {
    //console.log(req.body);
    let { pubkey, address, type, deviceID } = req.body;
    console.log(deviceID);
    console.log(type);
    // deviceID_typeModel.findOne({ device_ID: deviceID, device_type: type })
    //     .then((obj) => {
    //         if (obj)
    //             console.log(obj)
    //         else {
    //             console.log(obj);
    //         }
    //     })
})

router.get('/logout', function (req, res) {
    req.session.destroy(function (err) {
        if (err) {
            console.error(err);
        } else {
            res.redirect('/appChain/DataCustodian');
        }
    });
});

module.exports = router; 