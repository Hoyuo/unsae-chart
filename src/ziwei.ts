/**
 * 자미두수 명반 (orrery createChart / calculateLiunian / getDaxianList)
 */
import { createChart, calculateLiunian, getDaxianList } from "@orrery/core/ziwei";
import type { ZiweiChart } from "@orrery/core/types";
import type { BirthInput, Facts, Place, ZiweiView } from "./types.js";
import { getYearGanzi } from "@orrery/core/pillars";
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

export function computeZiwei(birth: BirthInput, place: Place, asOf: AsOf): ZiweiResult {
  const [year, month, day] = birth.date.split("-").map(Number) as [number, number, number];
  // 자미두수는 출생 시가 필수라 시간 미상이면 이 함수를 부르지 않는다(pipeline). 호출되면 정오로 계산한다.
  const [hour, minute] = birth.time ? (birth.time.split(":").map(Number) as [number, number]) : [12, 0];
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
