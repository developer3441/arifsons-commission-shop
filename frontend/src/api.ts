// Minimal typed client for the walking skeleton. ADR-0016 makes the backend's
// OpenAPI spec the contract; generating this client from that spec is the
// fast-follow — for now these few calls are hand-written against it.
//
// Issue #15: every data call attaches the bearer token (ADR-0025) from
// wherever it's currently stored (see auth.tsx).

const BASE = '/api'

let currentToken: string | null = null

/** Set (or clear) the token every subsequent request attaches. auth.tsx owns this. */
export function setAuthToken(token: string | null): void {
  currentToken = token
}

function authHeaders(): Record<string, string> {
  return currentToken ? { authorization: `Bearer ${currentToken}` } : {}
}

async function post<T>(path: string, body: unknown, auth = true): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? authHeaders() : {}) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

async function patch<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { method: 'PATCH', headers: authHeaders() })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { headers: authHeaders() })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

export interface Balance {
  accountId: string
  balance: number
}

export type Role = 'owner' | 'bookkeeper' | 'viewer'

export interface CurrentUser {
  id: string
  name: string
  role: Role
}

export interface LedgerBalance {
  kind: string
  balance: number
}

export interface TrueShopValueBreakdown {
  cash: number
  buyerReceivables: number
  farmerReceivables: number
  godownValue: number
  bardanaOutValue: number
  farmerPayoutsOwed: number
  outstandingLabour: number
  cessHeld: number
  total: number
}

export interface Reconciliation {
  trueShopValue: number
  expected: number
  drift: number
  reconciles: boolean
}

export interface DashboardSnapshot {
  cashInHand: number
  trueShopValue: number
  breakdown: TrueShopValueBreakdown
  reconciliation: Reconciliation
  ledgers: LedgerBalance[]
}

export type ContactKind = 'zamindar' | 'pakka' | 'thekedar'
export type CostBearer = 'farmer' | 'buyer'

export interface GenesisBalance {
  id: string
  name?: string
  balance: number
}

export interface GenesisInput {
  businessDate?: string
  rokarOpening: number
  farmerBalances: GenesisBalance[]
  buyerBalances: GenesisBalance[]
  contractorBalances: GenesisBalance[]
}

export interface LotBag {
  grossKg: number
  payableKg: number
}

export interface LotDetail {
  lotNumber: number
  farmerId: string
  businessDate: string
  bags: LotBag[]
  kattKgPerBag: number
  payableMaunds: number
}

export interface LotSummary {
  lotNumber: number
  farmerId: string
  businessDate: string
}

export interface FarmerBill {
  gross: number
  commission: number
  labour: number
  bagCharge: number
  net: number
}

export interface BuyerInvoice {
  buyerId: string
  saleValue: number
  commission: number
  labourCharge: number
  bagCharge: number
  cess: number
  total: number
}

export interface TradeSettlement {
  debtRepaid: number
  heldSurplus: number
  remainingDebt: number
  newBalance: number
}

export interface GodownState {
  bags: number
  netKg: number
  totalCostBasis: number
}

export interface GodownSummary extends GodownState {
  averageCostPerKg: number
}

export interface TradeResult {
  entryId: string
  lotNumber: number
  farmerId: string
  thekedarId: string
  payableMaunds: number
  farmerBill: FarmerBill
  buyerInvoices: BuyerInvoice[]
  settlement: TradeSettlement
  godown?: { bags: number; netKg: number; totalCostBasis: number }
}

export interface TradeLineInput {
  buyerId: string
  bagCount: number
  ratePerMaund: number
  kattKgPerBag?: number
  bagBearer?: CostBearer
  labourBearer?: CostBearer
}

export interface BardanaLoan {
  farmerId: string
  bagsOut: number
  bagValue: number
}

export interface ShopConfig {
  farmerCommissionRate: number
  buyerCommissionRate: number
  kattKgPerBag: number
  perBagLabour: number
  perBagCharge: number
  bagBearer: CostBearer
  labourBearer: CostBearer
  cessRate: number
}

export interface StatementLine {
  entryId: string
  kind: string
  amount: number
  balanceAfter: number
  settlement?: TradeSettlement
}

export interface FarmerStatement {
  farmerId: string
  balance: number
  entries: StatementLine[]
}

export interface ContactRecord {
  id: string
  kind: ContactKind
  name?: string
  commissionRate?: number
  buyerCommissionRate?: number
  bagBearer?: CostBearer
  labourBearer?: CostBearer
  kattKgPerBag?: number
  balance: number
}

export interface CashBookLine {
  entryId: string
  kind: string
  amount: number
  balanceAfter: number
}

export interface CashBook {
  balance: number
  entries: CashBookLine[]
}

export interface LedgerSummary {
  kind: string
  balance: number
}

export interface LedgerAccountSummary {
  id: string
  name?: string
  balance: number
}

export interface AccountStatement {
  accountId: string
  balance: number
  entries: { entryId: string; kind: string; amount: number; balanceAfter: number }[]
}

export interface EntryRecord {
  id: string
  kind: string
  postings: { accountId: string; amount: number }[]
}

export interface ChangeLogRow {
  id: string
  entryId: string
  action: 'edit' | 'delete'
  before: EntryRecord
  after: EntryRecord | null
  actor: string
  timestamp: string
}

