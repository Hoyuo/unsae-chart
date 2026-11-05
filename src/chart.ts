/**
 * 명식 계산·서술
 * - 계산은 @orrery/core(만세력 엔진)에 맡기고, LLM에는 계산 결과만 텍스트로 넘긴다.
 * - orrery의 pillars는 시→일→월→년 순서, 대운 startDate는 getUTC*로 읽는다.
 */
import { Lunar } from "lunar-javascript";
import { calculateSaju } from "@orrery/core/saju";
import { getYearGanzi, getRelation, getJeonggi, getHiddenStems, getTwelveMeteor, analyzePillarRelations } from "@orrery/core/pillars";
import { STEM_INFO, BRANCH_ELEMENT, ELEMENT_HANJA, SKY, SKY_KR, EARTH, EARTH_KR } from "@orrery/core/constants";
import type { BirthInput as OrreryInput, SajuResult, DaewoonItem, RelationResult } from "@orrery/core/types";
import { inKorea, type BirthInput, type ChartView, type Element, type Facts, type SeunView, type StrengthView } from "./types.js";

const PILLAR_NAMES = ["시주", "일주", "월주", "년주"];
const ELEMENTS: Element[] = ["tree", "fire", "earth", "metal", "water"];

const elemOfStem = (s: string) => STEM_INFO[s]!.element as Element;
const elemOfBranch = (b: string) => BRANCH_ELEMENT[b] as Element;
const krOf = (ch: string) => {
  const i = SKY.indexOf(ch);
  if (i >= 0) return SKY_KR[i]!;
  const j = EARTH.indexOf(ch);
  return j >= 0 ? EARTH_KR[j]! : ch;
};
const isUnknown = (ganzi: string) => ganzi === "??";

/** 기준일은 서버 타임존과 무관하게 한국 기준 (YYYY-MM-DD) */
export const kstToday = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** 기준 정보: 오늘, 올해, 내년 */
export interface AsOf {
  date: string;
  year: number;
}
export class InputError extends Error {}

/** YYYY-MM-DD가 실재하는 날짜이고 지원 범위(1900~2100) 안인지. 어느 체계를 계산하든 같은 검사를 거친다 */
export function checkDate(date: string, what = "날짜"): void {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(d.getTime()) || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) throw new InputError(`존재하지 않는 ${what}입니다.`);
  if (year < 1900 || year > 2100) throw new InputError(`${what}는 1900~2100년 사이만 지원합니다.`);
}

export const asOfDate = (date = kstToday()): AsOf => {
  checkDate(date, "기준일");
  return { date, year: Number(date.slice(0, 4)) };
};

/**
 * 음력 날짜(YYYY-MM-DD) → 양력 날짜. 윤달이면 leap=true.
 * lunar-javascript는 없는 날짜(예: 29일뿐인 달의 30일)를 다음 달로 넘겨 버리므로, 되돌려 보아 같은지 확인한다.
 */
export function lunarToSolar(date: string, leap = false): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const month = leap ? -m : m;
  try {
    const solar = Lunar.fromYmd(y, month, d).getSolar();
    const back = solar.getLunar();
    if (back.getYear() === y && back.getMonth() === month && back.getDay() === d) return solar.toYmd();
  } catch {
    /* 아래에서 같은 오류로 처리 */
  }
  throw new InputError(`존재하지 않는 음력 날짜입니다${leap ? " (그 해 그 달에는 윤달이 없습니다)" : " (윤달이면 윤달에 체크하세요)"}.`);
}

/**
 * 한국 영역 좌표는 타임존 이름과 상관없이 Asia/Seoul로 계산한다. 다른 이름(Asia/Tokyo·Asia/Pyongyang 등)을 넣으면
 * orrery가 해외로 보고 진태양시 보정을 해 시주·일주가 바뀌고, 자미두수도 해외 경로를 탄다
 */
export function normalizePlace<P extends { lat: number; lon: number; timezone: string }>(place: P): P {
  return inKorea(place.lat, place.lon) && place.timezone !== "Asia/Seoul" ? { ...place, timezone: "Asia/Seoul" } : place;
}

