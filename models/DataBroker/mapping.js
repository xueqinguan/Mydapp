const mongoose = require('mongoose');

const MappingSchema = new mongoose.Schema({
    address: {
        type: String
    },
    pubkey: {
        type: String
    }
});

module.exports = MappingSchema;