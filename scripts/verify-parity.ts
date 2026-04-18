import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import alasql from "alasql";
import type { HorseRecord } from "../src/features/horses/model/types";
import {
  createDefaultCriteria,
  type SearchCriteria
} from "../src/features/search/model/searchCriteria";
import { filterHorseRecords } from "../src/features/search/lib/filterHorseRecords";

type CaseDefinition = {
  name: string;
  criteria: SearchCriteria;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const containsAllCodes = (value: string, required: string[]) =>
  required.every((code) => value.includes(code));

const regexTest = (pattern: string, value: string) => {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
};

const filterSqlRare = (
  rareCodes: string[],
  gender: "0" | "1"
): { clause: string; valid: boolean } => {
  if (rareCodes.length === 0) {
    return { clause: "", valid: true };
  }

  const filtered = rareCodes.filter((code) =>
    gender === "0" ? !Number.isNaN(Number(code)) : Number.isNaN(Number(code))
  );

  if (filtered.length === 0) {
    return { clause: "", valid: false };
  }

  let sql = ' AND RareCd in ("';

  for (const code of filtered) {
    sql += `${code}","`;
  }

  return { clause: `${sql.slice(0, -2)})`, valid: true };
};

const filterSql = (column: keyof HorseRecord, values: string[], sqlFilter: string) => {
  if (values.length === 0) {
    return sqlFilter;
  }

  const prefix = sqlFilter.length > 0 ? `${sqlFilter} AND ` : "";
  const body = values.map((value) => `"${value}"`).join(",");
  return `${prefix}${column} in (${body})`;
};

const filterSqlCodes = (column: keyof HorseRecord, values: string[], sqlFilter: string) => {
  if (values.length === 0) {
    return sqlFilter;
  }

  const prefix = sqlFilter.length > 0 ? `${sqlFilter} AND ` : "";
  const body = values.map((value) => `(?=.*${value})`).join("");
  return `${prefix}(${column} REGEXP "^${body}.*$")`;
};

const filterSqlText = (
  column: keyof HorseRecord,
  value: string,
  sqlFilter: string
) => {
  if (value.length === 0) {
    return sqlFilter;
  }

  const prefix = sqlFilter.length > 0 ? `${sqlFilter} AND ` : "";
  return `${prefix}(${column} REGEXP "^(?=.*${value}).*$")`;
};

const filterSqlFactor = (
  sqlFilter: string,
  factorValue: string,
  factorPositions: string[]
) => {
  if (factorValue.length === 0 || factorPositions.length === 0) {
    return sqlFilter;
  }

  const prefix = sqlFilter.length > 0 ? `${sqlFilter} AND ` : "";
  const joined = factorPositions.map((position) => `[${position}${factorValue}]`).join("|");

  if (factorPositions.length === 7) {
    return `${prefix}(Ped_All REGEXP "^(?=.*${factorValue}).*$")`;
  }

  return `${prefix}(Ped_All REGEXP "${joined}")`;
};

const buildLegacySql = (criteria: SearchCriteria, gender: "0" | "1") => {
  const sqlBase = "SELECT * FROM ? h";
  const sqlOrder = " order by Gender ASC, FactorFlg DESC, RareCd DESC, SerialNumber ASC";

  let where = ` where Gender = "${gender}"`;
  const rareClause = filterSqlRare(criteria.rareCodes, gender);

  if (!rareClause.valid) {
    return null;
  }

  where += rareClause.clause;

  let sqlFilter = "";
  sqlFilter = filterSql("Paternal_t", criteria.fatherLines, sqlFilter);
  sqlFilter = filterSql("Paternal_ht", criteria.damSireLines, sqlFilter);
  sqlFilter = filterSqlCodes("Paternal_mig", criteria.migotoLines, sqlFilter);
  sqlFilter = filterSqlCodes("Paternal_jik", criteria.thinLines, sqlFilter);
  sqlFilter = filterSqlFactor(
    sqlFilter,
    criteria.ancestorName.trim(),
    criteria.ancestorPositions
  );
  sqlFilter = filterSqlText("Category", criteria.ownChildLine, sqlFilter);
  sqlFilter = filterSqlText("Category_ht", criteria.damSireChildLine, sqlFilter);
  sqlFilter = filterSqlText("Ped_All", criteria.keyword.trim(), sqlFilter);

  const suffix = sqlFilter.length > 0 ? ` AND ${sqlFilter}` : " AND 1 = 0";

  return sqlBase + where + suffix + sqlOrder;
};

const buildLegacyResult = (horses: HorseRecord[], criteria: SearchCriteria) => {
  const stallionSql = buildLegacySql(criteria, "0");
  const broodmareSql = buildLegacySql(criteria, "1");
  const stallions = stallionSql
    ? (alasql(stallionSql, [horses]) as HorseRecord[])
    : [];
  const broodmares = broodmareSql
    ? (alasql(broodmareSql, [horses]) as HorseRecord[])
    : [];

  return {
    stallions,
    broodmares,
    total: stallions.length + broodmares.length
  };
};

const splitPairCodes = (value: string) =>
  value.match(/.{1,2}/g)?.filter((code) => code.length === 2) ?? [];

const findFirst = <T>(values: T[], predicate: (value: T) => boolean) => {
  for (const value of values) {
    if (predicate(value)) {
      return value;
    }
  }

  return undefined;
};

const pickAncestorName = (horses: HorseRecord[], position: string, preferDot = false) => {
  const pattern = new RegExp(`\\[${position}([^\\]]+)\\]`);

  const preferred = findFirst(horses, (horse) => {
    const match = horse.Ped_All.match(pattern);
    return Boolean(match && (!preferDot || match[1]?.includes(".")));
  });

  const chosen = preferred ?? findFirst(horses, (horse) => pattern.test(horse.Ped_All));
  return chosen?.Ped_All.match(pattern)?.[1] ?? "";
};

const createCriteria = (patch: Partial<SearchCriteria>): SearchCriteria => ({
  ...createDefaultCriteria(),
  ...patch
});

const compareByIds = (left: HorseRecord[], right: HorseRecord[]) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((horse, index) => {
    const other = right[index];
    return (
      horse.HorseId === other?.HorseId && horse.SerialNumber === other?.SerialNumber
    );
  });
};

