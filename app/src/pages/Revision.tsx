import { getSetting, setSetting } from '../db/db'
import { saveTextFile } from '../db/files'
import RevisionView, { type RevisionStorage } from '../revision/Revision'
import { installPhoneHost } from '../revision/phoneHost'

// The phone answers the messages the PC window's host program answers, so Revision works the same way here.
installPhoneHost()

/** Kept with the app's other settings, so the app's own backup includes the sets and their history. */
const storage: RevisionStorage = {
  load: () => getSetting<string | null>('revisionStore', null),
  save: (text) => setSetting('revisionStore', text),
}

export default function Revision() {
  return <RevisionView storage={storage} saveFile={saveTextFile} phoneKeys wide />
}
