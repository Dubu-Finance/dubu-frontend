"use client";

/**
 * Where the language meets the Korean content. This is the only module that imports `ko.tsx`,
 * and it is the single import the page needs.
 *
 * Module graph, and it is acyclic in this order:
 *
 *   docs-data.ts    leaf, language-neutral payloads and the section ids
 *   docs-lang.tsx   leaf, the state, the context, the chrome strings, the toggle
 *   docs-blocks.tsx docs-data + docs-lang
 *   ko.tsx          docs-data + docs-blocks
 *   docs-i18n.tsx   docs-lang + ko          <- you are here
 *
 * The reason `docs-lang.tsx` is separate is that `CodeBlock` needs `useLang()`; if the context
 * lived here, `docs-blocks` would import this module and this module imports `ko.tsx` which
 * imports `docs-blocks`, and the cycle would be real.
 */

import type { ReactNode } from "react";
import type { SectionId } from "./docs-data";
import { type Lang, useLang } from "./docs-lang";
import { KO, KO_NAV } from "./ko";

export { LangProvider, LangToggle, UI, useDocsLang, useLang } from "./docs-lang";
export type { Lang } from "./docs-lang";

/**
 * A documentation section, in whichever language the page is set to.
 *
 * If there is no Korean entry for this id, the English `children` render. That is the whole
 * fallback: it is the absence of an entry, so it cannot be forgotten and it cannot fail.
 *
 * `lang` is set on the section rather than on `<html>`, because with a partly translated page
 * the document genuinely is mixed and a root-level value would be a lie. It also drives font
 * fallback, line breaking and screen-reader voice per section, which is what is actually wanted.
 */
export function Section({
  id,
  className = "docs-section",
  children,
}: {
  id: SectionId;
  className?: string;
  children: ReactNode;
}) {
  const lang = useLang();
  const ko = lang === "ko" ? KO[id] : undefined;

  return (
    <section className={className} id={id} lang={ko ? "ko" : "en"}>
      {ko ? ko() : children}
    </section>
  );
}

/** A sidebar or contents label, falling back to the English exactly like a section does. */
export function navLabel(lang: Lang, label: string): string {
  return lang === "ko" ? KO_NAV[label] ?? label : label;
}
