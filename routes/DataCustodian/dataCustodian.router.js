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


module.exports = function (dbconnection) {
    const Devicebinding = dbconnection.model('devicebindings', require('../../models/DataCustodian/devicebinding'));
    const Applylist = dbconnection.model('applylists', require('../../models/DataCustodian/applylist'));
    const Data = dbconnection.model('datas', require('../../models/DataCustodian/data'))

    var isAuthenticated = function (req, res, next) {
        // console.log('isAuthenticated : ' + req.isAuthenticated());
        if (req.isAuthenticated()) {
            next();
        } else {
            req.flash('info', 'Login first.');
            res.redirect('/appChain/DataCustodian');
        }
    };

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
        // Bug: cannot connect to government DB check is user or org
        // should using smart contract fixed this
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
        req.session.address = address;
        res.send({ 'url': '/appChain/DataCustodian/profile' });
    });



    //04585a8fca69fd68282d08e1c9b751f7037e59f7642a83bca8178018a25c1b9d769c0088e288836abd1de418cf772c9ccf2746c795d574a072110011e847937d9e
    router.get('/profile', isAuthenticated, async (req, res) => {
        const address = req.session.address;
        await Devicebinding.findOne({ address: address })
            .then(async (obj) => {
                if (!obj) {// Render to the binding page without binding
                    res.render('appChain/DataCustodian/binding', { address: address });
                } else {
                    req.session.binding = 'OK';
                    await Data.findOne({ address: address })
                        .then((doc) => {
                            if (!doc) {
                                res.render('appChain/DataCustodian/profile', { address: address, chartData: null, errorMessage: 'No data found.' });
                                return;
                            }
                            if (!doc.devices || !doc.devices.types || doc.devices.types.length === 0) {
                                res.render('appChain/DataCustodian/profile', { address: address, chartData: null });
                                return;
                            }
                            // const dataByType = {};
                            // const userHaveType = [];

                            // // 遍歷每一個 type
                            // doc.devices.types.forEach(({ type, data }) => {
                            //     // 建立空陣列儲存每個 type 的資料
                            //     userHaveType.push(type);
                            //     dataByType[type] = [];

                            //     // 將該 type 的所有資料加入到對應的陣列中
                            //     dataByType[type].push(...data.map(({ value, timestamp }) => ({ value, timestamp })));
                            // });
                            const TYPE = ['Heartrates', 'Stepstaken', 'Bodytemperature', 'Systolicbloodpressure', 'Diastolicbloodpressure'];
                            const dataByType = {};

                            TYPE.forEach((type) => {
                                // 建立空陣列儲存每個 type 的資料
                                dataByType[type] = [];

                                // 尋找 doc 中該 type 的資料
                                const typeData = doc.devices.types.find((d) => d.type === type);

                                // 如果有找到該 type 的資料，將其加入到對應的陣列中
                                if (typeData) {
                                    dataByType[type].push(...typeData.data.map(({ value, timestamp }) => ({ value, timestamp })));
                                }
                            });

                            const result = {
                                dataByType,
                                userHaveType: TYPE // 將固定的 type 順序放到 userHaveType 中
                            }
                            // const result = {
                            //     dataByType,
                            //     userHaveType
                            // };

                            const chartData = result.userHaveType.map(type => {
                                const dataByType = result.dataByType[type];
                                dataByType.sort((a, b) => a.timestamp - b.timestamp); // 按時間排序
                                const dataPoints = dataByType.map(dataPoint => {
                                    return {
                                        x: new Date(dataPoint.timestamp),
                                        y: dataPoint.value
                                    };
                                });

                                return {
                                    label: type,
                                    data: dataPoints
                                };
                            });
                            // console.log(JSON.stringify(chartData));
                            res.render('appChain/DataCustodian/profile', { address: address, chartData: JSON.stringify(chartData) });
                        })

                    //res.render('appChain/DataCustodian/profile', { address: address });
                }
            })
            .catch(function (err) {
                console.log(err);
                res.redirect('appChain/DataCustodian/binding', { address: address });
            });

    });

    router.get('/binding', isAuthenticated, (req, res) => {
        const address = req.session.address;
        res.render('appChain/DataCustodian/binding', { address: address });
    });

    router.post('/binding', isAuthenticated, async (req, res) => {
        let { pubkey, address, type, deviceID } = req.body;
        let obj = await Applylist.findOne({ device_ID: deviceID, device_type: type })

        if (!obj) { //The device has not been applied for or the ID and type pairing error
            console.log('The device has not been applied for or the ID and type pairing error!');
            res.render('appChain/DataCustodian/binding', { address: address });
            return;
        } else {//Devicebinding
            let newDevicebinding = new Devicebinding({
                pubkey: pubkey,
                address: address.toLowerCase(),
                deviceID: deviceID
            })
            let newData = new Data({
                pubkey: pubkey,
                address: address.toLowerCase(),
                devices: {
                    deviceID: deviceID
                }
            })
            await newDevicebinding.save();
            await newData.save();
            res.redirect('/appChain/DataCustodian/profile');
        }
    });



    router.get('/addData', isAuthenticated, async (req, res) => {
        const address = req.session.address;
        let pubkey, deviceID;
        await Devicebinding.findOne({ address: address })
            .then((obj) => {
                pubkey = obj.pubkey;
                deviceID = obj.deviceID;
            })
            .catch(function (err) {
                console.log(err);
                res.redirect('appChain/DataCustodian/profile', { address: address });
            });
        res.render('appChain/DataCustodian/addData', { address: address, pubkey: pubkey, deviceID: deviceID });
    })

    function generateDataForDevice(type, frequency, startDateTime, endDateTime, num) {
        let deviceData = [];
        const dataInterval = frequency * 60 * 1000; // 計算資料產生頻率的毫秒數
        let currentDateTime = startDateTime.getTime();
        let isSleeping = false;
        let dataID = num;
        let stepsCount = 0; // 累加的步數

        if (new Date(currentDateTime).getUTCHours() >= 22 || new Date(currentDateTime).getUTCHours() < 8) {
            isSleeping = true;
        } else {
            isSleeping = false;
        }

        while (currentDateTime < endDateTime.getTime()) {
            const hourOfDay = new Date(currentDateTime).getUTCHours();
            console.log(hourOfDay);
            let value = 0;

            if (type === "Stepstaken") {// 15 min
                if (hourOfDay === 0) {
                    stepsCount = 0; // 重設步數
                }
                value = isSleeping ? 0 : Math.floor(Math.random() * (200 - 20 + 1)) + 20;
                stepsCount += value;
            } else if (type === "Heartrates") {
                if (hourOfDay >= 6 && hourOfDay < 22) {
                    value = Math.floor(Math.random() * (100 - 80 + 1)) + 80;
                } else {
                    value = Math.floor(Math.random() * (70 - 60 + 1)) + 60;
                }
            } else if (type === "Bodytemperature") {
                value = (Math.random() * (38.0 - 36.6) + 36.6).toFixed(1);
            } else if (type === "Systolicbloodpressure") {
                value = Math.floor(Math.random() * (110 - 95 + 1)) + 95;
            } else if (type === "Diastolicbloodpressure") {
                value = Math.floor(Math.random() * (80 - 70 + 1)) + 70;
            }

            const data = {
                dataID: `${type}_${dataID}`,
                value: type === "Stepstaken" ? stepsCount : value, // 根據類型決定資料的值
                timestamp: new Date(currentDateTime)
            };

            deviceData.push(data);
            currentDateTime += dataInterval;
            if (hourOfDay >= 22 || hourOfDay < 8) {
                isSleeping = true;
            } else {
                isSleeping = false;
            }

            dataID++;
        }
        console.log(deviceData);
        return deviceData;
    }


    router.post('/addData', async (req, res) => {
        let { address, type, startDate, endDate, frequency } = req.body;
        await Data.findOne({ address: address.toLowerCase() })
            .then(async (data) => {
                const types = data.devices.types;
                const index = types.findIndex(t => t.type === type);
                if (index === -1) {
                    // Type does not exist, add new type
                    types.push({ type });
                    // console.log('type in not DB');
                    await data.save();
                }
            })

        await Data.findOne(
            { address: address.toLowerCase(), 'devices.types.type': type },
            { 'devices.types.$': 1 })
            .then(async (result) => {

                const typeObj = result?.devices?.types?.[0];
                const dataArr = typeObj ? typeObj.data : [];

                // generateDataForDevice(type, frequency, new Date(startDate), new Date(endDate), dataArr.length)
                await Data.findOneAndUpdate(
                    { address: address.toLowerCase(), 'devices.types.type': type },
                    { $push: { 'devices.types.$.data': { $each: generateDataForDevice(type, frequency, new Date(startDate), new Date(endDate), dataArr.length) } } },
                    { new: true })
                    .then((result) => {
                        console.log('update successfully!');
                    })
                    .catch((err) => {
                        console.error(err);
                    });
            });
        res.redirect('/appChain/DataCustodian/profile');
    })


    router.get('/logout', (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                console.error(err);
            } else {
                res.redirect('/appChain/DataCustodian');
            }
        });
    });

    return router;
}