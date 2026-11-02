/**
 * 서양 점성술 출생 차트 (orrery calculateNatal)
 */
import { calculateNatal, PLANET_KO, ZODIAC_KO, ZODIAC_SIGNS } from "@orrery/core/natal";
import type { NatalChart, PlanetPosition, ZodiacSign } from "@orrery/core/types";
import type { BirthInput, Facts, NatalView, Place } from "./types.js";
import { getYearGanzi } from "@orrery/core/pillars";
import type { AsOf } from "./chart.js";

export interface NatalResult {
  text: string;
  view: NatalView;
  /** 자동 검사의 정답 */
  facts: Facts;
}

// 원소·모드 분포와 트랜짓 각도 계산에 쓰는 주요 행성 (Chiron·노드·포르투나 제외)
const MAIN_PLANETS = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const PERSONAL = ["Sun", "Moon", "Mercury", "Venus", "Mars"];
const TRANSITING = ["Jupiter", "Saturn"];

// 황도 12궁은 양자리부터 불·흙·공기·물, 활동·고정·변통이 차례로 반복된다
const ELEMENTS = ["불", "흙", "공기", "물"];
const MODES = ["활동", "고정", "변통"];
const signIndex = (sign: ZodiacSign) => ZODIAC_SIGNS.indexOf(sign);

const ASPECT_KO: Record<string, string> = { conjunction: "합", sextile: "섹스타일", square: "스퀘어", trine: "트라인", opposition: "대립" };
const MAJOR_ASPECTS: [number, string, string][] = [[0, "합", "conjunction"], [90, "스퀘어", "square"], [120, "트라인", "trine"], [180, "대립", "opposition"]];
const TRANSIT_ORB = 3;

const planetKo = (id: string) => (PLANET_KO as Record<string, string>)[id] ?? id;
const signKo = (sign: ZodiacSign) => ZODIAC_KO[sign] ?? sign;
const deg = (d: number) => `${d.toFixed(1)}°`;

/** 받침 유무에 따라 와/과 (영문 등 한글이 아니면 '와') */
function wa(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 !== 0 ? "과" : "와");
}

/** 하우스 커스프 기준으로 황경이 속한 하우스 번호 */
function houseOf(longitude: number, chart: NatalChart): number | null {
  if (!chart.houses.length) return null;
  const cusps = [...chart.houses].sort((a, b) => a.number - b.number);
  for (let i = 0; i < 12; i++) {
    const start = cusps[i]!.cuspLongitude;
    const end = cusps[(i + 1) % 12]!.cuspLongitude;
    const inHouse = start <= end ? longitude >= start && longitude < end : longitude >= start || longitude < end;
    if (inHouse) return cusps[i]!.number;
  }
  return null;
}

export function aspectBetween(a: number, b: number): { name: string; en: string; orb: number } | null {
  const angle = Math.abs(((a - b + 540) % 360) - 180); // 두 경도의 각거리 0~180
  for (const [target, name, en] of MAJOR_ASPECTS) {
    const orb = Math.abs(angle - target);
    if (orb <= TRANSIT_ORB) return { name, en, orb: Math.round(orb * 10) / 10 };
  }
  return null;
}

