from __future__ import annotations

import argparse
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from bs4 import BeautifulSoup
from bs4.element import Tag

from tools.horse_data.generate_horselist import (
    COL_ABILITY,
    COL_ACHIEVEMENT,
    COL_CLEMENCY,
    COL_DIRT,
    COL_DISTANCE_MIN,
    COL_FACTOR_HHHT1,
    COL_FACTOR_NAME_1,
    COL_FACTOR_T1,
    COL_GENDER,
    COL_GROWTH,
    COL_HEALTH,
    COL_HORSE_ID,
    COL_HORSE_NAME,
    COL_ICON,
    COL_NAME_HHHT,
    COL_NAME_T,
    COL_PARENT_LINE,
    COL_PARENT_LINE_HHHT,
    COL_PARENT_LINE_T,
    COL_POTENTIAL,
    COL_RARE,
    COL_RUNNING_STYLE,
    COL_SERIAL_NUMBER,
    COL_SON_HHHT,
    COL_SON_T,
    COL_STABLE,
    DEFAULT_SOURCE_JSON_PATH,
    SOURCE_ALL_KEY,
    SOURCE_HORSE_LIST_KEY,
    SOURCE_SPECIAL_RARE_KEY,
    load_source_json,
    serialize_source_json,
    write_text,
)
from tools.horse_data.site_metadata import (
    DEFAULT_SITE_METADATA_PATH,
    serialize_site_metadata,
)


DEFAULT_BASE_URL = "https://dabimas.jp"
STALLION_LIST_PATH = "/kouryaku/stallions/"
BROODMARE_LIST_PATH = "/kouryaku/broodmares/"
USER_AGENT = (
    "Mozilla/5.0 (compatible; dabimasDataBot/1.0; "
    "+https://github.com/yanaifarm/dabimasData)"
)
SKILL_SECTION_KEYS = {
    "非凡な才能": "extraordinaryAbility",
    "天性": "innateTalent",
}


def text_value(value: object) -> str:
    return value if isinstance(value, str) else ""


def text(element: Tag | None) -> str | None:
    if element is None:
        return None

    value = " ".join(element.stripped_strings)
    return value or None


def src(element: Tag | None) -> str | None:
    if element is None:
        return None

    value = element.get("src")
    return value if isinstance(value, str) and value else None


def set_col(row: list[object], column: int, value: object) -> None:
    row[column - 1] = None if value == "" else value


def direct_tag_children(root: Tag) -> list[Tag]:
    return [child for child in root.children if isinstance(child, Tag)]


def next_tag_sibling(node: Tag) -> Tag | None:
    sibling = node.next_sibling
    while sibling is not None:
        if isinstance(sibling, Tag):
            return sibling
        sibling = sibling.next_sibling
    return None


def select_tables(soup: BeautifulSoup) -> list[Tag]:
    content = soup.select_one("#content") or soup.select_one(".paper") or soup
    return [table for table in content.find_all("table") if isinstance(table, Tag)]


def first_img_src(root: Tag, needle: str) -> str | None:
    for image in root.find_all("img"):
        image_src = src(image)
        if image_src and needle in image_src:
            return image_src
    return None


def img_srcs(root: Tag, needle: str) -> list[str]:
    values: list[str] = []
    for image in root.find_all("img"):
        image_src = src(image)
        if image_src and needle in image_src:
            values.append(image_src)
    return values


def detail_stat_img(cell: Tag | None) -> str | None:
    if cell is None:
        return None
    return first_img_src(cell, "stallion_detail_")


def direct_cell_text(cell: Tag | None) -> str | None:
    if cell is None:
        return None

    paragraph = cell.find("p")
    if isinstance(paragraph, Tag):
        return text(paragraph)

    return text(cell)


def text_lines(element: Tag | None) -> list[str]:
    if element is None:
        return []
    return [value for value in (text_value(item).strip() for item in element.stripped_strings) if value]


def summary_description_lines(root: Tag | None) -> list[str]:
    if root is None:
        return []
    paragraphs = root.find_all("p", recursive=False)
    if len(paragraphs) < 2:
        return []
    return text_lines(paragraphs[1])


