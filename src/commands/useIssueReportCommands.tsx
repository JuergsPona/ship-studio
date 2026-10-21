import { BugReportIcon, PlusIcon } from '@/components/icons';
import { useOpenModal } from '../contexts/ModalContext';
import { useCommands } from './useCommands';

/** Discoverable entry points for the public issue reporting flows. */
export function useIssueReportCommands() {
  const openModal = useOpenModal();

  useCommands(
    () => [
      {
        id: 'issueReports.bugReport',
        title: 'Report a bug…',
        subtitle: 'Ship Studio GitHub issues',
        icon: <BugReportIcon size={14} />,
        category: 'settings',
        keywords: ['bug', 'issue', 'report', 'feedback', 'github'],
        run: () => openModal('bugReport'),
      },
      {
        id: 'issueReports.featureRequest',
        title: 'Request a feature…',
        subtitle: 'Ship Studio GitHub issues',
        icon: <PlusIcon size={14} />,
        category: 'settings',
        keywords: ['feature', 'idea', 'suggestion', 'request', 'feedback', 'github'],
        run: () => openModal('featureRequest'),
      },
    ],
    [openModal]
  );
}
