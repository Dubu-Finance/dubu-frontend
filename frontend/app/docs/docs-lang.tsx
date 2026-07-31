"use client";

/**
 * The language primitives: the state, the context that carries it, the always-translated chrome
 * strings, and the toggle itself.
 *
 * This module is a leaf. It knows nothing about which sections have Korean, which is what lets
 * `docs-blocks.tsx` use `useLang()` and `UI` without creating a cycle through `ko.tsx`. The join
 * between the language and the Korean content happens in `docs-i18n.tsx`.
 */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";

export type Lang = "en" | "ko";

const LANG_STORAGE_KEY = "dubu-docs-lang";
const LANG_QUERY_KEY = "lang";

function isLang(value: string | null): value is Lang {
  return value === "en" || value === "ko";
}

/**
 * A layout effect in the browser, an inert effect on the server.
 *
 * The stored language cannot be read in a `useState` initialiser: the server always renders
 * English, so a client that started in Korean would disagree with the SSR HTML and React would
 * throw a hydration error. It has to be applied after mount. Applying it in a *layout* effect is
 * what stops the reader seeing English repaint to Korean.
 *
 * The branch is a module-level const, so hook order is stable within either environment.
 */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Language state for the docs page.
 *
 * Source of truth on load is `?lang=ko` first, then `localStorage`, else English. Changing it
 * writes both, so a copied URL carries the language and a reader who arrives without a query
 * gets their last choice back.
 */
export function useDocsLang() {
  const [lang, setLangState] = useState<Lang>("en");

  useBeforePaint(() => {
    const fromQuery = new URLSearchParams(window.location.search).get(LANG_QUERY_KEY);
    if (isLang(fromQuery)) {
      if (fromQuery !== "en") setLangState(fromQuery);
      return;
    }
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    } catch {
      // Storage can be disabled. The page still works, it just does not remember.
    }
    if (isLang(stored) && stored !== "en") setLangState(stored);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);

    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // Same as above: no memory, but no crash either.
    }

    const url = new URL(window.location.href);
    if (next === "en") url.searchParams.delete(LANG_QUERY_KEY);
    else url.searchParams.set(LANG_QUERY_KEY, next);
    // replaceState, not pushState: Back should leave the docs, not undo the language, and it
    // would otherwise fight the #anchor entries the sidebar pushes.
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  return { lang, setLang };
}

const LangContext = createContext<Lang>("en");

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext value={lang}>{children}</LangContext>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

type UiStrings = {
  langGroup: string;
  searchAria: string;
  searchPlaceholder: string;
  noMatches: string;
  browse: string;
  breadcrumbDocs: string;
  onThisPage: string;
  copy: string;
  copied: string;

  // Header. The aria-labels are in here for the same reason the visible strings are: a screen
  // reader announcing "Primary navigation" in an otherwise Korean page is a worse experience than
  // a sighted reader seeing one English word, not a better one.
  brandHome: string;
  primaryNav: string;
  navSwap: string;
  navWhy: string;
  navRouting: string;
  navDocs: string;
  themeLight: string;
  themeDark: string;
  launchApp: string;
  toggleNav: string;
  docsNav: string;
  closeDocsNav: string;
};

/**
 * Page chrome, always translated.
 *
 * These are short, plain strings with nothing embedded in them, which is the one case where a
 * string table is the right tool. Prose is not in here: it lives as JSX in `ko.tsx`, per section.
 */
export const UI: Record<Lang, UiStrings> = {
  en: {
    langGroup: "Documentation language",
    searchAria: "Search documentation",
    searchPlaceholder: "Search docs",
    noMatches: "No matching pages.",
    browse: "Browse documentation",
    breadcrumbDocs: "Docs",
    onThisPage: "On this page",
    copy: "Copy",
    copied: "Copied",
    brandHome: "Dubu home",
    primaryNav: "Primary navigation",
    navSwap: "Swap",
    navWhy: "Why Dubu",
    navRouting: "Routing",
    navDocs: "Docs",
    themeLight: "Use light theme",
    themeDark: "Use dark theme",
    launchApp: "Launch app",
    toggleNav: "Toggle navigation",
    docsNav: "Documentation navigation",
    closeDocsNav: "Close documentation navigation",
  },
  ko: {
    langGroup: "문서 언어",
    searchAria: "문서 검색",
    searchPlaceholder: "문서 검색",
    noMatches: "일치하는 문서가 없습니다.",
    browse: "문서 목록 보기",
    breadcrumbDocs: "문서",
    onThisPage: "이 페이지의 목차",
    copy: "복사",
    copied: "복사됨",
    brandHome: "Dubu 홈",
    primaryNav: "주 메뉴",
    navSwap: "스왑",
    navWhy: "Dubu를 쓰는 이유",
    navRouting: "라우팅",
    navDocs: "문서",
    themeLight: "라이트 테마로 전환",
    themeDark: "다크 테마로 전환",
    launchApp: "앱 실행",
    toggleNav: "메뉴 열고 닫기",
    docsNav: "문서 메뉴",
    closeDocsNav: "문서 메뉴 닫기",
  },
};

/**
 * A two-segment control rather than one icon button. The current theme is visible from the whole
 * page, so the theme button can get away with showing only its destination. The current language
 * is not, and a lone glyph reads as neither state nor destination. Two segments show both at once
 * and advertise that a Korean version exists at all.
 */
export function LangToggle({ lang, onChange }: { lang: Lang; onChange: (next: Lang) => void }) {
  return (
    <div className="docs-lang-toggle" role="group" aria-label={UI[lang].langGroup}>
      <button type="button" lang="en" aria-pressed={lang === "en"} onClick={() => onChange("en")}>
        EN
      </button>
      <button type="button" lang="ko" aria-pressed={lang === "ko"} onClick={() => onChange("ko")}>
        한국어
      </button>
    </div>
  );
}
