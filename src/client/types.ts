import type { OfficeFeatureId } from '../features'

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface UserTextDataMap {
    readonly office: {
      /** Stable feature id persisted inside the draft. */
      readonly feature: OfficeFeatureId
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the office `/` menu. */
    'dsh-office-suite': string
  }
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    /** A skill-catalog fetch owned by the office menu. */
    officeCatalog: unknown
  }
}

/** Session-bound preview action injected into the chip slot. */
export interface OfficeChipInjected {
  openOffice: (feature: OfficeFeatureId) => void
  officeLabel: (feature: OfficeFeatureId) => string
}
