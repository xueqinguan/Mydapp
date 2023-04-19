const mongoose = require('mongoose');

const DataProviderSchema = new mongoose.Schema({
    pubkey: {
        type: String
    },
    gender: {
        type: String
    },
    age: {
        type: Number
    },
    height: {
        type: Number
    },
    weight: {
        type: Number
    }
});

module.exports = DataProviderSchema;