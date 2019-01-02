const mongoose = require('mongoose')
const Schema = mongoose.Schema
const ComponentSchema = require('./component')

const AreaSchema = new Schema({
  name: { type: String, required: true },
  components: [ComponentSchema]
}, { _id: false })

module.exports = AreaSchema
