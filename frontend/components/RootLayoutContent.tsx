'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';

export default function RootLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Don't show Navbar for admin/merchant/client/superowner/driver routes (they have their own layouts)
  const hideNavbar = pathname?.startsWith('/admin') ||
                     pathname?.startsWith('/superowner') ||
                     pathname?.startsWith('/super-admin') ||
                     pathname?.startsWith('/merchant') ||
                     pathname?.startsWith('/client') ||
                     pathname?.startsWith('/driver');

  return (
    <>
      {!hideNavbar && <Navbar />}
      {children}
    </>
  );
}