/** 음력으로 들어온 출생일을 양력으로 바꾼다. 이미 양력이면 그대로 (calendar·leapMonth 필드는 지운다) */
export function normalizeBirth<T extends { date: string; calendar?: "solar" | "lunar" | undefined; leapMonth?: boolean | undefined }>(b: T): T {
  const { calendar, leapMonth, ...rest } = b;
  const out = (calendar === "lunar" ? { ...rest, date: lunarToSolar(b.date, !!leapMonth) } : rest) as unknown as T;
  checkDate(out.date); // 사주만이 아니라 자미두수·점성술만 계산할 때도 같은 검사를 거친다
  return out;
}

/** zod 검증을 통과한 입력 → orrery 입력 (날짜 실재 여부·범위 확인) */
export function toOrreryInput(b: BirthInput): OrreryInput {
  checkDate(b.date);
  const [year, month, day] = b.date.split("-").map(Number) as [number, number, number];

  const unknownTime = !b.time;
  const [hour, minute] = unknownTime ? [0, 0] : (b.time!.split(":").map(Number) as [number, number]);
  const place = b.place;
  return {
    year, month, day, hour, minute, gender: b.gender, unknownTime, jasiMethod: b.jasiMethod,
    // 국내(Asia/Seoul)는 orrery가 KST 벽시계 관례를 유지하고, 해외는 경도·균시차로 진태양시 보정
    ...(place && { latitude: place.lat, longitude: place.lon, timezone: place.timezone }),
  };
}

/** 시간 미상 + 절입일: 출생 시각에 따라 갈리는 기둥 [00:00 기준, 23:59 기준] */
export interface PillarBoundary { month?: [string, string]; year?: [string, string] }
export type SajuComputed = SajuResult & { boundary?: PillarBoundary };

/**
 * 시간 미상은 orrery가 정오로 계산한다. 그날에 절입(입춘·각 절기) 시각이 있으면 년주·월주가 출생 시각에 따라 갈리므로
 * 00:00과 23:59로도 계산해 다르면 boundary에 남긴다(해마다 12일꼴). 일주는 자시 경계로 늘 갈릴 수 있어 비교하지 않는다.
 */
export function computeSaju(b: BirthInput): SajuComputed {
  const saju: SajuComputed = calculateSaju(toOrreryInput(b));
  if (b.time) return saju;
  const at = (time: string) => calculateSaju(toOrreryInput({ ...b, time, jasiMethod: "split" })).pillars; // 야자시: 날짜를 옮기지 않고 절입만 본다
  const [early, late] = [at("00:00"), at("23:59")];
  const differs = (i: number): [string, string] | undefined =>
    early[i]!.pillar.ganzi !== late[i]!.pillar.ganzi ? [early[i]!.pillar.ganzi, late[i]!.pillar.ganzi] : undefined;
  const [month, year] = [differs(2), differs(3)];
  if (month || year) saju.boundary = { ...(month && { month }), ...(year && { year }) };
  return saju;
}

// ── 공통 집계 ─────────────────────────────────────────────
function countElements(saju: SajuResult) {
  const count = Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>;
  for (const p of saju.pillars) {
    if (isUnknown(p.pillar.ganzi)) continue;
    count[elemOfStem(p.pillar.stem)]++;
    count[elemOfBranch(p.pillar.branch)]++;
  }
  return count;
}

const fmtRel = (r: RelationResult) => `${r.type}${r.detail ? `(${ELEMENT_HANJA[r.detail] ?? r.detail})` : ""}`;

/**
 * @orrery/core 0.5.0은 丑戌未 형을 無禮로, 子卯 형을 相刑으로 낸다. 전통 분류는 丑戌未가 持勢, 子卯가 無禮다.
 * 寅巳申(無恩)과 자형은 맞으므로 이 둘만 바로잡는다.
 */
export function fixHyeong(rs: RelationResult[], a: string, b: string): RelationResult[] {
  const pair = new Set([a, b]);
  const label = pair.has("子") && pair.has("卯") ? "無禮" : a !== b && [...pair].every((x) => "丑戌未".includes(x)) ? "持勢" : null;
  return label ? rs.map((r) => (r.type === "刑" ? { ...r, detail: label } : r)) : rs;
}

