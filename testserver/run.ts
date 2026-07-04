import { AnalyticsClient, jwtAuthenticate, type StoredInteractionEvent } from 'fastify-txstate'
import { AssetServiceInternal, DGServer, requestResizes, userContext } from '../src/index.js'
import { fixtures } from './fixtures.js'
import { PageTemplate1, PageTemplate2, PageTemplate3, PageTemplate4, LinkComponent, PanelComponent, QuoteComponent, ColorData, BuildingData, ArticleData, RichTextComponent, HorizontalRule, TextImageComponent, ColumnLayout, DocumentsComponent, SongData, TeamComponent, TeamMemberComponent } from './fixturetemplates.js'

const userEvents: StoredInteractionEvent[] = []

/** Collects analytics events in memory so automated tests can read them back
 * via GET /userEvents instead of shipping them to elasticsearch. */
class MemoryAnalyticsClient extends AnalyticsClient {
  async push (events: StoredInteractionEvent[]) {
    userEvents.push(...events)
  }
}

async function main () {
  const server = new DGServer({ authenticate: jwtAuthenticate({ authenticateAll: true }) })

  server.app.get('/userEvents', async (req, res) => userEvents)

  server.app.delete('/userEvents', async (req, res) => {
    userEvents.length = 0
    return { success: true }
  })

  await server.start({
    fixtures,
    analytics: { analyticsClient: new MemoryAnalyticsClient() },
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
      DocumentsComponent,
      TeamComponent,
      TeamMemberComponent
    ],
    assetMeta: {
      getFulltext: data => [data.meta?.title, data.meta?.description]
    }
  })
}

main().then(async () => {
  const ctx = await userContext('su01')
  const [asset] = await ctx.svc(AssetServiceInternal).find({ names: ['bobcat'] })
  await requestResizes(asset)
}).catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
