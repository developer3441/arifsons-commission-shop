// Worker entry: assemble the Hono app and expose the OpenAPI document, which is
// the contract every client generates from (ADR-0016).

import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { ledger, type Bindings } from './routes/ledger'

const app = new OpenAPIHono<{ Bindings: Bindings }>()

app.route('/', ledger)

// The OpenAPI document — generated from the routes, the contract every client
// generates from (ADR-0016).
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: { title: 'SplitEase API', version: '0.0.0' },
})

// Browsable API docs, rendered from the spec above. Always accurate because it
// reads the generated document, never a hand-maintained copy.
app.get('/docs', swaggerUI({ url: '/openapi.json' }))

export default app
