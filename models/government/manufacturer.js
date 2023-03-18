const mongoose = require('mongoose');

const ManufactureSchema = new mongoose.Schema({
    Manufacturer: {
        require: true,
        type: String,
    },
    address: {
        type: String
    },
    device: [{
        device_ID: {
            type: String,
            require: true
        },
        device_type: {
            type: String,
            require: true
        },
        manufactured_Date: {
            type: Date
        }
    }]
});

module.exports = ManufactureSchema;