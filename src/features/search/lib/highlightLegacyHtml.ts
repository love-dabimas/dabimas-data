import type { SearchCriteria } from "@/features/search/model/searchCriteria";

const collectTerms = (criteria: SearchCriteria) => {
  const terms = [
    criteria.keyword.trim(),
    criteria.ancestorName.trim(),
    ...criteria.fatherLines,
    ...criteria.damSireLines,
    ...criteria.migotoLines,
    ...criteria.thinLines
  ].filter(Boolean);

  return [...new Set(terms)].sort((left, right) => right.length - left.length);
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const highlightLegacyHtml = (html: string, criteria: SearchCriteria) => {
  const terms = collectTerms(criteria);

  if (terms.length === 0) {
    return html;
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = documentNode.getElementById("root");

  if (!root) {
    return html;
  }

  const walker = documentNode.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;

    if (
      node.textContent &&
      parent &&
      !["SCRIPT", "STYLE"].includes(parent.tagName)
    ) {
      textNodes.push(node as Text);
    }
  }

  for (const textNode of textNodes) {
    const value = textNode.textContent ?? "";
    const fragment = documentNode.createDocumentFragment();
    let remaining = value;

    while (remaining.length > 0) {
      const match = terms
        .map((term) => ({
          term,
          match: remaining.match(new RegExp(escapeRegExp(term)))
        }))
        .filter(
          (result): result is { term: string; match: RegExpMatchArray } =>
            result.match !== null
        )
        .sort((left, right) => (left.match.index ?? 0) - (right.match.index ?? 0))[0];

      if (!match || match.match.index === undefined) {
        fragment.append(remaining);
        break;
      }

      const start = match.match.index;
      const end = start + match.term.length;

      if (start > 0) {
        fragment.append(remaining.slice(0, start));
      }

      const marker = documentNode.createElement("mark");
      marker.className = "result-highlight";
      marker.textContent = remaining.slice(start, end);
      fragment.append(marker);
      remaining = remaining.slice(end);
    }

    textNode.replaceWith(fragment);
  }

  return root.innerHTML;
};
