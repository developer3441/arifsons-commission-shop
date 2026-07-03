import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '../i18n'
import { LanguageProvider } from '../i18n/LanguageProvider'
import { ContactPicker } from './ContactPicker'
import { api, type ContactRecord } from '../api'

// Issue #54 — the shared ContactPicker: tap → full-screen search sheet →
// search name/id/phone → tap the match, which sets the id internally (no raw-id
// box is ever shown to the user — design.md).

vi.mock('../api', () => ({ api: { listContacts: vi.fn() } }))

const mill: ContactRecord = { id: 'buyer-mill', kind: 'pakka', name: 'Alpha Mill', phone: '0300-1', balance: 0 }

function renderPicker(onSelect = vi.fn()) {
  render(
    <LanguageProvider>
      <ContactPicker kind="pakka" value={null} onSelect={onSelect} />
    </LanguageProvider>,
  )
  return onSelect
}

describe('ContactPicker', () => {
  beforeEach(() => {
    vi.mocked(api.listContacts).mockReset()
    localStorage.setItem('splitease.lang', 'en')
  })

  it('shows a prompt and no raw-id box until tapped, then opens the search sheet', async () => {
    vi.mocked(api.listContacts).mockResolvedValue([mill])
    renderPicker()
    // the trigger shows a prompt, not an id text box
    expect(screen.getByRole('button', { name: /select buyer/i })).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /select buyer/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(await screen.findByText('Alpha Mill')).toBeInTheDocument()
  })

  it('queries GET /contacts by the typed text and selects the match, closing the sheet', async () => {
    vi.mocked(api.listContacts).mockResolvedValue([mill])
    const onSelect = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /select buyer/i }))

    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'alpha' } })
    await waitFor(() => expect(vi.mocked(api.listContacts)).toHaveBeenLastCalledWith('pakka', 'alpha'))

    fireEvent.click(await screen.findByText('Alpha Mill'))
    expect(onSelect).toHaveBeenCalledWith(mill)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
