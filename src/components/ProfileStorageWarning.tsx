import { useProfileQuotaExceeded } from '@/lib/profile';
import { useUiLanguage } from '@/lib/ui-language/store';

/** Mount-local failed-save notice. No retry, deletion or durable-recovery promise. */
export function ProfileStorageWarning() {
  const quotaExceeded = useProfileQuotaExceeded();
  const { language } = useUiLanguage();
  if (!quotaExceeded) return null;
  return <div role="status" lang={language} dir={language === 'en' ? 'ltr' : 'rtl'}
    className="mx-4 my-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-foreground">
    {language === 'en'
      ? 'Storage is full. Some changes could not be saved on this device. Do not clear app data.'
      : 'مساحة التخزين ممتلئة. تعذّر حفظ بعض التغييرات على هذا الجهاز. لا تمسح بيانات التطبيق.'}
  </div>;
}