export async function computeNatal(birth: BirthInput, place: Place, asOf: AsOf): Promise<NatalResult> {
  const [year, month, day] = birth.date.split("-").map(Number) as [number, number, number];
  const unknownTime = !birth.time;
  const [hour, minute] = unknownTime ? [12, 0] : (birth.time!.split(":").map(Number) as [number, number]);
  const base = { gender: birth.gender, latitude: place.lat, longitude: place.lon, timezone: place.timezone };
  const chart = await calculateNatal({ ...base, year, month, day, hour, minute, unknownTime });

  const planets = chart.planets.filter((p) => MAIN_PLANETS.includes(p.id));
  const byId = new Map<string, PlanetPosition>(planets.map((p) => [p.id, p]));

  const elements = Object.fromEntries(ELEMENTS.map((e) => [e, 0]));
  const modes = Object.fromEntries(MODES.map((m) => [m, 0]));
  for (const p of planets) {
    elements[ELEMENTS[signIndex(p.sign) % 4]!]!++;
    modes[MODES[signIndex(p.sign) % 3]!]!++;
  }

  // 토성 이후 행성은 또래가 같은 별자리를 공유한다. 개인의 쏠림은 개인 행성으로 따로 본다
  const personal = Object.fromEntries(ELEMENTS.map((e) => [e, 0]));
  for (const p of planets) if (PERSONAL.includes(p.id)) personal[ELEMENTS[signIndex(p.sign) % 4]!]!++;

  const aspects = chart.aspects
    .filter((a) => MAIN_PLANETS.includes(a.planet1) && MAIN_PLANETS.includes(a.planet2))
    .sort((a, b) => a.orb - b.orb);

  // 트랜짓: 각 연도 7월 1일 정오 기준 목성·토성 위치, 출생 하우스, 개인 행성·앵글과의 주요 각
  interface Transit { id: string; sign: ZodiacSign; degree: number; retro: boolean; house: number | null; hits: { target: string; targetKo: string; ko: string; en: string; orb: number }[] }
  const transitData: { year: number; label: string; list: Transit[] }[] = [];
  for (const [i, y] of [asOf.year, asOf.year + 1].entries()) {
    const t = await calculateNatal({ ...base, year: y, month: 7, day: 1, hour: 12, minute: 0 });
    const list: Transit[] = [];
    for (const id of TRANSITING) {
      const tp = t.planets.find((p) => p.id === id)!;
      const hits: Transit["hits"] = [];
      for (const pid of PERSONAL) {
        const np = byId.get(pid);
        const asp = np && aspectBetween(tp.longitude, np.longitude);
        if (asp) hits.push({ target: pid, targetKo: planetKo(pid), ko: asp.name, en: asp.en, orb: asp.orb });
      }
      if (chart.angles) {
        for (const [key, label, en] of [["asc", "상승점", "ASC"], ["mc", "MC", "MC"]] as const) {
          const asp = aspectBetween(tp.longitude, chart.angles[key].longitude);
          if (asp) hits.push({ target: en, targetKo: label, ko: asp.name, en: asp.en, orb: asp.orb });
        }
      }
      list.push({ id, sign: tp.sign, degree: tp.degreeInSign, retro: tp.isRetrograde, house: unknownTime ? null : houseOf(tp.longitude, chart), hits });
    }
    transitData.push({ year: y, label: i === 0 ? "올해" : "내년", list });
  }
  // 화면용(한국어)
  const transits = transitData.map(({ year, label, list }) => ({
    year,
    label,
    items: list.map(
      (t) =>
        `${planetKo(t.id)} ${signKo(t.sign)} ${deg(t.degree)}${t.house ? `(출생 ${t.house}하우스)` : ""}${t.retro ? " 역행" : ""}` +
        (t.hits.length ? ` — ${t.hits.map((h) => `출생 ${wa(h.targetKo)} ${h.ko}(오브 ${h.orb}°)`).join(", ")}` : "")
    ),
  }));

  // LLM 입력용 텍스트 (docs/chart_format.md). 행성·별자리·애스펙트는 영문 그대로 쓴다.
  const NO_TIME = "시간 미상으로 계산 불가";
  const planetText = (p: PlanetPosition) =>
    `${p.id} ${p.sign} ${deg(p.degreeInSign)}${p.house ? ` ${p.house}하우스` : ""}${p.isRetrograde ? " 역행" : ""}${unknownTime && p.id === "Moon" ? " (당일 이동 범위 큼)" : ""}`;
  const lines: string[] = [
    "[기준]",
    `오늘 ${asOf.date} / 올해 ${asOf.year}년 / 내년 ${asOf.year + 1}년`,
    "",
    "[기본]",
    `출생지 ${place.name} (${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}) / 하우스 Placidus / ${unknownTime ? "시간 미상" : "출생시간 확인됨"}`,
    "",
    "[행성]",
    ...planets.map(planetText),
    "",
    "[앵글]",
    chart.angles ? `ASC ${chart.angles.asc.sign} ${deg(chart.angles.asc.degreeInSign)} / MC ${chart.angles.mc.sign} ${deg(chart.angles.mc.degreeInSign)}` : NO_TIME,
    "",
    "[하우스 커스프]",
    chart.angles ? [...chart.houses].sort((x, y) => x.number - y.number).map((h) => `${h.number} ${h.sign} ${deg(h.degreeInSign)}`).join(" / ") : NO_TIME,
    "",
    "[애스펙트] (오브 작은 순)",
    ...(aspects.length ? aspects.map((a) => `${a.planet1} ${a.type} ${a.planet2} ${a.orb.toFixed(1)}°`) : ["없음"]),
    "",
    "[원소·모드]",
    `${ELEMENTS.map((e) => `${e} ${elements[e]}`).join(" / ")} — ${MODES.map((m) => `${m} ${modes[m]}`).join(" / ")} (태양~명왕성 10행성 기준)`,
    `개인 행성(태양·달·수성·금성·화성) 기준: ${ELEMENTS.map((e) => `${e} ${personal[e]}`).join(" / ")}`,
    "",
    "[트랜짓]",
    ...transitData.map(
      ({ year, label, list }) =>
        `${year}년(${label}) 7월 1일 기준: ` +
        list.map((t) => `${t.id} ${t.sign} ${deg(t.degree)}${t.retro ? " 역행" : ""} → ${t.house ? `출생 ${t.house}하우스` : "하우스 계산 불가(시간 미상)"}`).join(" / ")
    ),
    "트랜짓-출생 행성 주요 애스펙트(합·대립·사각·삼각, 오브 3° 이내): " +
      (transitData.flatMap(({ year, list }) => list.flatMap((t) => t.hits.map((h) => `${year} ${t.id} ${h.en} 출생 ${h.target} ${h.orb}°`))).join("; ") || "없음"),
  ];

  const text = lines.join("\n");
  return {
    text,
    facts: {
      system: "natal",
      thisYear: asOf.year,
      nextYear: asOf.year + 1,
      yearGanzi: { thisYear: getYearGanzi(asOf.year), nextYear: getYearGanzi(asOf.year + 1) },
      unknownTime,
      chartText: text,
      // 출생 애스펙트 + 트랜짓(목성·토성 ↔ 출생 개인행성·앵글). 영어 표기 그대로 대조한다
      aspects: [
        ...chart.aspects.map((a) => ({ p1: a.planet1, p2: a.planet2, type: a.type })),
        ...transitData.flatMap(({ list }) => list.flatMap((t) => t.hits.map((h) => ({ p1: t.id, p2: h.target, type: h.en })))),
      ],
    },
    view: {
      place,
      planets: planets.map((p) => ({
        id: p.id,
        name: planetKo(p.id),
        sign: p.sign,
        signName: signKo(p.sign),
        degree: Math.round(p.degreeInSign * 10) / 10,
        house: p.house ?? null,
        retrograde: p.isRetrograde,
      })),
      angles: chart.angles ? { asc: signKo(chart.angles.asc.sign), mc: signKo(chart.angles.mc.sign) } : null,
      elements,
      modes,
      aspects: aspects.map((a) => ({ p1: planetKo(a.planet1), p2: planetKo(a.planet2), type: ASPECT_KO[a.type] ?? a.type, orb: a.orb })),
      transits,
    },
  };
}
