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


const require_signature = "databroker?nonce:666";

module.exports = function (dbconnection) {


    module.exports = router;
    return router;
}