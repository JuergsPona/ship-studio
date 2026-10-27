import { Button } from '../primitives/Button';
import { EmptyState } from '../primitives/EmptyState';
import { useOptionalToast } from '../../contexts/ToastContext';
import { asCommandError, formatCommandError } from '../../lib/errors';

/** Intentional idle state: no connection probes or process launches on mount. */
export function ProjectServerStopped({ onStart }: { onStart: () => Promise<void> }) {
  const { showToast } = useOptionalToast();
  const start = () => {
    void onStart().catch((error: unknown) =>
      showToast(formatCommandError(asCommandError(error)), 'error')
    );
  };
  return (
    <EmptyState
      title="Project server is stopped"
      description="Start the server when you’re ready to preview this project."
      action={
        <Button variant="primary" onClick={start}>
          Start server
        </Button>
      }
    />
  );
}
