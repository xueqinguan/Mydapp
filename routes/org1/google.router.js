const express = require('express');
const path = require('path');
const router = express.Router();
const fs = require('fs')
const openssl = require('openssl-nodejs');
const forge = require('node-forge');

const config = JSON.parse(fs.readFileSync('./config/server_config.json', 'utf-8'));
const identityManager = JSON.parse(fs.readFileSync('./contracts/identityChain/identityManager.json', 'utf-8'));
const personalIdentity = JSON.parse(fs.readFileSync('./contracts/identityChain/PersonalIdentity.json', 'utf-8'));
const contract_address = config.contracts.identityManagerAddress;
const googleAddress = config.org_info.google.address;
const privateKey = config.org_info.google.key

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.WebsocketProvider(config.web3_provider));


// DB
const Mapping = require('../../models/mapping');
const User = require('../../models/user');

// Session 
var passport = require('passport');
var LocalStrategy = require('passport-local');

//fabric SDK and Util
const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const { buildCAClient, enrollAdmin, registerAndEnrollUser, getAdminIdentity } = require('../../util/CAUtil');
const { buildCCPOrg1, buildWallet } = require('../../util/AppUtil');

const require_signature = "google?nonce:703";


// node version should up to 14
const { ethers } = require('ethers');
const { decrypt, encrypt } = require("eth-sig-util")

var caClient;
var accChannel, accInstance;
var wallet;
var mspOrg1;
var gateway;
var adminUser;

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

    const walletPath = path.join(__dirname, '../../wallet/google');
    wallet = await buildWallet(Wallets, walletPath);

    mspOrg1 = 'Org1MSP';
    await enrollAdmin(caClient, wallet, mspOrg1);//remember to change ca url http to https

    //get ca admin to register and enroll user
    adminUser = await getAdminIdentity(caClient, wallet)

    // in a real application this would be done only when a new user was required to be added
    // and would be part of an administrative flow
    await registerAndEnrollUser(caClient, wallet, mspOrg1, 'google' /*, 'org1.department1'*/);


    // Create a new gateway instance for interacting with the fabric network.
    // In a real application this would be done as the backend server session is setup for
    // a user that has been verified.
    gateway = new Gateway();

    //console.log(JSON.stringify(gateway));
    await gateway.connect(ccp, {
        wallet,
        identity: 'google',
        discovery: { enabled: true, asLocalhost: true } // using asLocalhost as this gatewayOrg2 is using a fabric network deployed locally
    });

    accChannel = await gateway.getNetwork('acc-channel');
    accInstance = await accChannel.getContract('AccessControlManager');

}

passport.use('local', new LocalStrategy({
    usernameField: 'account',
    passwordField: 'signature',
    passReqToCallback: true
}, async function (req, username, password, done) {
    if (req.hashed && req.pubkey) {
        // Mapping DB data: identity => address, pubkey => pubkey
        return done(null, { 'identity': username.toLowerCase(), 'pubkey': req.pubkey });
    }
}));