/** 지지 관계의 이름을 바로잡은 analyzePillarRelations */
function pillarRelations(a: string, b: string) {
  const r = analyzePillarRelations(a, b);
  return { ...r, branch: fixHyeong(r.branch, a[1]!, b[1]!) };
}

/** 삼합은 가운데 글자가 왕지다 */
const SAMHAP: [string, string][] = [["申子辰", "水"], ["亥卯未", "木"], ["寅午戌", "火"], ["巳酉丑", "金"]];
const BANGHAP: [string, string][] = [["寅卯辰", "木"], ["巳午未", "火"], ["申酉戌", "金"], ["亥子丑", "水"]];

/** 원국에 운의 글자를 더해 완성되는 삼합·방합. 운의 글자가 들어가야 완성되는 것만 */
export function completedCombos(natal: string[], extra: string[], must?: string) {
  const have = new Set(natal);
  const out: string[] = [];
  for (const [names, list] of [["三合", SAMHAP], ["方合", BANGHAP]] as const)
    for (const [set, elem] of list) {
      const letters = [...set];
      const fromLuck = letters.filter((x) => !have.has(x));
      if (fromLuck.length && fromLuck.every((x) => extra.includes(x)) && (!must || fromLuck.includes(must))) out.push(`${set} ${names}(${elem}) 완성: ${fromLuck.join("·")}이(가) 들어와 원국 ${letters.filter((x) => have.has(x)).join("·")}과 묶임`);
    }
  return out;
}

/** 원국의 두 글자가 왕지 없이 삼합의 양 끝만 이룬 짝. 반합으로 볼지는 유파마다 다르다 */
export function openSamhapPairs(natal: string[]) {
  const have = new Set(natal);
  return SAMHAP.flatMap(([set, elem]) => {
    const [a, mid, b] = [...set] as [string, string, string];
    return have.has(a) && have.has(b) && !have.has(mid) ? [`${a}${b}: ${set} ${elem}국의 왕지 ${mid}이(가) 빠진 짝 (반합으로 볼지는 유파마다 다름)`] : [];
  });
}

/** 간지 하나의 천간이 원국의 같은 글자 둘 이상과 합하려는 쟁합 */
export function jaenghap(ganzi: string, saju: SajuResult, label: string) {
  const hits = saju.pillars.filter((p) => !isUnknown(p.pillar.ganzi) && analyzePillarRelations(ganzi, p.pillar.ganzi).stem.some((r) => r.type === "合"));
  return hits.length >= 2 ? [`${label} ${ganzi[0]}: 원국 ${hits.map((p) => p.pillar.stem).join("·")} ${hits.length}개와 합하려는 쟁합 (합의 힘이 나뉜다)`] : [];
}

function listRelations(saju: SajuResult) {
  const rel: string[] = [];
  for (const [key, pair] of saju.relations.pairs) {
    const [a, b] = key.split(",").map((n) => PILLAR_NAMES[Number(n)]);
    for (const r of pair.stem) rel.push(`${a}-${b} 천간 ${fmtRel(r)}`);
    const [bi, bj] = key.split(",").map((n) => saju.pillars[Number(n)]!.pillar.branch);
    for (const r of fixHyeong(pair.branch, bi!, bj!)) rel.push(`${a}-${b} 지지 ${fmtRel(r)}`);
  }
  for (const r of [...saju.relations.triple, ...saju.relations.directional]) rel.push(fmtRel(r));
  return rel;
}

function listSals(saju: SajuResult) {
  const s = saju.specialSals;
  const pos = (arr: number[]) => arr.map((i) => PILLAR_NAMES[i]).join("/");
  const sal: string[] = [];
  if (s.yangin.length) sal.push(`양인(${pos(s.yangin)})`);
  if (s.dohwa.length) sal.push(`도화(${pos(s.dohwa)})`);
  if (s.cheonul.length) sal.push(`천을귀인(${pos(s.cheonul)})`);
  if (s.cheonduk.length) sal.push(`천덕(${pos(s.cheonduk)})`);
  if (s.wolduk.length) sal.push(`월덕(${pos(s.wolduk)})`);
  if (s.munchang.length) sal.push(`문창(${pos(s.munchang)})`);
  if (s.geumyeo.length) sal.push(`금여(${pos(s.geumyeo)})`);
  if (s.baekho) sal.push("백호");
  if (s.goegang) sal.push("괴강");
  if (s.hongyeom) sal.push("홍염");
  return sal;
}

