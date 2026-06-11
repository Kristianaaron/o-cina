/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ErrorBoundary from '../components/ErrorBoundary'
import { describe, it, expect } from 'vitest'

function Wrapper({ children }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(<Wrapper><ErrorBoundary><div data-testid="child">Hello</div></ErrorBoundary></Wrapper>)
    expect(screen.getByTestId('child')).toBeTruthy()
  })

  it('shows error UI when child throws', () => {
    // Trigger error by rendering a component that throws
    function Boom() { throw new Error('test error') }
    const { getByText } = render(<Wrapper><ErrorBoundary><Boom /></ErrorBoundary></Wrapper>)
    expect(getByText('Something went wrong')).toBeTruthy()
  })
})