export interface UserRecord {
  id: string
  name: string
  username: string
  role: Role
  active: boolean
}

export const api = {
  createFarmer: (id: string, name?: string) =>
    post<{ id: string; kind: string }>('/accounts/farmers', { id, name }),
  setOpeningCash: (amount: number) => post<Balance>('/rokar/opening', { amount }),
  issueAdvance: (entryId: string, farmerId: string, amount: number) =>
    post<{ entryId: string }>('/advances', { entryId, farmerId, amount }),
  balanceOf: (id: string) => get<Balance>(`/accounts/${id}/balance`),
  dashboard: () => get<DashboardSnapshot>('/dashboard'),

  upsertContact: (input: {
    id: string
    kind: ContactKind
    name?: string
    commissionRate?: number
    buyerCommissionRate?: number
    bagBearer?: CostBearer
    labourBearer?: CostBearer
    kattKgPerBag?: number
  }) => post<ContactRecord>('/contacts', input),
  listContacts: (kind: ContactKind, q?: string) =>
    get<ContactRecord[]>(`/contacts?kind=${kind}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  getContact: (id: string) => get<ContactRecord>(`/contacts/${id}`),
  getFarmerStatement: (id: string) => get<FarmerStatement>(`/contacts/${id}/statement`),

  getConfig: () => get<ShopConfig>('/config'),
  setConfig: (update: Partial<ShopConfig>) => put<ShopConfig>('/config', update),

  postGenesis: (input: GenesisInput) => post<{ id: string; postings: number }>('/genesis', input),

  getCessHeld: () => get<{ held: number }>('/cess'),
  remitCess: (entryId: string) => post<{ entryId: string; amountRemitted: number }>('/cess/remit', { entryId }),

  createLot: (farmerId: string) => post<LotSummary>('/lots', { farmerId }),
  weighBag: (lotNumber: number, grossKg: number) => post<LotDetail>(`/lots/${lotNumber}/bags`, { grossKg }),
  getLot: (lotNumber: number) => get<LotDetail>(`/lots/${lotNumber}`),
  listLots: (farmerId?: string) => get<LotSummary[]>(`/lots${farmerId ? `?farmerId=${encodeURIComponent(farmerId)}` : ''}`),

  postTrade: (input: {
    entryId: string
    lotNumber: number
    thekedarId: string
    lines: TradeLineInput[]
  }) => post<TradeResult>('/trades', input),

  listBardanaLoans: () => get<BardanaLoan[]>('/bardana'),
  lendBardana: (entryId: string, farmerId: string, bags: number, bagValue?: number) =>
    post<BardanaLoan>('/bardana/lend', { entryId, farmerId, bags, bagValue }),
  returnBardana: (entryId: string, farmerId: string, bags: number) =>
    post<BardanaLoan>('/bardana/return', { entryId, farmerId, bags }),

  login: (username: string, password: string) =>
    post<{ token: string; user: CurrentUser }>('/auth/login', { username, password }, false),
  listUsers: () => get<UserRecord[]>('/users'),
  createUser: (id: string, name: string, username: string, password: string, role: Role) =>
    post<UserRecord>('/users', { id, name, username, password, role }),
  deactivateUser: (id: string) => patch<{ id: string; active: boolean }>(`/users/${id}/deactivate`),

  getEntry: (id: string) => get<EntryRecord>(`/entries/${id}`),
  getChangeLog: () => get<ChangeLogRow[]>('/changelog'),
  editEntry: (entryId: string, reversalEntryId: string, correctedEntryId: string, postings: { accountId: string; amount: number }[]) =>
    post<{ entryId: string; reversalEntryId: string; correctedEntryId: string; warning?: string }>(
      `/entries/${entryId}/edit`,
      { reversalEntryId, correctedEntryId, postings },
    ),
  deleteEntry: (entryId: string, reversalEntryId: string) =>
    post<{ entryId: string; reversalEntryId: string; warning?: string }>(`/entries/${entryId}/delete`, { reversalEntryId }),

  listLedgers: () => get<LedgerSummary[]>('/ledgers'),
  listLedgerAccounts: (kind: string) => get<LedgerAccountSummary[]>(`/ledgers/${kind}/accounts`),
  getAccountStatement: (id: string) => get<AccountStatement>(`/ledgers/accounts/${encodeURIComponent(id)}/entries`),

  payBuyer: (entryId: string, buyerId: string) =>
    post<{ entryId: string; buyerId: string; amount: number }>('/payments/buyer', { entryId, buyerId }),
  withdrawForFarmer: (entryId: string, farmerId: string, amount: number) =>
    post<{ entryId: string; farmerId: string; amount: number }>('/payments/withdrawal', { entryId, farmerId, amount }),
  payoutContractor: (entryId: string, thekedarId: string) =>
    post<{ entryId: string; thekedarId: string; amount: number }>('/payments/payout', { entryId, thekedarId }),
  getCashBook: () => get<CashBook>('/rokar/cashbook'),
  getGodown: () => get<GodownSummary>('/godown'),
  resellStock: (entryId: string, buyerId: string, bagsSold: number, netKgSold: number, saleProceeds: number) =>
    post<{ entryId: string; buyerId: string; costOfGoodsSold: number; tradingPnL: number; godown: GodownState }>(
      '/godown/resale',
      { entryId, buyerId, bagsSold, netKgSold, saleProceeds },
    ),
}
