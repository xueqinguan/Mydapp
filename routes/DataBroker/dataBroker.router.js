const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const openssl = require('openssl-nodejs');
const moment = require('moment');


// session
const passport = require('passport');
const LocalStrategy = require('passport-local');


const config = JSON.parse(fs.readFileSync('./config/server_config.json', 'utf-8'));
const identityManager = JSON.parse(fs.readFileSync('./contracts/identityChain/identityManager.json', 'utf-8'));
const personalIdentity = JSON.parse(fs.readFileSync('./contracts/identityChain/PersonalIdentity.json', 'utf-8'));
var contract_address = config.contracts.identityManagerAddress;
const databrokerAddress = config.databroker.address;
const privateKey = config.databroker.key

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.WebsocketProvider(config.web3_provider));

//fabric SDK and Util
const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const { buildCAClient, enrollAdmin, registerAndEnrollUser, getAdminIdentity } = require('../../util/CAUtil');
const { buildCCPOrg1, buildWallet } = require('../../util/AppUtil');

// node version should up to 14
const { ethers } = require('ethers');
const { decrypt, encrypt } = require("eth-sig-util")


const require_signature = "databroker?nonce:666";

var caClient;
var accChannel, accInstance;
var wallet;
var mspDatabroker;
var gateway;
var adminUser;