def skill_summary_from_anchor(anchor: Tag, base_url: str) -> dict[str, object] | None:
    href = anchor.get("href")
    if not isinstance(href, str) or not href:
        return None

    info = anchor.select_one(".ability_info")
    if not isinstance(info, Tag):
        return None

    name = text(info.select_one("p.large"))
    if not name or name == "非凡な才能はありません":
        return None

    return {
        "name": name,
        "description": summary_description_lines(info),
        "detailUrl": normalize_path(base_url, href),
    }


def parse_stallion_skill_summaries(
    soup: BeautifulSoup, base_url: str
) -> dict[str, dict[str, object]]:
    skills: dict[str, dict[str, object]] = {}
    for header in soup.find_all("h4"):
        header_text = text(header)
        if header_text not in SKILL_SECTION_KEYS:
            continue
        anchor = next_tag_sibling(header)
        if anchor is None or anchor.name != "a":
            continue
        summary = skill_summary_from_anchor(anchor, base_url)
        if summary is not None:
            skills[SKILL_SECTION_KEYS[header_text]] = summary
    return skills


def horse_cells(table: Tag | None) -> list[str | None]:
    if table is None:
        return []

    values: list[str | None] = []
    for row in table.find_all("tr"):
        if not isinstance(row, Tag):
            continue
        values.append(text(row.select_one("td.horse")))
    return values


def factor_cells(row: Tag) -> list[str | None]:
    values: list[str | None] = []
    for cell in row.select("td.factor"):
        values.append(src(cell.find("img")))

    return (values + [None, None, None])[:3]


def fill_consecutive(
    row: list[object],
    start_column: int,
    end_column: int,
    values: Iterable[object],
) -> None:
    for offset, value in enumerate(values):
        column = start_column + offset
        if column > end_column:
            break
        set_col(row, column, value)


def fill_pedigree(row: list[object], pedigree_tables: list[Tag]) -> None:
    names = horse_cells(pedigree_tables[0] if len(pedigree_tables) > 0 else None)
    parent_lines = horse_cells(pedigree_tables[1] if len(pedigree_tables) > 1 else None)
    child_lines = horse_cells(pedigree_tables[2] if len(pedigree_tables) > 2 else None)

    fill_consecutive(row, COL_NAME_T, COL_NAME_HHHT, names)
    fill_consecutive(row, COL_PARENT_LINE_T, COL_PARENT_LINE_HHHT, parent_lines)
    fill_consecutive(row, COL_SON_T, COL_SON_HHHT, child_lines)

    pedigree = pedigree_tables[0] if pedigree_tables else None
    if pedigree is None:
        return

    for row_index, pedigree_row in enumerate(pedigree.find_all("tr")[:15]):
        if not isinstance(pedigree_row, Tag):
            continue
        factor_start = COL_FACTOR_T1 + (row_index * 3)
        fill_consecutive(
            row,
            factor_start,
            min(factor_start + 2, COL_FACTOR_HHHT1 + 2),
            factor_cells(pedigree_row),
        )


def rare_count(summary_table: Tag) -> int | None:
    count = len(img_srcs(summary_table, "stallion_list_star.png"))
    return count or None


def ability_name(skills: dict[str, dict[str, object]]) -> str | None:
    skill = skills.get("extraordinaryAbility")
    if not isinstance(skill, dict):
        return None

    name = text_value(skill.get("name")).strip()
    return name or None


def build_empty_row(serial_number: int, gender: str) -> list[object]:
    row: list[object] = [None] * 112
    set_col(row, COL_GENDER, gender)
    set_col(row, COL_SERIAL_NUMBER, f"{serial_number:05d}")
    set_col(row, COL_HORSE_ID, None)
    return row


