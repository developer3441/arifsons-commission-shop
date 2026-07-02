// Worker entry: assemble the Hono app and expose the OpenAPI document, which is
// the contract every client generates from (ADR-0016).

import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { ledger, type Bindings } from './routes/ledger'
import { dashboard } from './routes/dashboard'
import { contacts } from './routes/contacts'
import { config } from './routes/config'
import { genesis } from './routes/genesis'
import { bardana } from './routes/bardana'
import { lots } from './routes/lots'
import { trades } from './routes/trades'
import { cess } from './routes/cess'
import { auth } from './routes/auth'
import { users } from './routes/users'
import { requireAuth, type AuthedVariables } from './routes/middleware'

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthedVariables }>()

// Every ledger data endpoint requires authentication (ADR-0020). Scoped to
// specific path prefixes (not a blanket '*') so it never touches /auth/login
// or /users (those are unauthenticated / independently Owner-gated).
app.use('/accounts/*', requireAuth)
app.use('/rokar/*', requireAuth)
app.use('/advances', requireAuth)
app.use('/dashboard', requireAuth)
app.use('/contacts', requireAuth)
app.use('/contacts/*', requireAuth)

app.route('/', ledger)
app.route('/', auth)
app.route('/', users)
app.route('/', dashboard)
app.route('/', contacts)
app.route('/', config)
app.route('/', genesis)
app.route('/', bardana)
app.route('/', lots)
app.route('/', trades)
app.route('/', cess)

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
