import { LANG_NAMES } from "./lib/copy.ts";
import type { Lang } from "./lib/types.ts";
import type { PageProps } from "./App.tsx";

export function LanguagePicker({ t, lang, setLang }: Pick<PageProps, "t" | "lang" | "setLang">) {
  return (
    <label className="lang">
      <span className="visually-hidden">{t.language}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
        {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
          <option key={l} value={l} lang={l}>
            {LANG_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The settled state, pressed into the card stock. */
export function Pressed({ children }: { children: React.ReactNode }) {
  return (
    <span className="pressed" aria-hidden="true">
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  id,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  id: string;
  optional?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {optional && <span className="field-optional"> ({optional})</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
