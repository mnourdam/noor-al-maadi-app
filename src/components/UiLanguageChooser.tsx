import { useId } from 'react';
import { useUiLanguage } from '@/lib/ui-language/store';
/** Deliberately local language island; does not flip untranslated page layout. */
export function UiLanguageChooser() {
  const id = useId();
  const { language, direction, messages, setLanguage } = useUiLanguage();
  return <aside lang={language} dir={direction} className="mx-3 mt-2 rounded-xl border border-white/10 px-3 py-2 text-xs">
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id}>{messages.language}</label>
      <select id={id} value={language} aria-describedby={`${id}-scope`}
        className="rounded border border-white/20 bg-background px-2 py-1"
        onChange={event => { if (event.target.value === 'ar' || event.target.value === 'en') setLanguage(event.target.value); }}>
        <option value="ar" lang="ar">{messages.arabic}</option>
        <option value="en" lang="en">{messages.english}</option>
      </select>
    </div>
    <p id={`${id}-scope`} className="mt-1 text-muted-foreground">{messages.scope}</p>
  </aside>;
}
