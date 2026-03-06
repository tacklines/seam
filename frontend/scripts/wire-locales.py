#!/usr/bin/env python3
"""Wire generated locale files into i18n.ts imports and locale map.

Run this after translate.py has generated all i18n.<locale>.ts files.
It rewrites frontend/src/lib/i18n.ts to import and register all locales.
"""

import os
import re

I18N_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "i18n.ts")

# Same locale list as translate.py
LOCALES = [
    "es-mx", "nl", "pl", "he", "hi", "te", "ur", "pa",
    "fr", "de", "it", "pt-br", "sv", "uk", "cs", "tr",
    "zh", "ja", "ko", "th", "vi", "id", "bn", "ta",
    "ar", "fa", "sw", "am",
]

RTL_LOCALES = {"he", "ur", "ar", "fa"}


def make_export_name(locale: str) -> str:
    if "-" in locale:
        parts = locale.split("-")
        return "messages" + parts[0].title() + parts[1].title()
    return "messages" + locale.title()


def main():
    with open(I18N_PATH) as f:
        content = f.read()

    # Check which locale files actually exist
    lib_dir = os.path.dirname(I18N_PATH)
    available = [loc for loc in LOCALES if os.path.exists(os.path.join(lib_dir, f"i18n.{loc}.ts"))]
    print(f"Found {len(available)}/{len(LOCALES)} locale files")

    if not available:
        print("No locale files found. Run translate.py first.")
        return

    # Build imports block
    imports = []
    for loc in available:
        name = make_export_name(loc)
        imports.append(f"import {{ {name} }} from './i18n.{loc}.js';")
    imports_block = "\n".join(imports)

    # Build Locale type
    locale_union = " | ".join([f"'{loc}'" for loc in ["en"] + available])
    locale_type = f"export type Locale =\n  | {locale_union.replace(' | ', chr(10) + '  | ')};"

    # Build RTL set
    rtl_available = [loc for loc in available if loc in RTL_LOCALES]
    if rtl_available:
        rtl_entries = ", ".join(f"'{loc}'" for loc in rtl_available)
        rtl_line = f"export const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>([{rtl_entries}]);"
    else:
        rtl_line = "export const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>([]);"

    # Build locale map entries
    map_entries = ["  'en': {} as Record<string, string>, // populated below"]
    for loc in available:
        name = make_export_name(loc)
        map_entries.append(f"  '{loc}': {name},")
    map_block = "\n".join(map_entries)

    # Rewrite the file
    # Replace imports (everything before the first export)
    # Strategy: rebuild the file from sections

    # Extract messagesEn block (between "export const messagesEn" and the closing "};")
    en_match = re.search(r'(export const messagesEn: Record<string, string> = \{.*?^\};)', content, re.DOTALL | re.MULTILINE)
    if not en_match:
        print("ERROR: Could not find messagesEn block in i18n.ts")
        return
    messages_en_block = en_match.group(1)

    new_content = f"""/**
 * Lightweight i18n module for Seam frontend.
 * Flat messages object + t() lookup with {{{{param}}}} interpolation.
 * Missing keys fall back to English, then to the key itself.
 */

{imports_block}

{locale_type}

{rtl_line}

let currentLocale: Locale = 'en';

export function setLocale(locale: Locale): void {{
  currentLocale = locale;
}}

export function getLocale(): Locale {{
  return currentLocale;
}}

export function isRtl(): boolean {{
  return RTL_LOCALES.has(currentLocale);
}}

export function detectLocale(): Locale {{
  if (typeof navigator === 'undefined') return 'en';
  const candidates = [...(navigator.languages || []), navigator.language].filter(Boolean);
  const supported = Object.keys(localeMessages) as Locale[];

  for (const tag of candidates) {{
    const lower = tag.toLowerCase();
    const exact = supported.find(l => l === lower);
    if (exact) return exact;
    const base = lower.split('-')[0];
    const partial = supported.find(l => l === base || l.startsWith(base + '-'));
    if (partial) return partial;
  }}
  return 'en';
}}

const localeMessages: Record<Locale, Record<string, string>> = {{
{map_block}
}};

{messages_en_block}

// Wire English into the locale map
localeMessages['en'] = messagesEn;
export const messages = messagesEn;

export function t(key: string, params?: Record<string, string | number>): string {{
  const localeMsg = localeMessages[currentLocale];
  let value = localeMsg?.[key] ?? messagesEn[key] ?? key;
  if (params) {{
    for (const [k, v] of Object.entries(params)) {{
      value = value.replace(new RegExp(`\\\\{{\\\\{{${{k}}\\\\}}\\\\}}`, 'g'), String(v));
    }}
  }}
  return value;
}}
"""

    with open(I18N_PATH, "w") as f:
        f.write(new_content)
    print(f"Updated {I18N_PATH} with {len(available)} locale imports")


if __name__ == "__main__":
    main()
