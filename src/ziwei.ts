/**
 * 자미두수 명반 (orrery createChart / calculateLiunian / getDaxianList)
 */
import { createChart, calculateLiunian, getDaxianList } from "@orrery/core/ziwei";
import type { ZiweiChart } from "@orrery/core/types";
import type { BirthInput, Facts, Place, ZiweiView } from "./types.js";
import { getYearGanzi } from "@orrery/core/pillars";
import { adjustBirthInputToKstWallClock } from "@orrery/core/timezone";
import type { AsOf } from "./chart.js";

export interface ZiweiResult {
  text: string;
  view: ZiweiView;
  /** 자동 검사의 정답 (chartText는 호출하는 쪽에서 채운다) */
  facts: Facts;
}

/** 巨門(廟,化權) / 天機(得) / 右弼 / 太陽(化祿) — 밝기와 생년사화는 한 괄호 안에 쉼표로 */
const starLabel = (s: { name: string; brightness: string; siHua: string }) => {
  const tags = [s.brightness, s.siHua].filter(Boolean).join(",");
  return `${s.name}${tags ? `(${tags})` : ""}`;
};
type Palace = ZiweiChart["palaces"][string];
const starsOf = (p: Palace) => (p.stars.length ? p.stars.map(starLabel).join(" ") : "");

/**
 * 한국 출생은 사주와 같은 시 경계를 쓴다(子시 23:30~01:30). createChart는 정시 경계를 쓰므로 30분 당겨 넘긴다.
 * 자시 날짜도 사주의 자시법을 따른다: 통자시는 23:30부터 다음 날, 야자시는 그날의 밤 子시.
 * 해외 출생은 라이브러리에 맡긴다.
 */
export function ziweiBirthTime(date: string, time: string, timezone: string | null | undefined, jasiMethod?: string) {
  const [y0, m0, d0] = date.split("-").map(Number) as [number, number, number];
  const [h0, min0] = time.split(":").map(Number) as [number, number];
  if (timezone && timezone !== "Asia/Seoul") return { year: y0, month: m0, day: d0, hour: h0, minute: min0 };
  // 서머타임·옛 표준시(1948~61, 1987~88) 출생은 사주처럼 KST(+9) 벽시계로 바꾼 뒤 경계를 잰다
  const kst = adjustBirthInputToKstWallClock({ year: y0, month: m0, day: d0, hour: h0, minute: min0, gender: "M" });
  return toSeoulWallClock(shiftToZiweiHour(kst, jasiMethod));
}

type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

/** KST 벽시계 기준으로 사주의 시 경계를 자미두수의 정시 경계로 옮긴다 */
function shiftToZiweiHour({ year, month, day, hour, minute }: WallClock, jasiMethod?: string): WallClock {
  const total = hour * 60 + minute;
  if (total >= 23 * 60 + 30) {
    if (jasiMethod === "split") return { year, month, day, hour: 23, minute: minute - 30 };
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: 0, minute: minute - 30 };
  }
  if (total < 90) return { year, month, day, hour: 0, minute: total >= 60 ? 59 : minute }; // 그날 새벽의 子시
  const moved = total - 30;
  return { year, month, day, hour: Math.floor(moved / 60), minute: moved % 60 };
}

const seoulFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
});

/**
 * createChart는 받은 시각을 서울 벽시계로 보고 다시 KST로 바꾼다. 두 번 보정되지 않게 KST 시각을 서울 벽시계로 되돌려 넘긴다.
 * 평소에는 그대로이고, 서머타임 기간에만 값이 달라진다.
 */
function toSeoulWallClock(kst: WallClock): WallClock {
  const utc = Date.UTC(kst.year, kst.month - 1, kst.day, kst.hour, kst.minute) - 9 * 3600_000;
  const p = Object.fromEntries(seoulFormat.formatToParts(new Date(utc)).map((x) => [x.type, Number(x.value)]));
  return { year: p.year!, month: p.month!, day: p.day!, hour: p.hour!, minute: p.minute! };
}

