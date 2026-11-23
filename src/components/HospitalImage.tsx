import { useState } from 'react';
import { Building2 } from 'lucide-react';

interface HospitalImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function HospitalImage({ src, alt, className = '' }: HospitalImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#EAF2FA] to-[#E2ECEE] text-[#0F4C81] ${className}`}
        role="img"
        aria-label={alt}
      >
        <Building2 className="h-8 w-8 opacity-75" />
        <span className="mt-2 px-3 text-center text-xs font-medium text-slate-600">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
