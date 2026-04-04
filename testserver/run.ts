import { MockContext } from '@txstate-mws/graphql-server'
import type { UserEvent } from '@dosgato/templating'
import { AssetServiceInternal, DGServer, getEnabledUser, requestResizes, templateRegistry } from '../src/index.js'
import { fixtures } from './fixtures.js'
import { PageTemplate1, PageTemplate2, PageTemplate3, PageTemplate4, LinkComponent, PanelComponent, QuoteComponent, ColorData, BuildingData, ArticleData, RichTextComponent, HorizontalRule, TextImageComponent, ColumnLayout, DocumentsComponent, SongData } from './fixturetemplates.js'

interface StoredUserEvent extends UserEvent {
  userId: string
  timestamp: string
}

const userEvents: StoredUserEvent[] = []

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
      SongData,
      RichTextComponent,
      TextImageComponent,
      ColumnLayout,
      DocumentsComponent
    ],
    assetMeta: {
      getFulltext: data => [data.meta?.title, data.meta?.description]
    }
  })

  server.app.post<{ Body: UserEvent }>('/userEvents', async (req, res) => {
    const ctx = templateRegistry.getCtx(req)
    const user = await getEnabledUser(ctx)
    userEvents.push({ ...req.body, userId: user.id, timestamp: new Date().toISOString() })
    return { success: true }
  })

  server.app.get('/userEvents', async (req, res) => {
    return userEvents
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
