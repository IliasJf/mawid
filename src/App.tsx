import { useEffect, useState } from "react";
import { BookPage } from "./booking/BookPage.tsx";
import { ManagePage } from "./booking/ManagePage.tsx";
import { OwnerPage } from "./owner/OwnerPage.tsx";
import { COPY } from "./lib/copy.ts";
import { REMOTE, useStore } from "./lib/store.ts";
import { Gate } from "./ui.tsx";
import type { Lang } from "./lib/types.ts";

/** Routes live in the hash so the demo works on any static host: #/, #/manage, #/owner/<tab>?day=… */
export interface Route {
  path: string[];
  query: URLSearchParams;
}
const readRoute = (): Route => {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  return { path: path.split("/").filter(Boolean), query: new URLSearchParams(query) };
};
export function go(path: string, query?: Record<string, string>, replace = false) {
  const q = query ? new URLSearchParams(query).toString() : "";
  const hash = `#/${path}${q ? "?" + q : ""}`;
  if (replace) history.replaceState(null, "", hash);
  else history.pushState(null, "", hash);
  dispatchEvent(new HashChangeEvent("hashchange"));
}

const LANG_KEY = "mawid:lang";
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "fr" || saved === "ar") return saved;
  } catch {}
  const browser = navigator.language.slice(0, 2);
  return browser === "ar" || browser === "fr" ? browser : "en";
}

export function App() {
  const [route, setRoute] = useState(readRoute);
  const [lang, setLangState] = useState<Lang>(initialLang);
  const t = COPY[lang];
  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    addEventListener("hashchange", onHash);
    addEventListener("popstate", onHash);
    return () => {
      removeEventListener("hashchange", onHash);
      removeEventListener("popstate", onHash);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
  }, [lang, t.dir]);
  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {}
  };
  const props = { t, lang, setLang, route };
  const scope = route.path[0] === "owner" ? "owner" : "public";
  const { status, scope: loaded } = useStore(scope);
  // On a real shop's server, nothing renders until this page's view of the shop has arrived.
  if (REMOTE && (status !== "ready" || loaded !== scope)) return <Gate {...props} scope={scope} status={loaded === scope ? status : "loading"} />;
  if (route.path[0] === "owner") return <OwnerPage {...props} />;
  if (route.path[0] === "manage") return <ManagePage {...props} />;
  return <BookPage {...props} />;
}

export interface PageProps {
  t: (typeof COPY)[Lang];
  lang: Lang;
  setLang: (l: Lang) => void;
  route: Route;
}
