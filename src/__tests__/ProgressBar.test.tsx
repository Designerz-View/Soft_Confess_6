import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../components/ProgressBar';

describe('ProgressBar', () => {
  it('renders current and total questions', () => {
    render(<ProgressBar current={1} total={7} />);
    expect(screen.getByText(/question 1 of 7/i)).toBeInTheDocument();
  });

  it('displays correct progress for different values', () => {
    const { rerender } = render(<ProgressBar current={1} total={7} />);
    expect(screen.getByText(/question 1 of 7/i)).toBeInTheDocument();

    rerender(<ProgressBar current={4} total={7} />);
    expect(screen.getByText(/question 4 of 7/i)).toBeInTheDocument();

    rerender(<ProgressBar current={7} total={7} />);
    expect(screen.getByText(/question 7 of 7/i)).toBeInTheDocument();
  });

  it('calculates progress percentage correctly', () => {
    const { container } = render(<ProgressBar current={3} total={7} />);
    const progressFill = container.querySelector('[style*="width"]');
    expect(progressFill).toBeInTheDocument();
  });

  it('shows 0% progress at start', () => {
    const { container } = render(<ProgressBar current={0} total={7} />);
    const progressFill = container.querySelector('[style*="width: 0%"]');
    expect(progressFill).toBeInTheDocument();
  });

  it('shows 100% progress when complete', () => {
    const { container } = render(<ProgressBar current={7} total={7} />);
    const progressFill = container.querySelector('[style*="width: 100%"]');
    expect(progressFill).toBeInTheDocument();
  });
});
