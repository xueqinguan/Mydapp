const mongoose = require('mongoose');

const deviceBindingSchema = new mongoose.Schema({
    pubkey: {
        require: true,
        type: String,
    },
    address: {
        type: String
    },
    device_ID: {
        type: String,
        require: true
    }
});

module.exports = deviceBindingSchema;