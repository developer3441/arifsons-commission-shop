import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import { LanguageProvider } from '../i18n/LanguageProvider'
import { IssueAdvance } from './IssueAdvance'
import { api, type ContactRecord } from '../api'

// Issue #55 — the farmer is chosen with the ContactPicker (no raw-id box) and
// the advance posts the same as before.
vi.mock('../api', () => ({ api: { listContacts: vi.fn(), getContact: vi.fn(), issueAdvance: vi.fn() } }))

const ali: ContactRecord = { id: 'farmer-ali', kind: 'zamindar', name: 'Ali', balance: -5000 }

function renderScreen() {
  render(
    <LanguageProvider>
      <MemoryRouter>
        <IssueAdvance />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('IssueAdvance', () => {
  beforeEach(() => {
    vi.mocked(api.listContacts).mockReset().mockResolvedValue([ali])
    vi.mocked(api.getContact).mockReset().mockResolvedValue(ali)
    vi.mocked(api.issueAdvance).mockReset().mockResolvedValue({ entryId: 'x' } as never)
    localStorage.setItem('splitease.lang', 'en')
  })

  it('picks the farmer via the ContactPicker (no raw-id box) and posts the advance', async () => {
    renderScreen()
    // No raw-id text input on the screen — only the picker trigger.
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /select farmer/i }))
    fireEvent.click(await screen.findByText('Ali'))

    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '2000' } })
    fireEvent.click(screen.getByRole('button', { name: /post advance/i }))

    await waitFor(() => expect(vi.mocked(api.issueAdvance)).toHaveBeenCalledWith(expect.any(String), 'farmer-ali', 2000))
    expect(await screen.findByText(/Advance posted/i)).toBeInTheDocument()
  })
})
