import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import { LanguageProvider } from '../i18n/LanguageProvider'
import { Genesis } from './Genesis'
import { api, type ContactRecord } from '../api'

// Issue #55 — each opening balance names a pre-existing contact via the
// ContactPicker; the posted payload keeps the {id, name, balance} shape.
vi.mock('../api', () => ({ api: { listContacts: vi.fn(), postGenesis: vi.fn() } }))

const rashid: ContactRecord = { id: 'farmer-rashid', kind: 'zamindar', name: 'Rashid', balance: 0 }

function renderScreen() {
  render(
    <LanguageProvider>
      <MemoryRouter>
        <Genesis />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('Genesis', () => {
  beforeEach(() => {
    vi.mocked(api.listContacts).mockReset().mockResolvedValue([rashid])
    vi.mocked(api.postGenesis).mockReset().mockResolvedValue({ id: 'g1', postings: 2 })
    localStorage.setItem('splitease.lang', 'en')
  })

  it('adds a farmer opening balance via the ContactPicker and posts the genesis entry', async () => {
    renderScreen()
    fireEvent.change(screen.getByLabelText(/Opening Rokar cash/i), { target: { value: '100000' } })

    // Add a farmer row, pick the contact, set its opening balance.
    fireEvent.click(screen.getAllByRole('button', { name: /add a balance/i })[0]!)
    fireEvent.click(screen.getByRole('button', { name: /select farmer/i }))
    fireEvent.click(await screen.findByText('Rashid'))
    fireEvent.change(screen.getByLabelText(/^Balance/i), { target: { value: '-5000' } })

    fireEvent.click(screen.getByRole('button', { name: /post genesis entry/i }))

    await waitFor(() =>
      expect(vi.mocked(api.postGenesis)).toHaveBeenCalledWith(
        expect.objectContaining({
          rokarOpening: 100000,
          farmerBalances: [{ id: 'farmer-rashid', name: 'Rashid', balance: -5000 }],
        }),
      ),
    )
    expect(await screen.findByText(/Genesis posted/i)).toBeInTheDocument()
  })
})
