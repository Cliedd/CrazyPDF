export function navigate(path: string) {
  history.pushState({}, '', path);
  window.dispatchEvent(new CustomEvent('route:changed'));
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}
