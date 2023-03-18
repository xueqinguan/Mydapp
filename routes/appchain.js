const express = require('express');
const router = express.Router();

const google = require('./org1/google.router');
const DataCustodian = require('./DataCustodian/dataCustodian.router')
const MinistryOfHealthandWelfare = require('./MinistryOfHealthandWelfare/ministryofhealthandwelfare.router');

// DB config
const db1 = require('../config/keys').GovernmentDB_URI;
const db2 = require('../config/keys').DataCustodianDB_1_URI;

const mongoose = require('mongoose');
const db1Connection = mongoose.createConnection(db1, { useNewUrlParser: true });
db1Connection.once('open', () => console.log(`${db1Connection.name}'s           DB connected by MinistryOfHealthandWelfare`));

const db2Connection = mongoose.createConnection(db2, { useNewUrlParser: true });
db2Connection.once('open', () => console.log(`${db2Connection.name}'s DB connected by DataCustodian`));


// router.use('/google', google);
router.use('/DataCustodian', DataCustodian);
router.use('/MinistryOfHealthandWelfare', require('./MinistryOfHealthandWelfare/ministryofhealthandwelfare.router')(db1Connection));

module.exports = router;