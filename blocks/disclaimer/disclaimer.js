/**
 * loads and decorates the disclaimer
 * Builds a collapsible panel: the first heading becomes the clickable
 * summary; the remaining content is the toggleable body.
 * @param {Element} block The disclaimer block element
 */
export default function decorate(block) {
  const content = block.querySelector(':scope > div > div') || block;
  const heading = content.querySelector('h1, h2, h3, h4, h5, h6');

  const details = document.createElement('details');
  details.className = 'disclaimer-panel';

  const summary = document.createElement('summary');
  summary.className = 'disclaimer-summary';
  summary.textContent = heading ? heading.textContent : 'Important information';
  if (heading) heading.remove();

  const body = document.createElement('div');
  body.className = 'disclaimer-body';
  while (content.firstChild) body.append(content.firstChild);

  details.append(summary, body);
  block.replaceChildren(details);
}
