const mongoose = require('mongoose')
const Schema = mongoose.Schema
const AreaSchema = require('./area')

const ComponentSchema = new Schema({
  template: { type: String, required: true },
  areas: [AreaSchema],
  data: Schema.Types.Mixed
})

module.exports = ComponentSchema