/** 기준일에 이미 시작한 마지막 대운. 연도만 보면 시작 전 몇 달을 새 대운으로 잘못 본다 */
const currentDaewoonIndex = (daewoon: DaewoonItem[], date: string) => daewoon.findLastIndex((d) => d.startDate.toISOString().slice(0, 10) <= date);

// ── 십신·관계 (orrery 함수로 계산) ────────────────────────
const SUPPORT = new Set(["比肩", "劫財", "正印", "偏印"]); // 일간을 돕는 십신 (비겁·인성)
const SAME = new Set(["比肩", "劫財"]); // 일간과 같은 오행
const sipsinOf = (dayStem: string, stem: string) => getRelation(dayStem, stem)?.hanja ?? "?";

/** 지장간 문자열(여기·중기·본기 3자리, 빈 자리는 공백) → 위치별 목록 */
const HIDDEN_POS = ["여기", "중기", "본기"] as const;
function hiddenStems(branch: string) {
  return [...getHiddenStems(branch)]
    .map((stem, i) => ({ stem, pos: HIDDEN_POS[i]! }))
    .filter((h) => h.stem.trim());
}

/** 간지 하나와 원국 각 주 사이의 관계 (orrery analyzePillarRelations) */
function relationsWithNatal(ganzi: string, saju: SajuResult) {
  const out: string[] = [];
  saju.pillars.forEach((p, i) => {
    if (isUnknown(p.pillar.ganzi)) return;
    const r = pillarRelations(ganzi, p.pillar.ganzi);
    for (const x of r.stem) out.push(`${PILLAR_NAMES[i]} 천간 ${ganzi[0]}-${p.pillar.stem} ${fmtRel(x)}`);
    for (const x of r.branch) out.push(`${PILLAR_NAMES[i]} 지지 ${ganzi[1]}-${p.pillar.branch} ${fmtRel(x)}`);
  });
  return out;
}

function relationsBetween(a: string, b: string, label: string) {
  const r = pillarRelations(a, b);
  return [
    ...r.stem.map((x) => `${label} 천간 ${a[0]}-${b[0]} ${fmtRel(x)}`),
    ...r.branch.map((x) => `${label} 지지 ${a[1]}-${b[1]} ${fmtRel(x)}`),
  ];
}

/** 세운 (기준 연도·다음 연도) */
export function seunOf(saju: SajuResult, asOf: AsOf): SeunView[] {
  const dayStem = saju.pillars[1]!.pillar.stem;
  const cur = saju.daewoon[currentDaewoonIndex(saju.daewoon, asOf.date)];
  return [asOf.year, asOf.year + 1].map((year, i) => {
    const ganzi = getYearGanzi(year);
    const [stem, branch] = [ganzi[0]!, ganzi[1]!];
    return {
      year,
      label: i === 0 ? "올해" : "내년",
      ganzi,
      kr: [...ganzi].map(krOf).join(""),
      stemSipsin: sipsinOf(dayStem, stem),
      branchSipsin: sipsinOf(dayStem, getJeonggi(branch)),
      unseong: getTwelveMeteor(dayStem, branch),
      natalRelations: relationsWithNatal(ganzi, saju),
      daewoonRelations: cur ? relationsBetween(ganzi, cur.ganzi, `대운 ${cur.ganzi}`) : [],
    };
  });
}

