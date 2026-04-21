export default function SkeletonCards({ count = 3 }) {
  return (
    <div className="skeleton-wrap">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  );
}
