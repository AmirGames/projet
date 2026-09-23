"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from 'next-intl';

export default function AdminPage() {
  const t = useTranslations('common');
  const router = useRouter();

  useEffect(() => {
    router.push("/admin/dashboard");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
}
