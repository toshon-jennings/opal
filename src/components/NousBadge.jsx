import nousLogo from '../assets/nousresearch.png';

export default function NousBadge({ size = 'h-6 w-6' }) {
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-[var(--border)]`}>
      <img src={nousLogo} alt="Hermes" className="h-full w-full object-cover" />
    </span>
  );
}
