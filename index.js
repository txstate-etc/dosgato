const utils = require('node-api-utils')
const app = utils.apiservice.app
const api = require('express').Router()
const Page = require('./models/page')

api.get('/page/:id', async (req, res) => {
  const page = Page.getById(req.params.id)
  res.json(page.full(req.user))
})

app.use('/api', api)

utils.apiservice.start()
