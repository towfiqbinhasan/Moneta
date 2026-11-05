import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Delete, Fingerprint, Lock } from 'lucide-react';
import type { Settings } from '@/db/types';
import { verifyBiometric, verifyPin } from '@/lib/lock';
import { cx } from '@/lib/utils';
import { Aurora, haptic } from '@/components/motion';
import { BrandMark } from '@/components/Brand';

/** PIN pad + optional biometric unlock. */
export function LockScreen({ settings, onUnlock }: { settings: Settings; onUnlock: () => void }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const bio = settings.lock.biometricId;

  const tryBio = async () => {
    if (bio && (await verifyBiometric(bio))) onUnlock();
  };
  useEffect(() => { tryBio(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const len = settings.lock.pinLength ?? 4;
  useEffect(() => {
    if (pin.length < len) return;
    const { pinHash, salt } = settings.lock;
    if (!pinHash || !salt) return onUnlock();
    verifyPin(pin, pinHash, salt).then((ok) => {
      if (ok) onUnlock();
      else { setError(true); haptic([30, 50, 30]); setTimeout(() => { setPin(''); setError(false); }, 600); }
    });
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', bio ? 'bio' : '', '0', 'del'];
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 px-6">
      <Aurora />
      <div className="text-center">
        <div className="relative mx-auto mb-3 w-fit">
          <BrandMark size={84} animated />
          <span className="absolute -bottom-1 -end-1 grid h-8 w-8 place-items-center rounded-full bg-card text-brand shadow-lg ring-2 ring-surface"><Lock size={15} /></span>
        </div>
        <h1 className="text-xl font-bold">{t('lock.enterPin')}</h1>
      </div>
      <div className={cx('flex gap-3', error && 'animate-shake')}>
        {Array.from({ length: len }).map((_, i) => (
          <span key={i} className={cx('h-3.5 w-3.5 rounded-full transition', i < pin.length ? (error ? 'bg-red-500' : 'bg-brand') : 'bg-ink/15')} />
        ))}
      </div>
      <div className="grid w-full max-w-xs grid-cols-3 gap-3" dir="ltr">
        {keys.map((k, i) => (
          <button
            key={i}
            disabled={!k}
            onClick={() => (k === 'del' ? setPin(pin.slice(0, -1)) : k === 'bio' ? tryBio() : pin.length < len && setPin(pin + k))}
            className="m-tile grid h-16 place-items-center !rounded-full text-2xl font-semibold transition hover:bg-ink/10 active:scale-90 disabled:opacity-0"
            aria-label={k === 'del' ? 'Backspace' : k === 'bio' ? t('lock.biometric') : k}
          >
            {k === 'del' ? <Delete /> : k === 'bio' ? <Fingerprint size={28} className="text-brand" /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}
