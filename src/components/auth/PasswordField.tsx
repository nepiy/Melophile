'use client'

import { useId, useState } from 'react'
import { MIN_ACCOUNT_PASSWORD } from '@/lib/validation'

/* ==========================================================================
   A password box with a show/hide toggle, and — on the two forms that set a
   new password — a meter and a checklist.

   THE METER IS NOT AN OPINION
   Every segment it lights corresponds to a rule passwordField actually
   enforces in src/lib/validation.ts: at least MIN_ACCOUNT_PASSWORD
   characters, at least one letter, at least one number. The fourth segment is
   a length bonus and nothing else. A meter that says "strong" about something
   the server then refuses is worse than no meter, so this one cannot: the
   only way to reach "Fine" is to satisfy every rule the server checks.

   It never blocks typing, and there is no maxLength on the input. The server
   decides; this only makes the rules visible before submitting rather than
   after.
   ========================================================================== */

/** Above this, the fourth segment lights and the label reads "Strong". */
const STRONG_LENGTH = 16

export type PasswordFieldProps = {
  id: string
  name: string
  label: string
  value: string
  /**
   * 'current-password' when signing in, 'new-password' when setting one.
   * Getting this wrong is how password managers end up saving the old
   * password over the new one.
   */
  autoComplete: 'current-password' | 'new-password'
  onChange: (value: string) => void
  onBlur?: () => void
  /** Lets the form focus this field when it, or the server, rejects it. */
  onRef?: (element: HTMLInputElement | null) => void
  error?: string
  hint?: string
  /** The meter and checklist. Sign-up and reset only — never on sign-in. */
  meter?: boolean
  required?: boolean
}

export function PasswordField({
  id,
  name,
  label,
  value,
  autoComplete,
  onChange,
  onBlur,
  onRef,
  error,
  hint,
  meter = false,
  required = false,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const rulesId = useId()

  const rules = checkRules(value)
  const score = strength(value, rules)

  const describedBy =
    [hint ? `${id}-hint` : null, meter ? rulesId : null, error ? `${id}-err` : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className="au-field">
      <label className="label au-field__label" htmlFor={id}>
        {label}
      </label>

      <span className="au-pass">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          className="au-box au-box--mono"
          autoComplete={autoComplete}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required={required}
          value={value}
          ref={onRef}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.currentTarget.value)}
          onBlur={onBlur}
        />

        {/* A real button, so it is reachable by keyboard and announced as a
            toggle. The visible word is the start of the accessible name, which
            is what "label in name" requires of a control whose visible text is
            shorter than the name a screen reader gets. */}
        <button
          type="button"
          className="au-pass__toggle"
          aria-pressed={visible}
          onClick={() => setVisible((on) => !on)}
        >
          {visible ? 'Hide' : 'Show'}
          <span className="vh"> password</span>
        </button>
      </span>

      {hint ? (
        <p className="mono au-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}

      {meter ? (
        <>
          <div className="au-meter">
            <div className="au-meter__track" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <span
                  key={index}
                  className={`au-meter__seg${index < score ? ' is-lit' : ''}`}
                />
              ))}
            </div>

            {/* The bar is decoration; this line is the meter. */}
            <p className="mono au-meter__label" aria-live="polite">
              {value ? strengthLabel(score) : ''}
            </p>
          </div>

          <ul className="au-rules" id={rulesId}>
            {rules.map((rule) => (
              <li key={rule.key} className={`au-rule${rule.met ? ' is-met' : ''}`}>
                <span className="au-rule__mark" aria-hidden="true" />
                <span className="mono au-rule__text">{rule.text}</span>
                <span className="vh">{rule.met ? ' — met' : ' — not yet'}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {error ? (
        <p className="au-err" id={`${id}-err`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------------------
   The rules, verbatim from passwordField in src/lib/validation.ts.
   -------------------------------------------------------------------------- */

type Rule = { key: string; text: string; met: boolean }

function checkRules(value: string): Rule[] {
  return [
    {
      key: 'length',
      text: `At least ${MIN_ACCOUNT_PASSWORD} characters`,
      met: value.length >= MIN_ACCOUNT_PASSWORD,
    },
    { key: 'letter', text: 'A letter', met: /[a-z]/i.test(value) },
    { key: 'number', text: 'A number', met: /\d/.test(value) },
  ]
}

/**
 * Segments lit, 0–4. Three for the rules, one for length beyond the minimum.
 *
 * Deliberately all-or-nothing at the top: while any rule is unmet the count
 * cannot exceed two, so the bar can never look nearly-full for something that
 * would be rejected.
 */
function strength(value: string, rules: Rule[]): number {
  if (!value) return 0
  const met = rules.filter((rule) => rule.met).length
  if (met < rules.length) return Math.min(met, 2)
  return value.length >= STRONG_LENGTH ? 4 : 3
}

/**
 * One label for every state the server would refuse, because the difference
 * between them is not the point — the checklist underneath says exactly which
 * rule is missing.
 */
function strengthLabel(score: number): string {
  if (score >= 4) return 'Strong'
  if (score >= 3) return 'Fine'
  return 'Too short'
}
