import type { SVGProps } from 'react';

export type IconName =
  | 'chevron'
  | 'arrow'
  | 'external'
  | 'close'
  | 'check'
  | 'help'
  | 'copy'
  | 'wallet'
  | 'identity'
  | 'network'
  | 'protected'
  | 'receipt'
  | 'loading';
export type IconProps = Omit<SVGProps<SVGSVGElement>, 'name'> & { size?: number };
// Original PayeeLock glyphs. One geometry registry, one rendering contract.
// All glyphs use a 24-unit grid and inherit the surrounding foreground color.
const geometry: Record<IconName, React.ReactNode> = {
  chevron: <path d="m6 9 6 6 6-6" />,
  arrow: <path d="M3 12h17m-6-6 6 6-6 6" />,
  external: <path d="M5 19 19 5M7 5h12v12" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m4 12 5 5L20 6" />,
  help: (
    <>
      <path d="M8 7.5c0-5 9-5 9 .5 0 3-5 3-5 6" />
      <path d="M12 18v1" />
    </>
  ),
  copy: (
    <>
      <path d="M8 8h12v13H8zM4 16V3h12" />
      <path d="M11 11h6" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7h17v14H3V7l12-4v4M14 11h7v6h-7z" />
      <path d="M17 14h1" />
    </>
  ),
  identity: (
    <>
      <path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6" />
      <path d="M8 13V9a4 4 0 0 1 8 0v6m-4-6v10" />
    </>
  ),
  network: (
    <>
      <path d="M3 4h6v6H3zm12 10h6v6h-6zM6 10v7h9M9 7h9v7" />
    </>
  ),
  protected: (
    <>
      <path d="M4 3h16v11l-8 7-8-7V3Z" />
      <path d="m8 10 3 3 5-6" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 2.5h10l4 4V21H5z" />
      <path d="M15 2.5V7h4M8.5 11.5h7" />
      <path d="m8.5 16 2.25 2.25 4.75-5" />
    </>
  ),
  loading: (
    <>
      <path d="M12 3a9 9 0 0 1 9 9" />
      <path d="M12 21a9 9 0 0 1-9-9" opacity=".25" />
    </>
  ),
};
export function Icon({ name, size = 20, ...props }: IconProps & { name: IconName }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {geometry[name]}
    </svg>
  );
}
export const Wallet = (p: IconProps) => <Icon name="wallet" {...p} />;
export const Fingerprint = (p: IconProps) => <Icon name="identity" {...p} />;
export const Globe = (p: IconProps) => <Icon name="network" {...p} />;
export const ArrowUpRight = (p: IconProps) => <Icon name="external" {...p} />;
export const ShieldCheck = (p: IconProps) => <Icon name="protected" {...p} />;
