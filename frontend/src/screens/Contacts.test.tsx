import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import { LanguageProvider } from '../i18n/LanguageProvider'
import { Contacts } from './Contacts'
import { api, type ContactRecord } from '../api'

// Issue #53 — Contacts screen: displays a contact's phone and searches by
// name / id / phone (all three go through GET /contacts?q). Restyled to the
// reference standard with loading / empty / error states.

vi.mock('../api', () => ({
  api: { listContacts: vi.fn(), upsertContact: vi.fn() },
}))

const rashid: ContactRecord = {
  id: 'farmer-rashid',
  kind: 'zamindar',
  name: 'Rashid Khan',
  phone: '0300-1234567',
  balance: 0,
}

function renderContacts() {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <Contacts />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('Contacts screen', () => {
  beforeEach(() => {
    vi.mocked(api.listContacts).mockReset()
    // Assert against English copy; LanguageProvider reads the stored language on
    // mount (Urdu is the default), so pin it before rendering.
    localStorage.setItem('splitease.lang', 'en')
  })

  it('shows a loading state first, then displays the contact with its phone', async () => {
    vi.mocked(api.listContacts).mockResolvedValue([rashid])
    renderContacts()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(await screen.findByText('Rashid Khan')).toBeInTheDocument()
    // the phone number renders (Western digits, ADR-0030)
    expect(screen.getByText('0300-1234567')).toBeInTheDocument()
  })

  it('searches by a single q that the backend matches against name / id / phone', async () => {
    vi.mocked(api.listContacts).mockResolvedValue([rashid])
    renderContacts()
    await screen.findByText('Rashid Khan')

    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: '1234567' } })
    fireEvent.submit(search.closest('form')!)

    await waitFor(() =>
      expect(vi.mocked(api.listContacts)).toHaveBeenLastCalledWith('zamindar', '1234567'),
    )
  })

  it('shows an empty state when no contact matches', async () => {
    vi.mocked(api.listContacts).mockResolvedValue([])
    renderContacts()
    expect(await screen.findByText('No contacts found.')).toBeInTheDocument()
  })

  it('shows an error state when the load fails', async () => {
    vi.mocked(api.listContacts).mockRejectedValue(new Error('network'))
    renderContacts()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
