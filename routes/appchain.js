const express = require('express');
const router = express.Router();

const google = require('./org1/google.router');
const DataCustodian = require('./DataCustodian/dataCustodian.router')
const MinistryOfHealthandWelfare = require('./MinistryOfHealthandWelfare/ministryofhealthandwelfare.router');

router.use('/google', google);
router.use('/DataCustodian', DataCustodian);
router.use('/MinistryOfHealthandWelfare', MinistryOfHealthandWelfare);

module.exports = router;