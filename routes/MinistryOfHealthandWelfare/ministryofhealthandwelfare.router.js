const express = require('express');
const fs = require('fs');
const router = express.Router();
const moment = require('moment');


// session
const passport = require('passport');
const LocalStrategy = require('passport-local');


const config = JSON.parse(fs.readFileSync('./config/server_config.json', 'utf-8'));
var contract_address = config.contracts.identityManagerAddress;
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.WebsocketProvider(config.web3_provider));

// DB config


const require_signature = "government?nonce:666";

module.exports = function (dbconnection) {
    // Manufacturer and Org model (mongoose)
    const Manufacturer = dbconnection.model('manufactures', require('../../models/Government/manufacturer'));
    const Org = dbconnection.model('orgs', require('../../models/Government/organization'));



    var isAuthenticated = function (req, res, next) {
        // console.log('isAuthenticated : ' + req.isAuthenticated());
        if (req.isAuthenticated()) {
            next();
        } else {
            req.flash('info', 'Login first.');
            res.redirect('/appChain/MinistryOfHealthandWelfare');
        }
    };

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
        req.session.address = address;
        res.send({ 'url': '/appChain/MinistryOfHealthandWelfare/profile' });
        // res.send({ 'url': '/appChain/MinistryOfHealthandWelfare/profile?address=' + address });
    });


    router.get('/profile', isAuthenticated, async (req, res) => {
        const address = req.session.address;
        //console.log('profile = ' + address);
        await Manufacturer.findOne({ address: address })
            .then(function (obj) {
                if (!obj) {
                    // console.log('obj not found');
                    res.render('appChain/MinistryOfHealthandWelfare/apply', { address: address });
                } else {
                    const formattedDevices = obj.device.map(device => {
                        return {
                            device_ID: device.device_ID,
                            device_type: device.device_type,
                            manufactured_Date: moment(device.manufactured_Date).format('YYYY-MM-DD hh:mm:ss')
                        }
                    });
                    res.render('appChain/MinistryOfHealthandWelfare/profile', { address: address, devices: formattedDevices });
                }
            })
            .catch(function (err) {
                console.log(err);
                res.redirect('appChain/MinistryOfHealthandWelfare/apply', { address: address });
            });
    })


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
            let tmpObj = {
                device_ID: generateDeviceId(),
                device_type: type,
                manufactured_Date: new Date()
            }
            deviceArr.push(tmpObj);
        }



        await Manufacturer.findOneAndUpdate(
            { address: address.toLowerCase() },
            { $push: { device: deviceArr } },
            { new: true }
        )
            .then((doc) => {
                res.redirect('/appChain/MinistryOfHealthandWelfare/profile');
                // res.redirect('appChain/MinistryOfHealthandWelfare/profile', { address: address, devices: doc.device });
            })
            .catch((err) => {
                console.error(err);
            });
    });

    router.get('/apply', isAuthenticated, (req, res) => {
        const address = req.session.address;
        res.render('appChain/MinistryOfHealthandWelfare/apply', { address: address });
    });
    router.get('/download', async (req, res) => {
        const address = req.session.address;
        await Manufacturer.findOne({ address: address })
            .then(function (obj) {
                if (obj) {
                    // console.log('obj found');
                    const filteredArr = obj.device.map(({ device_ID, device_type }) => ({ device_ID, device_type }));

                    const json = JSON.stringify(filteredArr);
                    const filename = 'download.json';

                    res.setHeader('Content-disposition', 'attachment; filename=' + filename);
                    res.setHeader('Content-type', 'application/json');

                    fs.writeFile(filename, json, function (err) {
                        if (err) {
                            console.log(err);
                            res.status(500).send('Internal server error');
                            return;
                        } else {
                            // 下載檔案
                            res.download(filename, function (err) {
                                if (err) {
                                    console.log(err);
                                    res.status(500).send('Internal server error');
                                }
                                // 刪除檔案
                                fs.unlinkSync(filename);
                            });
                        }
                    });
                }
            })
            .catch(function (err) {
                console.log(err);
                res.redirect('appChain/MinistryOfHealthandWelfare/profile', { address: address });
            });
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
    return router;
}