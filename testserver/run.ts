import { MockContext } from '@txstate-mws/graphql-server'
import { AssetServiceInternal, DGServer, requestResizes } from '../src/index.js'
import { fixtures } from './fixtures.js'
import { PageTemplate1, PageTemplate2, PageTemplate3, PageTemplate4, LinkComponent, PanelComponent, QuoteComponent, ColorData, BuildingData, ArticleData, RichTextComponent, HorizontalRule, TextImageComponent, ColumnLayout, DocumentsComponent } from './fixturetemplates.js'

async function main () {
  const server = new DGServer()
  await server.start({
    fixtures,
    userSearch: async (search: string) => {
      return [{ login: 'ab12', firstname: 'April', lastname: 'Bar', email: 'ab12@example.com', enabled: true }]
    },
    templates: [
      PageTemplate1,
      PageTemplate2,
      PageTemplate3,
      PageTemplate4,
      LinkComponent,
      PanelComponent,
      QuoteComponent,
      HorizontalRule,
      ColorData,
      BuildingData,
      ArticleData,
      RichTextComponent,
      TextImageComponent,
      ColumnLayout,
      DocumentsComponent
    ]
  })
}

main().then(async () => {
  const ctx = new MockContext({ sub: 'su01' })
  const [asset] = await ctx.svc(AssetServiceInternal).find({ names: ['bobcat'] })
  await requestResizes(asset)
}).catch(e => {
  console.error(e)
  process.exit(1)
})