/** 신강약 판단 재료: 득령·통근·득세·오행 점수 */
export function strengthOf(saju: SajuResult): StrengthView {
  const dayStem = saju.pillars[1]!.pillar.stem;
  const known = saju.pillars.map((p, i) => ({ p, i })).filter(({ p }) => !isUnknown(p.pillar.ganzi));

  const monthBranch = saju.pillars[2]!.pillar.branch;
  const monthMain = getJeonggi(monthBranch);
  const monthSipsin = sipsinOf(dayStem, monthMain);
  const deukryeong = SUPPORT.has(monthSipsin);

  const roots = known.map(({ p, i }) => {
    const found = hiddenStems(p.pillar.branch).filter((h) => SAME.has(sipsinOf(dayStem, h.stem)));
    return { pillar: PILLAR_NAMES[i]!, branch: p.pillar.branch, roots: found.map((h) => `${h.pos} ${h.stem}(${sipsinOf(dayStem, h.stem)})`) };
  });

  const helpers = known
    .filter(({ i }) => i !== 1)
    .map(({ p, i }) => ({ pos: PILLAR_NAMES[i]!.replace("주", "간"), stem: p.pillar.stem, sipsin: sipsinOf(dayStem, p.pillar.stem) }))
    .filter((h) => SUPPORT.has(h.sipsin));

  // 오행 점수 (b): 천간 1.0, 본기 1.0, 중기 0.5, 여기 0.3, 월지 지장간은 ×1.5
  const WEIGHT = { 여기: 0.3, 중기: 0.5, 본기: 1.0 } as const;
  const weighted = Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>;
  for (const { p, i } of known) {
    weighted[elemOfStem(p.pillar.stem)] += 1;
    for (const h of hiddenStems(p.pillar.branch)) weighted[elemOfStem(h.stem)] += WEIGHT[h.pos] * (i === 2 ? 1.5 : 1);
  }
  for (const e of ELEMENTS) weighted[e] = Math.round(weighted[e] * 10) / 10;
  const counts = countElements(saju);

  return {
    deukryeong: { ok: deukryeong, monthBranch, mainStem: monthMain, sipsin: monthSipsin },
    roots,
    deukse: { count: helpers.length, stems: helpers.map((h) => `${h.pos} ${h.stem}(${h.sipsin})`) },
    counts,
    weighted,
    hiddenOnly: ELEMENTS.filter((e) => counts[e] === 0 && weighted[e] > 0),
  };
}

// ── LLM 입력용 텍스트 ─────────────────────────────────────
// 형식은 docs/chart_format.md. 프롬프트가 섹션 이름을 그대로 참조하므로 이름을 바꾸면 프롬프트도 바꿔야 한다.
const elemLine = (rec: Record<Element, number>) => ELEMENTS.map((e) => `${ELEMENT_HANJA[e]}${rec[e]}`).join(" ");
const listOrNone = (xs: string[]) => (xs.length ? xs.join(", ") : "없음");
const JASI_KO = { unified: "통자시", split: "야자시" } as const;

/** 지지 쌍/천간 쌍을 "시지-년지 巳酉 半合(金)" 꼴로. 삼합·방합은 그대로 */
function relationLines(saju: SajuResult) {
  const lines: string[] = [];
  for (const [key, pair] of saju.relations.pairs) {
    const [i, j] = key.split(",").map(Number) as [number, number];
    const [a, b] = [saju.pillars[i]!.pillar, saju.pillars[j]!.pillar];
    for (const r of pair.stem) lines.push(`${PILLAR_NAMES[i]!.replace("주", "간")}-${PILLAR_NAMES[j]!.replace("주", "간")} ${a.stem}${b.stem} ${fmtRel(r)}`);
    for (const r of fixHyeong(pair.branch, a.branch, b.branch)) lines.push(`${PILLAR_NAMES[i]!.replace("주", "지")}-${PILLAR_NAMES[j]!.replace("주", "지")} ${a.branch}${b.branch} ${fmtRel(r)}`);
  }
  for (const r of [...saju.relations.triple, ...saju.relations.directional]) lines.push(fmtRel(r));
  return lines;
}

/** 간지 둘 사이의 천간·지지 관계를 "천간 丙-乙 沖 / 지지 午-巳 …" 꼴로. 없으면 "없음" */
function pairRelation(a: string, b: string) {
  const r = pillarRelations(a, b);
  const out = [...r.stem.map((x) => `천간 ${a[0]}-${b[0]} ${fmtRel(x)}`), ...r.branch.map((x) => `지지 ${a[1]}-${b[1]} ${fmtRel(x)}`)];
  return out.length ? out.join(", ") : "없음";
}

