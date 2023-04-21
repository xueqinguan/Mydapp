const mongoose = require('mongoose');

const DataRequesterSchema = new mongoose.Schema({
    pubkey: {
        type: String
    },
    address: {
        type: String
    },
    name: {
        type: String
    }
});

module.exports = DataRequesterSchema;