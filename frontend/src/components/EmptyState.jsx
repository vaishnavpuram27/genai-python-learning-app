export default function EmptyState({ icon, title, body }) {
  return (
    <div className="empty-state-card">
      {icon && <div className="empty-state-icon" aria-hidden="true">{icon}</div>}
      <p className="empty-state-title">{title}</p>
      {body && <p className="empty-state-body">{body}</p>}
    </div>
  );
}
