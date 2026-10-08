import type { ConfigIssue } from '@furniconfig/geometry-core';

interface ValidationErrorListProps {
  issues: readonly ConfigIssue[];
}

/** Lista de errores de validación del motor, con campo y mensaje. */
export function ValidationErrorList({ issues }: ValidationErrorListProps) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <section className="error-panel" aria-label="Errores de validación">
      <h2>Errores de validación ({issues.length})</h2>
      <ul>
        {issues.map((issue, index) => (
          <li key={`${issue.field}-${index}`}>
            <code>{issue.field}</code>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
