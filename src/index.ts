import { GQLServer } from '@txstate-mws/graphql-server'
import { PageResolver } from './page'

async function main () {
  const server = new GQLServer()
  await server.start({
    resolvers: [PageResolver]
  })
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
