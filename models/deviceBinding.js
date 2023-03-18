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

const deviceBinding = mongoose.model('deviceBinding', deviceBindingSchema);

module.exports = deviceBinding;