import { euro } from '@/lib/format';
import { useTranslations } from 'next-intl';

type Montant = number | string | null | undefined;

/**
 * Le détail de ce que le client a payé : chaque ligne, puis le total.
 *
 * Le suivi omettait la remise (15 + 5 + 0,25 annonçait 18,25 €), le détail
 * de « Mes commandes » ne montrait ni la livraison, ni la remise, ni le
 * sous-total. Et son « Total HT » retirait la TVA des articles d'un total qui
 * comprend aussi la livraison et les frais : il était faux. Seule la TVA,
 * connue, s'affiche.
 */
export default function DetailDuTotal({
  commande,
  couleurTotal = 'text-gray-900',
}: {
  commande: {
    totalAmount: Montant;
    feesAmount?: Montant;
    serviceFeeAmount?: Montant;
    discountAmount?: Montant;
    /** Le pourboire du livreur, payé en plus de la commande. */
    tipAmount?: Montant;
    promoCode?: string | null;
    taxAmount?: Montant;
    taxRate?: Montant;
    deliveryType?: string;
    items?: { price: Montant; quantity: number }[];
  };
  couleurTotal?: string;
}) {
  const t = useTranslations('detailDuTotal');
  const sousTotal = (commande.items || []).reduce(
    (somme, ligne) => somme + Number(ligne.price || 0) * ligne.quantity,
    0
  );

  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between text-gray-500">
        <span>{t('sousTotal')}</span>
        <span>{euro(sousTotal)}</span>
      </div>
      {commande.deliveryType === 'DELIVERY' && (
        <div className="flex justify-between text-gray-500">
          <span>{t('livraison')}</span>
          <span>{Number(commande.feesAmount) > 0 ? euro(commande.feesAmount) : t('offerte')}</span>
        </div>
      )}
      {Number(commande.serviceFeeAmount) > 0 && (
        <div className="flex justify-between text-gray-500">
          <span>{t('fraisService')}</span>
          <span>{euro(commande.serviceFeeAmount)}</span>
        </div>
      )}
      {Number(commande.discountAmount) > 0 && (
        <div className="flex justify-between text-green-600">
          <span>{commande.promoCode ? t('remiseCode', { code: commande.promoCode }) : t('remise')}</span>
          <span>− {euro(commande.discountAmount)}</span>
        </div>
      )}
      {Number(commande.tipAmount) > 0 && (
        <div className="flex justify-between text-gray-500">
          <span>{t('pourboire')}</span>
          <span>{euro(commande.tipAmount)}</span>
        </div>
      )}
      <div className="flex justify-between items-center pt-2 border-t border-gray-200 text-lg font-bold text-gray-900">
        <span>{t('total')}</span>
        {/* Ce que le client a payé : la commande et le pourboire, gardé à part. */}
        <span className={`text-2xl ${couleurTotal}`}>
          {euro(Number(commande.totalAmount || 0) + Number(commande.tipAmount || 0))}
        </span>
      </div>
      {Number(commande.taxAmount) > 0 && (
        <div className="flex justify-between text-gray-500">
          <span>
            {Number(commande.taxRate) > 0 ? t('dontTvaTaux', { taux: Number(commande.taxRate) }) : t('dontTva')}
          </span>
          <span>{euro(commande.taxAmount)}</span>
        </div>
      )}
    </div>
  );
}
