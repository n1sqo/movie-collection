import { useState } from 'preact/hooks'
import { lang, t, type Lang } from '../i18n'
import { saveLang, saveTmdbToken, tmdbToken } from '../settings'
import { checkToken, TmdbError } from '../api/tmdb'
import { Screen } from '../components/Screen'

type CheckState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok' } | { kind: 'saved' } | { kind: 'error'; message: string }

export function Settings() {
  const [token, setToken] = useState(tmdbToken.value)
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' })

  async function onSave() {
    await saveTmdbToken(token)
    setCheck({ kind: 'saved' })
  }

  async function onCheck() {
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
    <Screen title={t('titles.settings')}>
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
      <p class="group-footer">{t('settings.tmdbTokenHint')}</p>

      <div class="attribution">
        <img src={`${import.meta.env.BASE_URL}tmdb-logo.svg`} alt="TMDB" width={96} height={96} />
        <p>{t('settings.attribution')}</p>
      </div>
    </Screen>
  )
}
