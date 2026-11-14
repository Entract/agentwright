import { useEffect, useRef, useState } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { indentLess, indentMore } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { EditorView, keymap } from '@codemirror/view'

const extensions = [
  python(),
  indentUnit.of('    '),
  keymap.of([{ key: 'Tab', run: indentMore, shift: indentLess }]),
  EditorView.contentAttributes.of({ autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' }),
]

/** Characters that are slow to reach on a phone keyboard. */
const KEYS = [':', '(', ')', '[', ']', '"', '=', '_', '.', ',', '<', '>', '+', '{', '}']

function useDark(): boolean {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const [dark, setDark] = useState(query.matches)
  useEffect(() => {
    const on = (e: MediaQueryListEvent) => setDark(e.matches)
    query.addEventListener('change', on)
    return () => query.removeEventListener('change', on)
  }, [query])
  return dark
}

interface Props {
  value: string
  onChange: (value: string) => void
  minHeight?: string
  /** The row of symbol keys for phone keyboards. Off on a desktop. */
  showKeys?: boolean
  /** Fill the height of the parent instead of growing with the text. */
  fill?: boolean
  /** Shown for reading only: a file the app supplies and the learner cannot change. */
  readOnly?: boolean
}

/** Python editor with highlighting, automatic indentation and a row of symbol keys for phones. */
export default function CodeEditor({ value, onChange, minHeight = '180px', showKeys = true, fill = false, readOnly = false }: Props) {
  const ref = useRef<ReactCodeMirrorRef>(null)
  const dark = useDark()

  function withView(action: (view: EditorView) => void) {
    const view = ref.current?.view
    if (!view) return
    action(view)
    view.focus()
  }

  const insert = (text: string) =>
    withView((view) => view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true, userEvent: 'input' }))

  return (
    <div className={fill ? 'editor-fill' : undefined}>
      {showKeys && <div className="keys" role="toolbar" aria-label="Editor keys">
        <button type="button" onClick={() => withView((v) => indentMore(v))} aria-label="Indent">⇥</button>
        <button type="button" onClick={() => withView((v) => indentLess(v))} aria-label="Remove indent">⇤</button>
        {KEYS.map((k) => (
          <button type="button" key={k} onClick={() => insert(k)} aria-label={`Insert ${k}`}>
            {k}
          </button>
        ))}
      </div>}
      <div className="editor">
        <CodeMirror
          ref={ref}
          value={value}
          onChange={onChange}
          extensions={extensions}
          readOnly={readOnly}
          theme={dark ? 'dark' : 'light'}
          minHeight={fill ? undefined : minHeight}
          height={fill ? '100%' : undefined}
          basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false, autocompletion: false, tabSize: 4 }}
        />
      </div>
    </div>
  )
}
