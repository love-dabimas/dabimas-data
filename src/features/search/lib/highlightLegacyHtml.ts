import type { SearchCriteria } from "@/features/search/model/searchCriteria";

// HTML 文字列を直接扱う場面用に、ハイライト対象語を 1 か所で集約する。
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

  // 条件がなければ DOM を触らず、そのまま返す。
  if (terms.length === 0) {
    return html;
  }

  // 一度 DOM 化してからテキストノードだけを書き換え、既存タグ構造は壊さない。
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = documentNode.getElementById("root");

  if (!root) {
    return html;
  }

  const walker = documentNode.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  // script / style を除くテキストノードだけを先に収集する。
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

  // 収集済みノードを前から順に分割し、ヒット部分だけ mark タグへ差し替える。
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
