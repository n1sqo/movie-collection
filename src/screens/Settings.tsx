import { useState } from 'preact/hooks'
import { lang, t, type Lang } from '../i18n'
import { saveLang, saveTmdbToken, tmdbToken } from '../settings'
import { checkToken, TmdbError } from '../api/tmdb'
import tmdbLogo from '../assets/tmdb-logo.svg'
import { BackupSettings } from '../components/BackupSettings'
import { DataSettings } from '../components/DataSettings'

/** The short 32-character "API Key" from TMDB is a different credential than the Read Access Token. */
const looksLikeApiKey = (value: string) => /^[a-f0-9]{32}$/i.test(value.trim())

type CheckState =
  { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok' } | { kind: 'saved' } | { kind: 'error'; message: string }

/** Language, TMDB key, backup and data: the lower half of the «Я» screen. */
export function SettingsSections() {
  const [token, setToken] = useState(tmdbToken.value)
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' })

  async function onSave() {
    if (looksLikeApiKey(token)) {
      setCheck({ kind: 'error', message: t('settings.wrongKeyType') })
      return
    }
    await saveTmdbToken(token)
    setCheck({ kind: 'saved' })
  }

  async function onCheck() {
    if (looksLikeApiKey(token)) {
      setCheck({ kind: 'error', message: t('settings.wrongKeyType') })
      return
    }
    setCheck({ kind: 'busy' })
    try {
      await checkToken(token.trim())
      await saveTmdbToken(token)
      setCheck({ kind: 'ok' })
    } catch (err) {
      const kind = err instanceof TmdbError ? err.kind : 'network'
      setCheck({ kind: 'error', message: t(`errors.${kind}`) })
    }
  }

  return (
    <>
      <h2 class="section-title">{t('titles.settings')}</h2>
      <h2 class="group-title">{t('settings.language')}</h2>
      <div class="group">
        <div class="segmented">
          {(['uk', 'en'] as Lang[]).map((l) => (
            <button key={l} class={lang.value === l ? 'active' : ''} onClick={() => saveLang(l)}>
              {l === 'uk' ? 'Українська' : 'English'}
            </button>
          ))}
        </div>
      </div>

      <h2 class="group-title">{t('settings.tmdb')}</h2>
      <div class="group">
        <label class="field">
          <span>{t('settings.tmdbToken')}</span>
          <input
            type="password"
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            value={token}
            onInput={(e) => {
              setToken(e.currentTarget.value)
              setCheck({ kind: 'idle' })
            }}
          />
        </label>
        <div class="row-buttons">
          <button class="btn" onClick={onSave} disabled={!token.trim()}>
            {t('settings.save')}
          </button>
          <button class="btn" onClick={onCheck} disabled={!token.trim() || check.kind === 'busy'}>
            {check.kind === 'busy' ? t('settings.checking') : t('settings.check')}
          </button>
        </div>
        {check.kind === 'ok' && <p class="status ok">{t('settings.ok')}</p>}
        {check.kind === 'saved' && <p class="status ok">{t('settings.saved')}</p>}
        {check.kind === 'error' && <p class="status error">{check.message}</p>}
      </div>
      <div class="group-footer">
        <p>{t('settings.tmdbTokenHint')}</p>
        <ol class="steps">
          <li>{t('settings.tmdbStep1')}</li>
          <li>{t('settings.tmdbStep2')}</li>
          <li>{t('settings.tmdbStep3')}</li>
        </ol>
        <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">
          themoviedb.org/settings/api
        </a>
      </div>

      <BackupSettings />

      <DataSettings />

      <div class="attribution">
        <img src={tmdbLogo} alt="TMDB" width={96} height={96} />
        <p>{t('settings.attribution')}</p>
        <p class="version">
          {t('settings.version')} {__APP_VERSION__}
        </p>
      </div>
    </>
  )
}