export function computeZiwei(birth: BirthInput, place: Place, asOf: AsOf): ZiweiResult {
  // 자미두수는 출생 시가 필수라 시간 미상이면 이 함수를 부르지 않는다(pipeline). 호출되면 정오로 계산한다.
  const { year, month, day, hour, minute } = ziweiBirthTime(birth.date, birth.time ?? "12:30", place.timezone, birth.jasiMethod);
  const chart: ZiweiChart = createChart(year, month, day, hour, minute, birth.gender === "M", place.timezone, place.lon);

  const palaces = Object.values(chart.palaces);
  const daxian = getDaxianList(chart);
  const liunian = [asOf.year, asOf.year + 1].map((y, i) => ({ info: calculateLiunian(chart, y), label: i === 0 ? "올해" : "내년" }));
  const cur = liunian[0]!.info;

  // 명궁부터 반시계로 12궁이 늘어서므로, 대궁은 +6, 삼합궁은 +4·+8 이다
  const at = (i: number) => palaces[((i % 12) + 12) % 12]!;
  const ming = palaces.findIndex((p) => p.name === "命宮");
  const opposite = (i: number) => at(i + 6);

  const shen = palaces.find((p) => p.isShenGong);
  const lines: string[] = [
    "[기준]",
    `오늘 ${asOf.date} / 올해 ${asOf.year}년 / 내년 ${asOf.year + 1}년`,
    "",
    "[기본]",
    `성별 ${birth.gender === "M" ? "남" : "여"} / 명궁 ${chart.mingGongZhi} / 신궁 ${chart.shenGongZhi}${shen ? `(${shen.name})` : ""} / 오행국 ${chart.wuXingJu.name}`,
    `음력 ${chart.lunarYear}년 ${chart.isLeapMonth ? "윤" : ""}${chart.lunarMonth}월 ${chart.lunarDay}일 / 대한 시작 ${chart.daXianStartAge}세`,
    "",
    "[12궁]",
  ];
  palaces.forEach((p, i) => {
    if (p.stars.length) return lines.push(`${p.name} ${p.ganZhi} | ${starsOf(p)}`);
    const borrowed = starsOf(opposite(i));
    lines.push(`${p.name} ${p.ganZhi} | 주성 없음(공궁)${borrowed ? ` 차성: ${borrowed} (대궁 ${opposite(i).name})` : ""}`);
  });

  lines.push("", "[삼방사정]");
  const sanfang = [0, 4, 8, 6].map((d) => ({ palace: at(ming + d), i: ming + d }));
  lines.push(`명궁 ${at(ming).zhi} / ${sanfang.slice(1).map(({ palace }) => `${palace.name} ${palace.zhi}`).join(" / ")}`);
  for (const { palace } of sanfang) lines.push(`${palace.name} ${palace.zhi} | ${starsOf(palace) || "주성 없음(공궁)"}`);

  const birthSiHua = palaces.flatMap((p) => p.stars.filter((s) => s.siHua).map((s) => `${s.siHua} ${s.name}(${p.name})`));
  lines.push("", "[생년 사화]", birthSiHua.length ? birthSiHua.join(" / ") : "없음");

  lines.push("", "[대한]");
  for (const d of daxian) {
    const isCur = d.palaceName === cur.daxianPalaceName && d.ageStart === cur.daxianAgeStart;
    lines.push(`${d.ageStart}~${d.ageEnd}세 ${d.palaceName} ${d.ganZhi}${isCur ? " ← 현재" : ""}`);
  }

  lines.push("", "[유년]");
  for (const { info, label } of liunian) {
    const sihua = Object.entries(info.siHua).map(([star, hua]) => `${star} ${hua}(${info.siHuaPalaces[hua] ?? "?"})`).join(", ");
    lines.push(`${info.year}년(${label}) ${info.gan}${info.zhi} | 유년 명궁 ${info.mingGongZhi} = 본명반 ${info.natalPalaceAtMing} | 유년 사화: ${sihua}`);
  }

  const text = lines.join("\n");
  return {
    text,
    facts: {
      system: "ziwei",
      thisYear: asOf.year,
      nextYear: asOf.year + 1,
      yearGanzi: { thisYear: getYearGanzi(asOf.year), nextYear: getYearGanzi(asOf.year + 1) },
      unknownTime: !birth.time,
      chartText: text,
      palaces: Object.fromEntries(palaces.map((p) => [p.name, p.stars.map((s) => s.name)])),
    },
    view: {
      lunar: `${chart.lunarYear}-${chart.isLeapMonth ? "윤" : ""}${chart.lunarMonth}-${chart.lunarDay}`,
      mingGong: chart.mingGongZhi,
      shenGong: chart.shenGongZhi,
      wuXingJu: chart.wuXingJu.name,
      palaces: palaces.map((p) => ({ name: p.name, ganZhi: p.ganZhi, stars: p.stars, isShenGong: p.isShenGong })),
      daxian: daxian.map((d) => ({ ...d, current: d.palaceName === cur.daxianPalaceName && d.ageStart === cur.daxianAgeStart })),
      liunian: liunian.map(({ info, label }) => ({
        year: info.year,
        label,
        ganZhi: info.gan + info.zhi,
        mingGongZhi: info.mingGongZhi,
        natalPalaceAtMing: info.natalPalaceAtMing,
        siHuaPalaces: info.siHuaPalaces,
      })),
    },
  };
}
