const mongoose = require('mongoose')
const Schema = mongoose.Schema

const LinkSchema = new Schema({
  model: { type: String, enum: ['Page', 'Asset'], required: true },
  doc: { type: Schema.Types.ObjectId, refPath: 'model' },
  site: String,
  path: [String]
}, { _id: false })

module.exports = LinkSchema
