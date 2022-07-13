import { DGServer } from './index.js'
import { fixtures } from './fixtures.js'
import { PageTemplate1, PageTemplate2, PageTemplate3, PageTemplate4, LinkComponent, PanelComponent, QuoteComponent, ColorData, BuildingData, ArticleData } from './fixturetemplates.js'

async function main () {
  const server = new DGServer()
  await server.start({
    fixtures,
    templates: [
      PageTemplate1,
      PageTemplate2,
      PageTemplate3,
      PageTemplate4,
      LinkComponent,
      PanelComponent,
      QuoteComponent,
      ColorData,
      BuildingData,
      ArticleData
    ]
  })
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
