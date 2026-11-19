import { Navigate } from 'react-router-dom';

/**
 * Legacy editorial route retired to prevent single-language publishing bypasses.
 * All authoring, bilingual verification, duration controls, and kill-switch AI assistance
 * live inside the canonical /admin News Desk.
 */
export function EditorialDeskPage() {
  return <Navigate to="/admin" replace />;
}