def parse_stallion_detail(
    html: str, serial_number: int, base_url: str
) -> tuple[list[object], dict[str, dict[str, object]]]:
    soup = BeautifulSoup(html, "html.parser")
    tables = select_tables(soup)
    if len(tables) < 4:
        raise ValueError("stallion detail page did not contain expected tables")

    summary = tables[0]
    spec = soup.select_one("table.horse_spec")
    pedigree_tables = soup.select("table.pedigree")
    skills = parse_stallion_skill_summaries(soup, base_url)
    row = build_empty_row(serial_number, "0")

    self_factor_icons = img_srcs(summary, "icn_factor_")[:3]
    fill_consecutive(row, COL_FACTOR_NAME_1, COL_FACTOR_NAME_1 + 2, self_factor_icons)

    set_col(row, COL_RARE, rare_count(summary))
    set_col(row, COL_HORSE_NAME, text(summary.select_one("span.large")))
    set_col(row, COL_PARENT_LINE, text(summary.select_one(".category")))
    set_col(row, COL_ICON, first_img_src(summary, "list_icn_cat"))
    set_col(row, COL_ABILITY, ability_name(skills))

    if isinstance(spec, Tag):
        spec_rows = spec.find_all("tr")
        first_row_cells = (
            spec_rows[0].find_all("td", recursive=False) if len(spec_rows) > 0 else []
        )
        second_row_cells = (
            spec_rows[1].find_all("td", recursive=False) if len(spec_rows) > 1 else []
        )

        set_col(row, COL_DISTANCE_MIN, direct_cell_text(first_row_cells[0] if len(first_row_cells) > 0 else None))
        set_col(row, COL_GROWTH, direct_cell_text(first_row_cells[1] if len(first_row_cells) > 1 else None))
        set_col(row, COL_DIRT, detail_stat_img(first_row_cells[2] if len(first_row_cells) > 2 else None))
        set_col(row, COL_HEALTH, detail_stat_img(first_row_cells[3] if len(first_row_cells) > 3 else None))
        set_col(row, COL_CLEMENCY, detail_stat_img(first_row_cells[4] if len(first_row_cells) > 4 else None))

        set_col(row, COL_RUNNING_STYLE, direct_cell_text(second_row_cells[0] if len(second_row_cells) > 0 else None))
        set_col(row, COL_ACHIEVEMENT, detail_stat_img(second_row_cells[1] if len(second_row_cells) > 1 else None))
        set_col(row, COL_POTENTIAL, detail_stat_img(second_row_cells[2] if len(second_row_cells) > 2 else None))
        set_col(row, COL_STABLE, detail_stat_img(second_row_cells[3] if len(second_row_cells) > 3 else None))

    fill_pedigree(row, pedigree_tables)
    return row, skills


def parse_broodmare_detail(html: str, serial_number: int) -> list[object]:
    soup = BeautifulSoup(html, "html.parser")
    tables = select_tables(soup)
    if len(tables) < 4:
        raise ValueError("broodmare detail page did not contain expected tables")

    summary = tables[0]
    pedigree_tables = soup.select("table.pedigree")
    row = build_empty_row(serial_number, "1")

    set_col(row, COL_RARE, text(soup.select_one("p.bold")))
    set_col(row, COL_HORSE_NAME, text(summary.select_one("span.large")))
    set_col(row, COL_PARENT_LINE, text(soup.select_one(".category")))
    set_col(row, COL_ICON, first_img_src(summary, "list_icn_cat"))

    fill_pedigree(row, pedigree_tables)
    return row


def fetch_text(url: str, timeout: float, retries: int) -> str:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(request, timeout=timeout) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                return response.read().decode(charset, errors="replace")
        except (HTTPError, URLError, TimeoutError) as error:
            last_error = error
            if attempt >= retries:
                break
            time.sleep(1.5 * (attempt + 1))

    raise RuntimeError(f"Failed to fetch {url}: {last_error}") from last_error


def normalize_path(base_url: str, href: str) -> str:
    absolute = urljoin(base_url, href)
    parsed = urlparse(absolute)
    return parsed.path


def horse_id_from_path(path: str) -> str:
    match = re.search(r"/([0-9]+)\.html$", path)
    return match.group(1) if match else ""


def scrape_list_urls(base_url: str, path: str, selector: str, timeout: float) -> list[str]:
    html = fetch_text(urljoin(base_url, path), timeout=timeout, retries=2)
    soup = BeautifulSoup(html, "html.parser")
    urls: list[str] = []
    seen: set[str] = set()

    for anchor in soup.select(f"{selector} a[href]"):
        href = anchor.get("href")
        if not isinstance(href, str):
            continue

        normalized = normalize_path(base_url, href)
        if normalized in seen:
            continue

        seen.add(normalized)
        urls.append(normalized)

    if not urls:
        raise RuntimeError(f"No URLs found for {path}")

    return urls


