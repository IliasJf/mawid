import { useState } from "react";
import { BackendError, problemText, signIn } from "./lib/backend.ts";
import { LANG_NAMES } from "./lib/copy.ts";
import { refresh, type Scope, type Status } from "./lib/store.ts";
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

/** What a real shop's page shows before the shop arrives: loading, a problem, or the owner's PIN. */
export function Gate({ t, lang, setLang, scope, status }: Pick<PageProps, "t" | "lang" | "setLang"> & { scope: Scope; status: Status }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="page page-book">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="wordmark">{scope === "owner" ? t.ownerTitle : ""}</span>
          <div className="topbar-actions">
            <LanguagePicker t={t} lang={lang} setLang={setLang} />
          </div>
        </div>
      </header>
      <main className="container gate" id="main">
        {status === "loading" && (
          <p className="gate-note" role="status">
            {t.loading}
          </p>
        )}
        {status === "error" && (
          <div className="gate-note" role="alert">
            <p>{t.loadFailed}</p>
            <button type="button" className="btn btn--card" onClick={() => void refresh(scope)}>
              {t.tryAgain}
            </button>
          </div>
        )}
        {status === "setup" && (
          <p className="gate-note" role="alert">
            {t.problems.setup}
          </p>
        )}
        {status === "signed-out" && (
          <form
            className="manage-form stock"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await signIn(pin);
              } catch (cause) {
                setError(problemText(t, cause));
                if (cause instanceof BackendError && cause.code === "pin") setPin("");
                document.getElementById("pin")?.focus();
              } finally {
                setBusy(false);
              }
            }}
          >
            <h1>{t.signInTitle}</h1>
            <p className="muted">{t.signInLead}</p>
            <Field label={t.pin} id="pin" error={error}>
              <input
                id="pin"
                className="fig"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                dir="ltr"
                maxLength={12}
                value={pin}
                aria-invalid={!!error || undefined}
                aria-describedby={error ? "pin-error" : undefined}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError("");
                }}
              />
            </Field>
            <button className="btn btn--ink btn--block" type="submit" disabled={busy || !pin} aria-busy={busy || undefined}>
              {busy ? t.signingIn : t.signIn}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
