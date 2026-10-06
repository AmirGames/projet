'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/lib/use-notifications';

/** `clair` : sur un en-tête blanc, la cloche passe en sombre. */
export function NotificationBell({ clair = false }: { clair?: boolean } = {}) {
  const locale = useLocale();
  const t = useTranslations('notificationBell');
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const conteneur = useRef<HTMLDivElement>(null);

  // Le panneau restait ouvert par-dessus la page : désormais présent partout,
  // il masquerait le contenu à chaque clic ailleurs.
  useEffect(() => {
    if (!open) return;

    const auClic = (evenement: MouseEvent) => {
      if (!conteneur.current?.contains(evenement.target as Node)) setOpen(false);
    };
    const auClavier = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', auClic);
    document.addEventListener('keydown', auClavier);

    return () => {
      document.removeEventListener('mousedown', auClic);
      document.removeEventListener('keydown', auClavier);
    };
  }, [open]);

  const handleClick = (notif: { id: string; isRead: boolean; link?: string | null }) => {
    if (!notif.isRead) markAsRead(notif.id);
    if (notif.link) {
      setOpen(false);
      router.push(notif.link);
    }
  };

  return (
    <div className="relative" ref={conteneur}>
      <button
        onClick={() => setOpen(!open)}
        className={`relative p-2 transition ${clair ? 'text-gray-700 hover:text-gray-900' : 'text-gray-300 hover:text-white'}`}
        aria-label={
          unreadCount > 0 ? `${t('notifications')}, ${unreadCount} ${t('unread', { count: unreadCount })}` : t('notifications')
        }
        aria-expanded={open}
        title={t('notifications')}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-5 h-5 bg-red-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto border ${clair ? 'bg-white border-gray-200' : 'bg-gray-800 border-gray-700'}`}>
          <div className={`p-4 border-b flex justify-between items-center ${clair ? 'border-gray-100' : 'border-gray-700'}`}>
            <h3 className={`font-semibold ${clair ? 'text-gray-900' : 'text-white'}`}>{t('notifications')}</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className={`text-xs font-semibold ${clair ? 'text-orange-700 hover:text-orange-800' : 'text-orange-500 hover:text-orange-400'}`}
              >
                {t('markAllAsRead')}
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className={`p-4 text-center ${clair ? 'text-gray-500' : 'text-gray-400'}`}>{t('noNotifications')}</div>
          ) : (
            <div className={`divide-y ${clair ? 'divide-gray-100' : 'divide-gray-700'}`}>
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={`p-3 cursor-pointer transition ${
                    clair
                      ? notif.isRead
                        ? 'bg-white hover:bg-gray-50'
                        : 'bg-orange-50/60 hover:bg-orange-50'
                      : notif.isRead
                        ? 'bg-gray-800 hover:bg-gray-700'
                        : 'bg-gray-700/60 hover:bg-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <p className={`font-semibold text-sm ${clair ? 'text-gray-900' : 'text-white'}`}>{notif.title}</p>
                      <p className={`text-xs mt-1 ${clair ? 'text-gray-600' : 'text-gray-400'}`}>{notif.message}</p>
                      <p className="text-gray-500 text-xs mt-2">
                        {new Date(notif.createdAt).toLocaleString(locale)}
                      </p>
                    </div>
                    {!notif.isRead && <div className="w-2 h-2 bg-orange-500 rounded-full mt-1 flex-shrink-0" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