def scrape_detail_row(
    base_url: str,
    path: str,
    serial_number: int,
    timeout: float,
    retries: int,
) -> tuple[list[object], dict[str, dict[str, object]] | None]:
    html = fetch_text(urljoin(base_url, path), timeout=timeout, retries=retries)
    if "/stallions/" in path:
        row, skills = parse_stallion_detail(html, serial_number, base_url)
        return row, skills
    if "/broodmares/" in path:
        return parse_broodmare_detail(html, serial_number), None
    raise ValueError(f"Unknown horse URL type: {path}")


def scrape_rows(
    base_url: str,
    urls: list[str],
    *,
    max_workers: int,
    timeout: float,
    retries: int,
) -> tuple[list[list[object]], dict[str, dict[str, object]]]:
    rows: list[list[object] | None] = [None] * len(urls)
    horses: dict[str, dict[str, object]] = {}

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                scrape_detail_row,
                base_url,
                path,
                index + 1,
                timeout,
                retries,
            ): (index, path)
            for index, path in enumerate(urls)
        }

        completed = 0
        for future in as_completed(futures):
            index, path = futures[future]
            row, skills = future.result()
            rows[index] = row
            horse_id = horse_id_from_path(path)
            if horse_id and skills:
                horses[horse_id] = skills
            completed += 1
            if completed % 100 == 0 or completed == len(urls):
                print(f"scraped {completed}/{len(urls)}: {path}", flush=True)

    return [row for row in rows if row is not None], horses


def load_existing_special_rare(path: Path) -> list[list[object]]:
    if not path.exists():
        return []

    source = load_source_json(path)
    return source[SOURCE_SPECIAL_RARE_KEY]


def scrape_source(
    *,
    base_url: str,
    existing_source_json: Path,
    limit: int | None,
    max_workers: int,
    timeout: float,
    retries: int,
) -> tuple[dict[str, list[list[object]]], dict[str, dict[str, object]]]:
    stallion_urls = scrape_list_urls(
        base_url, STALLION_LIST_PATH, ".stallion_list_panel", timeout
    )
    broodmare_urls = scrape_list_urls(
        base_url, BROODMARE_LIST_PATH, ".list_panel.broodmare", timeout
    )

    urls = stallion_urls + broodmare_urls
    if limit is not None:
        urls = urls[:limit]

    print(
        f"found {len(stallion_urls)} stallion URLs and {len(broodmare_urls)} broodmare URLs",
        flush=True,
    )
    print(f"scraping {len(urls)} detail pages", flush=True)

    rows, horses = scrape_rows(
        base_url,
        urls,
        max_workers=max_workers,
        timeout=timeout,
        retries=retries,
    )

    return (
        {
            SOURCE_HORSE_LIST_KEY: [[path] for path in urls],
            SOURCE_ALL_KEY: rows,
            SOURCE_SPECIAL_RARE_KEY: load_existing_special_rare(existing_source_json),
        },
        horses,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape dabimas.jp and update the source JSON used to generate horse data."
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_SOURCE_JSON_PATH,
        help=f"Source JSON output path. Defaults to {DEFAULT_SOURCE_JSON_PATH}.",
    )
    parser.add_argument(
        "--site-metadata-output",
        type=Path,
        default=DEFAULT_SITE_METADATA_PATH,
        help=f"Site metadata output path. Defaults to {DEFAULT_SITE_METADATA_PATH}.",
    )
    parser.add_argument(
        "--existing-source-json",
        type=Path,
        default=DEFAULT_SOURCE_JSON_PATH,
        help="Existing source JSON used to preserve special_rare overrides.",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Base URL to scrape. Defaults to {DEFAULT_BASE_URL}.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit detail pages for smoke testing.",
    )
    parser.add_argument(
        "--max-workers",
        type=int,
        default=8,
        help="Concurrent detail page fetches.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="HTTP timeout in seconds.",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=2,
        help="Retries per detail page.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source, site_metadata = scrape_source(
        base_url=args.base_url,
        existing_source_json=args.existing_source_json,
        limit=args.limit,
        max_workers=args.max_workers,
        timeout=args.timeout,
        retries=args.retries,
    )
    write_text(args.output, serialize_source_json(source))
    write_text(args.site_metadata_output, serialize_site_metadata(site_metadata))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
