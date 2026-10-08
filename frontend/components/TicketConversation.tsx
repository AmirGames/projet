'use client';


import { jetonAcces } from '@/lib/jeton-session';
import { useCallback, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Send } from 'lucide-react';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface TicketMessage {
  id: string;
  authorName: string;
  authorRole: 'MERCHANT' | 'ADMIN';
  body: string;
  createdAt: string;
}

interface Props {
  /** Base de l'URL des messages, par ex. /api/support/tickets ou /api/admin/tickets */
  basePath: string;
  ticketId: string;
  /** Rôle de la personne connectée : ses messages sont alignés à droite */
  viewerRole: 'MERCHANT' | 'ADMIN';
  /** Un ticket archivé se consulte mais ne reçoit plus de réponse */
  readOnly?: boolean;
  onSent?: () => void;
  /** Sur une page claire (espace commerçant) : bulles et champ en clair. */
  clair?: boolean;
}

export function TicketConversation({ basePath, ticketId, viewerRole, readOnly, onSent, clair = false }: Props) {
  const locale = useLocale();
  const t = useTranslations('ticketConversation');
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const fetchMessages = useCallback(async () => {
    try {
      const token = jetonAcces();
      const response = await fetch(`${API_URL}${basePath}/${ticketId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || t('loadError'));
      }

      const data = await response.json();
      setMessages(data.data || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [basePath, ticketId, t]);

  // Un autre ticket : la conversation affichée n'est plus la bonne.
  const conversation = `${basePath}/${ticketId}`;
  const [conversationVue, setConversationVue] = useState(conversation);
  if (conversation !== conversationVue) {
    setConversationVue(conversation);
    setLoading(true);
  }

  useEffectChargement(() => {
    fetchMessages();
  }, [fetchMessages]);

  // La réponse de l'autre côté arrive sans recharger : le support pour le
  // commerçant, le commerçant pour le support.
  useDonneesModifiees('tickets', fetchMessages, { id: ticketId });

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;

    setSending(true);
    try {
      const token = jetonAcces();
      const response = await fetch(`${API_URL}${basePath}/${ticketId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || t('sendError'));
      }

      setBody('');
      setError('');
      await fetchMessages();
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sendError'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
        {loading ? (
          <p className="text-gray-400 text-sm">{t('loadingConversation')}</p>
        ) : messages.length === 0 ? (
          <p className="text-gray-400 text-sm">{t('noMessages')}</p>
        ) : (
          messages.map((message) => {
            const fromViewer = message.authorRole === viewerRole;
            return (
              <div
                key={message.id}
                className={`flex ${fromViewer ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    fromViewer
                      ? clair
                        ? 'bg-orange-50 border border-orange-200'
                        : 'bg-blue-600/30 border border-blue-500/40'
                      : clair
                        ? 'bg-white border border-gray-200'
                        : 'bg-gray-700'
                  }`}
                >
                  <p className={`text-xs mb-1 ${clair ? 'font-semibold text-gray-700' : 'text-gray-300'}`}>
                    {message.authorName}
                    <span className="text-gray-500">
                      {' · '}
                      {message.authorRole === 'ADMIN' ? t('roleSupport') : t('roleMerchant')}
                    </span>
                  </p>
                  <p className={`text-sm whitespace-pre-wrap ${clair ? 'text-gray-900' : 'text-white'}`}>{message.body}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(message.createdAt).toLocaleString(locale)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div className={`rounded-lg p-3 text-sm border ${clair ? 'bg-red-50 border-red-200 text-red-800' : 'bg-red-500/20 border-red-500/50 text-red-400'}`}>
          {error}
        </div>
      )}

      {readOnly ? (
        <p className="text-sm text-gray-400">
          {t('readOnlyMessage')}
        </p>
      ) : (
        <form onSubmit={handleSend} className="flex gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder={t('replyPlaceholder')}
            className={`flex-1 rounded-lg px-4 py-2 focus:outline-hidden resize-none ${
              clair
                ? 'bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-orange-500'
                : 'bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:border-blue-500'
            }`}
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className={`px-4 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2 ${
              clair ? 'bg-gray-900 hover:bg-black text-white font-bold' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <Send size={18} />
            {sending ? '...' : t('sendButton')}
          </button>
        </form>
      )}
    </div>
  );
}
