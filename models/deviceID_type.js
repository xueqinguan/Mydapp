// {
//     "$schema": "http://json-schema.org/draft-07/schema#",
//         "type": "object",
//             "properties": {
//         "device_ID": {
//             "type": "string"
//         },
//         "device_type": {
//             "type": "string"
//         }
//     },
//     "required": ["device_ID", "device_type"]
// }
const mongoose = require('mongoose');

const deviceID_typeSchema = new mongoose.Schema({
    device_ID: {
        require: true,
        type: String,
    },
    device_type: {
        type: String,
        require: true
    }
});

const deviceID_type = mongoose.model('deviceID_type', deviceID_typeSchema, 'deviceID_type');

module.exports = deviceID_type;