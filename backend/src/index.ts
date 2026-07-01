// Worker entry: assemble the Hono app and expose the OpenAPI document, which is
// the contract every client generates from (ADR-0016).

import { OpenAPIHono } from '@hono/zod-openapi'
import { ledger, type Bindings } from './routes/ledger'

const app = new OpenAPIHono<{ Bindings: Bindings }>()

app.route('/', ledger)

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: { title: 'SplitEase API', version: '0.0.0' },
})

export default app
