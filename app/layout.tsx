import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KubeSignal — Cluster health & drift',
  description: 'A read-only operational view of your Kubernetes clusters.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
