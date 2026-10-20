/** One plugin-scoped style tag; the disposer owns removal. */
export function mountOfficeStyles(): () => void {
  const id = 'dsh-office-suite/reference.css'
  if (typeof document === 'undefined')
    return () => {}

  const existing = document.querySelector(`style[data-plugin-css="${id}"]`)
  if (existing != null)
    return () => existing.remove()

  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-office-suite'
  style.dataset.pluginCss = id
  style.textContent = `
.dsh-office-ref {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  height: calc(20px + var(--dsh-content-font-delta, 0px));
  padding: 0 6px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  line-height: 1;
  vertical-align: baseline;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-office-ref[data-interactive] {
  cursor: pointer;
}
.dsh-office-ref[data-interactive]:hover {
  background: var(--dsw-alias-interactive-bg-hover-solid);
  color: var(--dsw-alias-label-primary);
}
.dsh-office-ref[data-interactive]:focus-visible {
  outline: 2px solid var(--dsw-alias-state-focus-ring);
  outline-offset: 1px;
}
.dsh-office-ref-icon {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-office-ref[data-interactive]:hover .dsh-office-ref-icon {
  color: inherit;
}
`
  document.head.appendChild(style)
  return () => style.remove()
}
