const mongoose = require('mongoose');

const MappingSchema = new mongoose.Schema({
    address: {
        type: String
    },
    pubkey: {
        type: String
    }
});

const mapping = mongoose.model('Mapping', MappingSchema);

module.exports = mapping;