/** 기준일이 입춘(2월 3~5일) 전인가. 세운은 양력 연도로 세므로 이때는 사주의 해와 어긋날 수 있다 */
export const beforeIpchun = (date: string) => {
  const [, m, d] = date.split("-").map(Number) as [number, number, number];
  return m === 1 || (m === 2 && d <= 4);
};

/** 절입일 출생(시간 미상)의 경고 문장. 없으면 null */
export function boundaryNote(boundary: PillarBoundary | undefined): string | null {
  if (!boundary) return null;
  const parts = [boundary.year && `년주 ${boundary.year[0]} 또는 ${boundary.year[1]}`, boundary.month && `월주 ${boundary.month[0]} 또는 ${boundary.month[1]}`].filter(Boolean);
  return `절입일 출생(시간 미상): ${parts.join(", ")}. 출생 시각에 따라 갈리므로 어느 한쪽으로 확정하지 말고 두 경우를 함께 볼 것 (대운 시작 나이도 달라질 수 있음)`;
}

export function describeChart(saju: SajuComputed, asOf: AsOf = asOfDate()) {
  const { input, pillars } = saju;
  const dayStem = pillars[1]!.pillar.stem;
  const note = boundaryNote(saju.boundary);
  const lines: string[] = [
    "[기준]",
    `오늘 ${asOf.date} / 올해 ${asOf.year}년 / 내년 ${asOf.year + 1}년`,
    ...(beforeIpchun(asOf.date) ? [`올해 간지는 양력 연도 기준. 입춘(2월 4일경) 전이라 사주 세운으로는 아직 ${getYearGanzi(asOf.year - 1)} 해로 볼 수 있음`] : []),
    "",
    "[기본]",
    `성별 ${input.gender === "M" ? "남" : "여"} / 자시법 ${JASI_KO[input.jasiMethod ?? "unified"] ?? "통자시"} / ${input.unknownTime ? "시간 미상" : "출생시간 확인됨"}`,
    ...(note ? [note] : []),
    "",
    "[원국]",
  ];
  pillars.forEach((p, i) => {
    if (isUnknown(p.pillar.ganzi)) return lines.push(`${PILLAR_NAMES[i]} 시간 미상`);
    lines.push(
      `${PILLAR_NAMES[i]} ${p.pillar.ganzi} | 천간 ${i === 1 ? "日干" : p.stemSipsin} / 지지 ${p.branchSipsin} | 12운성 ${p.unseong} | 12신살 ${p.sinsal} | 지장간 ${p.jigang.replace(/\s+/g, "")}`
    );
  });

  lines.push("", "[일간]", `${dayStem} (${STEM_INFO[dayStem]!.yinyang === "+" ? "양" : "음"} ${ELEMENT_HANJA[elemOfStem(dayStem)]})`);

  const st = strengthOf(saju);
  const d = st.deukryeong;
  // "년간 癸(劫財)" → "년간 癸"
  const stemsOf = (names: string[]) => (names.length ? `(${names.map((x) => x.replace(/\(.*$/, "")).join(", ")})` : "");
  const bigeop = st.deukse.stems.filter((x) => SAME.has(x.slice(x.indexOf("(") + 1, -1)));
  const inseong = st.deukse.stems.filter((x) => !SAME.has(x.slice(x.indexOf("(") + 1, -1)));
  lines.push(
    "",
    "[신강약 재료]",
    `득령: 월지 ${d.monthBranch} 본기 ${d.mainStem}(${d.sipsin}) → ${d.ok ? "득령" : "실령"}`,
    `통근: ${st.roots.map((r) => `${r.pillar.replace("주", "지")} ${r.branch} ${r.roots.length ? r.roots.join("·") : "없음"}`).join(" / ")}`,
    `득세: 천간 비겁 ${bigeop.length}${stemsOf(bigeop)}, 인성 ${inseong.length}${stemsOf(inseong)}`,
    `오행 개수(천간+지지 본기): ${elemLine(st.counts)}`,
    `오행 점수(가중): ${elemLine(st.weighted)}`,
    `지장간에만 있는 오행: ${listOrNone(st.hiddenOnly.map((e) => ELEMENT_HANJA[e]!))}`
  );

  lines.push("", "[간지 관계]", ...(relationLines(saju).length ? relationLines(saju) : ["없음"]));
  lines.push("", "[신살]", listOrNone(listSals(saju)));
  lines.push("", "[공망]", saju.gongmang.branches.join("") || "없음");

  const curIdx = currentDaewoonIndex(saju.daewoon, asOf.date);
  lines.push("", "[대운]");
  saju.daewoon.forEach((dw, i) => {
    lines.push(`${dw.age}세~ ${dw.startDate.getUTCFullYear()}년 ${dw.ganzi} ${dw.stemSipsin}/${dw.branchSipsin} ${dw.unseong}${i === curIdx ? " ← 현재" : ""}`);
  });
  const cur = saju.daewoon[curIdx];

  lines.push("", "[대운 관계]");
  if (cur) {
    const rows = pillars.map((p, i) => `${PILLAR_NAMES[i]} ${isUnknown(p.pillar.ganzi) ? "시간 미상" : `${p.pillar.ganzi}: ${pairRelation(cur.ganzi, p.pillar.ganzi)}`}`);
    lines.push(`현재 대운 ${cur.ganzi} ↔ 원국`, ...rows);
  } else lines.push("없음");

  const next = saju.daewoon[curIdx + 1];
  if (next) {
    const rows = pillars.map((p, i) => `${PILLAR_NAMES[i]} ${isUnknown(p.pillar.ganzi) ? "시간 미상" : `${p.pillar.ganzi}: ${pairRelation(next.ganzi, p.pillar.ganzi)}`}`);
    lines.push("", "[다음 대운 관계]", `${next.startDate.getUTCFullYear()}년부터 ${next.ganzi} ↔ 원국`, ...rows);
  }

  const seun = seunOf(saju, asOf);
  lines.push("", "[세운]");
  for (const y of seun) lines.push(`${y.year}년(${y.label}) ${y.ganzi} | 천간 ${y.stemSipsin} / 지지 ${y.branchSipsin} | 12운성 ${y.unseong}`);

  lines.push("", "[세운 관계]");
  for (const y of seun) {
    lines.push(`${y.year} ${y.ganzi} ↔ ` + pillars.map((p, i) => `${PILLAR_NAMES[i]} ${isUnknown(p.pillar.ganzi) ? "시간 미상" : `${p.pillar.ganzi}: ${pairRelation(y.ganzi, p.pillar.ganzi)}`}`).join(" / "));
    lines.push(`${y.year} ${y.ganzi} ↔ ${cur ? `현재 대운 ${cur.ganzi}: ${pairRelation(y.ganzi, cur.ganzi)}` : "현재 대운 없음"}`);
  }

  const natalBranches = pillars.filter((p) => !isUnknown(p.pillar.ganzi)).map((p) => p.pillar.branch);
  const combo = [
    ...openSamhapPairs(natalBranches).map((x) => `원국 ${x}`),
    ...(cur ? completedCombos(natalBranches, [cur.ganzi[1]!]).map((x) => `현재 대운 ${cur.ganzi}: ${x}`) : []),
    ...(next ? completedCombos(natalBranches, [next.ganzi[1]!]).map((x) => `다음 대운 ${next.ganzi}: ${x}`) : []),
    ...seun.flatMap((y) => completedCombos(natalBranches, [y.ganzi[1]!, ...(cur ? [cur.ganzi[1]!] : [])], y.ganzi[1]!).map((x) => `${y.year} ${y.ganzi}: ${x}`)),
    ...seun.flatMap((y) => jaenghap(y.ganzi, saju, `${y.year} 세운`)),
    ...(cur ? jaenghap(cur.ganzi, saju, "현재 대운") : []),
    ...(next ? jaenghap(next.ganzi, saju, "다음 대운") : []),
  ];
  lines.push("", "[삼합·방합·쟁합]", ...(combo.length ? [...new Set(combo)] : ["없음"]));
  return lines.join("\n");
}

