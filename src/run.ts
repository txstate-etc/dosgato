/* eslint-disable import/first */
import { install } from 'source-map-support'
install()
import { DGServer } from 'index'
import { fixtures } from 'fixtures'
import { PageTemplate1, PageTemplate2, PageTemplate3, PageTemplate4, LinkComponent, PanelComponent, QuoteComponent, ColorData, BuildingData, ArticleData } from 'fixturetemplates'

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
