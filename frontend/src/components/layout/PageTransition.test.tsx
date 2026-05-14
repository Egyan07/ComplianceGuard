import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PageTransition from './PageTransition';

describe('PageTransition', () => {
  it('renders children', () => {
    render(
      <MemoryRouter>
        <PageTransition>
          <div>page content</div>
        </PageTransition>
      </MemoryRouter>
    );
    expect(screen.getByText('page content')).toBeInTheDocument();
  });
});
