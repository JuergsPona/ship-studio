import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectServerStopped } from './ProjectServerStopped';

describe('ProjectServerStopped', () => {
  it('waits for explicit Start server intent', () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<ProjectServerStopped onStart={onStart} />);
    expect(onStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start server' }));
    expect(onStart).toHaveBeenCalledOnce();
  });
});