module.exports = function (dbconnection) {
    const Mapping = dbconnection.model('mappings', require('../../models/DataBroker/mapping'));
    const User = dbconnection.model('users', require('../../models/DataBroker/user'))
    let delay = async (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
    async function opensslDecode(buffer_input) {
        return new Promise(function (reslove, reject) {
            openssl(['req', '-text', '-in', { name: 'key.csr', buffer: buffer_input }, '-pubkey'], function (err, result) {
                reslove(result.toString())
            })
        })
    }
    async function init() {
        //console.log('google router init()');
        await delay(3000);

        // build an in memory object with the network configuration (also known as a connection profile)
        const ccp = buildCCPOrg1();

        // build an instance of the fabric ca services client based on
        // the information in the network configuration
        caClient = buildCAClient(FabricCAServices, ccp, 'ca.org1.example.com');

        const walletPath = path.join(__dirname, '../../wallet/databroker');
        wallet = await buildWallet(Wallets, walletPath);

        mspOrg1 = 'Org1MSP';
        await enrollAdmin(caClient, wallet, mspOrg1);//remember to change ca url http to https

        //get ca admin to register and enroll user
        adminUser = await getAdminIdentity(caClient, wallet)

        // in a real application this would be done only when a new user was required to be added
        // and would be part of an administrative flow
        await registerAndEnrollUser(caClient, wallet, mspOrg1, 'databroker' /*, 'org1.department1'*/);


        // Create a new gateway instance for interacting with the fabric network.
        // In a real application this would be done as the backend server session is setup for
        // a user that has been verified.
        gateway = new Gateway();

        //console.log(JSON.stringify(gateway));
        await gateway.connect(ccp, {
            wallet,
            identity: 'databroker',
            discovery: { enabled: true, asLocalhost: true } // using asLocalhost as this gatewayOrg2 is using a fabric network deployed locally
        });

        accChannel = await gateway.getNetwork('acc-channel');
        accInstance = await accChannel.getContract('AccessControlManager');
    }

    var isAuthenticated = function (req, res, next) {
        // console.log('isAuthenticated : ' + req.isAuthenticated());
        if (req.isAuthenticated()) {
            next();
        } else {
            req.flash('info', 'Login first.');
            res.redirect('/appChain/DataBroker');
        }
    };
    passport.use('local', new LocalStrategy({
        usernameField: 'account',
        passwordField: 'signature',
        passReqToCallback: true
    }, async function (req, username, password, done) {
        if (req.hashed && req.pubkey) {
            // Mapping DB data: identity => address, pubkey => pubkey
            return done(null, { 'identity': username.toLowerCase(), 'pubkey': req.pubkey, 'userType': req.userType });
        }
    }));
    router.get('/', (req, res) => {
        res.render('appChain/DataBroker/homepage', { 'require_signature': require_signature, 'contract_address': contract_address });
    });

    router.post('/loginWithMetamask', async function (req, res, next) {
        const address = req.body.account.toLowerCase();

        let { account, signature } = req.body;
        let signingAccount = web3.eth.accounts.recover(require_signature, signature).toLowerCase();


        if (signingAccount != account.toLowerCase()) {
            return res.send({ 'msg': 'Failed to verify signature' });
        }

        let { identity, userType } = req.body;   //DID  userType=>user: 0   org: 1


        let identityManagerInstance = new web3.eth.Contract(identityManager.abi, contract_address);

        if (identity) {
            // Verify from the database whether the user is logging in for the first time
            var pubkey;
            try {
                let result = await Mapping.findOne({ address: account.toLowerCase() });
                pubkey = result.pubkey;
                //console.log(pubkey);
            } catch {
                pubkey = null;
            }

            //check is first time login?
            if (pubkey) {       //not first time
                req.hashed = identity;
                req.pubkey = pubkey;
                req.userType = userType;
                next();
            } else {            //first time login
                let PIContractAddress = await identityManagerInstance.methods.getAccessManagerAddress(account).call({ from: account });
                let personalIdentityInstance = new web3.eth.Contract(personalIdentity.abi, PIContractAddress);

                let EncryptCSRHex = await personalIdentityInstance.methods.getEncryptMaterial("HLFCSR").call({ from: account });

                //If upgrading to the latest version does not fix the issue, try downgrading to a previous version of the ethers library. You can specify a version number when installing the ethers library using the npm package manager.

                let EncryptCSR = JSON.parse(ethers.utils.toUtf8String(EncryptCSRHex));
                let CSR = decrypt(EncryptCSR, privateKey);
                let CSRDecode = await opensslDecode(Buffer.from(CSR));

                // // Decode CSR to get CN and pubkey.
                const regex = /CN=([^\s]+)\s+/;
                let CN = CSRDecode.match(regex)[1];
                //let CN = CSRDecode.substr(CSRDecode.indexOf('CN=') + 3, account.length);
                let start_index = '-----BEGIN PUBLIC KEY-----'.length
                let end_index = CSRDecode.indexOf('-----END PUBLIC KEY-----')
                let pubkey_base64 = CSRDecode.substring(start_index, end_index).replace(/\n/g, '');
                let pubkey_hex = Buffer.from(pubkey_base64, 'base64').toString('hex');
                pubkey_hex = pubkey_hex.substr('3059301306072a8648ce3d020106082a8648ce3d030107034200'.length)


                if (CN) {
                    try {
                        // first time login this appChain
                        let attrs = [
                            { name: 'category', value: 'dataProvider', ecert: true }
                        ]
                        //console.log(adminUser);
                        let secret = await caClient.register({
                            enrollmentID: CN,
                            role: 'client',
                            attrs: attrs
                        }, adminUser);

                        let enrollment = await caClient.enroll({
                            csr: CSR,
                            enrollmentID: CN,
                            enrollmentSecret: secret
                        });

                        const x509Identity = {
                            credentials: {
                                certificate: enrollment.certificate
                            },
                            mspId: mspOrg1,
                            type: 'X.509',
                        };
                        await wallet.put(CN, x509Identity);
                        console.log('\x1b[33m%s\x1b[0m', "create x509 cert successfully.");
                    } catch (error) {
                        console.log('\x1b[33m%s\x1b[0m', `${CN} already register in ca`);
                    }
                    try {
                        // console.log(pubkey_hex);

                        var result = await accInstance.submitTransaction('AddPersonalAccessControl', pubkey_hex);
                        //console.log('\x1b[33m%s\x1b[0m', result.toString());

                        //console.log('transaction finish');

                        const mapping = new Mapping({ address: account.toLowerCase(), pubkey: pubkey_hex });
                        await mapping.save();
                        req.hashed = DID;
                        req.pubkey = pubkey_hex;
                        next();
                    }
                    catch (e) {
                        return res.send({ 'msg': 'create acc error.' });
                    }
                } else {
                    console.log("CN and account are not match.")
                    return res.send({ 'msg': 'CN and account are not match.' });
                }
            }
        } else {
            return res.send({ 'msg': 'DID dose not exist.' });
        }
    },
        passport.authenticate('local'),
        async function (req, res) {
            res.send({ url: "/appChain/DataBroker/profile" });
        });
    router.get('/profile', isAuthenticated, async (req, res) => {

        let { identity, pubkey, userType } = req.user;
        let DB_filter = {
            'pubkey': pubkey
        }
        let user = await User.findOne(DB_filter);

        //first time login should fill in some information
        if (!user && userType == 0) {
            res.render('appChain/DataBroker/aboutme', { address: identity, pubkey });
        } else if (user && userType == 0) {
            res.render('appChain/DataBroker/profile', { address: identity });
        }

    });
    router.post('/aboutme', isAuthenticated, async (req, res) => {
        // console.log(req.body);
        const address = req.session.address;
        let { pubkey, gender, age, height, weight } = req.body;
        const newUser = new User({
            pubkey: pubkey,
            gender: gender,
            age: age,
            height: height,
            weight: weight
        });
        await newUser.save();
        res.render('appChain/DataBroker/profile', { address: address });
    });

    // router.get('/profile', async (req, res) => {

    //     // let address = req.user.identity.toLowerCase();
    //     // let result = await Mapping.findOne({ address: address });
    //     // // check binding
    //     // if (result.deviceID.length == 0) {
    //     //     res.render('appChain/google/bind', { "address": address });
    //     // } else {
    //     //     // let r = await accInstance.submitTransaction('Deletekey', req.user.pubkey);
    //     //     // console.log(r.toString());
    //     //     // result.deviceID = [];
    //     //     // await result.save();


    //     //     // let acc = await accInstance.evaluateTransaction('GetUserAccControl', req.user.pubkey);
    //     //     // let accJson = JSON.parse(acc.toString());
    //     //     // console.log(accJson);
    //     // }


    //     //return res.render("appChain/google/bind.ejs", { "address": req.user.identity });

    //     let acc = await accInstance.evaluateTransaction('GetUserAccControl', req.user.pubkey);
    //     let accJson = JSON.parse(acc.toString())

    //     // get reviewer list
    //     // reviewerList = {};
    //     // let reviewers = await certInstance.evaluateTransaction("getReviewer");
    //     // reviewers = JSON.parse(reviewers.toString())
    //     // reviewers.forEach(function (object, index, array) {
    //     //     let value = JSON.parse(object.value)
    //     //     reviewerList[value.pubkey] = value.reviewerName
    //     // });
    //     // console.log(reviewerList)
    //     console.log(accJson);
    //     // let reviewerList = {};
    //     return res.render("appChain/google/review.ejs", { "acc": accJson, "contract_address": contract_address, "user": req.user.identity })
    // });
    router.get('/logout', (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                console.error(err);
            } else {
                res.redirect('/appChain/DataBroker');
            }
        });
    });
    init();
    module.exports = router;
    return router;
}