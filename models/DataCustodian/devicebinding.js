const mongoose = require('mongoose');

const deviceBindingSchema = new mongoose.Schema({
    pubkey: {
        type: String,
        require: true
    },
    address: {
        type: String,
        require: true
    },
    deviceID: {
        type: String,
        require: true
    }
});

module.exports = deviceBindingSchema;