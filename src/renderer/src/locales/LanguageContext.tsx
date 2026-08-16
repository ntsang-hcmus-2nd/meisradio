import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { Language, TranslationDictionary } from './types'
import { en } from './en'
import { vi } from './vi'

const dictionaries: Record<Language, TranslationDictionary> = {
  en,
  vi
}

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (path: string, params?: Record<string, string | number>) => string
  dict: TranslationDictionary
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

const STORAGE_KEY = 'app_language'

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'en' || saved === 'vi') return saved
    } catch {
      // ignore
    }
    return 'en' // Default to English as requested
  })

  // Sync with electron config if available
  useEffect(() => {
    if ((window as any).api?.getConfig) {
      ;(window as any).api.getConfig().then((cfg: any) => {
        if (cfg && (cfg.language === 'en' || cfg.language === 'vi')) {
          setLanguageState(cfg.language)
          try {
            localStorage.setItem(STORAGE_KEY, cfg.language)
          } catch {}
        }
      }).catch(() => {})
    }
  }, [])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {}
    if ((window as any).api?.saveConfig) {
      ;(window as any).api.saveConfig({ language: lang }).catch(() => {})
    }
  }, [])

  const dict = useMemo(() => dictionaries[language] || en, [language])

  const t = useCallback(
    (path: string, params?: Record<string, string | number>): string => {
      const keys = path.split('.')
      let current: any = dict
      for (const k of keys) {
        if (current && typeof current === 'object' && k in current) {
          current = current[k]
        } else {
          // Fallback to English
          let fallback: any = en
          for (const fk of keys) {
            if (fallback && typeof fallback === 'object' && fk in fallback) {
              fallback = fallback[fk]
            } else {
              return path
            }
          }
          current = fallback
          break
        }
      }

      if (typeof current !== 'string') return path

      if (params) {
        return Object.entries(params).reduce((str, [key, val]) => {
          return str.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val))
        }, current)
      }

      return current
    },
    [dict]
  )

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      dict
    }),
    [language, setLanguage, t, dict]
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}

export const useTranslation = () => {
  return useLanguage()
}
