/**
 * loads and decorates the hero
 * @param {Element} block The hero block element
 */
export default function decorate(block) {
  const cell = block.querySelector(':scope > div > div') || block;
  const picture = cell.querySelector('picture');

  // pull the image out into its own column first
  const media = document.createElement('div');
  media.className = 'hero-media';
  if (picture) {
    const wrapper = picture.closest('p');
    media.append(picture);
    if (wrapper && !wrapper.textContent.trim()) wrapper.remove();
  }

  // whatever remains (heading, copy, CTAs — at any nesting) is the text column
  const content = document.createElement('div');
  content.className = 'hero-content';
  while (cell.firstChild) {
    const node = cell.firstChild;
    if (node.nodeType === Node.ELEMENT_NODE || node.textContent.trim()) {
      content.append(node);
    } else {
      node.remove();
    }
  }

  cell.append(content);
  if (picture) {
    cell.append(media);
    block.classList.add('hero-split');
  }
}
