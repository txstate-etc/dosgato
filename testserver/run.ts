import { DGServer } from '../src/index.js'
import { fixtures } from './fixtures.js'
import { PageTemplate1, PageTemplate2, PageTemplate3, PageTemplate4, LinkComponent, PanelComponent, QuoteComponent, ColorData, BuildingData, ArticleData, RichTextComponent } from './fixturetemplates.js'

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
      ArticleData,
      RichTextComponent
    ]
  })
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
