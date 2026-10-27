export function approvedMonochromeSvg(source) {
  return source
    .replace(/<\?xml[^>]*>\s*/, '')
    .replace(/fill="[^"]*"/g, 'fill="currentColor"')
    .replace('<svg ', '<svg class="approved-brand-art" aria-hidden="true" focusable="false" ')
    .trim();
}
