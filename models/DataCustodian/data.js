const mongoose = require('mongoose');


const dataSchema = new mongoose.Schema({
    pubkey: {
        require: true,
        type: String,
    },
    address: {
        type: String
    },
    devices: {
        deviceID: {
            type: String,
            required: true
        },
        types: [{
            type: {
                type: String,
                required: true
            },
            data: [{
                dataID: {
                    type: String,
                    required: true
                },
                value: {
                    type: String,
                    required: true
                },
                timestamp: {
                    type: Date
                }
            }]
        }]
    }
});


module.exports = dataSchema;