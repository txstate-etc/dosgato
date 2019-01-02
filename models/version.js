const mongoose = require('mongoose')
const Schema = mongoose.Schema

const JSONPatchSchema = new Schema({
  op: { type: String, enum: ['test', 'remove', 'add', 'replace', 'move', 'copy'] },
  from: String,
  path: String,
  value: Schema.Types.Mixed
}, { _id: false })

const VersionSchema = new Schema({
  id: Number,
  migration: Number,
  date: Date,
  type: { type: String, enum: ['user', 'migration'] },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: function () { return this.type === 'user' } },
  undo: [JSONPatchSchema]
}, { _id: false })

module.exports = VersionSchema