const main = async () => {
  const horseJson = await readFile(path.join(rootDir, "json/horselist.json"), "utf8");
  const horses = JSON.parse(horseJson) as HorseRecord[];

  const firstHorse = horses[0];
  const maleRare = horses.find((horse) => horse.Gender === "0")?.RareCd ?? "8";
  const femaleRare = horses.find((horse) => horse.Gender === "1")?.RareCd ?? "X";
  const father = firstHorse?.Paternal_t ?? "Ne";
  const damSire = firstHorse?.Paternal_ht ?? "Ns";
  const migoto = splitPairCodes(firstHorse?.Paternal_mig ?? "").slice(0, 2);
  const thin = splitPairCodes(firstHorse?.Paternal_jik ?? "").slice(0, 2);
  const ownChildLine = firstHorse?.Category ?? "";
  const damSireChildLine = firstHorse?.Category_ht ?? "";
  const ancestorFather = pickAncestorName(horses, "父父");
  const ancestorMother = pickAncestorName(horses, "母父");
  const dottedAncestor = pickAncestorName(horses, "見事", true);

  const cases: CaseDefinition[] = [
    {
      name: "no-filters",
      criteria: createCriteria({})
    },
    {
      name: "rare-only",
      criteria: createCriteria({ rareCodes: ["8", "7", "6", "5", "4", "Z", "Y", "X"] })
    },
    {
      name: "father-only",
      criteria: createCriteria({ fatherLines: [father] })
    },
    {
      name: "father-dam-sire",
      criteria: createCriteria({ fatherLines: [father], damSireLines: [damSire] })
    },
    {
      name: "migoto-and",
      criteria: createCriteria({ migotoLines: migoto })
    },
    {
      name: "thin-and",
      criteria: createCriteria({ thinLines: thin })
    },
    {
      name: "keyword-plain",
      criteria: createCriteria({ keyword: ancestorMother || ancestorFather })
    },
    {
      name: "own-child-line",
      criteria: createCriteria({ ownChildLine })
    },
    {
      name: "dam-sire-child-line",
      criteria: createCriteria({ damSireChildLine })
    },
    {
      name: "ancestor-name-only",
      criteria: createCriteria({ ancestorName: ancestorFather })
    },
    {
      name: "ancestor-with-position",
      criteria: createCriteria({
        ancestorName: ancestorFather,
        ancestorPositions: ["父父"]
      })
    },
    {
      name: "all-ancestor-positions",
      criteria: createCriteria({
        ancestorName: ancestorMother,
        ancestorPositions: ["自身", "１父", "父父", "母父", "１薄", "見事", "以外"]
      })
    },
    {
      name: "male-rare-with-filter",
      criteria: createCriteria({
        fatherLines: [father],
        rareCodes: [maleRare]
      })
    },
    {
      name: "female-rare-with-filter",
      criteria: createCriteria({
        fatherLines: [father],
        rareCodes: [femaleRare]
      })
    }
  ];

  if (dottedAncestor) {
    cases.push({
      name: "ancestor-dotted-name",
      criteria: createCriteria({
        ancestorName: dottedAncestor,
        ancestorPositions: ["見事"]
      })
    });
    cases.push({
      name: "keyword-dotted-name",
      criteria: createCriteria({
        keyword: dottedAncestor
      })
    });
  }

  const results = cases.map((testCase) => {
    const legacy = buildLegacyResult(horses, testCase.criteria);
    const rebuilt = filterHorseRecords(horses, testCase.criteria);

    const stallionMatch = compareByIds(legacy.stallions, rebuilt.stallions);
    const broodmareMatch = compareByIds(legacy.broodmares, rebuilt.broodmares);

    return {
      name: testCase.name,
      legacy,
      rebuilt,
      ok: stallionMatch && broodmareMatch
    };
  });

  const lines = results.map((result) => {
    const prefix = result.ok ? "OK " : "NG ";
    return [
      `${prefix}${result.name}`,
      `  legacy   M=${result.legacy.stallions.length} F=${result.legacy.broodmares.length} T=${result.legacy.total}`,
      `  rebuilt  M=${result.rebuilt.stallions.length} F=${result.rebuilt.broodmares.length} T=${result.rebuilt.total}`
    ].join("\n");
  });

  console.log(lines.join("\n"));

  const failed = results.filter((result) => !result.ok);

  if (failed.length > 0) {
    console.error("\nMismatch cases:");
    for (const result of failed) {
      console.error(`- ${result.name}`);
    }
    process.exit(1);
  }
};

await main();
