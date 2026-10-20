import type { ReactElement, SVGProps } from 'react'
import type { OfficeFeatureId } from '../features'

type OfficeIconProps = SVGProps<SVGSVGElement> & { size?: number }

function frame(props: OfficeIconProps): SVGProps<SVGSVGElement> {
  const { size = 16, ...rest } = props
  return {
    'width': size,
    'height': size,
    'viewBox': '0 0 16 16',
    'fill': 'none',
    'stroke': 'currentColor',
    'strokeWidth': 1.2,
    'strokeLinecap': 'round',
    'strokeLinejoin': 'round',
    'aria-hidden': true,
    ...rest,
  }
}

/** A document page with text lines. */
export function DocumentsIcon(props: OfficeIconProps): ReactElement {
  return (
    <svg {...frame(props)}>
      <path d="M3.5 1.75h5l4 4v8.5h-9z" />
      <path d="M8.5 1.75v4h4" />
      <path d="M5.5 9h5M5.5 11.5h5" />
    </svg>
  )
}

/** A document page with a PDF badge. */
export function PdfIcon(props: OfficeIconProps): ReactElement {
  return (
    <svg {...frame(props)}>
      <path d="M3.5 1.75h5l4 4v8.5h-9z" />
      <path d="M8.5 1.75v4h4" />
      <path d="M5.25 9.25h1.1a1 1 0 0 1 0 2h-1.1zM5.25 12.75v-1.5" />
      <path d="M8.4 9.25h1.05c.9 0 1.55.7 1.55 1.75s-.65 1.75-1.55 1.75H8.4z" />
    </svg>
  )
}

/** A presentation screen with a play mark. */
export function PresentationsIcon(props: OfficeIconProps): ReactElement {
  return (
    <svg {...frame(props)}>
      <rect x="1.75" y="2.25" width="12.5" height="9" rx="1.25" />
      <path d="M8 13.25v1.5M5.75 14.75h4.5" />
      <path d="M7 5v3.5l3-1.75z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** A spreadsheet grid. */
export function SpreadsheetsIcon(props: OfficeIconProps): ReactElement {
  return (
    <svg {...frame(props)}>
      <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="1.25" />
      <path d="M1.75 6h12.5M6.25 6v7.75M10.75 6v7.75" />
    </svg>
  )
}

export const OFFICE_ICONS: Record<OfficeFeatureId, (props: OfficeIconProps) => ReactElement> = {
  documents: DocumentsIcon,
  pdf: PdfIcon,
  presentations: PresentationsIcon,
  spreadsheets: SpreadsheetsIcon,
}