// ── 화면용 구조화 데이터 ──────────────────────────────────
export function chartView(saju: SajuResult, asOf: AsOf = asOfDate()): ChartView {
  const curIdx = currentDaewoonIndex(saju.daewoon, asOf.date);
  return {
    gender: saju.input.gender,
    unknownTime: !!saju.input.unknownTime,
    pillars: saju.pillars.map((p, i) => {
      const unknown = isUnknown(p.pillar.ganzi);
      const { stem, branch } = p.pillar;
      return {
        name: PILLAR_NAMES[i]!,
        unknown,
        stem: unknown ? null : { char: stem, kr: krOf(stem), element: elemOfStem(stem), yinyang: STEM_INFO[stem]!.yinyang },
        branch: unknown ? null : { char: branch, kr: krOf(branch), element: elemOfBranch(branch) },
        stemSipsin: p.stemSipsin,
        branchSipsin: p.branchSipsin,
        unseong: p.unseong,
        sinsal: p.sinsal,
        jigang: p.jigang,
      };
    }),
    elements: countElements(saju),
    relations: listRelations(saju),
    sals: listSals(saju),
    gongmang: [...saju.gongmang.branches],
    daewoon: saju.daewoon.map((d, i) => ({
      age: d.age,
      year: d.startDate.getUTCFullYear(),
      ganzi: d.ganzi,
      kr: [...d.ganzi].map(krOf).join(""),
      stemSipsin: d.stemSipsin,
      branchSipsin: d.branchSipsin,
      unseong: d.unseong,
      current: i === curIdx,
    })),
    thisYear: asOf.year,
    asOf: asOf.date,
    seun: seunOf(saju, asOf),
    strength: strengthOf(saju),
  };
}