router.get('/', (req, res) => {
    //http://localhost:3000/appChain/google
    res.render('appChain/google/homepage', { 'require_signature': require_signature });
})
router.post('/loginWithMetamask', async (req, res, next) => {
    let { account, signature } = req.body;
    let signingAccount = web3.eth.accounts.recover(require_signature, signature).toLowerCase();


    if (signingAccount != account.toLowerCase()) {
        return res.send({ 'msg': 'Failed to verify signature' });
    }


    let identityManagerInstance = new web3.eth.Contract(identityManager.abi, contract_address);
    let DID = await identityManagerInstance.methods.getId().call({ from: account });


    if (DID) {
        // Verify from the database whether the user is logging in for the first time
        var pubkey;
        try {
            let result = await Mapping.findOne({ address: account.toLowerCase() });
            pubkey = result.pubkey;
            //console.log(pubkey);
        } catch {
            pubkey = null;
        }

        // console.log(pubkey);
        if (pubkey) { //pubkey != undefined    
            req.hashed = DID;
            req.pubkey = pubkey;
            next();
        } else { //first time login
            // access control is not exist create one (in ethereum address store lowerCase in ledger.)
            let PIContractAddress = await identityManagerInstance.methods.getAccessManagerAddress(account).call({ from: account });
            let personalIdentityInstance = new web3.eth.Contract(personalIdentity.abi, PIContractAddress);

            let EncryptCSRHex = await personalIdentityInstance.methods.getEncryptMaterial("HLFCSR").call({ from: account });
            //If upgrading to the latest version does not fix the issue, try downgrading to a previous version of the ethers library. You can specify a version number when installing the ethers library using the npm package manager.
            let EncryptCSR = JSON.parse(ethers.utils.toUtf8String(EncryptCSRHex));
            let CSR = decrypt(EncryptCSR, privateKey);
            let CSRDecode = await opensslDecode(Buffer.from(CSR));

            // Decode CSR to get CN and pubkey.
            const regex = /CN=([^\s]+)\s+/;
            let CN = CSRDecode.match(regex)[1];
            //let CN = CSRDecode.substr(CSRDecode.indexOf('CN=') + 3, account.length);
            let start_index = '-----BEGIN PUBLIC KEY-----'.length
            let end_index = CSRDecode.indexOf('-----END PUBLIC KEY-----')
            let pubkey_base64 = CSRDecode.substring(start_index, end_index).replace(/\n/g, '');
            let pubkey_hex = Buffer.from(pubkey_base64, 'base64').toString('hex');
            pubkey_hex = pubkey_hex.substr('3059301306072a8648ce3d020106082a8648ce3d030107034200'.length)

            // Take the account to find the corresponding IDnumber in the database
            let DB_filter = {
                'address': account.toLowerCase()
            }
            let user = await User.findOne(DB_filter);

            //check CN and IDNumber is match
            if (CN == user.IDNumber) {
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
                    console.log(pubkey_hex);

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
        res.send({ url: "/appChain/google/profile" });
    });

router.get('/profile', async (req, res) => {

    // let address = req.user.identity.toLowerCase();
    // let result = await Mapping.findOne({ address: address });
    // // check binding
    // if (result.deviceID.length == 0) {
    //     res.render('appChain/google/bind', { "address": address });
    // } else {
    //     // let r = await accInstance.submitTransaction('Deletekey', req.user.pubkey);
    //     // console.log(r.toString());
    //     // result.deviceID = [];
    //     // await result.save();


    //     // let acc = await accInstance.evaluateTransaction('GetUserAccControl', req.user.pubkey);
    //     // let accJson = JSON.parse(acc.toString());
    //     // console.log(accJson);
    // }


    //return res.render("appChain/google/bind.ejs", { "address": req.user.identity });

    let acc = await accInstance.evaluateTransaction('GetUserAccControl', req.user.pubkey);
    let accJson = JSON.parse(acc.toString())

    // get reviewer list
    // reviewerList = {};
    // let reviewers = await certInstance.evaluateTransaction("getReviewer");
    // reviewers = JSON.parse(reviewers.toString())
    // reviewers.forEach(function (object, index, array) {
    //     let value = JSON.parse(object.value)
    //     reviewerList[value.pubkey] = value.reviewerName
    // });
    // console.log(reviewerList)
    console.log(accJson);
    // let reviewerList = {};
    return res.render("appChain/google/review.ejs", { "acc": accJson, "contract_address": contract_address, "user": req.user.identity })
});
router.post('/deviceBinding', async (req, res) => {
    let { address, deviceID } = req.body;
    let result = await Mapping.findOne({ address });
    result.deviceID.push(deviceID);
    await result.save();
    res.render("appChain/google/profile.ejs", { "address": address });
});

// logout Handler
router.get('/logout', function (req, res) {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        res.redirect('/appChain/google');
    });
});
// init();



module.exports = router; 