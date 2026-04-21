export default function SkeletonRows({ count = 5 }) {
  return (
    <div className="skeleton-wrap">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}