/** 자동 검사의 정답: 이 명식에 실제로 존재하는 관계·지장간·세운 간지 */
export function sajuFacts(saju: SajuComputed, asOf: AsOf, chartText: string): Facts {
  const relations: NonNullable<Facts["relations"]> = [];
  const push = (a: string, b: string, rs: RelationResult[]) => rs.forEach((r) => relations.push({ a, b, type: r.type }));
  const between = (g1: string, g2: string) => {
    const r = analyzePillarRelations(g1, g2);
    push(g1[0]!, g2[0]!, r.stem);
    push(g1[1]!, g2[1]!, r.branch);
  };

  // 원국 안 (시→일→월→년 쌍)
  for (const [key, pair] of saju.relations.pairs) {
    const [i, j] = key.split(",").map(Number) as [number, number];
    const [a, b] = [saju.pillars[i]!.pillar, saju.pillars[j]!.pillar];
    push(a.stem, b.stem, pair.stem);
    push(a.branch, b.branch, pair.branch);
  }
  // 현재 대운·올해·내년 세운 ↔ 원국, 세운 ↔ 현재 대운
  const known = saju.pillars.filter((p) => !isUnknown(p.pillar.ganzi)).map((p) => p.pillar.ganzi);
  const cur = saju.daewoon[currentDaewoonIndex(saju.daewoon, asOf.date)];
  const years = [asOf.year, asOf.year + 1].map(getYearGanzi);
  if (cur) known.forEach((g) => between(cur.ganzi, g));
  const nextLuck = saju.daewoon[currentDaewoonIndex(saju.daewoon, asOf.date) + 1];
  if (nextLuck) known.forEach((g) => between(nextLuck.ganzi, g));
  for (const y of years) {
    known.forEach((g) => between(y, g));
    if (cur) between(y, cur.ganzi);
  }

  return {
    system: "saju",
    thisYear: asOf.year,
    nextYear: asOf.year + 1,
    yearGanzi: { thisYear: years[0]!, nextYear: years[1]! },
    unknownTime: !!saju.input.unknownTime,
    ...(saju.boundary && { boundaryPillars: saju.boundary }),
    chartText,
    relations,
    looseHap: saju.relations.triple.length + saju.relations.directional.length > 0,
    hiddenStems: Object.fromEntries([...EARTH].map((b) => [b, getHiddenStems(b)])),
  };
}
