const express = require('express');
const router = express.Router();

//const google = require('./org1/google.router');
const DataCustodian = require('./DataCustodian/dataCustodian.router');
const MinistryOfHealthandWelfare = require('./MinistryOfHealthandWelfare/ministryofhealthandwelfare.router');
const DataBroker = require('./DataBroker/dataBroker.router');

// DB config
const db1 = require('../config/keys').GovernmentDB_URI;
const db2 = require('../config/keys').DataCustodianDB_1_URI;
const db3 = require('../config/keys').DataBroker_URI;

const mongoose = require('mongoose');
const db1Connection = mongoose.createConnection(db1, { useNewUrlParser: true });
db1Connection.once('open', () => console.log('\x1b[35m%s\x1b[0m', `${db1Connection.name}'s           DB connected by MinistryOfHealthandWelfare`));

const db2Connection = mongoose.createConnection(db2, { useNewUrlParser: true });
db2Connection.once('open', () => console.log('\x1b[35m%s\x1b[0m', `${db2Connection.name}'s DB connected by DataCustodian`));

const db3Connection = mongoose.createConnection(db3, { useNewUrlParser: true });
db3Connection.once('open', () => console.log('\x1b[35m%s\x1b[0m', `${db3Connection.name}'s      DB connected by DataBroker`));


// router.use('/google', google);

router.use('/MinistryOfHealthandWelfare', MinistryOfHealthandWelfare(db1Connection));
router.use('/DataCustodian', DataCustodian(db2Connection));
router.use('/DataBroker', DataBroker(db3Connection));

module.exports = router;