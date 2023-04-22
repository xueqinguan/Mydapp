const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const openssl = require('openssl-nodejs');

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
const fabric_common = require("fabric-common");
const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const { buildCAClient, enrollAdmin, registerAndEnrollUser, getAdminIdentity, buildCertUser } = require('../../util/CAUtil');
const { buildCCPOrg1, buildWallet } = require('../../util/AppUtil');

// node version should up to 14
const { ethers } = require('ethers');
const { decrypt, encrypt } = require("eth-sig-util");


//hash function
var cryptoSuite = fabric_common.Utils.newCryptoSuite()
var hashFunction = cryptoSuite.hash.bind(cryptoSuite)

const require_signature = "databroker?nonce:666";

var caClient;
var accChannel, accInstance;
var wallet;
var mspDatabroker;
var gateway;
var adminUser;

var updatePermission = {};
var revokePermission = {};

var authorizedList = {};



module.exports = function (dbconnection) {
    const Mapping = dbconnection.model('mappings', require('../../models/DataBroker/mapping'));
    const Dataprovider = dbconnection.model('dataproviders', require('../../models/DataBroker/dataprovider'));
    const DataRequester = dbconnection.model('datarequester', require('../../models/DataBroker/datarequester'));


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
            discovery: { enabled: true, asLocalhost: true }
        });

        accChannel = await gateway.getNetwork('acc-channel');
        accInstance = await accChannel.getContract('AccessControlManager');

        UpdateAuthorizeList();
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
                        await wallet.put(address, x509Identity);
                        console.log('\x1b[33m%s\x1b[0m', "create x509 cert successfully.");
                    } catch (error) {
                        console.log('\x1b[33m%s\x1b[0m', `${CN} already register in ca`);
                    }
                    try {
                        // console.log(pubkey_hex);

                        var result = await accInstance.submitTransaction('AddPersonalAccessControl', pubkey_hex);
                        console.log('\x1b[33m%s\x1b[0m', result.toString());

                        console.log('transaction finish');

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
        let dataprovider = await Dataprovider.findOne(DB_filter);
        let datarequester = await DataRequester.findOne(DB_filter);
        if (dataprovider) {
            res.redirect('./authorize');
        } else if (datarequester) {
            res.redirect('./request');
        } else {
            res.render('appChain/DataBroker/profile', { address: identity });
        }
    });

    router.get('/authorize', isAuthenticated, async (req, res) => {
        // Find all data requesters for this platform from the database
        let ALLdataRequesters = await DataRequester.find({}, { name: 1, address: 1, _id: 0 });
        ALLdataRequesters = ALLdataRequesters.sort((a, b) => {
            return a.name.localeCompare(b.name);
        });

        // Read user's ACL
        let acc = await accInstance.evaluateTransaction('GetUserAccControl', req.user.pubkey);
        let accJson = JSON.parse(acc.toString());
        const permissionData = accJson.Permission;

        const permissionDataArray = [];

        for (const [requestName, authorizedData] of Object.entries(permissionData)) {
            const authorizedDataArray = [];

            for (const [dataType, { custodian, startTime, endTime }] of Object.entries(authorizedData)) {
                authorizedDataArray.push({
                    dataType,
                    custodian,
                    startTime,
                    endTime,
                    operation: 'revoke'
                });
            }

            permissionDataArray.push({
                requestName,
                authorizedData: authorizedDataArray
            });
        }
        res.render('appChain/DataBroker/authorize', { address: req.user.identity, ALLdataRequesters: ALLdataRequesters, contract_address: contract_address, permissionData: permissionDataArray });
    });

    router.get('/request', isAuthenticated, async (req, res) => {
        res.render('appChain/DataBroker/request', { address: req.user.identity });
    })

    router.post('/dataprovider', isAuthenticated, async (req, res) => {
        let { pubkey, gender, age, height, weight } = req.body;
        const newProvider = new Dataprovider({
            pubkey: pubkey,
            gender: gender,
            age: age,
            height: height,
            weight: weight
        });
        await newProvider.save();
        res.redirect('./authorize');
    });

    router.post('/datarequester', isAuthenticated, async (req, res) => {
        let { pubkey, rqname } = req.body;
        const newRequester = new DataRequester({
            pubkey: pubkey,
            address: req.user.identity,
            name: rqname
        });
        await newRequester.save();
        res.redirect('./request');
    });

    router.post("/updatePermission", isAuthenticated, async function (req, res) {
        let { rqname, custodian, data, starttime, endtime } = req.body;

        try {
            let acc = await accInstance.evaluateTransaction('GetUserAccControl', req.user.pubkey);
            let accJson = JSON.parse(acc.toString());


            // check orgPubkey exist
            //  async UpdatePermission(ctx, dataRequesterName, dataType, startTime = 0, endTime = -1) {

            const digest = await createTransaction(req.user.identity, 'UpdatePermission', rqname, custodian, data, starttime, endtime);
            return res.send({ 'digest': digest });
        } catch (e) {
            console.log('e = ' + e)
            return res.send({ 'error': "error", "result": e })
        }
    });

    router.post("/revokePermission", isAuthenticated, async function (req, res) {
        let { rqname, custodian, data } = req.body;
        try {
            const digest = await createTransaction(req.user.identity, 'RevokePermission', rqname, custodian, data);
            return res.send({ 'digest': digest })
        }
        catch (e) {
            console.log(e)
            return res.send({ 'error': "error", "result": e })
        }
    })

    router.post("/revokeAuthorizeList", isAuthenticated, async function (req, res) {
        let { rqname, custodian, data } = req.body;
        let pubkey = req.user.pubkey;
        console.log('authorizedList (front) = ' + JSON.stringify(authorizedList));
        deleteUserFromAuthorizedList(rqname, data, pubkey, custodian);
        console.log('authorizedList (end) = ' + JSON.stringify(authorizedList));
        res.send({ url: "/appChain/DataBroker/authorize" });
    })

    router.post("/proposalAndCreateCommit", isAuthenticated, async function (req, res) {
        try {
            let { signature, func } = req.body;
            let signature_buffer = convertSignature(signature)
            let response = await proposalAndCreateCommit(req.user.identity, func, signature_buffer)
            console.log(response)
            return res.send(response)

        } catch (error) {
            console.log(error)
            return res.send(error)
        }
    });

    router.post("/commitSend", isAuthenticated, async function (req, res) {
        try {
            let { signature, func } = req.body;
            let signature_buffer = convertSignature(signature);
            let response = await commitSend(req.user.identity, func, signature_buffer);
            console.log(response)
            return res.send(response)
        } catch (error) {
            console.log(error)
            return res.send(error)
        }
    })

    router.get('/logout', (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                console.error(err);
            } else {
                res.redirect('/appChain/DataBroker');
            }
        });
    });

    async function createTransaction() {
        // parameter 0 is user identity
        // parameter 1 is chaincode function Name
        // parameter 2 to end is chaincode function parameter
        var user = await buildCertUser(wallet, fabric_common, arguments[0]);
        var userContext = gateway.client.newIdentityContext(user);


        var endorsementStore;
        //console.log('arguments[1] = ' + arguments[1]);
        switch (arguments[1]) {
            case 'UpdatePermission':
                endorsementStore = updatePermission;
                break;
            case 'RevokePermission':
                endorsementStore = revokePermission;
                break;
        }
        var paras = [];
        for (var i = 2; i < arguments.length; i++) {
            paras.push(arguments[i])
        }
        var endorsement = accChannel.channel.newEndorsement('AccessControlManager');
        var build_options = { fcn: arguments[1], args: paras, generateTransactionId: true };
        var proposalBytes = endorsement.build(userContext, build_options);
        const digest = hashFunction(proposalBytes);
        endorsementStore[arguments[0]] = endorsement;

        return new Promise(function (reslove, reject) {
            reslove(digest);
        })
    };

    async function proposalAndCreateCommit() {
        // parameter 0 is user identity
        // parameter 1 is chaincode function Name
        // parameter 2 is signature

        var endorsementStore;
        switch (arguments[1]) {
            case 'UpdatePermission':
                endorsementStore = updatePermission
                break;
            case 'RevokePermission':
                endorsementStore = revokePermission
                break;
        }
        if (typeof (endorsementStore) == "undefined") {
            return new Promise(function (reslove, reject) {
                reject({
                    'error': true,
                    'result': "func dosen't exist."
                });
            })
        }

        // console.log('endorsementStore = ' + JSON.stringify(endorsementStore[arguments[0]]));

        let endorsement = endorsementStore[arguments[0]];
        endorsement.sign(arguments[2]);
        let proposalResponses = await endorsement.send({ targets: accChannel.channel.getEndorsers() });
        // console.log('proposalResponses = ' + JSON.stringify(proposalResponses));
        // console.log('responses[0] = ' + JSON.stringify(proposalResponses.responses[0]));
        // console.log('proposalResponses.responses[0].response.status = ' + proposalResponses.responses[0].response.status);
        if (proposalResponses.responses[0].response.status == 200) {
            let user = await buildCertUser(wallet, fabric_common, arguments[0]);
            let userContext = gateway.client.newIdentityContext(user)

            let commit = endorsement.newCommit();
            let commitBytes = commit.build(userContext)
            let commitDigest = hashFunction(commitBytes)
            let result = proposalResponses.responses[0].response.payload.toString();
            endorsementStore[arguments[0]] = commit;

            return new Promise(function (reslove, reject) {
                reslove({
                    'commitDigest': commitDigest,
                    'result': result
                });
            })
        }
        else {
            return new Promise(function (reslove, reject) {
                reject({
                    'error': true,
                    'result': proposalResponses.responses[0].response.message
                });
            })
        }
    };

    async function commitSend() {
        // parameter 0 is user identity
        // parameter 1 is chaincode function Name
        // parameter 2 is signature

        var endorsementStore;
        switch (arguments[1]) {
            case 'UpdatePermission':
                endorsementStore = updatePermission;
                break;
            case 'RevokePermission':
                endorsementStore = revokePermission;
                break;
        }
        if (typeof (endorsementStore) == "undefined") {
            return new Promise(function (reslove, reject) {
                reject({
                    'error': true,
                    'result': "func doesn't exist."
                });
            })
        }
        let commit = endorsementStore[arguments[0]]
        commit.sign(arguments[2])
        let commitSendRequest = {};
        commitSendRequest.requestTimeout = 300000
        commitSendRequest.targets = accChannel.channel.getCommitters();
        let commitResponse = await commit.send(commitSendRequest);

        if (commitResponse['status'] == "SUCCESS") {
            return new Promise(function (reslove, reject) {
                reslove({
                    'result': true
                });
            })
        }
        else {
            return new Promise(function (reslove, reject) {
                reject({
                    'error': true,
                    'result': "commit error"
                });
            })
        }
    }

    function convertSignature(signature) {
        signature = signature.split("/");
        let signature_array = new Uint8Array(signature.length);
        for (var i = 0; i < signature.length; i++) {
            signature_array[i] = parseInt(signature[i])
        }
        let signature_buffer = Buffer.from(signature_array)
        return signature_buffer;
    }

    async function UpdateAuthorizeList() {
        authorizedList = {};
        // Find all data requesters for this platform from the database
        let ALLdataProvider = await Dataprovider.find({}, { pubkey: 1, _id: 0 });

        for (let i = 0; i < ALLdataProvider.length; i++) {
            let user = ALLdataProvider[i].pubkey;
            //console.log(user);
            let acc = await accInstance.evaluateTransaction('GetUserAccControl', user);
            let accJson = JSON.parse(acc.toString());
            for (const address in accJson.Permission) {
                const permissions = accJson.Permission[address];
                for (const dataType in permissions) {
                    const dataInfo = permissions[dataType];
                    authorizedList[address] = authorizedList[address] || {};
                    if (!authorizedList[address][dataType]) {
                        authorizedList[address][dataType] = [];
                    }

                    authorizedList[address][dataType].push({
                        user: user,
                        ...dataInfo,
                    });
                }
            }
        }
        console.log('authorizedList(in) = ' + JSON.stringify(authorizedList));
    }

    function deleteUserFromAuthorizedList(requestername, dataType, user, custodian) {
        // 判斷是否存在requestername
        if (authorizedList.hasOwnProperty(requestername)) {
            const dataTypes = authorizedList[requestername];
            // 判斷是否存在dataType
            if (dataTypes.hasOwnProperty(dataType)) {
                const dataTypeArr = dataTypes[dataType];
                let indexToRemove = -1;
                // 尋找符合user和custodian的物件
                dataTypeArr.forEach((item, index) => {
                    if (item.user === user && item.custodian === custodian) {
                        indexToRemove = index;
                    }
                });
                // 如果找到符合的物件，就將它從陣列中移除
                if (indexToRemove !== -1) {
                    dataTypeArr.splice(indexToRemove, 1);
                }
            }
        }
    }

    const updateAuthorizedListHourly = async () => {
        await UpdateAuthorizeList();
    }

    //Update authorization list every hour
    setInterval(updateAuthorizedListHourly, 60 * 60 * 1000);

    init();
    module.exports = router;
    return router;
}